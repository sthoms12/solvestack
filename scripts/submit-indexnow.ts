import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const origin = "https://solvestack-ai.app";
const host = "solvestack-ai.app";
const key = "e9e28ff1a5f9cee1973224d3104514c7";
const sitemapUrl = "https://solvestack-ai.app/sitemap.xml";
const batchSize = 10000;
const here = dirname(fileURLToPath(import.meta.url));
const keyPath = resolve(here, `../public/${key}.txt`);

async function collectFromSitemap(url: string, seen = new Set<string>()): Promise<string[]> {
  if (seen.has(url)) return [];
  seen.add(url);
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; IndexNowSubmitter/1.0)" },
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`Sitemap fetch failed HTTP ${response.status}: ${url}`);
  const xml = await response.text();
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].trim());
  const pages: string[] = [];
  for (const loc of locs) {
    if (/sitemap/i.test(loc) && /\.xml(\gz)?$/i.test(loc)) {
      pages.push(...(await collectFromSitemap(loc, seen)));
    } else {
      pages.push(loc);
    }
  }
  return pages;
}

function assertOwned(urls: string[]) {
  for (const value of urls) {
    const parsed = new URL(value);
    if (parsed.origin !== origin) throw new Error(`Refusing URL outside ${origin}: ${value}`);
  }
}

async function submitBatch(urls: string[]) {
  const response = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host,
      key,
      keyLocation: `${origin}/${key}.txt`,
      urlList: urls,
    }),
  });
  const body = await response.text();
  if (![200, 202].includes(response.status)) {
    throw new Error(`IndexNow returned HTTP ${response.status}: ${body.slice(0, 500)}`);
  }
  return { status: response.status, submitted: urls.length, body: body.slice(0, 200) };
}

const args = process.argv.slice(2);
const sitemapMode = args.includes("--sitemap") || args.includes("--all");
const explicit = args.filter((a) => a !== "--sitemap" && a !== "--all");

if (!sitemapMode && explicit.length === 0) {
  throw new Error("Usage: bun scripts/submit-indexnow.ts --sitemap | <absolute-url>...");
}

if ((await readFile(keyPath, "utf8")).trim() !== key) {
  throw new Error("IndexNow verification file does not match the configured key");
}

const urls = sitemapMode ? await collectFromSitemap(sitemapUrl) : explicit;
if (urls.length === 0) throw new Error("No URLs to submit");
assertOwned(urls);

const unique = [...new Set(urls)];
const results = [];
for (let i = 0; i < unique.length; i += batchSize) {
  const chunk = unique.slice(i, i + batchSize);
  results.push(await submitBatch(chunk));
}
console.log(JSON.stringify({ host, total: unique.length, results }, null, 2));
