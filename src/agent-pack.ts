/**
 * Redaction patterns, applied in array order (security audit run 1:
 * agent-pack-redaction-pattern-gaps). Order matters: PEM blocks, JWTs,
 * and Bearer credentials are matched before the labeled-keyword pattern,
 * which previously consumed the word "Bearer" as its single-token value
 * and defeated Bearer redaction entirely. The keyword pattern now
 * consumes the full value to end of line, since real secrets (Basic
 * credentials, passphrases) routinely contain spaces.
 *
 * Deliberate exclusions: internal hostnames/FQDNs and DOMAIN\user account
 * names are NOT redacted. They are diagnostic content, not credentials,
 * and stripping them would gut the troubleshooting value of the pack;
 * the review step in the adapter guide is where a human judges those.
 */
const REDACTIONS: { pattern: RegExp; replacement: string }[] = [
  {
    // PEM private-key blocks, including a truncated block with no END line.
    pattern:
      /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----[\s\S]*?(?:-----END (?:[A-Z0-9]+ )*PRIVATE KEY-----|$)/g,
    replacement: "[REDACTED]",
  },
  {
    // JSON Web Tokens (header.payload.signature, base64url).
    pattern: /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
    replacement: "[REDACTED]",
  },
  {
    pattern: /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
    replacement: "[REDACTED]",
  },
  {
    // Credentials embedded in a URL: keep the scheme, drop user:pass.
    pattern: /([a-z][a-z0-9+.-]*:\/\/)[^\s/:@]+:[^\s/@]+@/gi,
    replacement: "$1[REDACTED]@",
  },
  {
    // Labeled secrets: value runs to end of line.
    pattern:
      /\b(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|account[_-]?key|private[_-]?key|client[_-]?secret|authorization)\s*[:=]\s*[^\n]+/gi,
    replacement: "[REDACTED]",
  },
  {
    // Azure SAS signature parameter inside a query string.
    pattern: /((?:[?&])sig=)[^&\s]+/gi,
    replacement: "$1[REDACTED]",
  },
  {
    // AWS access key ids.
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
    replacement: "[REDACTED]",
  },
  {
    // GitHub fine-grained personal access tokens.
    pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
    replacement: "[REDACTED]",
  },
  {
    // OpenAI project keys (hyphenated, so the underscore class missed them).
    pattern: /\bsk-proj-[A-Za-z0-9_-]{16,}/g,
    replacement: "[REDACTED]",
  },
  {
    // Stripe-style keys: the segment after live_/test_ is short, so the
    // generic underscore pattern below matches nothing for these.
    pattern: /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{8,}\b/g,
    replacement: "[REDACTED]",
  },
  {
    pattern: /\b(?:sk|pk|rk|ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{8,}\b/g,
    replacement: "[REDACTED]",
  },
  {
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    replacement: "[REDACTED]",
  },
  {
    // IPv6 (full and ::-compressed forms). Requires at least three colon
    // groups so ordinary HH:MM:SS timestamps survive.
    pattern:
      /\b(?:[0-9a-fA-F]{1,4}:){3,7}[0-9a-fA-F]{1,4}\b|\b(?:[0-9a-fA-F]{1,4}:){1,6}:(?:[0-9a-fA-F]{1,4}:)*[0-9a-fA-F]{0,4}\b|\b::1\b/g,
    replacement: "[REDACTED]",
  },
  {
    pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    replacement: "[REDACTED]",
  },
];

export function redactText(value: string): string {
  let next = value;
  for (const { pattern, replacement } of REDACTIONS)
    next = next.replace(pattern, replacement);
  return next;
}

/** Recursively redact every string value in imported session metadata. */
function redactDeep(value: unknown): unknown {
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map(redactDeep);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redactDeep(item)]),
    );
  return value;
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
    // Tags and metadata ride along with the spread, so redact them too
    // (security audit run 1: agent-pack-unredacted-fields).
    tags: session.tags.map((tag) => redactText(tag)),
    metadata:
      session.metadata === undefined
        ? undefined
        : (redactDeep(session.metadata) as Record<string, unknown>),
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
            filename: redactText(attachment.filename),
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
            filename: redactText(attachment.filename),
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
