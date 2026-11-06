import { describe, expect, test } from "bun:test";
import {
  AGENT_TASKS,
  agentTaskById,
  buildAgentPrompt,
  buildReplyContract,
} from "../src/agent-tasks";
import { buildSkillKitFiles } from "../src/skill-kit";
import { buildAgentPackFiles } from "../src/agent-pack";
import type { AgentPackSession } from "../src/agent-pack";
import { CURRENT_SCHEMA_VERSION } from "../src/migrations";

function fixtureSession(): AgentPackSession {
  return {
    id: "SS-TEST-001",
    title: "VPN outage",
    problem: "Users cannot connect",
    system: "VPN gateway",
    tags: ["vpn"],
    status: "active",
    createdAt: "2026-11-01T09:00:00Z",
    updatedAt: "2026-11-01T12:00:00Z",
    currentFocus: "Confirm scope",
    scratchpad: "",
    entries: [],
    hypotheses: [],
    tasks: [],
    resolution: { rootCause: "", fix: "", validation: "", prevention: "" },
  } as AgentPackSession;
}

describe("reply contract in prompts", () => {
  test("every task prompt carries the contract and its reply guidance", () => {
    const session = fixtureSession();
    for (const task of AGENT_TASKS) {
      const prompt = buildAgentPrompt(session, task);
      expect(prompt).toContain("## How to reply");
      expect(prompt).toContain("solvestack-reply");
      expect(prompt).toContain(task.replyGuidance);
      expect(prompt).toContain(`"task": "${task.id}"`);
    }
  });

  test("the handoff closing still comes after the contract", () => {
    const prompt = buildAgentPrompt(
      fixtureSession(),
      agentTaskById("review"),
      "handoff",
    );
    expect(prompt.indexOf("solvestack-reply")).toBeLessThan(
      prompt.indexOf("I will paste the full session record"),
    );
  });

  test("AGENT.md names the reply contract when a task is requested", () => {
    const files = buildAgentPackFiles({
      session: fixtureSession(),
      knowledgeMarkdown: "# Summary",
      attachments: [],
      schemaVersion: CURRENT_SCHEMA_VERSION,
      taskId: "review",
    });
    const agent = files.find((f) => f.name === "AGENT.md");
    expect(agent?.text).toContain("solvestack-reply v1");
  });

  test("buildReplyContract interpolates the task id", () => {
    expect(buildReplyContract("kb-article")).toContain('"task": "kb-article"');
  });
});

describe("skill kit", () => {
  test("contains the adapter, a README, and all five task references", () => {
    const files = buildSkillKitFiles();
    const names = files.map((f) => f.name);
    expect(names).toContain("README.md");
    expect(names).toContain("solvestack-adapter/SKILL.md");
    for (const task of AGENT_TASKS)
      expect(names).toContain(`solvestack-adapter/references/${task.id}.md`);
  });

  test("SKILL.md carries the standing rules and the contract", () => {
    const skill = buildSkillKitFiles().find(
      (f) => f.name === "solvestack-adapter/SKILL.md",
    );
    expect(skill?.text).toContain("name: solvestack-adapter");
    expect(skill?.text).toContain("solvestack-reply");
    expect(skill?.text).toContain("Do not invent timeline events");
  });

  test("references carry each task's instructions verbatim", () => {
    const files = buildSkillKitFiles();
    for (const task of AGENT_TASKS) {
      const ref = files.find(
        (f) => f.name === `solvestack-adapter/references/${task.id}.md`,
      );
      expect(ref?.text).toContain(task.instructions.slice(0, 40));
      expect(ref?.text).toContain(task.replyGuidance);
    }
  });
});
