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

## The return trip (solvestack-reply v1)

Every task prompt ends with a **reply contract**: the model answers in
prose, then appends one fenced `solvestack-reply` JSON block — proposed
new entries, hypothesis updates (matched by verbatim text), new next
steps, and an optional resolution draft. Back in SolveStack, **Apply AI
reply** (session toolbar) parses the pasted answer as untrusted input
(strict kind/version/session checks, caps, whitelist coercion), shows an
itemized preview — including anything that could *not* be applied, with
the reason — and only mutates the session on confirmation. A reply that
names a different session is refused. Applying appends a Decision entry
recording what the model proposed and the user accepted, and a
resolution draft never resolves the session by itself. The parser lives
in `src/ai-reply.ts`; the contract text in `src/agent-tasks.ts`
(`buildReplyContract`) is the single source both the prompts and the
skill kit are generated from.

## Delta packs

After any successful pack export, SolveStack remembers (device-locally,
in `localStorage` — deliberately not in the session schema) when the pack
left and the hypothesis states at that moment. The next export dialog
then offers **Changes since last pack**: entries created after the
marker plus hypotheses whose status changed, through the same redaction
path, with the prompt and `AGENT.md` marked as a delta so the model
knows earlier record is not shown. If nothing changed, the app says so
instead of building an empty pack. The evidence manifest still lists all
of the session's attachments (metadata only, as always).

## The skill kit

**Settings → Portability → AI skill kit** downloads a ZIP generated from
the same constants as the in-app prompts: an Agent Skills folder
(`solvestack-adapter/SKILL.md` + the five tasks under `references/`) and a
README with per-tool notes. Tools that support skill folders can load it
once; everywhere else the SKILL.md text serves as project/custom
instructions. The pack + paste flow remains the portable path — notably
in ChatGPT, whose plugin directory is curated and whose MCP connections
require a public HTTPS server SolveStack deliberately does not run.

Public guide: `/agent-adapter/`.
