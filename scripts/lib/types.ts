/**
 * Shared types for the Sanity migration.
 */

export interface UploadedAsset {
  assetId: string;
  url: string;
  sha256: string;
  filename: string;
  contentType: string;
  metadata?: Record<string, unknown>;
  localPath: string; // /jump.jpg, /2025_images/1.webp, etc. (web-rooted public path)
  absPath: string;
}

export type AssetMap = Map<string, UploadedAsset>; // key = web-rooted localPath

export interface LinkPageEntry {
  filename: string;
  title: string;
  url: string;
  description: string;
}

export interface ParsedPostFrontmatter {
  title: string;
  description: string;
  pubDate: string;
  references?: string[];
}

export interface ParsedPost {
  filename: string; // 2025.md
  slug: string; // 2025
  frontmatter: ParsedPostFrontmatter;
  body: string; // raw markdown body
}

export interface ConversionWarning {
  file: string;
  line?: number;
  message: string;
}
