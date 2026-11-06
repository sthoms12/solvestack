# SolveStack agent adapter

SolveStack does not host a model. The agent adapter is a **bring-your-own** protocol:

1. Capture the investigation locally.
2. Export **Agent pack** from the session toolbar. Pick what the AI should do
   (review, executive summary, KB article, contradiction audit, prevention
   review) and the format: a ZIP of files to upload, or a single Markdown
   **paste pack** for a chat box. Dismissing the dialog exports the plain
   pack, as before tasks existed.
3. Review the redacted pack, then open it in an organization-approved tool.
4. Optionally inspect the ZIP with `bun scripts/agent-pack-inspect.mjs path/to/pack.zip`.

Public guide: `/agent-adapter/`.
