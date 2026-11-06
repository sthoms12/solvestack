/**
 * Return-trip import: parse a model's solvestack-reply block (the contract
 * in agent-tasks.ts buildReplyContract) into an apply plan for one session.
 *
 * The reply is UNTRUSTED input — a model produced it, and the user pasted
 * it. Same discipline as the portable-data import: strict kind/version
 * checks, hard caps, whitelist coercion, and nothing applies without the
 * preview in main.ts. Hypotheses match by exact text (the contract tells
 * the model to copy it verbatim); unmatched updates are reported, never
 * fuzzy-matched or silently dropped. A reply that names a different
 * session is refused outright.
 */

export const REPLY_ENTRY_TYPES = [
  "Note",
  "Observation",
  "Action",
  "Evidence",
  "Hypothesis",
  "Decision",
] as const;
export type ReplyEntryType = (typeof REPLY_ENTRY_TYPES)[number];

export const REPLY_HYPOTHESIS_STATUSES = [
  "Investigating",
  "Likely",
  "Confirmed",
  "Ruled Out",
] as const;
export type ReplyHypothesisStatus =
  (typeof REPLY_HYPOTHESIS_STATUSES)[number];

const MAX_ITEMS = 50;
const MAX_ENTRY_CHARS = 20_000;
const MAX_FIELD_CHARS = 4_000;
const MAX_TASK_CHARS = 300;

export type ReplyPlan = {
  task: string;
  summary: string;
  entries: { type: ReplyEntryType; content: string }[];
  hypothesisUpdates: {
    matchText: string;
    status: ReplyHypothesisStatus;
    reasoning: string;
    currentStatus: string;
  }[];
  unmatched: { matchText: string; reason: string }[];
  tasks: string[];
  resolutionDraft: {
    rootCause?: string;
    fix?: string;
    validation?: string;
    prevention?: string;
  } | null;
};

export type ReplyResult =
  | { ok: true; plan: ReplyPlan }
  | {
      ok: false;
      reason: "no-block" | "malformed" | "wrong-session" | "bad-version";
      message: string;
    };

type SessionShape = {
  id: string;
  hypotheses: { text: string; status: string }[];
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asString = (value: unknown, cap: number): string =>
  typeof value === "string" ? value.slice(0, cap) : "";

const asStringList = (value: unknown, cap: number): string[] =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.slice(0, cap).trim())
        .filter(Boolean)
        .slice(0, MAX_ITEMS)
    : [];

/** Find and JSON-parse the reply block: the ```solvestack-reply fence if
 * present, else the whole pasted text as a bare JSON object. */
