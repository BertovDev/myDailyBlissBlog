/**
 * Special handling for the 2025.md custom image grid + modal.
 *
 * We collapse the entire `<div id="image-grid">...</div>` block (containing 32
 * `<img>` tags) into a single placeholder string that the markdown->PT
 * converter can replace with a synthetic `imageGallery` block.
 *
 * We also strip the inline `<script>`, `<style>`, and `<div id="image-modal">`
 * blocks because the new Astro `ImageGalleryBlock.astro` provides equivalent
 * UI/UX.
 *
 * Strategy: do a textual extraction BEFORE marked() processes the markdown,
 * because marked would otherwise emit raw HTML interspersed with paragraphs
 * which is brittle to detect. After extraction we leave a custom HTML comment
 * marker which we later swap for the gallery block.
 */

export interface ExtractedGallery {
  /** Web-rooted paths in document order (deduped) */
  imagePaths: string[];
  /** Unique marker placed at the original location for downstream replacement */
  marker: string;
}

export interface GalleryExtractionResult {
  body: string; // markdown body with gallery + script/style/modal stripped
  galleries: ExtractedGallery[];
}

const GALLERY_MARKER_PREFIX = "<!--SANITY_GALLERY:";
const GALLERY_MARKER_SUFFIX = "-->";

export function galleryMarker(id: number): string {
  return `${GALLERY_MARKER_PREFIX}${id}${GALLERY_MARKER_SUFFIX}`;
}

export function isGalleryMarkerLine(line: string): number | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith(GALLERY_MARKER_PREFIX)) return null;
  if (!trimmed.endsWith(GALLERY_MARKER_SUFFIX)) return null;
  const inner = trimmed.slice(
    GALLERY_MARKER_PREFIX.length,
    trimmed.length - GALLERY_MARKER_SUFFIX.length,
  );
  const n = Number.parseInt(inner, 10);
  return Number.isFinite(n) ? n : null;
}

/** Match `<div ... id="image-grid" ...>` and pair it with its closing `</div>` */
function extractFirstBalancedDiv(
  body: string,
  openRegex: RegExp,
): { start: number; end: number; inner: string } | null {
  openRegex.lastIndex = 0;
  const openMatch = openRegex.exec(body);
  if (!openMatch) return null;
  const start = openMatch.index;
  const afterOpen = openMatch.index + openMatch[0].length;

  // Walk and balance div tags.
  const tagRegex = /<\/?div\b[^>]*>/gi;
  tagRegex.lastIndex = afterOpen;
  let depth = 1;
  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(body)) !== null) {
    if (match[0].startsWith("</")) {
      depth -= 1;
      if (depth === 0) {
        const end = match.index + match[0].length;
        return { start, end, inner: body.slice(afterOpen, match.index) };
      }
    } else {
      depth += 1;
    }
  }
  return null;
}

const IMG_SRC_REGEX = /<img[^>]+src=["']([^"']+)["']/gi;

export function extractGalleries(body: string): GalleryExtractionResult {
  const galleries: ExtractedGallery[] = [];
  let current = body;

  // 1. Extract every `<div id="image-grid">...</div>` (typically 1).
  for (;;) {
    const found = extractFirstBalancedDiv(
      current,
      /<div\b[^>]*\bid=["']image-grid["'][^>]*>/i,
    );
    if (!found) break;

    const seen = new Set<string>();
    const paths: string[] = [];
    IMG_SRC_REGEX.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = IMG_SRC_REGEX.exec(found.inner)) !== null) {
      const src = m[1];
      if (!src || !src.startsWith("/")) continue;
      if (seen.has(src)) continue;
      seen.add(src);
      paths.push(src);
    }

    const id = galleries.length;
    galleries.push({ imagePaths: paths, marker: galleryMarker(id) });
    current =
      current.slice(0, found.start) +
      `\n\n${galleryMarker(id)}\n\n` +
      current.slice(found.end);
  }

  // 2. Strip `<div id="image-modal">...</div>`
  for (;;) {
    const found = extractFirstBalancedDiv(
      current,
      /<div\b[^>]*\bid=["']image-modal["'][^>]*>/i,
    );
    if (!found) break;
    current = current.slice(0, found.start) + current.slice(found.end);
  }

  // 3. Strip inline <script>...</script>
  current = current.replace(/<script\b[\s\S]*?<\/script>/gi, "");

  // 4. Strip inline <style>...</style>
  current = current.replace(/<style\b[\s\S]*?<\/style>/gi, "");

  return { body: current, galleries };
}
