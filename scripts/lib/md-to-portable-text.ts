/**
 * Markdown -> HTML -> Portable Text conversion with the Strategy A rules:
 *
 *   - `<span style="color: #9571D5; font-weight:800">…</span>`  -> decorator `highlight`
 *   - `<a href>`                                                -> annotation `link`
 *   - `<img src="...">`                                         -> `imageWithAlt` block
 *   - `<div id="image-grid">…</div>` (only in 2025.md)          -> `imageGallery` block
 *
 * Notes
 * -----
 * - `@sanity/block-tools` requires a compiled Sanity schema (via @sanity/schema).
 * - `@sanity/block-tools` requires a parseHtml impl when used in Node — we
 *   provide one backed by `jsdom`.
 * - `marked` is configured to NOT mangle email/headers and to pass through any
 *   raw HTML (which is most of these documents).
 */

import { JSDOM } from "jsdom";
import { marked } from "marked";
import { htmlToBlocks } from "@sanity/block-tools";
import { Schema } from "@sanity/schema";
import type { ArbitraryTypedObject } from "@portabletext/types";
import type { AssetMap } from "./types.js";
import {
  extractGalleries,
  isGalleryMarkerLine,
  type ExtractedGallery,
} from "./gallery-detector.js";
import { schemaTypes as schemaTypesArr } from "../../schemaTypes/index.js";

// ---------------------------------------------------------------------------
// Sanity block-tools "deserializers"
//
// The block-tools API exposes a `rules` array. Each rule has:
//   - deserialize(el, next, block) -> Block | undefined
// where returning undefined falls through to the next rule.
// ---------------------------------------------------------------------------

/** Normalise a CSS color/weight pair to detect the highlight style. */
function isHighlightSpan(el: Element): boolean {
  const style = (el.getAttribute("style") ?? "")
    .toLowerCase()
    .replace(/\s+/g, "");
  if (!style.includes("#9571d5")) return false;
  return style.includes("font-weight:800") || style.includes("color:#9571d5");
}

interface BuildOptions {
  assetMap: AssetMap;
  galleries: ExtractedGallery[];
  /** Called with a free-form note about lossy bits we discarded. */
  warn: (msg: string, line?: number) => void;
  /** Filename for warning context */
  filename: string;
}

function compileSchema() {
  // @sanity/schema's named export accepts a {name, types} config.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const compiled = (Schema as any).compile({
    name: "default",
    types: schemaTypesArr,
  });
  return compiled;
}

/** Build the rule set passed to htmlToBlocks. */
function buildRules(opts: BuildOptions) {
  const { assetMap, galleries, warn, filename } = opts;

  return [
    // 1. Image -> imageWithAlt block
    {
      deserialize(
        el: Element,
        _next: unknown,
        block: (node: ArbitraryTypedObject) => ArbitraryTypedObject,
      ) {
        if (el.tagName?.toUpperCase() !== "IMG") return undefined;
        const src = el.getAttribute("src") ?? "";
        const altAttr = el.getAttribute("alt") ?? "";

        // Defer to gallery rule if this image happens to be inside a gallery
        // marker — but galleries are already extracted by extractGalleries so
        // every remaining <img> is inline and should become a block.
        if (!src) {
          warn("img tag with no src dropped", undefined);
          return undefined;
        }

        const asset = assetMap.get(src);
        if (!asset) {
          warn(`img src ${src} has no uploaded asset (skipping)`);
          return undefined;
        }

        const alt = altAttr || filenameToAlt(asset.filename);
        return block({
          _type: "imageWithAlt",
          alt,
          asset: { _type: "reference", _ref: asset.assetId },
        });
      },
    },

    // 2. Highlight span -> decorator
    {
      deserialize(
        el: Element,
        next: (
          children: NodeListOf<ChildNode> | Element[],
        ) => ArbitraryTypedObject[],
      ) {
        if (el.tagName?.toUpperCase() !== "SPAN") return undefined;
        if (!isHighlightSpan(el)) return undefined;
        return {
          _type: "__decorator",
          name: "highlight",
          children: next(el.childNodes),
        };
      },
    },

    // 3. Link -> annotation
    {
      deserialize(
        el: Element,
        next: (
          children: NodeListOf<ChildNode> | Element[],
        ) => ArbitraryTypedObject[],
      ) {
        if (el.tagName?.toUpperCase() !== "A") return undefined;
        const href = el.getAttribute("href") ?? "";
        if (!href) {
          // Spurious <a> with no href (the 2025 post has a few mis-closed
          // anchors). Convert to plain span by yielding children.
          warn("anchor with no href flattened to plain text");
          return undefined;
        }
        const blank =
          (el.getAttribute("target") ?? "").toLowerCase() === "_blank";
        return {
          _type: "__annotation",
          markDef: {
            _key: randomMarkKey(),
            _type: "link",
            href,
            blank,
          },
          children: next(el.childNodes),
        };
      },
    },
  ];
}

function filenameToAlt(filename: string): string {
  return filename
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_]+/g, " ")
    .trim();
}

