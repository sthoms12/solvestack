interface Env {
  ASSETS: Fetcher;
}

// Routes that serve Markdown mirrors: homepage + template pages.
// The mirrors are generated at build by scripts/generate-md-mirrors.mjs
// from the same HTML copy, so agents get the same content in Markdown.
const markdownRoutes = new Set([
  "/",
  "/incident-report-template/",
  "/5-whys-template/",
  "/fishbone-diagram-template/",
  "/rca-template/",
  "/vpn-outage-template/",
  "/sign-in-failure-template/",
  "/expired-certificate-template/",
  "/dns-failure-template/",
  "/disk-full-template/",
  "/email-delivery-template/",
  "/use-your-data/",
  "/onenote-vs-solvestack/",
  "/agent-adapter/",
]);

function appendVary(headers: Headers, value: string) {
  const values = new Set(
    (headers.get("Vary") || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
  values.add(value);
  headers.set("Vary", [...values].join(", "));
}

function withDiscoveryHeaders(response: Response, canonicalUrl: string) {
  const headers = new Headers(response.headers);
  appendVary(headers, "Accept");
  headers.set(
    "Link",
    `<${canonicalUrl}>; rel="alternate"; type="text/markdown"`,
  );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/key.php") {
      const notFound = await env.ASSETS.fetch(new URL("/404", url));
      return new Response(notFound.body, {
        status: 404,
        headers: notFound.headers,
      });
    }

    const route = markdownRoutes.has(url.pathname) ? url.pathname : null;
    if (!route) return env.ASSETS.fetch(request);

    const canonicalUrl = new URL(route, url.origin).toString();
    const wantsMarkdown = (request.headers.get("Accept") || "")
      .toLowerCase()
      .includes("text/markdown");

    if (wantsMarkdown) {
      const markdownPath =
        route === "/" ? "/index.md" : `${route.replace(/\/$/, "")}.md`;
      const markdownResponse = await env.ASSETS.fetch(
        new Request(new URL(markdownPath, url.origin), request),
      );
      if (markdownResponse.status === 200) {
        const headers = new Headers(markdownResponse.headers);
        headers.set("Content-Type", "text/markdown; charset=utf-8");
        appendVary(headers, "Accept");
        headers.set(
          "Link",
          `<${canonicalUrl}>; rel="canonical", <${canonicalUrl}>; rel="alternate"; type="text/markdown"`,
        );
        return new Response(markdownResponse.body, { status: 200, headers });
      }
    }

    const htmlResponse = await env.ASSETS.fetch(request);
    if (htmlResponse.status !== 200) return htmlResponse;
    return withDiscoveryHeaders(htmlResponse, canonicalUrl);
  },
};
