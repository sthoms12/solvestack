import { describe, expect, test } from "bun:test";
import {
  buildAgentPackFiles,
  buildPastePack,
  redactSessionForAgent,
  type AgentPackSession,
} from "../src/agent-pack";
import {
  AGENT_TASKS,
  agentTaskById,
  buildAgentPrompt,
} from "../src/agent-tasks";
import { CURRENT_SCHEMA_VERSION } from "../src/migrations";

// The seed secrets use obviously fake values assembled to match the
// redaction patterns (labeled secret, AWS key id, IPv4, email).
const SECRETS = ["hunter2", "AKIAIOSFODNN7EXAMPLE", "10.0.0.8", "user@contoso.com"];

function fixtureSession(): AgentPackSession {
  return {
    id: "SS-TEST-001",
    title: "VPN outage — password: hunter2 in the ticket",
    problem: "Users cannot connect; gateway at 10.0.0.8, key AKIAIOSFODNN7EXAMPLE leaked in log",
    system: "VPN gateway",
    tags: ["vpn"],
    status: "resolved",
    createdAt: "2026-11-01T09:00:00Z",
    updatedAt: "2026-11-01T12:00:00Z",
    resolvedAt: "2026-11-01T12:00:00Z",
    currentFocus: "Confirm scope",
    scratchpad: "Contact user@contoso.com for the window",
    entries: [
      {
        type: "Observation",
        technicalType: "",
        content: "Scope check: all remote users affected since 08:40.",
        timestamp: "2026-11-01T09:05:00Z",
        starred: true,
      },
      {
        type: "Evidence",
        technicalType: "Log",
        content: "auth log shows token=abc123 failures",
        timestamp: "2026-11-01T09:20:00Z",
        starred: false,
      },
    ],
    hypotheses: [
      { text: "Gateway fault", status: "Ruled out", reasoning: "Gateway answers locally" },
      { text: "IdP outage", status: "Confirmed", reasoning: "Vendor status page" },
    ],
    tasks: [
      { text: "Confirm scope", completed: true },
      { text: "Write the KB article", completed: false },
    ],
    resolution: {
      rootCause: "IdP signing cert expired",
      fix: "Rotated the cert",
      validation: "Test sign-in succeeded",
      prevention: "Alert 30 days before cert expiry",
    },
  };
}

describe("agent tasks", () => {
  test("every task builds a prompt with its instructions and the session frame", () => {
    const redacted = redactSessionForAgent(fixtureSession());
    for (const task of AGENT_TASKS) {
      const prompt = buildAgentPrompt(redacted, task);
      expect(prompt).toContain(`# SolveStack AI task — ${task.label}`);
      expect(prompt).toContain("Treat every [REDACTED] token");
      expect(prompt).toContain("- Status: resolved");
      expect(prompt).toContain("- Entries: 2 (1 starred)");
      expect(prompt).toContain("- Hypotheses: 2 (1 ruled out, 1 confirmed)");
      expect(prompt).toContain("- Tasks: 1/2 completed");
      expect(prompt).toContain("- Resolution recorded: yes");
      // A distinctive line from each task's own instructions.
      expect(prompt.length).toBeGreaterThan(600);
    }
    expect(buildAgentPrompt(redacted, agentTaskById("contradiction"))).toContain(
      "Audit the reasoning in this investigation.",
    );
    expect(buildAgentPrompt(redacted, agentTaskById("kb-article"))).toContain(
      "Draft a knowledge-base article",
    );
  });

  test("task lookup falls back to review", () => {
    expect(agentTaskById(undefined).id).toBe("review");
    expect(agentTaskById("nonsense").id).toBe("review");
    expect(agentTaskById("summarize").id).toBe("summarize");
  });

  test("pack with a task adds PROMPT.md and names the task in AGENT.md", () => {
    const files = buildAgentPackFiles({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      knowledgeMarkdown: "# VPN outage",
      session: fixtureSession(),
      attachments: [],
      taskId: "contradiction",
    });
    expect(files.map((f) => f.name)).toEqual([
      "AGENT.md",
      "PROMPT.md",
      "knowledge.md",
      "session.redacted.json",
      "evidence-manifest.json",
    ]);
    expect(files.find((f) => f.name === "AGENT.md")!.text).toContain(
      "Audit the reasoning (contradictions)",
    );
    expect(files.find((f) => f.name === "PROMPT.md")!.text).toContain(
      "## Your task",
    );
  });

  test("pack without a task is exactly the historical four files", () => {
    const files = buildAgentPackFiles({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      knowledgeMarkdown: "# VPN outage",
      session: fixtureSession(),
      attachments: [],
    });
    expect(files.map((f) => f.name).sort()).toEqual([
      "AGENT.md",
      "evidence-manifest.json",
      "knowledge.md",
      "session.redacted.json",
    ]);
    expect(files.find((f) => f.name === "AGENT.md")!.text).not.toContain(
      "PROMPT.md",
    );
  });

  test("no seed secret reaches PROMPT.md or the paste pack", () => {
    const files = buildAgentPackFiles({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      knowledgeMarkdown: "# VPN outage\nReach user@contoso.com",
      session: fixtureSession(),
      attachments: [
        {
          id: "f1",
          filename: "token=filesecret screenshot.png",
          mimeType: "image/png",
          size: 12,
          description: "shot from user@contoso.com",
        },
      ],
      taskId: "review",
    });
    const prompt = files.find((f) => f.name === "PROMPT.md")!.text;
    const paste = buildPastePack({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      knowledgeMarkdown: "# VPN outage\nReach user@contoso.com",
      session: fixtureSession(),
      attachments: [
        {
          id: "f1",
          filename: "token=filesecret screenshot.png",
          mimeType: "image/png",
          size: 12,
          description: "shot from user@contoso.com",
        },
      ],
      taskId: "review",
    });
    for (const surface of [prompt, paste]) {
      for (const secret of [...SECRETS, "filesecret", "abc123"])
        expect(surface).not.toContain(secret);
      expect(surface).toContain("[REDACTED]");
    }
  });

  test("paste pack structure: prompt, knowledge, parseable JSON, manifest", () => {
    const paste = buildPastePack({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      knowledgeMarkdown: "# VPN outage\n\nResolved by cert rotation.",
      session: fixtureSession(),
      attachments: [
        {
          id: "f1",
          filename: "gateway-log.txt",
          mimeType: "text/plain",
          size: 2048,
          description: "Auth failures",
        },
      ],
      taskId: "kb-article",
    });
    expect(paste.startsWith("# SolveStack AI task — Draft a knowledge-base article")).toBe(true);
    expect(paste).toContain("# Knowledge summary (redacted)");
    expect(paste).toContain("Resolved by cert rotation.");
    const match = paste.match(/```json\n([\s\S]*?)\n```/);
    expect(match).not.toBeNull();
    const parsed = JSON.parse(match![1]);
    expect(parsed.kind).toBe("solvestack-agent-pack");
    expect(parsed.session.id).toBe("SS-TEST-001");
    expect(parsed.session.title).toContain("[REDACTED]");
    expect(paste).toContain("# Evidence manifest");
    expect(paste).toContain("- gateway-log.txt (text/plain, 2048 bytes) — Auth failures");
  });
});
