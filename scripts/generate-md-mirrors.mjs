import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

// Generates Markdown mirrors of the static pages for agent discovery.
// Reads the checked-in HTML (index.html + public/<slug>/index.html) and
// writes dist/<slug>.md alongside the built site, so the mirrors always
// derive from the same copy as the HTML pages. The Cloudflare worker
// serves these when a client asks for Accept: text/markdown, and advertises
// them with a Link: rel="alternate"; type="text/markdown" header.
// Run after `vite build`: node scripts/generate-md-mirrors.mjs [dist]

const ORIGIN = "https://solvestack-ai.app";

const PAGES = [
  { source: "index.html", out: "index.md", path: "/" },
  {
    source: "public/incident-report-template/index.html",
    out: "incident-report-template.md",
    path: "/incident-report-template/",
  },
  {
    source: "public/5-whys-template/index.html",
    out: "5-whys-template.md",
    path: "/5-whys-template/",
  },
  {
    source: "public/fishbone-diagram-template/index.html",
    out: "fishbone-diagram-template.md",
    path: "/fishbone-diagram-template/",
  },
  {
    source: "public/root-cause-analysis-tools/index.html",
    out: "root-cause-analysis-tools.md",
    path: "/root-cause-analysis-tools/",
  },
  {
    source: "public/corrective-action-plan-template/index.html",
    out: "corrective-action-plan-template.md",
    path: "/corrective-action-plan-template/",
  },
  {
    source: "public/rca-template/index.html",
    out: "rca-template.md",
    path: "/rca-template/",
  },
  {
    source: "public/vpn-outage-template/index.html",
    out: "vpn-outage-template.md",
    path: "/vpn-outage-template/",
  },
  {
    source: "public/sign-in-failure-template/index.html",
    out: "sign-in-failure-template.md",
    path: "/sign-in-failure-template/",
  },
  {
    source: "public/expired-certificate-template/index.html",
    out: "expired-certificate-template.md",
    path: "/expired-certificate-template/",
  },
  {
    source: "public/dns-failure-template/index.html",
    out: "dns-failure-template.md",
    path: "/dns-failure-template/",
  },
  {
    source: "public/disk-full-template/index.html",
    out: "disk-full-template.md",
    path: "/disk-full-template/",
  },
  {
    source: "public/email-delivery-template/index.html",
    out: "email-delivery-template.md",
    path: "/email-delivery-template/",
  },
  {
    source: "public/use-your-data/index.html",
    out: "use-your-data.md",
    path: "/use-your-data/",
  },
  {
    source: "public/onenote-vs-solvestack/index.html",
    out: "onenote-vs-solvestack.md",
    path: "/onenote-vs-solvestack/",
  },
  {
    source: "public/agent-adapter/index.html",
    out: "agent-adapter.md",
    path: "/agent-adapter/",
  },
];

const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  hellip: "…",
};

function decodeEntities(text) {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_m, dec) =>
      String.fromCodePoint(Number.parseInt(dec, 10)),
    )
    .replace(/&([a-z]+);/gi, (_m, name) => NAMED_ENTITIES[name] ?? `&${name};`);
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, "");
}

function absUrl(href, pagePath) {
  if (/^(https?:|mailto:)/i.test(href)) return href;
  if (href.startsWith("/")) return ORIGIN + href;
  if (href.startsWith("#")) return ORIGIN + pagePath + href;
  return href;
}

function inline(html, pagePath) {
  let text = html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(
      /<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
      (_m, href, label) => `[${inline(label, pagePath)}](${absUrl(href, pagePath)})`,
    )
    .replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, (_m, _tag, inner) =>
      `**${inline(inner, pagePath)}**`,
    )
    .replace(/<em>([\s\S]*?)<\/em>/gi, (_m, inner) => `*${inline(inner, pagePath)}*`)
    .replace(/<code>([\s\S]*?)<\/code>/gi, (_m, inner) => `\`${stripTags(inner).trim()}\``);
  text = stripTags(text);
  return decodeEntities(text).replace(/\s+/g, " ").trim();
}

