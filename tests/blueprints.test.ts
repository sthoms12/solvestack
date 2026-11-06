import { describe, expect, test } from "bun:test";
import {
  BLUEPRINTS,
  blueprintById,
  methodDeepLink,
  parseMethodParam,
  type BlueprintId,
} from "../src/blueprints";

const INCIDENT_IDS: BlueprintId[] = [
  "vpn-outage",
  "sign-in-failure",
  "cert-expired",
  "dns-failure",
  "disk-full",
  "email-delivery",
];

describe("blueprint data contract", () => {
  test("ids are unique and every blueprint is well-formed", () => {
    const ids = BLUEPRINTS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const blueprint of BLUEPRINTS) {
      expect(["method", "incident"]).toContain(blueprint.kind);
      expect(blueprint.label.length).toBeGreaterThan(0);
      expect(blueprint.shortLabel.length).toBeGreaterThan(0);
      expect(blueprint.description.length).toBeGreaterThan(0);
      for (const tag of blueprint.tags)
        expect(tag).toBe(tag.toLowerCase());
      if (blueprint.id === "blank") continue;
      // A starting point that seeds nothing is a broken template.
      expect(blueprint.tasks.length).toBeGreaterThanOrEqual(3);
      expect(blueprint.hypotheses.length).toBeGreaterThanOrEqual(1);
      expect(blueprint.entries.length).toBeGreaterThanOrEqual(2);
      // Incident blueprints always offer competing causes, never one.
      if (blueprint.kind === "incident")
        expect(blueprint.hypotheses.length).toBeGreaterThanOrEqual(2);
      expect(blueprint.currentFocus.length).toBeGreaterThan(0);
      expect(blueprint.scratchpad.length).toBeGreaterThan(0);
      for (const entry of blueprint.entries)
        expect(entry.content.length).toBeGreaterThan(0);
    }
  });

  test("incident blueprints link to their public template pages (phase B)", () => {
    const expected: Record<string, string> = {
      "vpn-outage": "/vpn-outage-template/",
      "sign-in-failure": "/sign-in-failure-template/",
      "cert-expired": "/expired-certificate-template/",
      "dns-failure": "/dns-failure-template/",
      "disk-full": "/disk-full-template/",
      "email-delivery": "/email-delivery-template/",
    };
    for (const [id, path] of Object.entries(expected))
      expect(blueprintById(id).templatePath).toBe(path);
    // Methods keep theirs.
    expect(blueprintById("rca").templatePath).toBe("/rca-template/");
  });
});

describe("incident deep links", () => {
  test("each incident id resolves from query and hash forms", () => {
    for (const id of INCIDENT_IDS) {
      expect(parseMethodParam(`?method=${id}`, "")).toBe(id);
      expect(parseMethodParam("", `#method=${id}`)).toBe(id);
      expect(methodDeepLink(id)).toBe(`/?method=${id}`);
      expect(blueprintById(id).id).toBe(id);
    }
  });

  test("unknown ids still fall back safely", () => {
    expect(parseMethodParam("?method=not-a-template", "")).toBeNull();
    expect(blueprintById("not-a-template").id).toBe("blank");
    expect(blueprintById(undefined).id).toBe("blank");
  });
});
