export type SearchableSession = {
  id: string;
  title: string;
  problem: string;
  system: string;
  tags: string[];
  resolution: {
    rootCause: string;
    fix: string;
    validation: string;
    prevention: string;
  };
  entries: { type: string; content: string }[];
  hypotheses: { text: string; reasoning: string }[];
};
const words = (value: string) =>
  new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9.-]+/)
      .filter((word) => word.length > 2),
  );
export function searchSessions(sessions: SearchableSession[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  const queryWords = words(normalized);
  return sessions
    .map((session) => {
      const title = words(session.title),
        system = words(session.system),
        tags = new Set(session.tags.map((tag) => tag.toLowerCase())),
        body = words(JSON.stringify(session));
      let score = 0;
      const reasons = new Set<string>();
      if (session.title.toLowerCase().includes(normalized)) {
        score += 12;
        reasons.add("title match");
      }
      if (session.system.toLowerCase().includes(normalized)) {
        score += 8;
        reasons.add("system match");
      }
      if (session.tags.some((tag) => tag.toLowerCase().includes(normalized))) {
        score += 7;
        reasons.add("tag match");
      }
      for (const word of queryWords) {
        if (title.has(word)) {
          score += 8;
          reasons.add("title match");
        } else if (system.has(word)) {
          score += 6;
          reasons.add("system match");
        } else if (tags.has(word)) {
          score += 5;
          reasons.add("tag match");
        } else if (body.has(word)) {
          score += 2;
          reasons.add("content match");
        }
      }
      return { session, score, reasons: [...reasons] };
    })
    .filter((result) => result.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || a.session.title.localeCompare(b.session.title),
    );
}
export function redactSelection(value: string, start: number, end: number) {
  return start === end
    ? value
    : `${value.slice(0, start)}[REDACTED]${value.slice(end)}`;
}
export function mergeBackup<T extends { id: string }>(
  existing: T[],
  incoming: T[],
) {
  const ids = new Set(existing.map((item) => item.id));
  return [
    ...existing,
    ...incoming.filter((item) => {
      // Track accepted incoming ids too: duplicates within a single
      // incoming file must be dropped, not just conflicts with existing
      // records (security audit run 1: merge-backup-intra-file-duplicate-ids).
      if (ids.has(item.id)) return false;
      ids.add(item.id);
      return true;
    }),
  ];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const asString = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback;
const asTimestamp = (value: unknown, fallback: string) =>
  typeof value === "string" && !Number.isNaN(Date.parse(value))
    ? value
    : fallback;
const asStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
const hasStringId = (value: Record<string, unknown>) =>
  typeof value.id === "string" && value.id.length > 0;

/**
 * Import normalization (security audit run 1:
 * portable-import-unvalidated-session-fields-persisted-render-crash).
 * parsePortableData is the last gate before mergeIncoming persists an
 * imported file, so every record it returns must satisfy the shape the
 * renderers assume. Structurally impossible records reject the whole file
 * (null); recoverable field problems are repaired with safe defaults, and
 * collection elements without a usable id are dropped.
 */
function normalizeEntry(raw: unknown, nowIso: string) {
  if (!isRecord(raw) || !hasStringId(raw)) return null;
  const entry: Record<string, unknown> = {
    ...raw,
    type: asString(raw.type, "Note"),
    technicalType: asString(raw.technicalType),
    content: asString(raw.content),
    timestamp: asTimestamp(raw.timestamp, nowIso),
    starred: typeof raw.starred === "boolean" ? raw.starred : false,
    attachmentIds: asStringArray(raw.attachmentIds),
  };
  if (raw.createdAt !== undefined)
    entry.createdAt = asTimestamp(raw.createdAt, nowIso);
  if (raw.updatedAt !== undefined)
    entry.updatedAt = asTimestamp(raw.updatedAt, nowIso);
  return entry;
}
function normalizeHypothesis(raw: unknown) {
  if (!isRecord(raw) || !hasStringId(raw)) return null;
  return {
    ...raw,
    text: asString(raw.text),
    status: asString(raw.status, "Investigating"),
    reasoning: asString(raw.reasoning),
    evidenceIds: asStringArray(raw.evidenceIds),
  };
}
function normalizeTask(raw: unknown, nowIso: string) {
  if (!isRecord(raw) || !hasStringId(raw)) return null;
  const task: Record<string, unknown> = {
    ...raw,
    text: asString(raw.text),
    completed: typeof raw.completed === "boolean" ? raw.completed : false,
    createdAt: asTimestamp(raw.createdAt, nowIso),
  };
  if (raw.completedAt !== undefined)
    task.completedAt = asTimestamp(raw.completedAt, nowIso);
  return task;
}
function normalizeSession(raw: unknown, nowIso: string) {
  if (!isRecord(raw) || !hasStringId(raw)) return null;
  if (!Array.isArray(raw.entries)) return null;
  if (raw.tags !== undefined && !Array.isArray(raw.tags)) return null;
  if (raw.hypotheses !== undefined && !Array.isArray(raw.hypotheses))
    return null;
  if (raw.tasks !== undefined && !Array.isArray(raw.tasks)) return null;
  const resolution = isRecord(raw.resolution) ? raw.resolution : {};
  const session: Record<string, unknown> = {
    ...raw,
    title: asString(raw.title),
    problem: asString(raw.problem),
    system: asString(raw.system),
    tags: asStringArray(raw.tags),
    status:
      raw.status === "active" || raw.status === "resolved"
        ? raw.status
        : "active",
    createdAt: asTimestamp(raw.createdAt, nowIso),
    updatedAt: asTimestamp(raw.updatedAt, nowIso),
    currentFocus: asString(raw.currentFocus),
    scratchpad: asString(raw.scratchpad),
    entries: raw.entries
      .map((entry) => normalizeEntry(entry, nowIso))
      .filter((entry) => entry !== null),
    hypotheses: (Array.isArray(raw.hypotheses) ? raw.hypotheses : [])
      .map((hypothesis) => normalizeHypothesis(hypothesis))
      .filter((hypothesis) => hypothesis !== null),
    tasks: (Array.isArray(raw.tasks) ? raw.tasks : [])
      .map((task) => normalizeTask(task, nowIso))
      .filter((task) => task !== null),
    resolution: {
      rootCause: asString(resolution.rootCause),
      fix: asString(resolution.fix),
      validation: asString(resolution.validation),
      prevention: asString(resolution.prevention),
    },
  };
  if (raw.schemaVersion !== undefined && typeof raw.schemaVersion !== "number")
    delete session.schemaVersion;
  if (raw.resolvedAt !== undefined)
    session.resolvedAt = asTimestamp(raw.resolvedAt, nowIso);
  if (raw.metadata !== undefined && !isRecord(raw.metadata))
    delete session.metadata;
  return session;
}
function normalizeAttachment(raw: unknown, nowIso: string) {
  if (!isRecord(raw) || !hasStringId(raw)) return null;
  if (typeof raw.sessionId !== "string" || !raw.sessionId) return null;
  const attachment: Record<string, unknown> = {
    ...raw,
    filename: asString(raw.filename),
    mimeType: asString(raw.mimeType),
    description: asString(raw.description),
    data: asString(raw.data),
    size:
      typeof raw.size === "number" && Number.isFinite(raw.size) ? raw.size : 0,
  };
  if (raw.createdAt !== undefined)
    attachment.createdAt = asTimestamp(raw.createdAt, nowIso);
  // A blobRef may only ever name this attachment's own OPFS blob — the
  // invariant the capture flow maintains. Anything else would alias
  // another attachment's bytes (security audit run 1:
  // imported-attachment-blobref-aliasing), so drop it and keep only the
  // inline data.
  if (raw.blobRef !== undefined && raw.blobRef !== `opfs:${raw.id}`)
    delete attachment.blobRef;
  return attachment;
}
export function parsePortableData(value: unknown) {
  if (!value || typeof value !== "object")
    throw new Error("Unsupported or corrupt SolveStack file.");
  const input = value as Record<string, unknown>;
  if (![1, 2, 3].includes(Number(input.schemaVersion)))
    throw new Error("Unsupported SolveStack schema version.");
  const nowIso = new Date().toISOString();
  if (input.session && typeof input.session === "object") {
    const session = normalizeSession(input.session, nowIso);
    if (!session) throw new Error("Corrupt SolveStack session export.");
    if (!Array.isArray(input.attachments))
      throw new Error("Corrupt SolveStack session attachments.");
    return {
      kind: "session" as const,
      sessions: [session],
      attachments: input.attachments
        .map((attachment) => normalizeAttachment(attachment, nowIso))
        .filter((attachment) => attachment !== null),
    };
  }
  if (Array.isArray(input.sessions) && Array.isArray(input.attachments)) {
    const sessions = [];
    for (const raw of input.sessions) {
      const session = normalizeSession(raw, nowIso);
      if (!session) throw new Error("Corrupt SolveStack backup.");
      sessions.push(session);
    }
    return {
      kind: "backup" as const,
      sessions,
      attachments: input.attachments
        .map((attachment) => normalizeAttachment(attachment, nowIso))
        .filter((attachment) => attachment !== null),
    };
  }
  throw new Error("Unsupported or corrupt SolveStack file.");
}
export function relatedSessions(
  current: SearchableSession,
  sessions: SearchableSession[],
) {
  const currentTerms = new Set([
    ...current.tags.map((tag) => tag.toLowerCase()),
    ...words(`${current.problem} ${current.resolution.rootCause}`),
  ]);
  return sessions
    .filter((session) => session.id !== current.id)
    .map((session) => {
      const reasons: string[] = [];
      if (session.system && session.system === current.system)
        reasons.push("same system");
      if (
        session.tags.some((tag) =>
          current.tags.some(
            (currentTag) => currentTag.toLowerCase() === tag.toLowerCase(),
          ),
        )
      )
        reasons.push("shared tag");
      if (
        [...words(`${session.problem} ${session.resolution.rootCause}`)].some(
          (term) => currentTerms.has(term),
        )
      )
        reasons.push("shared problem terms");
      return { session, score: reasons.length, reasons };
    })
    .filter((result) => result.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || a.session.title.localeCompare(b.session.title),
    )
    .slice(0, 3);
}
