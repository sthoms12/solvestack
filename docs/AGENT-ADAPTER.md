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
