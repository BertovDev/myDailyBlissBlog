/**
 * Asset upload + dedup logic for Sanity migration.
 *
 * - Walks every blog markdown file and extracts image src references.
 * - Hashes each file's bytes with sha256 to dedup repeated assets.
 * - In dry-run mode: only logs what WOULD be uploaded.
 * - Otherwise: uploads via client.assets.upload and builds a map.
 */

import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import type { SanityClient } from "@sanity/client";
import type { AssetMap, UploadedAsset } from "./types.js";
import type { AssetCache } from "./asset-cache.js";
import { withRetry } from "./retry.js";

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
};

/** Match every src="/..." attribute value, single or double quoted. */
const IMG_SRC_REGEX = /<img[^>]+src=["']([^"']+)["']/gi;

/**
 * Collect every distinct public-rooted image path referenced by markdown bodies.
 */
export function collectImagePathsFromMarkdown(bodies: string[]): string[] {
  const found = new Set<string>();
  for (const body of bodies) {
    let match: RegExpExecArray | null;
    IMG_SRC_REGEX.lastIndex = 0;
    while ((match = IMG_SRC_REGEX.exec(body)) !== null) {
      const src = match[1];
      if (!src || !src.startsWith("/")) continue;
      found.add(src);
    }
  }
  return [...found].sort();
}

/**
 * Resolve a web-rooted path (/foo.webp) to an absolute fs path under public/.
 */
export function resolvePublicPath(projectRoot: string, webPath: string): string {
  const clean = webPath.replace(/^\/+/, "");
  return resolve(projectRoot, "public", clean);
}

function contentTypeFor(absPath: string): string {
  const ext = extname(absPath).toLowerCase();
  return CONTENT_TYPE_BY_EXT[ext] ?? "application/octet-stream";
}

function sha256OfFile(absPath: string): string {
  const hash = createHash("sha256");
  hash.update(readFileSync(absPath));
  return hash.digest("hex");
}

interface UploadOptions {
  client: SanityClient;
  projectRoot: string;
  dryRun: boolean;
  log: (msg: string) => void;
  cache?: AssetCache;
}

/**
 * Upload (or describe) every image in `webPaths`. Deduped by file content sha256.
 * Returns a map keyed by web-rooted path so multiple paths can share an assetId.
 */
export async function uploadAssets(
  webPaths: string[],
  opts: UploadOptions,
): Promise<AssetMap> {
  const { client, projectRoot, dryRun, log, cache } = opts;
  const map: AssetMap = new Map();
  const byHash = new Map<string, UploadedAsset>();

  for (const webPath of webPaths) {
    const absPath = resolvePublicPath(projectRoot, webPath);
    if (!existsSync(absPath)) {
      throw new Error(
        `[asset] referenced image not found on disk: ${webPath} (expected at ${absPath})`,
      );
    }
    const hash = sha256OfFile(absPath);
    const filename = basename(absPath);
    const contentType = contentTypeFor(absPath);

    // 1. In-run dedup (same hash seen earlier this run)
    const sameRun = byHash.get(hash);
    if (sameRun) {
      log(`[asset] dedup ${webPath} -> ${sameRun.assetId}`);
      map.set(webPath, { ...sameRun, localPath: webPath, absPath });
      continue;
    }

    // 2. Cross-run cache (already uploaded in a previous attempt)
    if (!dryRun && cache) {
      const cached = cache.get(hash);
      if (cached) {
        const reused: UploadedAsset = {
          assetId: cached.assetId,
          url: cached.url,
          sha256: hash,
          filename: cached.filename,
          contentType: cached.contentType,
          localPath: webPath,
          absPath,
        };
        log(`[asset] cache-hit ${webPath} -> ${reused.assetId}`);
        byHash.set(hash, reused);
        map.set(webPath, reused);
        continue;
      }
    }

    if (dryRun) {
      const placeholder: UploadedAsset = {
        assetId: `image-${hash.slice(0, 12)}-dryrun`,
        url: `dryrun://${filename}`,
        sha256: hash,
        filename,
        contentType,
        localPath: webPath,
        absPath,
      };
      log(`[asset] (dry-run) WOULD upload ${webPath} (${contentType})`);
      byHash.set(hash, placeholder);
      map.set(webPath, placeholder);
      continue;
    }

    log(`[asset] uploading ${webPath} (${contentType})...`);
    const result = await withRetry(
      () => {
        const stream = createReadStream(absPath);
        return client.assets.upload("image", stream, { filename, contentType });
      },
      { label: `upload ${webPath}`, log, retries: 4 },
    );
    const uploaded: UploadedAsset = {
      assetId: result._id,
      url: result.url,
      sha256: hash,
      filename,
      contentType,
      metadata: result.metadata as Record<string, unknown> | undefined,
      localPath: webPath,
      absPath,
    };
    log(`[asset] uploaded ${webPath} -> ${uploaded.assetId}`);
    byHash.set(hash, uploaded);
    map.set(webPath, uploaded);
    if (cache) {
      cache.set(hash, {
        assetId: uploaded.assetId,
        url: uploaded.url,
        filename: uploaded.filename,
        contentType: uploaded.contentType,
      });
    }
  }

  return map;
}

/** Useful for adding non-body images (favicon, default OG, hero overrides). */
export async function uploadSingle(
  webPath: string,
  opts: UploadOptions,
): Promise<UploadedAsset> {
  const result = await uploadAssets([webPath], opts);
  const asset = result.get(webPath);
  if (!asset) throw new Error(`[asset] failed to upload single ${webPath}`);
  return asset;
}

// Suppress unused warning for `join` re-export use elsewhere if needed.
void join;
