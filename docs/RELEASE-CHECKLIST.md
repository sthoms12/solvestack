# SolveStack release checklist

## Production SEO

- Confirm `https://solvestack-ai.app/` remains the intended canonical origin.
- Confirm the apex domain redirects HTTP to HTTPS without a redirect chain.
- If `www.solvestack-ai.app` is attached, redirect it to `https://solvestack-ai.app/`.
- Confirm `/robots.txt`, `/sitemap.xml`, and `/og-image.png` return HTTP 200.
- Submit the production property and sitemap in Google Search Console.

- Run `bun run build`.
- Run `bun run test`.
- Confirm `dist/index.html`, `dist/manifest.webmanifest`, `dist/service-worker.js`, and `dist/icon.svg` exist.
- Open the built preview and verify dashboard, session capture, export controls, and settings.
- Reload after creating an entry and confirm IndexedDB persistence.
- Verify offline reload after the service worker has cached the shell.
- Verify an offline first visit to each template/guide page loads, and that an uncached offline navigation falls back to the app shell instead of failing.
- Verify the shipped service worker lists the hashed assets (no `__PRECACHE_ASSETS__` token left in `dist/service-worker.js`).
- Verify the manifest serves 192px and 512px PNG icons and the fonts load with no Google Fonts request.
- Verify attachment capture and ZIP evidence paths.
- Verify corrupt backup rejection and merge restore behavior.
- Verify individual session JSON import and conflict confirmation.
- Verify separate knowledge Markdown and RCA Markdown exports.
- Verify Agent pack ZIP contains AGENT.md and redacted JSON without evidence binaries.
- Verify method deep link `/?method=rca` opens a new-session dialog with RCA selected.
- Verify Pattern Desk lists recurring systems after two similar sessions exist.
- Verify encrypted vault export/import with a passphrase round-trips a backup merge.
- Verify quota failure guidance does not silently discard the working entry.
- Verify the backup banner appears with no backup on file and clears after a backup download; Settings shows the last-backup date.
- Verify deleting an entry or an evidence attachment offers Undo for 30 seconds and restores it; verify no `alert()` remains for delete/restore flows.
- Verify scratchpad typing keeps focus while a save is in flight and closing the tab mid-save prompts before leaving.
- Review the accessibility tree for named controls and visible focus states.
- Run `bun test tests` and confirm the registered domain tests report passing cases, not only console smoke messages.
- Deploy the contents of `dist/` to the selected static host.
