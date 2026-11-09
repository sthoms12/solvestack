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
const fishbone = await Bun.file(
  "public/fishbone-diagram-template/index.html",
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

assertStaticTemplatePage(fishbone, {
  path: "/fishbone-diagram-template/",
  title: "Fishbone Diagram Template (Ishikawa)",
  heading: "Fishbone Diagram Template",
  descriptionPhrase: "fishbone diagram template",
  templateMarker: "FISHBONE DIAGRAM",
});
const fishTitle = fishbone.match(/<title>([^<]+)<\/title>/)?.[1] ?? "";
assert.equal(fishTitle.length < 60, true, `${fishTitle} (${fishTitle.length})`);
assert.match(
  fishbone,
  /name="description" content="[^"]*Ishikawa diagram template/,
);
assert.equal(fishbone.includes('href="/5-whys-template/"'), true);
assert.equal(fishbone.includes('href="/rca-template/"'), true);
assert.equal(fishbone.includes('href="/"'), true);
assert.equal(
  fishbone.includes(
    'href="/fishbone-diagram-template/fishbone-diagram-blank.csv"',
  ),
  true,
);
assert.match(fishbone, /Not a real incident/);
assert.equal(fishbone.includes('"@type": "Person"'), false);
assert.equal(fishbone.includes('"author"'), false);
const fishFaqs = faqEntities(fishbone);
assert.equal(fishFaqs.length >= 4 && fishFaqs.length <= 6, true, String(fishFaqs.length));
const csv = await Bun.file(
  "public/fishbone-diagram-template/fishbone-diagram-blank.csv",
).text();
assert.match(
  csv,
  /^effect,category_set,category,cause,subcause,evidence,disposition/,
);
for (const category of [
  "Methods",
  "Machines",
  "Materials",
  "Manpower/People",
  "Measurement",
  "Mother Nature/Environment",
  "Policies",
  "Procedures",
  "People",
  "Plant/Technology",
  "Surroundings",
  "Suppliers",
  "Systems",
  "Skills",
]) {
  assert.equal(csv.includes(category), true, category);
}
assert.equal(
  sitemap.includes(`<loc>${productionOrigin}fishbone-diagram-template/</loc>`),
  true,
);
assert.equal(
  (await Bun.file("public/llms.txt").text()).includes(
    "https://solvestack-ai.app/fishbone-diagram-template/",
  ),
  true,
);
assert.equal(
  (await Bun.file("index.html").text()).includes(
    'href="/fishbone-diagram-template/"',
  ),
  true,
);

for (const path of [
  "rca-template/",
  "5-whys-template/",
  "incident-report-template/",
  "fishbone-diagram-template/",
]) {
  assert.equal(sitemap.includes(`<loc>${productionOrigin}${path}</loc>`), true);
  const built = await Bun.file(`dist/${path}index.html`).text();
  const expected =
    path === "rca-template/"
      ? rca
      : path === "5-whys-template/"
        ? fiveWhys
        : path === "incident-report-template/"
          ? incidentReport
          : fishbone;
  assert.equal(built, expected);
}
assert.equal(
  await Bun.file(
    "dist/fishbone-diagram-template/fishbone-diagram-blank.csv",
  ).text(),
  csv,
);

