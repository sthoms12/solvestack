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
  return [...existing, ...incoming.filter((item) => !ids.has(item.id))];
}
export function parsePortableData(value: unknown) {
  if (!value || typeof value !== "object")
    throw new Error("Unsupported or corrupt SolveStack file.");
  const input = value as Record<string, unknown>;
  if (![1, 2].includes(Number(input.schemaVersion)))
    throw new Error("Unsupported SolveStack schema version.");
  if (input.session && typeof input.session === "object") {
    const session = input.session as Record<string, unknown>;
    if (typeof session.id !== "string" || !Array.isArray(session.entries))
      throw new Error("Corrupt SolveStack session export.");
    if (!Array.isArray(input.attachments))
      throw new Error("Corrupt SolveStack session attachments.");
    return {
      kind: "session" as const,
      sessions: [session],
      attachments: input.attachments,
    };
  }
  if (Array.isArray(input.sessions) && Array.isArray(input.attachments))
    return {
      kind: "backup" as const,
      sessions: input.sessions,
      attachments: input.attachments,
    };
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