function titleCase(label) {
  const lower = label.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function tableToMarkdown(tableHtml, pagePath) {
  const lines = [];
  const caption = tableHtml.match(/<caption>([\s\S]*?)<\/caption>/i)?.[1];
  if (caption) lines.push(`*${inline(caption, pagePath)}*`, "");
  const head = tableHtml.match(/<thead>([\s\S]*?)<\/thead>/i)?.[1] ?? "";
  const headers = [...head.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((cell) =>
    inline(cell[1], pagePath),
  );
  const body =
    tableHtml.match(/<tbody>([\s\S]*?)<\/tbody>/i)?.[1] ?? tableHtml;
  const rows = [...body.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)].map((row) =>
    [...row[1].matchAll(/<(?:th|td)[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)].map(
      (cell) => inline(cell[1], pagePath).replace(/\|/g, "\\|"),
    ),
  );
  if (headers.length) {
    lines.push(`| ${headers.join(" | ")} |`);
    lines.push(`| ${headers.map(() => "---").join(" | ")} |`);
  }
  for (const row of rows) lines.push(`| ${row.join(" | ")} |`);
  lines.push("");
  return lines;
}

function convertPage(html, page) {
  const faqs = [];
  for (const match of html.matchAll(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
  )) {
    try {
      const data = JSON.parse(match[1]);
      const blocks = Array.isArray(data["@graph"]) ? data["@graph"] : [data];
      for (const block of blocks) {
        if (block["@type"] === "FAQPage") {
          for (const entity of block.mainEntity ?? []) {
            faqs.push({
              question: entity.name,
              answer: entity.acceptedAnswer?.text ?? "",
            });
          }
        }
      }
    } catch {
      // Ignore malformed JSON-LD; the HTML page is the source of truth.
    }
  }

  let main = html.match(/<main>([\s\S]*?)<\/main>/)?.[1] ?? "";
  main = main.replace(/<script[\s\S]*?<\/script>/gi, "");

  // Fenced copy-paste blocks first, so their contents survive tag stripping.
  const pres = [];
  main = main.replace(/<pre>([\s\S]*?)<\/pre>/gi, (_m, code) => {
    pres.push(decodeEntities(code).replace(/^\n+|\s+$/g, ""));
    return `\n@@PRE${pres.length - 1}@@\n`;
  });

  const asides = [];
  main = main.replace(/<aside>([\s\S]*?)<\/aside>/gi, (_m, inner) => {
    // <strong>label</strong><span>text</span> has no whitespace between tags.
    const spaced = inner.replace(/<\/strong>\s*<span>/gi, "</strong> <span>");
    asides.push(inline(spaced, page.path));
    return `\n@@ASIDE${asides.length - 1}@@\n`;
  });

  const examples = [];
  main = main.replace(
    /<span class="example">([\s\S]*?)<\/span>/gi,
    (_m, inner) => {
      const label = inner.match(/<b>([^<]+)<\/b>/i)?.[1] ?? "Example";
      const rest = inner.replace(/<b>[^<]*<\/b>/i, "");
      examples.push({ label: titleCase(label), text: inline(rest, page.path) });
      return `\n@@EX${examples.length - 1}@@\n`;
    },
  );

  // Decorative chrome: hero actions, chapter/overline labels, step numbers,
  // small format labels.
  main = main
    .replace(/<div class="hero-actions">[\s\S]*?<\/div>/gi, "")
    .replace(/<div class="chapter">[\s\S]*?<\/div>/gi, "")
    .replace(/<p class="overline">[\s\S]*?<\/p>/gi, "")
    .replace(/<span class="number">[\s\S]*?<\/span>/gi, "")
    .replace(/<small>[\s\S]*?<\/small>/gi, "");

  // Unwrap structural containers, keeping inner content in order.
  main = main.replace(
    /<\/?(section|div|article|figure|span|header|footer|nav)(\s[^>]*)?>/gi,
    "",
  );

  // Standalone bold lines (e.g. "Use when …" under a format card) become
  // paragraphs; standalone <code> labels (e.g. ".MD") are dropped.
  main = main.replace(/>\s*<b>([^<]+)<\/b>/g, ">\n<p><strong>$1</strong></p>");
  main = main.replace(/<code>[^<]*<\/code>/gi, "");

  const lines = [];
  const blockRe =
    /<(h1|h2|h3|p|ul|ol|table|figcaption)(?:\s[^>]*)?>([\s\S]*?)<\/\1>|@@(PRE|ASIDE|EX)(\d+)@@/g;
  let match;
  while ((match = blockRe.exec(main)) !== null) {
    if (match[3]) {
      if (match[3] === "PRE") {
        lines.push("```", pres[Number(match[4])], "```", "");
      } else if (match[3] === "ASIDE") {
        lines.push(`> ${asides[Number(match[4])]}`, "");
      } else {
        const example = examples[Number(match[4])];
        lines.push(`> **${example.label}:** ${example.text}`, "");
      }
      continue;
    }
    const tag = match[1];
    const inner = match[2];
    if (tag === "h1") lines.push(`# ${inline(inner, page.path)}`, "");
    else if (tag === "h2") lines.push(`## ${inline(inner, page.path)}`, "");
    else if (tag === "h3") lines.push(`### ${inline(inner, page.path)}`, "");
    else if (tag === "figcaption") {
      lines.push(`*${inline(inner, page.path)}*`, "");
    } else if (tag === "p") {
      const text = inline(inner, page.path);
      if (!text) continue;
      if (/^COPY-PASTE VERSION/i.test(text)) {
        lines.push("## Copy-paste version", "");
        continue;
      }
      // Section eyebrow labels ("THE TEMPLATE", "HOW TO FILL IT IN").
      if (/^[A-Z][A-Z0-9\s&—–\-·'’.]+$/.test(text) && text.length <= 45) {
        continue;
      }
      lines.push(text, "");
    } else if (tag === "ul") {
      for (const item of inner.matchAll(/<li>([\s\S]*?)<\/li>/gi)) {
        lines.push(`- ${inline(item[1], page.path)}`);
      }
      lines.push("");
    } else if (tag === "ol") {
      let index = 0;
      for (const item of inner.matchAll(/<li>([\s\S]*?)<\/li>/gi)) {
        lines.push(`${++index}. ${inline(item[1], page.path)}`);
      }
      lines.push("");
    } else if (tag === "table") {
      lines.push(...tableToMarkdown(inner, page.path));
    }
  }

  if (faqs.length) {
    lines.push("## Frequently asked questions", "");
    for (const faq of faqs) {
      lines.push(`### ${decodeEntities(faq.question).trim()}`, "");
      lines.push(decodeEntities(faq.answer).replace(/\s+/g, " ").trim(), "");
    }
  }

  lines.push("---", "");
  lines.push(`[View the live page](${ORIGIN}${page.path})`, "");

  const markdown = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  if (!markdown.startsWith("# ")) {
    throw new Error(`${page.source}: no h1 found, refusing to emit a mirror`);
  }
  if (markdown.length < 300) {
    throw new Error(`${page.source}: mirror too short (${markdown.length} chars)`);
  }
  return markdown;
}

export async function generate(root = process.cwd(), outDir = "dist") {
  const written = [];
  for (const page of PAGES) {
    const html = await readFile(join(root, page.source), "utf8");
    const markdown = convertPage(html, page);
    const outPath = join(root, outDir, page.out);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, markdown, "utf8");
    written.push(`${outPath} (${markdown.length} chars)`);
  }
  return written;
}

const isCli =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isCli) {
  const outDir = process.argv[2] ?? "dist";
  try {
    const written = await generate(process.cwd(), outDir);
    for (const file of written) console.log(`Wrote ${file}`);
  } catch (error) {
    console.error(`generate-md-mirrors failed: ${error.message}`);
    process.exit(1);
  }
}
