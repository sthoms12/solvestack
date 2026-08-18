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
- Verify attachment capture and ZIP evidence paths.
- Verify corrupt backup rejection and merge restore behavior.
- Verify individual session JSON import and conflict confirmation.
- Verify separate knowledge Markdown and RCA Markdown exports.
- Verify quota failure guidance does not silently discard the working entry.
- Review the accessibility tree for named controls and visible focus states.
- Run `bun test tests` and confirm the registered domain tests report passing cases, not only console smoke messages.
- Deploy the contents of `dist/` to the selected static host.
