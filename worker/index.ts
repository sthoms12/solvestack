interface Env {
  ASSETS: Fetcher;
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
    return env.ASSETS.fetch(request);
  },
};
