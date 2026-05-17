# Sanity migration script

One-shot migration of legacy local content into the Sanity dataset.

What it moves:

| Source                                | Sanity destination          |
| ------------------------------------- | --------------------------- |
| `src/content/blog/*.md`               | `post` documents            |
| `src/content/linkPage/*.json`         | `externalLink` documents    |
| `consts.ts`, `Layout.astro`, `Header.astro` constants | `siteSettings` (singleton) |
| `public/2025_images/*.webp`, inline post images, `/jump.jpg`, `/icon.png` | Sanity image assets |

Strategy A is in effect — best-effort Markdown -> HTML -> Portable Text with custom rules:

- `<span style="color:#9571D5;font-weight:800">…</span>` becomes the `highlight` decorator.
- `<a href>` becomes a `link` annotation.
- `<img>` becomes an `imageWithAlt` block.
- The `<div id="image-grid">` in `2025.md` collapses to a single `imageGallery` block (the inline `<script>` and `<div id="image-modal">` are stripped — they are replaced by `ImageGalleryBlock.astro`).

Document IDs are deterministic (`post-<slug>`, `externalLink-<filename>`, `siteSettings`) so re-running with `--force` is safe.

## Prerequisites

`.env.local` (at the repo root) must have:

```
PUBLIC_SANITY_PROJECT_ID=...
PUBLIC_SANITY_DATASET=production
SANITY_EDITOR_TOKEN=<write token>
```

## Usage

```bash
# 1. Preview without writing anything to Sanity:
bun scripts/migrate-to-sanity.ts --dry-run

# 2. Apply (uploads assets, creates documents):
bun scripts/migrate-to-sanity.ts

# 3. Re-run after fixing something (overwrites existing docs by deterministic _id):
bun scripts/migrate-to-sanity.ts --force
```

Equivalent npm script: `bun run migrate:sanity`.

## Output

- `scripts/migration-output.ndjson` — the planned documents (always written, even in `--apply` mode for audit).
- Console summary: counts by type, asset count, conversion warnings.

## Known caveats

- `hero` is intentionally left **undefined** on every post (no markdown frontmatter declared a designated hero). Pick one in Sanity Studio per post after migration.
- The first inline image in `2025.md` is `/2025_images/hedo.webp` — feel free to promote it to the hero.
- Anchors in `2025.md` that are malformed (`<a ...>...<a>` instead of `</a>`) are emitted as plain text — the script logs them.
