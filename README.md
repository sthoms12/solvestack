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

The Worker asset runtime is defined in `wrangler.jsonc`. It uses `not_found_handling: "404-page"` so unknown URLs return the custom `404.html` with an HTTP 404 response instead of the application shell. A narrowly scoped Worker handler also returns that response for the stale indexed `/key.php` path.

## Boundaries

No account, backend, cloud database, hosted AI, or network service is required. The MVP stores sessions and evidence in IndexedDB (large evidence prefers OPFS when available) and provides deterministic Markdown, standalone HTML, JSON, backup, ZIP knowledge-package, encrypted vault, and redacted agent-pack export. Method deep links (`/?method=rca`, `5-whys`, `fishbone`, `incident-report`) seed structured investigations. The Pattern Desk surfaces recurring systems, tags, root causes, and ruled-outs on-device. The service worker precaches every page, the fonts, and the built assets, so the whole site works offline on a first visit; fonts are self-hosted in `public/fonts` and no request goes to Google Fonts. When a new service worker takes over, the app prompts to reload instead of swapping silently.

The site uses Cloudflare Web Analytics, which is cookieless, records aggregate page views, and does not read locally stored data.

The data format is versioned (`schemaVersion: 3`) with executable migrations from versions 1 and 2. JSON import accepts individual session exports and full backups, reports ID conflicts, and preserves existing investigations. Encrypted vault import uses the same merge policy after local passphrase decrypt.

The persistence boundary and migration policy are documented in `docs/DATA-MODEL.md`. Use `docs/RELEASE-CHECKLIST.md` for repeatable static releases.

First-time users receive a dismissible workflow introduction, and the persistent field guide explains the Capture → Structure → Investigate → Resolve → Document → Reuse model with a realistic IT example. Settings includes durable audience, product-boundary, local-privacy, backup, and knowledge-repository guidance.

The in-app **Use your data** guide explains what each export format is for and how completed investigations can become searchable knowledge, runbooks, AI-assisted reviews, readable handoffs, and durable archives. A public vendor-neutral guide is available at `https://solvestack-ai.app/use-your-data/`, with privacy guardrails and reusable prompts for organization-approved AI tools. SolveStack itself never uploads or analyzes exported data.

## Verification

The current verification suite covers the static build and PWA shell, versioned data contracts, backup merge and corruption rejection, required export sections, ZIP signatures and evidence paths, attachment limits, quota-specific storage failure messaging, transaction-abort handling, accessible live status/labels on core controls, and registered domain tests for search ranking, related-session explanations, redaction, and backup merging.

Search and related-investigation matching share deterministic domain logic. Selective reuse uses a labeled modal, and attachment removal is keyed by attachment ID rather than filename or rendered page text. Knowledge-article Markdown and RCA Markdown are separate deterministic outputs. Evidence capture includes image/text previews, descriptions, technical-content copy controls, and embedded images in standalone HTML.

Browser smoke coverage has also been completed for dashboard/session rendering, IndexedDB persistence across reload, mobile layout, offline reload after initial load, attachment capture, static PWA endpoints, the core session accessibility tree, and controlled storage-quota failure handling. A full manual screen-reader audit and deployment to an external static host remain environment-dependent checks rather than automated guarantees.
