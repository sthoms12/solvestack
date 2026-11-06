/**
 * AI tasks for agent packs. SolveStack does not call a model: a task is a
 * prompt scaffold the user carries, with the redacted pack, to an
 * organization-approved AI tool (ChatGPT, Claude, Copilot, Gemini — the
 * pack format is the same for all of them).
 *
 * Redaction invariant: buildAgentPrompt takes the REDACTED session (the
 * same contract as agentPackReadme in agent-pack.ts). The only callers are
 * the pack builders in agent-pack.ts, which redact first; nothing here
 * ever sees a raw session.
 */
import type { AgentPackSession } from "./agent-pack";

export type AgentTaskId =
  | "review"
  | "summarize"
  | "kb-article"
  | "contradiction"
  | "prevention";

export type AgentTask = {
  id: AgentTaskId;
  label: string;
  description: string;
  instructions: string;
  /** What to put in the solvestack-reply block (see buildReplyContract). */
  replyGuidance: string;
};

export const AGENT_TASKS: AgentTask[] = [
  {
    id: "review",
    label: "Review this investigation",
    description: "Evidence gaps, untested hypotheses, next steps",
    instructions: `Review the investigation as a senior peer.
- Name the strongest and weakest parts of the evidence trail.
- List hypotheses that are still open and what test would settle each one.
- Point out any conclusion the recorded evidence does not yet support.
- End with the three highest-value next steps, in order.`,
    replyGuidance:
      "In the reply block: include hypothesisUpdates for any hypothesis your review bears on, and newTasks for your three next steps.",
  },
  {
    id: "summarize",
    label: "Executive summary + timeline",
    description: "A brief a non-technical reader can act on",
    instructions: `Write an executive summary of this investigation for a non-technical reader.
- Open with impact: what broke, who was affected, and whether it is resolved.
- Rebuild the timeline from entry timestamps: first detection, key turning points, resolution.
- Keep it under 300 words and free of jargon; define any technical term you must use.
- Close with what is being done so it does not recur.`,
    replyGuidance:
      "In the reply block: include the finished summary as a single newEntries item of type Note.",
  },
  {
    id: "kb-article",
    label: "Draft a knowledge-base article",
    description: "Turn a resolved session into a reusable article",
    instructions: `Draft a knowledge-base article from this resolved investigation.
Use these sections: Symptom · Environment · Root cause · Fix · Validation · Prevention.
- Write steps a colleague can follow without this session open.
- Keep commands, error text, and product names verbatim from the record.
- If a section has no supporting facts in the record, write "Not recorded" rather than inventing content.`,
    replyGuidance:
      "In the reply block: include the finished article as a single newEntries item of type Note.",
  },
  {
    id: "contradiction",
    label: "Audit the reasoning (contradictions)",
    description: "Ruled-outs and conclusions the evidence doesn't support",
    instructions: `Audit the reasoning in this investigation.
- For every hypothesis marked ruled out, quote the evidence its reasoning rests on. Flag any ruled-out whose cited evidence is missing, ambiguous, or also consistent with the hypothesis being true.
- Do the same for the declared root cause: list the entries that support it and any that cut against it.
- Separate "contradicted by evidence" from "not yet proven" — they are different findings.`,
    replyGuidance:
      "In the reply block: include hypothesisUpdates for every hypothesis you audited, with reasoning that quotes the evidence you relied on.",
  },
  {
    id: "prevention",
    label: "Prevention review",
    description: "Turn prevention notes into an owned follow-up plan",
    instructions: `Turn this investigation's prevention material into a follow-up plan.
- List each prevention action implied by the resolution, with a suggested owner role and a realistic timeframe.
- Flag prevention gaps: failure modes this incident exposed that no recorded action covers (monitoring, alerting, documentation, capacity).
- Order the plan by risk reduced per unit of effort.`,
    replyGuidance:
      "In the reply block: include newTasks for the follow-up plan, ordered as in your answer.",
  },
];

export function agentTaskById(id: string | null | undefined): AgentTask {
  return AGENT_TASKS.find((task) => task.id === id) ?? AGENT_TASKS[0];
}

export const AGENT_STANDING_RULES = `Rules:
1. Use only facts present in this pack. Do not invent timeline events, root causes, or evidence that is missing.
2. Treat every [REDACTED] token as intentionally removed — do not guess it.
3. Prefer citing entry timestamps and hypothesis statuses over paraphrasing.
4. Separate observed facts from suggestions, and label which is which.`;

