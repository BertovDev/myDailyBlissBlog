/**
 * Disk-persisted cache of uploaded Sanity assets, keyed by file sha256.
 *
 * Lets the migration script survive partial failures: rerunning will skip
 * any asset that was already uploaded to the target dataset.
 *
 * The cache is namespaced by projectId + dataset so switching datasets
 * doesn't reuse stale asset IDs.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

interface CacheEntry {
  assetId: string;
  url: string;
  filename: string;
  contentType: string;
}

interface CacheFile {
  projectId: string;
  dataset: string;
  entries: Record<string, CacheEntry>; // key = sha256
}

export class AssetCache {
  private data: CacheFile;
  constructor(
    private filePath: string,
    private projectId: string,
    private dataset: string,
  ) {
    if (existsSync(filePath)) {
      try {
        const raw = JSON.parse(readFileSync(filePath, "utf8")) as CacheFile;
        if (raw.projectId === projectId && raw.dataset === dataset) {
          this.data = raw;
          return;
        }
      } catch {
        // fall through to fresh cache
      }
    }
    this.data = { projectId, dataset, entries: {} };
  }

  get(sha256: string): CacheEntry | undefined {
    return this.data.entries[sha256];
  }

  set(sha256: string, entry: CacheEntry): void {
    this.data.entries[sha256] = entry;
    this.flush();
  }

  size(): number {
    return Object.keys(this.data.entries).length;
  }

  private flush(): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), "utf8");
  }
}
