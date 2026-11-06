import {
  agentTaskById,
  buildAgentPrompt,
  type AgentTaskId,
} from "./agent-tasks";

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

export function agentPackReadme(
  session: AgentPackSession,
  taskLabel?: string,
  deltaSince?: string,
): string {
  const taskSection = taskLabel
    ? `
## Requested task

**${taskLabel}** — the full prompt is in \`PROMPT.md\`. Follow it within the rules above.

Reply contract: **solvestack-reply v1** — end the reply with the fenced block \`PROMPT.md\` describes, so the user can apply it in SolveStack with one paste (they preview it first; nothing applies automatically).
`
    : "";
  const promptLine = taskLabel
    ? "\n- `PROMPT.md` — the task prompt to give the reviewing tool first"
    : "";
  return `# SolveStack agent pack

This package is a **redaction-first** handoff for organization-approved AI tools.
SolveStack itself does not call a model and does not upload this file.

## Rules for the reviewing agent

1. Use only facts present in \`session.redacted.json\` and \`knowledge.md\`.
2. Do not invent timeline events, root causes, or evidence that is missing.
3. Treat every \`[REDACTED]\` token as intentionally removed — do not guess it.
4. Prefer citing entry timestamps and hypothesis statuses over paraphrasing.
5. If asked for recommendations, separate **observed facts** from **suggestions**.
${taskSection}
## Contents

- \`AGENT.md\` — this file${promptLine}
- \`knowledge.md\` — human-readable investigation summary (also redacted)
- \`session.redacted.json\` — structured record without attachment binaries
- \`evidence-manifest.json\` — filenames and MIME types only (no file bodies)

Session: ${session.id}
Generated: ${new Date().toISOString()}${deltaSince ? `\nPack scope: delta — only entries added and hypotheses changed since ${deltaSince}.` : ""}
`;
}

type AgentPackInput = {
  session: AgentPackSession;
  knowledgeMarkdown: string;
  attachments: AgentPackAttachmentMeta[];
  schemaVersion: number;
  /** When set, the pack is a delta: the session passed in is already
   * filtered to changes since this ISO timestamp (buildDeltaSession). */
  deltaSince?: string;
};

/** Marker recorded after each successful pack export (kept device-local
 * by the caller — deliberately not part of the session schema). */
export type PackMarker = {
  at: string;
  hypothesisStates: Record<string, string>;
  /** Change-detection key for the resolution text (not a security hash). */
  resolutionKey?: string;
};

/**
 * Filter a session to what changed since a pack marker: entries created
 * after it, and hypotheses whose status differs from the snapshot (new
 * hypotheses included). Everything else on the session carries over, so
 * the result feeds the normal pack builders — and the same redaction
 * path — unchanged.
 */
export function buildDeltaSession<T extends AgentPackSession>(
  session: T,
  marker: PackMarker,
): { session: T; changedEntries: number; changedHypotheses: number } {
  const entries = session.entries.filter(
    (entry) => entry.timestamp > marker.at,
  );
  const hypotheses = session.hypotheses.filter(
    (hypothesis) => marker.hypothesisStates[hypothesis.text] !== hypothesis.status,
  );
  return {
    session: { ...session, entries, hypotheses },
    changedEntries: entries.length,
    changedHypotheses: hypotheses.length,
  };
}

function redactedAttachments(input: AgentPackInput) {
  return input.attachments.map((attachment) => ({
    id: attachment.id,
    filename: redactText(attachment.filename),
    mimeType: attachment.mimeType,
    size: attachment.size,
    description: redactText(attachment.description),
  }));
}

function sessionJsonObject(
  input: AgentPackInput,
  redacted: AgentPackSession,
) {
  return {
    schemaVersion: input.schemaVersion,
    kind: "solvestack-agent-pack",
    session: redacted,
    attachments: redactedAttachments(input),
  };
}

export function buildAgentPackFiles(
  input: AgentPackInput & { taskId?: AgentTaskId },
): { name: string; text: string }[] {
  const redacted = redactSessionForAgent(input.session);
  const knowledge = redactText(input.knowledgeMarkdown);
  const task = input.taskId ? agentTaskById(input.taskId) : undefined;
  const files: { name: string; text: string }[] = [
    { name: "AGENT.md", text: agentPackReadme(redacted, task?.label, input.deltaSince) },
  ];
  if (task)
    files.push({
      name: "PROMPT.md",
      text: `${buildAgentPrompt(redacted, task, "files", input.deltaSince)}\n`,
    });
  files.push(
    { name: "knowledge.md", text: knowledge },
    {
      name: "session.redacted.json",
      text: JSON.stringify(sessionJsonObject(input, redacted), null, 2),
    },
    {
      name: "evidence-manifest.json",
      text: JSON.stringify(
        {
          note: "Binaries intentionally omitted from agent packs.",
          files: redactedAttachments(input).map(
            ({ description: _description, ...file }) => file,
          ),
        },
        null,
        2,
      ),
    },
  );
  return files;
}

/**
 * Single-file variant of the agent pack for pasting into an AI chat box:
 * the task prompt first, then the redacted knowledge summary, the redacted
 * session JSON in a fenced block, and the evidence manifest. Same
 * redaction path as the ZIP pack — built only from the redacted session.
 */
export function buildPastePack(
  input: AgentPackInput & { taskId: AgentTaskId },
): string {
  const redacted = redactSessionForAgent(input.session);
  const knowledge = redactText(input.knowledgeMarkdown);
  const task = agentTaskById(input.taskId);
  const manifest = redactedAttachments(input);
  return [
    buildAgentPrompt(redacted, task, "files", input.deltaSince),
    "",
    "---",
    "",
    "# Knowledge summary (redacted)",
    "",
    knowledge,
    "",
    "---",
    "",
    "# Session record (redacted JSON)",
    "",
    "```json",
    JSON.stringify(sessionJsonObject(input, redacted), null, 2),
    "```",
    "",
    "---",
    "",
    "# Evidence manifest",
    "",
    "Binaries intentionally omitted from agent packs.",
    "",
    ...(manifest.length
      ? manifest.map(
          (file) =>
            `- ${file.filename} (${file.mimeType}, ${file.size} bytes)${file.description ? ` — ${file.description}` : ""}`,
        )
      : ["- No attachments."]),
    "",
  ].join("\n");
}
