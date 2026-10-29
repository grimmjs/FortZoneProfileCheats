export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Edge CORS relay proxy endpoint
    if (url.pathname === "/proxy") {
      const target = url.searchParams.get("url");
      if (!target) {
        return new Response(JSON.stringify({ error: "Missing target 'url' query parameter" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }

      // Handle CORS preflight
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
            "Access-Control-Max-Age": "86400"
          }
        });
      }

      const forwardHeaders = new Headers();
      forwardHeaders.set("Content-Type", request.headers.get("Content-Type") || "application/x-www-form-urlencoded");
      forwardHeaders.set("Origin", "https://fortzone-battle-royale-xkd.game-files.crazygames.com");
      forwardHeaders.set("User-Agent", request.headers.get("User-Agent") || "Mozilla/5.0");

      try {
        const upstream = await fetch(target, {
          method: request.method,
          headers: forwardHeaders,
          body: request.method !== "GET" && request.method !== "HEAD" ? await request.text() : undefined
        });

        const body = await upstream.text();
        const respHeaders = new Headers();
        respHeaders.set("Access-Control-Allow-Origin", "*");
        respHeaders.set("Access-Control-Allow-Methods", "*");
        respHeaders.set("Content-Type", upstream.headers.get("Content-Type") || "text/plain");

        return new Response(body, {
          status: upstream.status,
          headers: respHeaders
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 502,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }
    }

    // Serve static assets from public/ directory
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  }
};
