import { describe, expect, test } from "bun:test";
import {
  buildAgentPackFiles,
  buildDeltaSession,
  type AgentPackSession,
  type PackMarker,
} from "../src/agent-pack";
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
    entries: [
      {
        type: "Observation",
        technicalType: "",
        content: "old entry",
        timestamp: "2026-11-01T09:05:00Z",
        starred: false,
      },
      {
        type: "Note",
        technicalType: "",
        content: "new entry",
        timestamp: "2026-11-02T09:05:00Z",
        starred: false,
      },
    ],
    hypotheses: [
      { text: "Gateway fault", status: "Ruled Out", reasoning: "swapped hardware" },
      { text: "ISP fault", status: "Investigating", reasoning: "" },
      { text: "Config push", status: "Likely", reasoning: "" },
    ],
    tasks: [],
    resolution: { rootCause: "", fix: "", validation: "", prevention: "" },
  } as AgentPackSession;
}

const marker: PackMarker = {
  at: "2026-11-01T12:00:00Z",
  hypothesisStates: {
    "Gateway fault": "Investigating",
    "ISP fault": "Investigating",
  },
};

describe("buildDeltaSession", () => {
  test("keeps only post-marker entries and changed/new hypotheses", () => {
    const { session, changedEntries, changedHypotheses } =
      buildDeltaSession(fixtureSession(), marker);
    expect(changedEntries).toBe(1);
    expect(session.entries[0].content).toBe("new entry");
    // Gateway fault changed (Investigating → Ruled Out), Config push is
    // new since the marker; ISP fault is unchanged and excluded.
    expect(changedHypotheses).toBe(2);
    expect(session.hypotheses.map((h) => h.text)).toEqual([
      "Gateway fault",
      "Config push",
    ]);
  });

  test("an unchanged session produces an empty delta", () => {
    const fresh: PackMarker = {
      at: "2026-11-03T00:00:00Z",
      hypothesisStates: {
        "Gateway fault": "Ruled Out",
        "ISP fault": "Investigating",
        "Config push": "Likely",
      },
    };
    const { changedEntries, changedHypotheses } = buildDeltaSession(
      fixtureSession(),
      fresh,
    );
    expect(changedEntries).toBe(0);
    expect(changedHypotheses).toBe(0);
  });

  test("the delta flows through the pack builders with a scope line", () => {
    const { session } = buildDeltaSession(fixtureSession(), marker);
    const files = buildAgentPackFiles({
      session,
      knowledgeMarkdown: "# Summary",
      attachments: [],
      schemaVersion: CURRENT_SCHEMA_VERSION,
      taskId: "review",
      deltaSince: marker.at,
    });
    const prompt = files.find((f) => f.name === "PROMPT.md");
    expect(prompt?.text).toContain("Pack scope: DELTA");
    expect(prompt?.text).toContain(marker.at);
    const agent = files.find((f) => f.name === "AGENT.md");
    expect(agent?.text).toContain("Pack scope: delta");
    const json = JSON.parse(
      files.find((f) => f.name === "session.redacted.json")!.text,
    );
    expect(json.session.entries).toHaveLength(1);
    expect(json.session.hypotheses).toHaveLength(2);
  });
});
