# SolveStack agent adapter

SolveStack does not host a model. The agent adapter is a **bring-your-own** protocol:

1. Capture the investigation locally.
2. Export **Agent pack** from the session toolbar. Pick what the AI should do
   (review, executive summary, KB article, contradiction audit, prevention
   review) and the format: a ZIP of files to upload, a single Markdown
   **paste pack** for a chat box, or a one-click handoff — **Open in
   ChatGPT** or **Open in Claude** copies the paste pack to your clipboard
   and opens the tool with the prompt prefilled, so your whole job is one
   paste. (The prefill is a best-effort URL convention; if it does not
   land, the copied pack still completes the flow.) Dismissing the dialog
   exports the plain pack, as before tasks existed.
3. Review the redacted pack, then open it in an organization-approved tool.
4. Optionally inspect the ZIP with `bun scripts/agent-pack-inspect.mjs path/to/pack.zip`.

Public guide: `/agent-adapter/`.
