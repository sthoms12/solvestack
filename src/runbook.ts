/**
 * Convert-to-runbook export (F4). A resolved session proves a fix worked
 * once; a runbook lets the next person follow it. The structure leans on
 * what only SolveStack records: the session's tasks become the steps, the
 * validation becomes the verification, and the ruled-out hypotheses become
 * the "if it doesn't work" section no generic SOP tool can produce.
 *
 * Deliberately unredacted, like Knowledge MD / RCA MD: a runbook is the
 * user's own KB artifact (the data guide's redact-before-sharing warning
 * covers it). The redacted path stays exclusive to the agent pack, where
 * data leaves the organization.
 */

import { escapeMd } from "./domain";

export type RunbookSession = {
  id: string;
  title: string;
  problem: string;
  system: string;
  status: string;
  resolvedAt?: string;
  tasks: { text: string; completed: boolean }[];
  hypotheses: { text: string; status: string; reasoning: string }[];
  resolution: {
    rootCause: string;
    fix: string;
    validation: string;
    prevention: string;
  };
};

const NOT_RECORDED = "Not recorded";

export function buildRunbook(
  session: RunbookSession,
  evidenceNames: string[] = [],
): string {
  const ruledOut = session.hypotheses.filter((h) => h.status === "Ruled Out");
  const steps =
    session.tasks.length > 0
      ? session.tasks.map((task) => `- [ ] ${escapeMd(task.text)}`).join("\n")
      : session.resolution.fix || NOT_RECORDED;
  return [
    `# Runbook: ${escapeMd(session.title)}`,
    "",
    `- System: ${escapeMd(session.system || NOT_RECORDED)}`,
    `- Source session: ${session.id}${session.resolvedAt ? ` · Resolved ${session.resolvedAt.slice(0, 10)}` : " · Not yet resolved"}`,
    "",
    "_Generated from a SolveStack session. Review before first use — a runbook is a draft until someone has followed it._",
    "",
    "## When to use this",
    session.problem || NOT_RECORDED,
    "",
    "## Before you start",
    `- Environment: ${escapeMd(session.system || NOT_RECORDED)}`,
    ...(session.resolution.rootCause
      ? [`- Root cause found originally: ${escapeMd(session.resolution.rootCause)}`]
      : []),
    `- Evidence from the original session: ${evidenceNames.length > 0 ? evidenceNames.map(escapeMd).join(", ") : "None recorded"}`,
    "",
    "## Steps",
    steps,
    "",
    "## Verify it worked",
    session.resolution.validation
      ? `- [ ] ${escapeMd(session.resolution.validation)}`
      : NOT_RECORDED,
    "",
    "## If it doesn't work",
    ruledOut.length > 0
      ? [
          "Already ruled out during the original incident — re-check before repeating:",
          "",
          ...ruledOut.map(
            (h) =>
              `- **${escapeMd(h.text)}** — ${escapeMd(h.reasoning || "Reason not recorded")}`,
          ),
        ].join("\n")
      : "Nothing was ruled out in the original session.",
    "",
    "## Prevention / follow-ups",
    session.resolution.prevention || NOT_RECORDED,
    "",
  ].join("\n");
}
