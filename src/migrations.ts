export const CURRENT_SCHEMA_VERSION = 2;

export function migrateWorkspace<T extends Record<string, any>>(input: T): T {
  if (
    !input ||
    !Array.isArray(input.sessions) ||
    !Array.isArray(input.attachments)
  )
    throw new Error("Unsupported or corrupt SolveStack workspace.");
  if ((input.schemaVersion || 1) > CURRENT_SCHEMA_VERSION)
    throw new Error("Unsupported future SolveStack schema version.");
  const output = structuredClone(input);
  if ((output.schemaVersion || 1) === 1) {
    output.sessions = output.sessions.map((session: any) => ({
      ...session,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      metadata: session.metadata || {},
      entries: (session.entries || []).map((entry: any) => ({
        ...entry,
        createdAt: entry.createdAt || entry.timestamp,
        updatedAt: entry.updatedAt || entry.timestamp,
      })),
      hypotheses: (session.hypotheses || []).map((hypothesis: any) => ({
        ...hypothesis,
        createdAt: hypothesis.createdAt || session.createdAt,
        updatedAt:
          hypothesis.updatedAt || session.updatedAt || session.createdAt,
      })),
    }));
    output.schemaVersion = CURRENT_SCHEMA_VERSION;
  }
  return output;
}