export function extractReplyJson(
  text: string,
): { ok: true; value: unknown } | { ok: false; reason: "no-block" | "malformed" } {
  const fenced = text.match(/```solvestack-reply\s*\n([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text.trim();
  if (!candidate) return { ok: false, reason: "no-block" };
  try {
    return { ok: true, value: JSON.parse(candidate) };
  } catch {
    return { ok: false, reason: fenced ? "malformed" : "no-block" };
  }
}

export function planReply(text: string, session: SessionShape): ReplyResult {
  const extracted = extractReplyJson(text);
  if (!extracted.ok)
    return {
      ok: false,
      reason: extracted.reason,
      message:
        extracted.reason === "malformed"
          ? "Found a solvestack-reply block, but its JSON would not parse. Ask the AI to re-send just the block."
          : "No solvestack-reply block found in that paste. The AI needs to end its answer with the fenced block from the pack prompt.",
    };
  const root = asRecord(extracted.value);
  if (!root || root.kind !== "solvestack-reply")
    return {
      ok: false,
      reason: "no-block",
      message:
        "That JSON is not a solvestack-reply block. Paste the AI's full answer, including its fenced block.",
    };
  if (root.version !== 1)
    return {
      ok: false,
      reason: "bad-version",
      message: `Unsupported reply version (${String(root.version)}). This app understands solvestack-reply v1.`,
    };
  if (root.sessionId !== session.id)
    return {
      ok: false,
      reason: "wrong-session",
      message: `That reply is for session ${String(root.sessionId || "(missing)")}, not this one (${session.id}). Open the session it names and apply it there.`,
    };

  const entries: ReplyPlan["entries"] = [];
  if (Array.isArray(root.newEntries)) {
    for (const raw of root.newEntries.slice(0, MAX_ITEMS)) {
      const item = asRecord(raw);
      if (!item) continue;
      const content = asString(item.content, MAX_ENTRY_CHARS).trim();
      if (!content) continue;
      const type = REPLY_ENTRY_TYPES.includes(item.type as ReplyEntryType)
        ? (item.type as ReplyEntryType)
        : "Note";
      entries.push({ type, content });
    }
  }

  const hypothesisUpdates: ReplyPlan["hypothesisUpdates"] = [];
  const unmatched: ReplyPlan["unmatched"] = [];
  if (Array.isArray(root.hypothesisUpdates)) {
    for (const raw of root.hypothesisUpdates.slice(0, MAX_ITEMS)) {
      const item = asRecord(raw);
      if (!item) continue;
      const matchText = asString(item.matchText, MAX_FIELD_CHARS).trim();
      if (!matchText) continue;
      const status = item.status as ReplyHypothesisStatus;
      if (!REPLY_HYPOTHESIS_STATUSES.includes(status)) {
        unmatched.push({
          matchText,
          reason: `unknown status "${String(item.status)}"`,
        });
        continue;
      }
      const target = session.hypotheses.find((h) => h.text === matchText);
      if (!target) {
        unmatched.push({ matchText, reason: "no hypothesis with this exact text" });
        continue;
      }
      hypothesisUpdates.push({
        matchText,
        status,
        reasoning: asString(item.reasoning, MAX_FIELD_CHARS).trim(),
        currentStatus: target.status,
      });
    }
  }

  const draft = asRecord(root.resolutionDraft);
  const resolutionDraft: ReplyPlan["resolutionDraft"] = draft
    ? {
        rootCause: asString(draft.rootCause, MAX_FIELD_CHARS).trim() || undefined,
        fix: asString(draft.fix, MAX_FIELD_CHARS).trim() || undefined,
        validation:
          asString(draft.validation, MAX_FIELD_CHARS).trim() || undefined,
        prevention:
          asString(draft.prevention, MAX_FIELD_CHARS).trim() || undefined,
      }
    : null;

  return {
    ok: true,
    plan: {
      task: asString(root.task, 60).trim() || "review",
      summary: asString(root.summary, MAX_FIELD_CHARS).trim(),
      entries,
      hypothesisUpdates,
      unmatched,
      tasks: asStringList(root.newTasks, MAX_TASK_CHARS),
      resolutionDraft:
        resolutionDraft &&
        (resolutionDraft.rootCause ||
          resolutionDraft.fix ||
          resolutionDraft.validation ||
          resolutionDraft.prevention)
          ? resolutionDraft
          : null,
    },
  };
}

/** One-line counts for the provenance Decision entry and toasts. */
export function planCounts(plan: ReplyPlan): string[] {
  const parts: string[] = [];
  if (plan.entries.length)
    parts.push(
      `${plan.entries.length} entr${plan.entries.length === 1 ? "y" : "ies"} added`,
    );
  if (plan.hypothesisUpdates.length)
    parts.push(
      `${plan.hypothesisUpdates.length} hypothes${plan.hypothesisUpdates.length === 1 ? "is" : "es"} updated`,
    );
  if (plan.tasks.length)
    parts.push(
      `${plan.tasks.length} next step${plan.tasks.length === 1 ? "" : "s"} added`,
    );
  if (plan.resolutionDraft) parts.push("resolution drafted");
  if (plan.unmatched.length)
    parts.push(`${plan.unmatched.length} not applied`);
  return parts;
}
