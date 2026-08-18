# SolveStack release checklist

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