/**
 * The return-trip contract (solvestack-reply v1): the model answers in
 * prose, then ends with one fenced JSON block the app can apply after a
 * user preview (src/ai-reply.ts parses it as untrusted input). The skill
 * kit export reuses this text verbatim so the contract cannot drift.
 */
export function buildReplyContract(taskId: string): string {
  return `End your reply with exactly one fenced block in this format, so the user can apply your work in SolveStack with one paste:

\`\`\`solvestack-reply
{
  "kind": "solvestack-reply",
  "version": 1,
  "sessionId": "<the session id from the record>",
  "task": "${taskId}",
  "summary": "One or two sentences: the headline of your answer.",
  "newEntries": [{ "type": "Note", "content": "..." }],
  "hypothesisUpdates": [{ "matchText": "<hypothesis text copied verbatim from the record>", "status": "Ruled Out", "reasoning": "..." }],
  "newTasks": ["..."],
  "resolutionDraft": { "rootCause": "...", "fix": "...", "validation": "...", "prevention": "..." }
}
\`\`\`

Include only the fields your answer actually supports — omit the rest. Copy hypothesis text exactly; the app matches on it. Hypothesis status must be one of: Investigating, Likely, Confirmed, Ruled Out. Entry type must be one of: Note, Observation, Action, Evidence, Hypothesis, Decision. Everything in the block is a proposal: the user reviews it in a preview before anything is applied, and a resolutionDraft never resolves the session by itself.`;
}

function hypothesisSummary(session: AgentPackSession): string {
  if (session.hypotheses.length === 0) return "none recorded";
  const counts = new Map<string, number>();
  for (const hypothesis of session.hypotheses)
    counts.set(
      hypothesis.status,
      (counts.get(hypothesis.status) ?? 0) + 1,
    );
  return [...counts.entries()]
    .map(([status, count]) => `${count} ${status.toLowerCase()}`)
    .join(", ");
}

export type AgentPromptClosing = "files" | "handoff";

/** Build the task prompt from the redacted session (see module comment).
 * The closing line depends on how the record travels: attached as files
 * (ZIP / paste pack) or pasted by the user as their next message after a
 * one-click handoff (see ai-handoff.ts) — where the destination may even
 * auto-submit this prompt before the record arrives. */
export function buildAgentPrompt(
  session: AgentPackSession,
  task: AgentTask,
  closing: AgentPromptClosing = "files",
  deltaSince?: string,
): string {
  const starred = session.entries.filter((entry) => entry.starred).length;
  const tasksDone = session.tasks.filter((item) => item.completed).length;
  const resolved = Boolean(
    session.resolution.rootCause || session.resolution.fix,
  );
  return [
    `# SolveStack AI task — ${task.label}`,
    "",
    "This is a redaction-first export from SolveStack, a local troubleshooting workspace. SolveStack does not call a model; a person carried this file to you.",
    "",
    AGENT_STANDING_RULES,
    "",
    "## Session",
    `- Title: ${session.title}`,
    `- Problem: ${session.problem}`,
    `- System: ${session.system || "Not specified"}`,
    `- Status: ${session.status}`,
    ...(deltaSince
      ? [
          `- Pack scope: DELTA — only entries added and hypotheses changed since ${deltaSince} are included below. Earlier record is not shown; do not treat missing history as missing evidence.`,
        ]
      : []),
    `- Entries: ${session.entries.length} (${starred} starred)`,
    `- Hypotheses: ${session.hypotheses.length} (${hypothesisSummary(session)})`,
    `- Tasks: ${tasksDone}/${session.tasks.length} completed`,
    `- Resolution recorded: ${resolved ? "yes" : "no"}`,
    "",
    "## Your task",
    task.instructions,
    "",
    "## How to reply",
    task.replyGuidance,
    "",
    buildReplyContract(task.id),
    "",
    closing === "handoff"
      ? "I will paste the full session record in my next message. Wait for it, then carry out the task above using only that record."
      : "The full redacted session record accompanies this prompt (knowledge.md and session.redacted.json in the ZIP pack, or the sections below in a paste pack).",
  ].join("\n");
}
