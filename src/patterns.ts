export type PatternKind =
  | "system"
  | "tag"
  | "root-cause"
  | "ruled-out"
  | "technical-type";

export type PatternableSession = {
  id: string;
  title: string;
  system: string;
  tags: string[];
  status: string;
  resolution: { rootCause: string; fix: string };
  hypotheses: { text: string; status: string; reasoning: string }[];
  entries: { technicalType: string }[];
};

export type PatternCard = {
  id: string;
  kind: PatternKind;
  label: string;
  count: number;
  sessionIds: string[];
  sampleTitles: string[];
  hint: string;
};

const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

function pushBucket(
  buckets: Map<string, { label: string; sessionIds: Set<string>; titles: string[] }>,
  key: string,
  label: string,
  session: PatternableSession,
) {
  if (!key) return;
  const existing = buckets.get(key) || {
    label,
    sessionIds: new Set<string>(),
    titles: [],
  };
  if (!existing.sessionIds.has(session.id)) {
    existing.sessionIds.add(session.id);
    if (existing.titles.length < 3) existing.titles.push(session.title);
  }
  buckets.set(key, existing);
}

function cardsFromBuckets(
  kind: PatternKind,
  buckets: Map<string, { label: string; sessionIds: Set<string>; titles: string[] }>,
  hint: string,
  minCount = 2,
): PatternCard[] {
  return [...buckets.entries()]
    .map(([key, value]) => ({
      id: `${kind}:${key}`,
      kind,
      label: value.label,
      count: value.sessionIds.size,
      sessionIds: [...value.sessionIds],
      sampleTitles: value.titles,
      hint,
    }))
    .filter((card) => card.count >= minCount)
    .sort(
      (a, b) =>
        b.count - a.count || a.label.localeCompare(b.label),
    );
}

/** Deterministic cross-session patterns — no model, no upload. */
export function buildPatterns(
  sessions: PatternableSession[],
  options: { minCount?: number } = {},
): PatternCard[] {
  const minCount = options.minCount ?? 2;
  const systems = new Map<
    string,
    { label: string; sessionIds: Set<string>; titles: string[] }
  >();
  const tags = new Map<
    string,
    { label: string; sessionIds: Set<string>; titles: string[] }
  >();
  const rootCauses = new Map<
    string,
    { label: string; sessionIds: Set<string>; titles: string[] }
  >();
  const ruledOut = new Map<
    string,
    { label: string; sessionIds: Set<string>; titles: string[] }
  >();
  const technical = new Map<
    string,
    { label: string; sessionIds: Set<string>; titles: string[] }
  >();

  for (const session of sessions) {
    if (session.system.trim())
      pushBucket(
        systems,
        normalize(session.system),
        session.system.trim(),
        session,
      );
    for (const tag of session.tags) {
      if (!tag.trim()) continue;
      pushBucket(tags, normalize(tag), tag.trim(), session);
    }
    if (session.resolution.rootCause.trim())
      pushBucket(
        rootCauses,
        normalize(session.resolution.rootCause).slice(0, 80),
        session.resolution.rootCause.trim().slice(0, 80),
        session,
      );
    for (const hypothesis of session.hypotheses) {
      if (hypothesis.status !== "Ruled Out") continue;
      const label = hypothesis.text.trim() || hypothesis.reasoning.trim();
      if (!label) continue;
      pushBucket(ruledOut, normalize(label).slice(0, 80), label.slice(0, 80), session);
    }
    for (const entry of session.entries) {
      if (!entry.technicalType) continue;
      pushBucket(
        technical,
        normalize(entry.technicalType),
        entry.technicalType,
        session,
      );
    }
  }

  return [
    ...cardsFromBuckets(
      "system",
      systems,
      "Same system across investigations",
      minCount,
    ),
    ...cardsFromBuckets("tag", tags, "Shared tag", minCount),
    ...cardsFromBuckets(
      "root-cause",
      rootCauses,
      "Similar recorded root cause",
      minCount,
    ),
    ...cardsFromBuckets(
      "ruled-out",
      ruledOut,
      "Cause repeatedly ruled out",
      minCount,
    ),
    ...cardsFromBuckets(
      "technical-type",
      technical,
      "Recurring evidence type",
      Math.max(minCount, 3),
    ),
  ];
}

export function patternKindLabel(kind: PatternKind): string {
  switch (kind) {
    case "system":
      return "Systems";
    case "tag":
      return "Tags";
    case "root-cause":
      return "Root causes";
    case "ruled-out":
      return "Ruled out";
    case "technical-type":
      return "Evidence types";
  }
}