// Incident template pages (F2 phase B): same static contract as the method
// pages, plus sitemap, llms.txt, and dist parity for each.
const incidentTemplatePages: Array<{
  path: string;
  title: string;
  heading: string;
  descriptionPhrase: string;
  templateMarker: string;
}> = [
  {
    path: "vpn-outage-template/",
    title: "VPN Outage Template",
    heading: "VPN Outage",
    descriptionPhrase: "VPN outage template",
    templateMarker: "VPN OUTAGE CHECKLIST",
  },
  {
    path: "sign-in-failure-template/",
    title: "SSO Sign-In Failure Template",
    heading: "SSO Sign-In Failure Template",
    descriptionPhrase: "sign-in failure template",
    templateMarker: "SIGN-IN FAILURE CHECKLIST",
  },
  {
    path: "expired-certificate-template/",
    title: "Expired Certificate Template",
    heading: "Expired Certificate Template",
    descriptionPhrase: "expired certificate template",
    templateMarker: "EXPIRED CERTIFICATE CHECKLIST",
  },
  {
    path: "dns-failure-template/",
    title: "DNS Failure Template",
    heading: "DNS Failure Template",
    descriptionPhrase: "DNS failure template",
    templateMarker: "DNS FAILURE CHECKLIST",
  },
  {
    path: "disk-full-template/",
    title: "Disk Full Template",
    heading: "Disk Full Template",
    descriptionPhrase: "disk full template",
    templateMarker: "DISK FULL CHECKLIST",
  },
  {
    path: "email-delivery-template/",
    title: "Email Delivery Template",
    heading: "Email Delivery Template",
    descriptionPhrase: "email delivery template",
    templateMarker: "EMAIL DELIVERY CHECKLIST",
  },
];
const llms = await Bun.file("public/llms.txt").text();
for (const page of incidentTemplatePages) {
  const html = await Bun.file(`public/${page.path}index.html`).text();
  assertStaticTemplatePage(html, page);
  assert.equal(html.includes('href="/rca-template/"'), true, page.path);
  assert.equal(html.includes('href="/"'), true, page.path);
  assert.match(html, /Not a real incident/);
  assert.equal(
    sitemap.includes(`<loc>${productionOrigin}${page.path}</loc>`),
    true,
    page.path,
  );
  assert.equal(
    llms.includes(`${productionOrigin}${page.path}`),
    true,
    page.path,
  );
  const built = await Bun.file(`dist/${page.path}index.html`).text();
  assert.equal(built, html, page.path);
}

const home = await Bun.file("index.html").text();
assert.equal(home.includes('href="/root-cause-analysis-tools/"'), true);
assert.equal(home.includes('href="/corrective-action-plan-template/"'), true);

const addedPages: Array<{
  path: string;
  title: string;
  heading: string;
  descriptionPhrase: string;
  templateMarker: string;
}> = [
  {
    path: "root-cause-analysis-tools/",
    title: "Root Cause Analysis Tools",
    heading: "Root Cause Analysis Tools",
    descriptionPhrase: "Root cause analysis tools",
    templateMarker: "WHICH RCA TOOL",
  },
  {
    path: "corrective-action-plan-template/",
    title: "Corrective Action Plan Template",
    heading: "Corrective Action Plan Template",
    descriptionPhrase: "corrective action plan template",
    templateMarker: "CORRECTIVE ACTION PLAN",
  },
];
for (const page of addedPages) {
  const html = await Bun.file(`public/${page.path}index.html`).text();
  assertStaticTemplatePage(html, page);
  assert.equal(html.includes('href="/rca-template/"'), true, page.path);
  assert.equal(html.includes('href="/"'), true, page.path);
  assert.match(html, /Not a real incident/);
  assert.equal(
    html.includes(
      '"author": { "@type": "Organization", "name": "SolveStack"',
    ),
    true,
    page.path,
  );
  assert.equal(html.includes('"@type": "Person"'), false, page.path);
  assert.equal(html.toLowerCase().includes("steve"), false, page.path);
  assert.equal(/href="[^"]*fmea/i.test(html), false, page.path);
  assert.equal(
    sitemap.includes(`<loc>${productionOrigin}${page.path}</loc>`),
    true,
    page.path,
  );
  assert.equal(
    llms.includes(`${productionOrigin}${page.path}`),
    true,
    page.path,
  );
  const built = await Bun.file(`dist/${page.path}index.html`).text();
  assert.equal(built, html, page.path);
}
assert.equal(
  (await Bun.file("public/root-cause-analysis-tools/index.html").text()).includes(
    'href="/corrective-action-plan-template/"',
  ),
  true,
);
assert.equal(
  (await Bun.file("public/corrective-action-plan-template/index.html").text()).includes(
    'href="/root-cause-analysis-tools/"',
  ),
  true,
);

console.log("SolveStack template page contract passed");
