import { describe, expect, test } from "bun:test";
import { buildRunbook, type RunbookSession } from "../src/runbook";

const resolved: RunbookSession = {
  id: "SS-RUNBOOK-1",
  title: "VPN gateway outage",
  problem: "All remote users dropped at 09:12",
  system: "VPN gateway GW-2",
  status: "resolved",
  resolvedAt: "2026-11-02T15:30:00Z",
  tasks: [
    { text: "Check gateway status page", completed: true },
    { text: "Fail over to GW-1", completed: true },
    { text: "Announce restoration in #ops", completed: false },
  ],
  hypotheses: [
    { text: "ISP circuit down", status: "Ruled Out", reasoning: "BGP session stayed up" },
    { text: "Gateway firmware fault", status: "Confirmed", reasoning: "Crash dump matched the advisory" },
  ],
  resolution: {
    rootCause: "Firmware crash on GW-2 under load",
    fix: "Failed over to GW-1 and patched GW-2",
    validation: "20 test users connected and stayed up for 30 minutes",
    prevention: "Add gateway crash alerting",
  },
};

describe("buildRunbook", () => {
  test("a resolved session becomes a followable checklist", () => {
    const md = buildRunbook(resolved, ["gw-status.txt", "crash.png"]);
    expect(md).toContain("# Runbook: VPN gateway outage");
    expect(md).toContain("Resolved 2026-11-02");
    expect(md).toContain("Review before first use");
    // Tasks become fresh checkboxes, in order, none pre-checked.
    const first = md.indexOf("- [ ] Check gateway status page");
    const second = md.indexOf("- [ ] Fail over to GW\\-1");
    const third = md.indexOf("- [ ] Announce restoration in \\#ops");
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
    expect(third).toBeGreaterThan(second);
    expect(md).not.toContain("- [x]");
    // Validation is the closing check; ruled-outs carry their reasoning.
    expect(md).toContain("- [ ] 20 test users connected");
    expect(md).toContain("Already ruled out during the original incident");
    expect(md).toContain("**ISP circuit down** — BGP session stayed up");
    expect(md).not.toContain("## If it doesn't work\n\n- **Gateway firmware fault**");
    expect(md).toContain("Root cause found originally: Firmware crash on GW\\-2");
    expect(md).toContain("gw\\-status\\.txt, crash\\.png");
    expect(md).toContain("Add gateway crash alerting");
  });

  test("no tasks falls back to the recorded fix as the procedure", () => {
    const md = buildRunbook({ ...resolved, tasks: [] });
    expect(md).toContain("## Steps\nFailed over to GW-1 and patched GW-2");
  });

  test("an unresolved, sparse session degrades honestly", () => {
    const md = buildRunbook({
      id: "SS-EMPTY-1",
      title: "Untitled",
      problem: "",
      system: "",
      status: "active",
      tasks: [],
      hypotheses: [],
      resolution: { rootCause: "", fix: "", validation: "", prevention: "" },
    });
    expect(md).toContain("Not yet resolved");
    expect(md).toContain("## When to use this\nNot recorded");
    expect(md).toContain("Nothing was ruled out in the original session.");
    expect(md).toContain("Evidence from the original session: None recorded");
    expect(md).toContain("## Prevention / follow-ups\nNot recorded");
  });

  test("markdown-significant characters in fields are escaped", () => {
    const md = buildRunbook({
      ...resolved,
      title: "VPN [gateway] *down*",
      tasks: [{ text: "Run `netstat` #now", completed: false }],
    });
    expect(md).toContain("# Runbook: VPN \\[gateway\\] \\*down\\*");
    expect(md).toContain("- [ ] Run \\`netstat\\` \\#now");
  });
});