/**
 * Build a jsdom-backed parseHtml for block-tools.
 */
function makeParseHtml() {
  return (html: string) => {
    const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`);
    return dom.window.document;
  };
}

/**
 * Build the synthetic imageGallery block from a previously-extracted gallery.
 */
function galleryToBlock(
  gallery: ExtractedGallery,
  assetMap: AssetMap,
  warn: (msg: string) => void,
): ArbitraryTypedObject {
  const images = gallery.imagePaths
    .map((p) => {
      const asset = assetMap.get(p);
      if (!asset) {
        warn(`gallery image ${p} had no uploaded asset (skipped)`);
        return null;
      }
      return {
        _type: "imageWithAlt",
        _key: keyFor(p),
        alt: filenameToAlt(asset.filename),
        asset: { _type: "reference", _ref: asset.assetId },
      };
    })
    .filter(Boolean);

  return {
    _type: "imageGallery",
    images,
  };
}

function randomMarkKey(): string {
  return Math.random().toString(36).slice(2, 14);
}

let keyCounter = 0;
function keyFor(seed: string): string {
  keyCounter += 1;
  // Deterministic-ish per-process. Sanity only requires uniqueness within a doc.
  const hash = seed
    .split("")
    .reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 5381);
  return `k${hash.toString(16)}${keyCounter}`;
}

/** Ensure every block / inline child has a _key. */
function withKeys<T extends ArbitraryTypedObject>(blocks: T[]): T[] {
  return blocks.map((b) => addKeysToBlock(b)) as T[];
}

function addKeysToBlock(block: ArbitraryTypedObject): ArbitraryTypedObject {
  const out: ArbitraryTypedObject = { ...block };
  if (!out._key) out._key = keyFor(out._type ?? "block");
  if (Array.isArray(out.children)) {
    out.children = out.children.map((c: ArbitraryTypedObject) => ({
      ...c,
      _key: c._key ?? keyFor(c._type ?? "span"),
    }));
  }
  if (Array.isArray(out.markDefs)) {
    out.markDefs = out.markDefs.map((m: ArbitraryTypedObject) => ({
      ...m,
      _key: m._key ?? keyFor(m._type ?? "mark"),
    }));
  }
  if (Array.isArray(out.images)) {
    out.images = out.images.map((c: ArbitraryTypedObject) => ({
      ...c,
      _key: c._key ?? keyFor(c._type ?? "imageWithAlt"),
    }));
  }
  return out;
}

/**
 * Public API.
 */
export async function markdownToPortableText(
  rawBody: string,
  opts: BuildOptions,
): Promise<ArbitraryTypedObject[]> {
  // Step 1: extract galleries (mutates raw body, replaces with markers).
  const { body: extractedBody, galleries } = extractGalleries(rawBody);
  opts.galleries.push(...galleries);

  // Step 2: split on gallery markers so each segment is converted independently
  // and we splice gallery blocks back at the right positions.
  const segments = splitByMarkers(extractedBody);

  const schema = compileSchema();
  const blockContentType = schema
    .get("post")
    .fields.find(
      (f: { name: string; type: { jsonType?: string } }) => f.name === "body",
    )?.type;

  if (!blockContentType) {
    throw new Error(
      "Could not locate blockContent schema for 'body' field on 'post'",
    );
  }

  const parseHtml = makeParseHtml();
  const rules = buildRules({
    ...opts,
    galleries,
  });

  const finalBlocks: ArbitraryTypedObject[] = [];

  for (const seg of segments) {
    if (seg.kind === "gallery") {
      const gal = galleries[seg.index];
      if (!gal) {
        opts.warn(`gallery marker ${seg.index} had no payload`);
        continue;
      }
      finalBlocks.push(galleryToBlock(gal, opts.assetMap, (m) => opts.warn(m)));
      continue;
    }
    const html = await markedRender(seg.text);
    if (!html.trim()) continue;
    const blocks = htmlToBlocks(html, blockContentType, {
      parseHtml,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rules: rules as any,
    }) as ArbitraryTypedObject[];
    finalBlocks.push(...blocks);
  }

  return withKeys(finalBlocks);
}

interface MarkerSegment {
  kind: "markdown" | "gallery";
  text: string;
  index: number;
}

function splitByMarkers(body: string): MarkerSegment[] {
  const lines = body.split("\n");
  const out: MarkerSegment[] = [];
  let buf: string[] = [];

  const flush = () => {
    if (buf.length === 0) return;
    out.push({ kind: "markdown", text: buf.join("\n"), index: -1 });
    buf = [];
  };

  for (const line of lines) {
    const idx = isGalleryMarkerLine(line);
    if (idx !== null) {
      flush();
      out.push({ kind: "gallery", text: "", index: idx });
    } else {
      buf.push(line);
    }
  }
  flush();
  return out;
}

/** Run `marked` with options that preserve raw HTML and avoid header IDs. */
async function markedRender(md: string): Promise<string> {
  marked.setOptions({
    gfm: true,
    breaks: false,
  });
  const result = await marked.parse(md);
  return typeof result === "string" ? result : await result;
}
