export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const targetUrlStr = url.searchParams.get("url");
    
    // We want to allow the specific origin
    const origin = request.headers.get("Origin");
    
    // Handle CORS preflight (OPTIONS) requests
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": origin || "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
          "Access-Control-Allow-Headers": request.headers.get("Access-Control-Request-Headers") || "Authorization, Content-Type, Accept",
          "Access-Control-Max-Age": "86400",
        }
      });
    }

    // Check if URL is provided
    if (!targetUrlStr) {
      return new Response(JSON.stringify({ error: "Missing 'url' parameter" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": origin || "*",
        },
      });
    }

    // Rewrite request to target
    try {
      const targetUrl = new URL(targetUrlStr);
      
      // Build clean headers for the Artemis request.
      // Auth can come either from the Authorization header (standard)
      // or from the x-auth URL parameter (to avoid CORS preflight).
      const forwardHeaders = new Headers();
      
      // Check for auth in URL param first (avoids preflight), then header
      const authParam = url.searchParams.get("x-auth");
      const authHeader = request.headers.get("Authorization");
      if (authParam) {
        forwardHeaders.set("Authorization", authParam);
      } else if (authHeader) {
        forwardHeaders.set("Authorization", authHeader);
      }

      // Check for content-type in URL param first, then header
      const ctParam = url.searchParams.get("x-content-type");
      const ctHeader = request.headers.get("Content-Type");
      if (ctParam) {
        forwardHeaders.set("Content-Type", ctParam);
      } else if (ctHeader) {
        forwardHeaders.set("Content-Type", ctHeader);
      }

      // Forward Accept header
      const acceptHeader = request.headers.get("Accept");
      if (acceptHeader) {
        forwardHeaders.set("Accept", acceptHeader);
      }

      // Determine the actual HTTP method to use for the Artemis request.
      // When the client needs to avoid preflight, it can send a GET/POST
      // but specify the intended method via x-method URL param.
      const methodParam = url.searchParams.get("x-method");
      const actualMethod = methodParam || request.method;

      const fetchOptions = {
        method: actualMethod,
        headers: forwardHeaders,
        redirect: 'follow',
      };

      // Forward body for non-GET/HEAD requests
      if (actualMethod !== 'GET' && actualMethod !== 'HEAD') {
        fetchOptions.body = request.body;
      }

      // Fetch the actual data from Artemis
      const response = await fetch(targetUrl.toString(), fetchOptions);
      
      // Build a clean response - only keep safe headers.
      // This is important: we must NOT forward Artemis's CSP, X-Frame-Options,
      // etc. as they can interfere with the browser's handling of the response.
      const responseHeaders = new Headers();
      
      // Set CORS headers
      responseHeaders.set("Access-Control-Allow-Origin", origin || "*");
      // Required for pages using Cross-Origin-Embedder-Policy
      responseHeaders.set("Cross-Origin-Resource-Policy", "cross-origin");
      
      // Forward only safe/useful response headers from Artemis
      const safeResponseHeaders = [
        'Content-Type',
        'Content-Length',
        'Content-Disposition',
        'Cache-Control',
        'Expires',
        'Pragma',
        'ETag',
        'Last-Modified',
      ];
      
      for (const header of safeResponseHeaders) {
        const value = response.headers.get(header);
        if (value) {
          responseHeaders.set(header, value);
        }
      }
      
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: "Proxy error: " + e.message }), {
        status: 502,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": origin || "*",
        },
      });
    }
  }
}
