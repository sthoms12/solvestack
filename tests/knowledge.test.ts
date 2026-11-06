import { describe, expect, test } from "bun:test";
import {
  filterKnowledgeArticles,
  knowledgeArticles,
  knowledgeSystems,
  knowledgeTags,
  type KnowledgeSession,
} from "../src/knowledge";

const make = (
  partial: Partial<KnowledgeSession> & { id: string },
): KnowledgeSession => ({
  title: "Untitled",
  problem: "",
  system: "",
  tags: [],
  status: "resolved",
  updatedAt: "2026-11-01T00:00:00Z",
  resolution: { rootCause: "", fix: "", validation: "", prevention: "" },
  entries: [],
  hypotheses: [],
  ...partial,
});

const sessions: KnowledgeSession[] = [
  make({
    id: "SS-K1",
    title: "VPN gateway outage",
    system: "VPN",
    tags: ["network", "vpn"],
    resolvedAt: "2026-11-02T10:00:00Z",
    resolution: {
      rootCause: "Firmware crash",
      fix: "Failover",
      validation: "",
      prevention: "",
    },
    entries: [
      { type: "Observation", content: "Users dropped" },
      { type: "Evidence", content: "Gateway log" },
    ],
  }),
  make({
    id: "SS-K2",
    title: "Mailbox sync failure",
    problem: "A vpn tunnel carried the sync traffic",
    system: "Exchange",
    tags: ["email"],
    resolvedAt: "2026-11-04T10:00:00Z",
  }),
  make({
    id: "SS-K3",
    title: "VPN client update loop",
    system: "VPN",
    tags: ["VPN"],
    status: "active",
    resolvedAt: undefined,
  }),
];

describe("knowledgeArticles", () => {
  test("resolved only, newest resolution first, projected fields", () => {
    const articles = knowledgeArticles(sessions);
    expect(articles.map((a) => a.id)).toEqual(["SS-K2", "SS-K1"]);
    expect(articles[1].rootCause).toBe("Firmware crash");
    expect(articles[1].entryCount).toBe(2);
    expect(articles[1].resolvedAt).toBe("2026-11-02T10:00:00Z");
  });
});

describe("filterKnowledgeArticles", () => {
  test("system and tag filters compose; tag match is case-insensitive", () => {
    expect(
      filterKnowledgeArticles(sessions, { system: "VPN" }).map((a) => a.id),
    ).toEqual(["SS-K1"]);
    expect(
      filterKnowledgeArticles(sessions, { tag: "VPN" }).map((a) => a.id),
    ).toEqual(["SS-K1"]);
    expect(
      filterKnowledgeArticles(sessions, { system: "Exchange", tag: "vpn" }),
    ).toEqual([]);
  });

  test("query ranks a title match above a body-only match", () => {
    const found = filterKnowledgeArticles(sessions, { query: "vpn" });
    expect(found.map((a) => a.id)).toEqual(["SS-K1", "SS-K2"]);
  });

  test("no filters returns every resolved article", () => {
    expect(filterKnowledgeArticles(sessions).map((a) => a.id)).toEqual([
      "SS-K2",
      "SS-K1",
    ]);
    expect(filterKnowledgeArticles(sessions, { query: "  " })).toHaveLength(2);
  });
});

describe("filter vocabularies", () => {
  test("systems and tags come from resolved sessions only, deduped and sorted", () => {
    expect(knowledgeSystems(sessions)).toEqual(["Exchange", "VPN"]);
    // SS-K3 is active: its "VPN" tag must not leak in; K1's tags dedupe.
    expect(knowledgeTags(sessions)).toEqual(["email", "network", "vpn"]);
  });
});
