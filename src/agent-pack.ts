const SECRET_PATTERNS: RegExp[] = [
  /\b(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|authorization)\s*[:=]\s*\S+/gi,
  /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
  /\b(?:sk|pk|rk|ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{8,}\b/g,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
];

export function redactText(value: string): string {
  let next = value;
  for (const pattern of SECRET_PATTERNS) next = next.replace(pattern, "[REDACTED]");
  return next;
}

export type AgentPackSession = {
  id: string;
  title: string;
  problem: string;
  system: string;
  tags: string[];
  status: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  currentFocus: string;
  scratchpad: string;
  entries: {
    type: string;
    technicalType: string;
    content: string;
    timestamp: string;
    starred: boolean;
  }[];
  hypotheses: {
    text: string;
    status: string;
    reasoning: string;
  }[];
  tasks: { text: string; completed: boolean }[];
  resolution: {
    rootCause: string;
    fix: string;
    validation: string;
    prevention: string;
  };
  metadata?: Record<string, unknown>;
};

export type AgentPackAttachmentMeta = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  description: string;
};

export function redactSessionForAgent(session: AgentPackSession): AgentPackSession {
  return {
    ...session,
    title: redactText(session.title),
    problem: redactText(session.problem),
    system: redactText(session.system),
    currentFocus: redactText(session.currentFocus),
    scratchpad: redactText(session.scratchpad),
    entries: session.entries.map((entry) => ({
      ...entry,
      content: redactText(entry.content),
    })),
    hypotheses: session.hypotheses.map((hypothesis) => ({
      ...hypothesis,
      text: redactText(hypothesis.text),
      reasoning: redactText(hypothesis.reasoning),
    })),
    tasks: session.tasks.map((task) => ({
      ...task,
      text: redactText(task.text),
    })),
    resolution: {
      rootCause: redactText(session.resolution.rootCause),
      fix: redactText(session.resolution.fix),
      validation: redactText(session.resolution.validation),
      prevention: redactText(session.resolution.prevention),
    },
  };
}

export function agentPackReadme(session: AgentPackSession): string {
  return `# SolveStack agent pack

This package is a **redaction-first** handoff for organization-approved AI tools.
SolveStack itself does not call a model and does not upload this file.

## Rules for the reviewing agent

1. Use only facts present in \`session.redacted.json\` and \`knowledge.md\`.
2. Do not invent timeline events, root causes, or evidence that is missing.
3. Treat every \`[REDACTED]\` token as intentionally removed — do not guess it.
4. Prefer citing entry timestamps and hypothesis statuses over paraphrasing.
5. If asked for recommendations, separate **observed facts** from **suggestions**.

## Contents

- \`AGENT.md\` — this file
- \`knowledge.md\` — human-readable investigation summary (also redacted)
- \`session.redacted.json\` — structured record without attachment binaries
- \`evidence-manifest.json\` — filenames and MIME types only (no file bodies)

Session: ${session.id}
Generated: ${new Date().toISOString()}
`;
}

export function buildAgentPackFiles(input: {
  session: AgentPackSession;
  knowledgeMarkdown: string;
  attachments: AgentPackAttachmentMeta[];
  schemaVersion: number;
}): { name: string; text: string }[] {
  const redacted = redactSessionForAgent(input.session);
  const knowledge = redactText(input.knowledgeMarkdown);
  return [
    { name: "AGENT.md", text: agentPackReadme(redacted) },
    { name: "knowledge.md", text: knowledge },
    {
      name: "session.redacted.json",
      text: JSON.stringify(
        {
          schemaVersion: input.schemaVersion,
          kind: "solvestack-agent-pack",
          session: redacted,
          attachments: input.attachments.map((attachment) => ({
            id: attachment.id,
            filename: attachment.filename,
            mimeType: attachment.mimeType,
            size: attachment.size,
            description: redactText(attachment.description),
          })),
        },
        null,
        2,
      ),
    },
    {
      name: "evidence-manifest.json",
      text: JSON.stringify(
        {
          note: "Binaries intentionally omitted from agent packs.",
          files: input.attachments.map((attachment) => ({
            id: attachment.id,
            filename: attachment.filename,
            mimeType: attachment.mimeType,
            size: attachment.size,
          })),
        },
        null,
        2,
      ),
    },
  ];
}
