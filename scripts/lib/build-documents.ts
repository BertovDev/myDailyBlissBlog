/**
 * Document builders for the migration.
 *
 * - buildPostDoc:     post -> { _id: post-<slug>, ... }
 * - buildLinkDoc:     externalLink -> { _id: externalLink-<filename-kebab>, ... }
 * - buildSiteSettings: { _id: 'siteSettings', ... }
 */

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import matter from "gray-matter";
import type { ArbitraryTypedObject } from "@portabletext/types";
import type {
  AssetMap,
  LinkPageEntry,
  ParsedPost,
  UploadedAsset,
} from "./types.js";

export interface PostDoc {
  _id: string;
  _type: "post";
  title: string;
  slug: { _type: "slug"; current: string };
  description?: string;
  publishedAt: string;
  body: ArbitraryTypedObject[];
  references?: Array<{
    _type: "postReference";
    _key: string;
    label: string;
    url?: string;
  }>;
  hero?: {
    _type: "imageWithAlt";
    alt: string;
    asset: { _type: "reference"; _ref: string };
  };
}

export interface ExternalLinkDoc {
  _id: string;
  _type: "externalLink";
  title: string;
  url: string;
  description?: string;
  order?: number;
}

export interface SiteSettingsDoc {
  _id: "siteSettings";
  _type: "siteSettings";
  siteTitle: string;
  siteDescription: string;
  twitterHandle: string;
  twitterDescription: string;
  defaultOgImage?: {
    _type: "imageWithAlt";
    alt: string;
    asset: { _type: "reference"; _ref: string };
  };
  favicon?: { _type: "image"; asset: { _type: "reference"; _ref: string } };
  marqueeText: string;
  headerGreeting: string;
}

// ---------------------------------------------------------------------------
// File parsing
// ---------------------------------------------------------------------------

/** Convert "2025.md" to "2025", "quest-based.md" to "quest-based", etc. */
export function slugFromFilename(filename: string): string {
  return basename(filename, ".md")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .toLowerCase();
}

export function parsePostFile(absPath: string): ParsedPost {
  const raw = readFileSync(absPath, "utf8");
  const parsed = matter(raw);
  const fm = parsed.data as {
    title: string;
    description: string;
    pubDate: string | Date;
    references?: string[];
  };
  return {
    filename: basename(absPath),
    slug: slugFromFilename(basename(absPath)),
    frontmatter: {
      title: fm.title,
      description: fm.description ?? "",
      pubDate:
        typeof fm.pubDate === "string" ? fm.pubDate : fm.pubDate.toISOString(),
      references: fm.references ?? [],
    },
    body: parsed.content,
  };
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

function keyFor(seed: string): string {
  const hash = seed
    .split("")
    .reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 5381);
  return `k${hash.toString(16)}`;
}

export function buildPostDoc(
  post: ParsedPost,
  body: ArbitraryTypedObject[],
): PostDoc {
  // Normalise publishedAt to ISO.
  const date = new Date(post.frontmatter.pubDate);
  if (Number.isNaN(date.getTime())) {
    throw new Error(
      `[post:${post.slug}] could not parse pubDate '${post.frontmatter.pubDate}'`,
    );
  }
  const publishedAt = date.toISOString();

  const references = (post.frontmatter.references ?? [])
    .filter((r) => typeof r === "string" && r.trim().length > 0)
    .map((label, idx) => {
      const isUrl = /^https?:\/\//i.test(label);
      const entry: PostDoc["references"][number] = {
        _type: "postReference",
        _key: keyFor(`${post.slug}-ref-${idx}-${label}`),
        label: isUrl ? label : label,
      };
      if (isUrl) entry.url = label;
      return entry;
    });

  return {
    _id: `post-${post.slug}`,
    _type: "post",
    title: post.frontmatter.title,
    slug: { _type: "slug", current: post.slug },
    description: post.frontmatter.description,
    publishedAt,
    body,
    references: references.length > 0 ? references : undefined,
    // hero is intentionally left undefined; reviewers can set it in Studio.
  };
}

export function readLinkPageEntries(jsonAbsPaths: string[]): LinkPageEntry[] {
  return jsonAbsPaths.map((p) => {
    const raw = readFileSync(p, "utf8");
    const data = JSON.parse(raw) as {
      title: string;
      url: string;
      description: string;
    };
    return {
      filename: basename(p, ".json"),
      title: data.title,
      url: data.url,
      description: data.description,
    };
  });
}

export function buildLinkDoc(
  entry: LinkPageEntry,
  index: number,
): ExternalLinkDoc {
  const slug = entry.filename
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .toLowerCase();
  return {
    _id: `externalLink-${slug}`,
    _type: "externalLink",
    title: entry.title,
    url: entry.url,
    description: entry.description,
    order: index,
  };
}

export interface SiteSettingsAssets {
  defaultOg: UploadedAsset | null;
  favicon: UploadedAsset | null;
}

export function buildSiteSettings(
  consts: {
    siteTitle: string;
    siteDescription: string;
    twitterHandle: string;
    twitterDescription: string;
    marqueeText: string;
    headerGreeting: string;
  },
  assets: SiteSettingsAssets,
): SiteSettingsDoc {
  const doc: SiteSettingsDoc = {
    _id: "siteSettings",
    _type: "siteSettings",
    siteTitle: consts.siteTitle,
    siteDescription: consts.siteDescription,
    twitterHandle: consts.twitterHandle,
    twitterDescription: consts.twitterDescription,
    marqueeText: consts.marqueeText,
    headerGreeting: consts.headerGreeting,
  };
  if (assets.defaultOg) {
    doc.defaultOgImage = {
      _type: "imageWithAlt",
      alt: "My daily bliss blog",
      asset: { _type: "reference", _ref: assets.defaultOg.assetId },
    };
  }
  if (assets.favicon) {
  doc.favicon = {
      _type: "image",
      asset: { _type: "reference", _ref: assets.favicon.assetId },
    };
  }
  return doc;
}

/** Used by --force pre-check */
export function allDocIds(
  postDocs: PostDoc[],
  linkDocs: ExternalLinkDoc[],
  settings: SiteSettingsDoc,
): string[] {
  return [
    settings._id,
    ...postDocs.map((d) => d._id),
    ...linkDocs.map((d) => d._id),
  ];
}

// Cast helper for sanity client transaction
export type AnyDoc = PostDoc | ExternalLinkDoc | SiteSettingsDoc;
