import { describe, expect, test } from "bun:test";
import { redactSessionForAgent, type AgentPackSession } from "../src/agent-pack";
import { agentTaskById, buildAgentPrompt } from "../src/agent-tasks";
import {
  AI_HANDOFFS,
  aiHandoffById,
  buildHandoffUrl,
  HANDOFF_URL_CAP,
} from "../src/ai-handoff";

describe("AI handoff destinations", () => {
  test("chatgpt and claude are the destinations; lookup is strict", () => {
    expect(AI_HANDOFFS.map((h) => h.id)).toEqual(["chatgpt", "claude"]);
    expect(aiHandoffById("chatgpt")?.prefillBase).toBe("https://chatgpt.com/?q=");
    expect(aiHandoffById("claude")?.prefillBase).toBe("https://claude.ai/new?q=");
    expect(aiHandoffById("gemini")).toBeUndefined();
    expect(aiHandoffById(undefined)).toBeUndefined();
  });

  test("URLs encode newlines, ampersands, and non-ASCII", () => {
    const url = buildHandoffUrl(aiHandoffById("chatgpt")!, "line one\nline two & café");
    expect(url).toBe(
      "https://chatgpt.com/?q=line%20one%0Aline%20two%20%26%20caf%C3%A9",
    );
  });

  test("over-cap prompts return null so the caller opens the plain chat", () => {
    const huge = "x".repeat(HANDOFF_URL_CAP);
    expect(buildHandoffUrl(aiHandoffById("claude")!, huge)).toBeNull();
    expect(buildHandoffUrl(aiHandoffById("claude")!, "short")).not.toBeNull();
  });
});

describe("handoff prompt variant", () => {
  const session: AgentPackSession = {
    id: "SS-HANDOFF-1",
    title: "VPN outage — password: hunter2 in the ticket",
    problem: "Users cannot connect",
    system: "VPN gateway",
    tags: ["vpn"],
    status: "active",
    createdAt: "2026-11-01T09:00:00Z",
    updatedAt: "2026-11-01T10:00:00Z",
    currentFocus: "",
    scratchpad: "",
    entries: [],
    hypotheses: [],
    tasks: [],
    resolution: { rootCause: "", fix: "", validation: "", prevention: "" },
  };

  test("handoff closing tells the model the record comes next", () => {
    const redacted = redactSessionForAgent(session);
    const prompt = buildAgentPrompt(redacted, agentTaskById("review"), "handoff");
    expect(prompt).toContain("I will paste the full session record in my next message.");
    expect(prompt).not.toContain("accompanies this prompt");
    // The rest of the prompt is the same scaffold as the files variant.
    expect(prompt).toContain("Treat every [REDACTED] token");
    expect(prompt).toContain("## Your task");
  });

  test("default closing is unchanged from F1", () => {
    const redacted = redactSessionForAgent(session);
    const prompt = buildAgentPrompt(redacted, agentTaskById("review"));
    expect(prompt).toContain(
      "The full redacted session record accompanies this prompt",
    );
  });

  test("the handoff prompt — the only thing entering the URL — is redacted", () => {
    const redacted = redactSessionForAgent(session);
    const prompt = buildAgentPrompt(redacted, agentTaskById("review"), "handoff");
    expect(prompt).not.toContain("hunter2");
    expect(prompt).toContain("[REDACTED]");
    const url = buildHandoffUrl(aiHandoffById("chatgpt")!, prompt)!;
    expect(url).not.toContain("hunter2");
  });
});
