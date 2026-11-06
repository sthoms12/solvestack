import { describe, expect, test } from "bun:test";
import { extractReplyJson, planReply } from "../src/ai-reply";

const session = {
  id: "SS-TEST-001",
  hypotheses: [
    { text: "Gateway config push broke the tunnel", status: "Investigating" },
    { text: "ISP outage in the region", status: "Likely" },
  ],
};

const block = (body: Record<string, unknown>) =>
  "Here is my review.\n\n```solvestack-reply\n" +
  JSON.stringify(
    { kind: "solvestack-reply", version: 1, sessionId: "SS-TEST-001", ...body },
    null,
    2,
  ) +
  "\n```\n";

describe("planReply", () => {
  test("parses a full valid reply into a plan", () => {
    const result = planReply(
      block({
        task: "review",
        summary: "Evidence points at the config push.",
        newEntries: [{ type: "Note", content: "Checked the change log." }],
        hypothesisUpdates: [
          {
            matchText: "Gateway config push broke the tunnel",
            status: "Confirmed",
            reasoning: "Change window matches the first failure.",
          },
        ],
        newTasks: ["Roll back the push in a window"],
        resolutionDraft: { rootCause: "Bad config push" },
      }),
      session,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.entries).toHaveLength(1);
    expect(result.plan.hypothesisUpdates[0].currentStatus).toBe("Investigating");
    expect(result.plan.hypothesisUpdates[0].status).toBe("Confirmed");
    expect(result.plan.tasks).toHaveLength(1);
    expect(result.plan.resolutionDraft?.rootCause).toBe("Bad config push");
    expect(result.plan.unmatched).toHaveLength(0);
  });

  test("prose without a block is no-block", () => {
    const result = planReply("Just prose, no block.", session);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("no-block");
  });

  test("a malformed fenced block is malformed, not no-block", () => {
    const result = planReply("```solvestack-reply\n{not json\n```", session);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("malformed");
  });

  test("a reply for another session is refused", () => {
    const result = planReply(
      block({}).replace("SS-TEST-001", "SS-OTHER-999"),
      session,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("wrong-session");
      expect(result.message).toContain("SS-OTHER-999");
    }
  });

  test("an unknown version is refused", () => {
    const text = block({}).replace('"version": 1', '"version": 2');
    const result = planReply(text, session);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad-version");
  });

  test("unmatched hypotheses and bad statuses are reported, not applied", () => {
    const result = planReply(
      block({
        hypothesisUpdates: [
          { matchText: "A hypothesis that does not exist", status: "Ruled Out" },
          { matchText: "ISP outage in the region", status: "Banana" },
        ],
      }),
      session,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.hypothesisUpdates).toHaveLength(0);
    expect(result.plan.unmatched).toHaveLength(2);
  });

  test("unknown entry types coerce to Note and empty content is dropped", () => {
    const result = planReply(
      block({
        newEntries: [
          { type: "Banana", content: "kept as a note" },
          { type: "Note", content: "   " },
        ],
      }),
      session,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.entries).toHaveLength(1);
    expect(result.plan.entries[0].type).toBe("Note");
  });

  test("oversized lists are capped", () => {
    const many = Array.from({ length: 80 }, (_, i) => `task ${i}`);
    const result = planReply(block({ newTasks: many }), session);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.tasks.length).toBeLessThanOrEqual(50);
  });

  test("a bare JSON paste (no fence) also parses", () => {
    const bare = JSON.stringify({
      kind: "solvestack-reply",
      version: 1,
      sessionId: "SS-TEST-001",
      newTasks: ["one"],
    });
    const result = planReply(bare, session);
    expect(result.ok).toBe(true);
  });

  test("extractReplyJson ignores surrounding prose around the fence", () => {
    const extracted = extractReplyJson(`before ${block({})} after`);
    expect(extracted.ok).toBe(true);
  });
});
