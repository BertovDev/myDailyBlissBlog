#!/usr/bin/env bun
/**
 * One-shot migration from local markdown + json content into Sanity.
 *
 * See scripts/README.md for usage.
 */

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { createClient, type SanityClient } from "@sanity/client";
import { collectImagePathsFromMarkdown, uploadAssets } from "./lib/upload-assets.js";
import { AssetCache } from "./lib/asset-cache.js";
import { withRetry } from "./lib/retry.js";
import {
  buildLinkDoc,
  buildPostDoc,
  buildSiteSettings,
  parsePostFile,
  readLinkPageEntries,
  type AnyDoc,
  type ExternalLinkDoc,
  type PostDoc,
  type SiteSettingsDoc,
} from "./lib/build-documents.js";
import { markdownToPortableText } from "./lib/md-to-portable-text.js";
import type { ConversionWarning, ParsedPost } from "./lib/types.js";

const PROJECT_ROOT = resolve(import.meta.dir, "..");

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes("--dry-run");
const FORCE = argv.includes("--force");
const APPLY = argv.includes("--apply") || (!DRY_RUN && !argv.includes("--help"));

if (argv.includes("--help")) {
  console.log(`
Usage: bun scripts/migrate-to-sanity.ts [--dry-run|--apply] [--force]

Modes:
  --dry-run        Write planned documents to scripts/migration-output.ndjson.
                   No Sanity API calls are made (assets are simulated).
  --apply          (default) Upload assets and create documents.
  --force          Allow overwriting documents that already exist.
`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Logging helpers (color-free, dependency-free).
// ---------------------------------------------------------------------------
const log = (msg: string) => console.log(msg);
const warnings: ConversionWarning[] = [];

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------

loadEnv({ path: resolve(PROJECT_ROOT, ".env.local") });

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function makeClient(): SanityClient {
  const projectId = requireEnv("PUBLIC_SANITY_PROJECT_ID");
  const dataset = requireEnv("PUBLIC_SANITY_DATASET");
  const token = requireEnv("SANITY_EDITOR_TOKEN");
  return createClient({
    projectId,
    dataset,
    token,
    useCdn: false,
    apiVersion: "2025-01-01",
  });
}

// ---------------------------------------------------------------------------
// Static config sourced from existing files (per Phase 4 spec).
// ---------------------------------------------------------------------------

const SITE_CONSTANTS = {
  siteTitle: "Life archive",
  siteDescription: "My daily bliss blog",
  twitterHandle: "@YourTwitterHandle",
  twitterDescription: "Things that fills me and find cool in a daily basis",
  marqueeText: "DAILY REMINDER, BUILD.",
  headerGreeting: "Welcome",
};

const SITE_DEFAULT_OG = "/jump.jpg";
const SITE_FAVICON = "/icon.png";

// ---------------------------------------------------------------------------
// Migration pipeline
// ---------------------------------------------------------------------------

async function main() {
  log("=".repeat(60));
  log(`mode: ${DRY_RUN ? "DRY-RUN" : "APPLY"}${FORCE ? " --force" : ""}`);
  log("=".repeat(60));

  // 1. Collect post markdown files.
  const blogDir = resolve(PROJECT_ROOT, "src/content/blog");
  const postFiles = readdirSync(blogDir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => resolve(blogDir, f));
  log(`[posts] discovered ${postFiles.length} markdown files`);

  const parsedPosts: ParsedPost[] = postFiles.map(parsePostFile);

  // 2. Collect link page entries.
  const linkDir = resolve(PROJECT_ROOT, "src/content/linkPage");
  const linkFiles = readdirSync(linkDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => resolve(linkDir, f))
    .sort();
  log(`[links] discovered ${linkFiles.length} link json files`);
  const linkEntries = readLinkPageEntries(linkFiles);

  // 3. Lazily build a client (skipped entirely in dry-run).
  const client = DRY_RUN ? null : makeClient();

  // 3b. Asset cache survives partial failures across runs.
  const cache = DRY_RUN
    ? undefined
    : new AssetCache(
        resolve(PROJECT_ROOT, "scripts/.migration-assets.json"),
        requireEnv("PUBLIC_SANITY_PROJECT_ID"),
        requireEnv("PUBLIC_SANITY_DATASET"),
      );
  if (cache) log(`[cache] ${cache.size()} previously uploaded assets cached`);

  // 4. Pre-flight: optionally check for existing docs (skip in dry-run).
  if (!DRY_RUN && client && !FORCE) {
    const targetIds = [
      "siteSettings",
      ...parsedPosts.map((p) => `post-${p.slug}`),
      ...linkEntries.map((e) => {
        const slug = e.filename
          .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
          .replace(/[_\s]+/g, "-")
          .toLowerCase();
        return `externalLink-${slug}`;
      }),
    ];
    const existing = await withRetry(
      () => client.fetch<string[]>(`*[_id in $ids]._id`, { ids: targetIds }),
      { label: "pre-flight fetch", log, retries: 3 },
    );
    if (existing && existing.length > 0) {
      throw new Error(
        `Refusing to overwrite ${existing.length} existing docs without --force:\n  ${existing.join("\n  ")}`,
      );
    }
  }

  // 5. Collect every image referenced by post bodies + site settings imgs.
  const bodyImagePaths = collectImagePathsFromMarkdown(
    parsedPosts.map((p) => p.body),
  );
  const settingsImagePaths = [SITE_DEFAULT_OG, SITE_FAVICON];
  const allImagePaths = [
    ...new Set([...bodyImagePaths, ...settingsImagePaths]),
  ].sort();
  log(`[assets] ${allImagePaths.length} distinct images to handle`);

  const uploadClient =
    client ??
    // dummy client typing only — uploadAssets won't be called in dry-run mode
    (null as unknown as SanityClient);

  const assetMap = await uploadAssets(allImagePaths, {
    client: uploadClient,
    projectRoot: PROJECT_ROOT,
    dryRun: DRY_RUN,
    log,
    cache,
  });

  // 6. Convert posts to Portable Text + build docs.
  const postDocs: PostDoc[] = [];
  for (const post of parsedPosts) {
    log(`[post] converting ${post.filename}...`);
    const blocks = await markdownToPortableText(post.body, {
      assetMap,
      galleries: [],
      filename: post.filename,
      warn: (msg, line) => {
        warnings.push({ file: post.filename, line, message: msg });
        log(`  ! ${msg}`);
      },
    });
    const doc = buildPostDoc(post, blocks);
    postDocs.push(doc);
    log(`[post] built ${doc._id} (${blocks.length} blocks)`);
  }

  // 7. Build externalLink docs.
  const linkDocs: ExternalLinkDoc[] = linkEntries.map((e, i) =>
    buildLinkDoc(e, i),
  );
  for (const d of linkDocs) log(`[link] built ${d._id}`);

  // 8. Build siteSettings doc.
  const settings = buildSiteSettings(SITE_CONSTANTS, {
    defaultOg: assetMap.get(SITE_DEFAULT_OG) ?? null,
    favicon: assetMap.get(SITE_FAVICON) ?? null,
  });
  log(`[settings] built ${settings._id}`);

  // 9. Output.
  const allDocs: AnyDoc[] = [settings, ...postDocs, ...linkDocs];
  await writeNdjson(allDocs);

  // 10. Commit or print plan.
  if (DRY_RUN) {
    printSummary(postDocs, linkDocs, settings, assetMap.size);
    if (warnings.length) printWarnings();
    log(`[done] dry-run complete. Output: scripts/migration-output.ndjson`);
    return;
  }

  if (!client) throw new Error("client not initialised");

  // Per-doc commits with retry. Smaller payloads survive flaky edges,
  // and a transient failure on one doc doesn't roll back the others.
  log(`[commit] ${allDocs.length} docs (one mutation per doc)`);
  for (const [i, doc] of allDocs.entries()) {
    await withRetry(
      () => client.createOrReplace(doc as unknown as AnyDoc),
      { label: `commit ${doc._id}`, log, retries: 4 },
    );
    log(`[commit] ${i + 1}/${allDocs.length} ok (${doc._id})`);
  }

  printSummary(postDocs, linkDocs, settings, assetMap.size);
  if (warnings.length) printWarnings();
  log(`[done] migration applied.`);
}

async function writeNdjson(docs: AnyDoc[]) {
  const outDir = resolve(PROJECT_ROOT, "scripts");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, "migration-output.ndjson");
  const body = docs.map((d) => JSON.stringify(d)).join("\n") + "\n";
  writeFileSync(outPath, body, "utf8");
  log(`[output] wrote ${docs.length} docs to ${outPath}`);
}

function printSummary(
  posts: PostDoc[],
  links: ExternalLinkDoc[],
  settings: SiteSettingsDoc,
  assetCount: number,
) {
  log("");
  log("Summary");
  log("-------");
  log(`  posts:         ${posts.length}`);
  log(`  externalLinks: ${links.length}`);
  log(`  siteSettings:  1 (${settings._id})`);
  log(`  assets:        ${assetCount}`);
  log("");
  log("Sample post doc:");
  if (posts[0]) {
    const sample = { ...posts[0], body: `[${posts[0].body.length} blocks]` };
    log(JSON.stringify(sample, null, 2).split("\n").slice(0, 25).join("\n"));
  }
}

function printWarnings() {
  log("");
  log(`Warnings (${warnings.length})`);
  log("---------------------------");
  for (const w of warnings) {
    log(`  [${w.file}${w.line ? `:${w.line}` : ""}] ${w.message}`);
  }
}

// ---------------------------------------------------------------------------

main().catch((err) => {
  // Never leak the token.
  const safe = (err as Error).message?.replace(
    process.env.SANITY_EDITOR_TOKEN ?? "__no_token__",
    "<redacted>",
  );
  console.error("");
  console.error(`migration failed: ${safe ?? err}`);
  process.exit(1);
});

// Discard unused variable warning
void APPLY;
