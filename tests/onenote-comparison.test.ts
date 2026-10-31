import { test, expect } from "bun:test";
import { parsePortableData } from "../src/domain";
import { migrateWorkspace } from "../src/migrations";

const page = await Bun.file("public/onenote-vs-solvestack/index.html").text();
const sampleJson = await Bun.file("public/onenote-vs-solvestack/sample-session.json").text();
const sampleMd = await Bun.file("public/onenote-vs-solvestack/sample-knowledge.md").text();
const sitemap = await Bun.file("public/sitemap.xml").text();
const home = await Bun.file("index.html").text();

function visibleText(html: string) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

test("comparison page is static, canonical, and linked", () => {
  expect(page.includes('<script type="module"') || page.includes("<script src=")).toBe(false);
  expect(page).toContain('<link rel="canonical" href="https://solvestack-ai.app/onenote-vs-solvestack/" />');
  expect(page.match(/<h1>/g)?.length).toBe(1);
  expect(sitemap).toContain("<loc>https://solvestack-ai.app/onenote-vs-solvestack/</loc>");
  expect(home).toContain('href="/onenote-vs-solvestack/"');
});

test("FAQ JSON-LD matches visible text", () => {
  const blocks = [...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const faq = blocks.find((block) => block["@type"] === "FAQPage");
  expect(faq).toBeDefined();
  const text = visibleText(page).replaceAll("&#x27;", "'");
  for (const entity of faq.mainEntity) {
    expect(text).toContain(entity.name);
    expect(text).toContain(entity.acceptedAnswer.text);
  }
});

test("OneNote claims cite official Microsoft pages", () => {
  const external = [...page.matchAll(/href="(https?:\/\/[^"]+)"/g)].map((m) => new URL(m[1]).hostname).filter((host) => host !== "solvestack-ai.app");
  expect(external.length).toBeGreaterThan(0);
  for (const host of external) expect(["support.microsoft.com", "www.microsoft.com"]).toContain(host);
});

test("sample session JSON imports through the real portable-data path", () => {
  const incoming = parsePortableData(JSON.parse(sampleJson));
  expect(incoming.kind).toBe("session");
  const migrated = migrateWorkspace({ schemaVersion: 2, sessions: incoming.sessions, attachments: incoming.attachments });
  expect(migrated.sessions).toHaveLength(1);
  expect((migrated.sessions[0] as { id: string }).id).toBe("SS-SAMPLE-001");
});

test("sample Markdown is the export of the sample session", () => {
  const session = JSON.parse(sampleJson).session;
  expect(sampleMd).toContain(`session_id: ${session.id}`);
  for (const heading of ["## Problem", "## Timeline", "## Hypotheses", "## Ruled Out", "## Root Cause", "## Resolution", "## Validation", "## Prevention"])
    expect(sampleMd).toContain(heading);
  expect(sampleMd).toContain(session.resolution.rootCause);
  expect(page).toContain('href="/onenote-vs-solvestack/sample-knowledge.md"');
  expect(page).toContain('href="/onenote-vs-solvestack/sample-session.json"');
});
