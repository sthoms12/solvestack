/**
 * Knowledge view derivation (F5). Resolved sessions are the knowledge
 * base; this module projects them to article cards and filters them with
 * the same scored search the dashboard uses (searchSessions in domain.ts).
 * Pure and per-render — no index, no storage, no schema change, exactly
 * like the Pattern Desk derivation in patterns.ts.
 */

import { searchSessions, type SearchableSession } from "./domain";

export type KnowledgeSession = SearchableSession & {
  status: string;
  resolvedAt?: string;
  updatedAt: string;
};

export type KnowledgeArticle = {
  id: string;
  title: string;
  system: string;
  tags: string[];
  rootCause: string;
  resolvedAt: string;
  entryCount: number;
};

export function knowledgeArticles(
  sessions: KnowledgeSession[],
): KnowledgeArticle[] {
  return sessions
    .filter((session) => session.status === "resolved")
    .map((session) => ({
      id: session.id,
      title: session.title,
      system: session.system,
      tags: [...session.tags],
      rootCause: session.resolution.rootCause,
      resolvedAt: session.resolvedAt ?? session.updatedAt,
      entryCount: session.entries.length,
    }))
    .sort(
      (a, b) =>
        b.resolvedAt.localeCompare(a.resolvedAt) ||
        a.title.localeCompare(b.title),
    );
}

export type KnowledgeFilters = {
  query?: string;
  system?: string;
  tag?: string;
};

export function filterKnowledgeArticles(
  sessions: KnowledgeSession[],
  filters: KnowledgeFilters = {},
): KnowledgeArticle[] {
  let pool = sessions.filter((session) => session.status === "resolved");
  if (filters.system)
    pool = pool.filter((session) => session.system === filters.system);
  if (filters.tag)
    pool = pool.filter((session) =>
      session.tags.some(
        (tag) => tag.toLowerCase() === filters.tag!.toLowerCase(),
      ),
    );
  if (filters.query?.trim()) {
    const byId = new Map(
      knowledgeArticles(pool).map((article) => [article.id, article]),
    );
    return searchSessions(pool, filters.query)
      .map((result) => byId.get(result.session.id))
      .filter((article): article is KnowledgeArticle => Boolean(article));
  }
  return knowledgeArticles(pool);
}

/** Distinct non-empty systems across resolved sessions, sorted. */
export function knowledgeSystems(sessions: KnowledgeSession[]): string[] {
  return [
    ...new Set(
      sessions
        .filter((session) => session.status === "resolved" && session.system)
        .map((session) => session.system),
    ),
  ].sort((a, b) => a.localeCompare(b));
}

/** Distinct tags across resolved sessions, sorted case-insensitively. */
export function knowledgeTags(sessions: KnowledgeSession[]): string[] {
  const seen = new Map<string, string>();
  for (const session of sessions) {
    if (session.status !== "resolved") continue;
    for (const tag of session.tags)
      if (!seen.has(tag.toLowerCase())) seen.set(tag.toLowerCase(), tag);
  }
  return [...seen.values()].sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase()),
  );
}
