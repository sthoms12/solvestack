# SolveStack

SolveStack is a static, local-first troubleshooting workspace for IT professionals.

## Run

```bash
bun install
bun run dev
```

Build for Cloudflare Pages, GitHub Pages, or any static host with `bun run build`. The deployable output is `dist/`.

## Cloudflare Pages

Connect the `sthoms12/solvestack` GitHub repository and use:

- Production branch: `main`
- Framework preset: Vite
- Build command: `bun run build`
- Build output directory: `dist`
- Root directory: `/`

No environment variables, server functions, database, or runtime compatibility flags are required.

The source includes indexable fallback content, a canonical URL for `https://solvestack-ai.app/`, robots and sitemap directives, SoftwareApplication structured data, Open Graph and Twitter metadata, a 1200×630 social image, and Cloudflare cache/security headers.

## Boundaries

No account, backend, cloud database, AI, or network service is required. The MVP stores sessions and evidence in IndexedDB and provides deterministic Markdown, standalone HTML, JSON, backup, and ZIP knowledge-package export. The service worker caches the application shell for offline use after the first load.

The data format is versioned (`schemaVersion: 2`) with an executable version-1 migration. JSON import accepts individual session exports and full backups, reports ID conflicts, and preserves existing investigations.

The persistence boundary and migration policy are documented in `docs/DATA-MODEL.md`. Use `docs/RELEASE-CHECKLIST.md` for repeatable static releases.

## Verification

The current verification suite covers the static build and PWA shell, versioned data contracts, backup merge and corruption rejection, required export sections, ZIP signatures and evidence paths, attachment limits, quota-specific storage failure messaging, transaction-abort handling, accessible live status/labels on core controls, and registered domain tests for search ranking, related-session explanations, redaction, and backup merging.

Search and related-investigation matching share deterministic domain logic. Selective reuse uses a labeled modal, and attachment removal is keyed by attachment ID rather than filename or rendered page text. Knowledge-article Markdown and RCA Markdown are separate deterministic outputs. Evidence capture includes image/text previews, descriptions, technical-content copy controls, and embedded images in standalone HTML.

Browser smoke coverage has also been completed for dashboard/session rendering, IndexedDB persistence across reload, mobile layout, offline reload after initial load, attachment capture, static PWA endpoints, the core session accessibility tree, and controlled storage-quota failure handling. A full manual screen-reader audit and deployment to an external static host remain environment-dependent checks rather than automated guarantees.
