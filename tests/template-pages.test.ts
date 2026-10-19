import { strict as assert } from "node:assert";

const productionOrigin = "https://solvestack-ai.app/";

function visibleText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function faqEntities(html: string) {
  const blocks = [
    ...html.matchAll(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
    ),
  ].map((match) => JSON.parse(match[1]) as { "@type"?: string });
  const faq = blocks.find((block) => block["@type"] === "FAQPage") as
    | {
        mainEntity: Array<{
          name: string;
          acceptedAnswer: { text: string };
        }>;
      }
    | undefined;
  assert.ok(faq, "page should include FAQPage JSON-LD");
  return faq.mainEntity;
}

function assertStaticTemplatePage(
  html: string,
  expectations: {
    path: string;
    title: string;
    heading: string;
    descriptionPhrase: string;
    templateMarker: string;
  },
) {
  assert.equal(
    html.includes('<script type="module"') || html.includes("<script src="),
    false,
    `${expectations.path} should be server HTML, not a client render`,
  );
  assert.match(
    html,
    /<link rel="canonical" href="https:\/\/solvestack-ai\.app\/[^"]+" \/>/,
  );
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1] ?? "";
  assert.equal(title.includes(expectations.title), true, title);
  const heading = html.match(/<h1>([\s\S]*?)<\/h1>/)?.[1] ?? "";
  assert.equal(
    heading.replace(/<[^>]+>/g, "").includes(expectations.heading),
    true,
    heading,
  );
  assert.match(
    html,
    new RegExp(
      `<meta name="description" content="[^"]*${expectations.descriptionPhrase}[^"]*"`,
    ),
  );
  assert.match(html, /<pre>[\s\S]*<\/pre>/);
  assert.equal(html.includes(expectations.templateMarker), true);
  const text = visibleText(html);
  for (const entity of faqEntities(html)) {
    assert.equal(text.includes(entity.name), true, entity.name);
    assert.equal(
      text.includes(entity.acceptedAnswer.text),
      true,
      entity.acceptedAnswer.text,
    );
  }
}

const rca = await Bun.file("public/rca-template/index.html").text();
const fiveWhys = await Bun.file("public/5-whys-template/index.html").text();
const incidentReport = await Bun.file(
  "public/incident-report-template/index.html",
).text();
const sitemap = await Bun.file("public/sitemap.xml").text();

assertStaticTemplatePage(rca, {
  path: "/rca-template/",
  title: "Root Cause Analysis Template",
  heading: "Root Cause Analysis Template",
  descriptionPhrase: "Root cause analysis template",
  templateMarker: "ROOT CAUSE ANALYSIS",
});
assert.equal(rca.includes('href="/5-whys-template/"'), true);
assert.equal(rca.includes('href="/"'), true);

assertStaticTemplatePage(fiveWhys, {
  path: "/5-whys-template/",
  title: "5 Whys Template",
  heading: "5 Whys Template",
  descriptionPhrase: "5 whys template",
  templateMarker: "5 WHYS",
});
assert.equal(fiveWhys.includes('href="/rca-template/"'), true);
assert.equal(fiveWhys.includes('href="/"'), true);
assert.match(fiveWhys, /Not a real incident/);
assert.equal(fiveWhys.includes("2.9k") || fiveWhys.includes("$6.38"), false);
assert.equal(fiveWhys.includes("$4.61") || rca.includes("$6.38"), false);

assertStaticTemplatePage(incidentReport, {
  path: "/incident-report-template/",
  title: "IT Incident Report Template",
  heading: "IT Incident Report Template",
  descriptionPhrase: "incident report template",
  templateMarker: "INCIDENT REPORT",
});
assert.equal(incidentReport.includes('href="/rca-template/"'), true);
assert.equal(incidentReport.includes('href="/use-your-data/"'), true);
assert.equal(incidentReport.includes('href="/"'), true);
assert.match(incidentReport, /Not a real incident/);
assert.equal(
  incidentReport.includes("2.9k") ||
    incidentReport.includes("$6.38") ||
    incidentReport.includes("$4.61"),
  false,
);

for (const path of ["rca-template/", "5-whys-template/", "incident-report-template/"]) {
  assert.equal(sitemap.includes(`<loc>${productionOrigin}${path}</loc>`), true);
  const built = await Bun.file(`dist/${path}index.html`).text();
  const expected =
    path === "rca-template/"
      ? rca
      : path === "5-whys-template/"
        ? fiveWhys
        : incidentReport;
  assert.equal(built, expected);
}

console.log("SolveStack template page contract passed");
