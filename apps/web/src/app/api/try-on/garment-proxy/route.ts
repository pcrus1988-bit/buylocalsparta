import { verifyTryOnGarmentProxyToken } from "../../../../lib/try-on-garment-proxy";

export const runtime = "edge";
export const preferredRegion = "fra1";

const IMAGE_CACHE = "private, no-store";

function browserHeaders(source: URL, includeReferer: boolean): HeadersInit {
  return {
    "Accept": "image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.1",
    "Accept-Language": "el-GR,el;q=0.9,en;q=0.8",
    ...(includeReferer ? { "Referer": `${source.origin}/` } : {}),
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
  };
}

async function fetchImage(source: URL): Promise<Response> {
  let response = await fetch(source, {
    method: "GET",
    redirect: "follow",
    cache: "no-store",
    headers: browserHeaders(source, true)
  });
  if (response.ok) return response;

  if (response.status === 401 || response.status === 403 || response.status === 429) {
    response = await fetch(source, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      headers: browserHeaders(source, false)
    });
  }
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim();
  if (!token) return new Response("Missing token.\n", { status: 400, headers: { "Cache-Control": IMAGE_CACHE } });

  try {
    const src = await verifyTryOnGarmentProxyToken(token);
    const source = new URL(src);
    const upstream = await fetchImage(source);
    if (!upstream.ok || !upstream.body) {
      console.warn(JSON.stringify({
        level: "warn",
        event: "try_on.garment_edge_proxy_failed",
        host: source.hostname,
        status: upstream.status
      }));
      return new Response("Garment image unavailable.\n", {
        status: 502,
        headers: { "Cache-Control": IMAGE_CACHE, "X-Robots-Tag": "noindex" }
      });
    }

    const contentType = upstream.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
    if (!contentType?.startsWith("image/")) {
      console.warn(JSON.stringify({
        level: "warn",
        event: "try_on.garment_edge_proxy_non_image",
        host: source.hostname,
        contentType: contentType ?? null
      }));
      return new Response("Garment response is not an image.\n", {
        status: 502,
        headers: { "Cache-Control": IMAGE_CACHE, "X-Robots-Tag": "noindex" }
      });
    }

    const headers = new Headers({
      "Content-Type": contentType,
      "Cache-Control": IMAGE_CACHE,
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex"
    });
    const contentLength = upstream.headers.get("content-length");
    if (contentLength && /^\d+$/.test(contentLength)) headers.set("Content-Length", contentLength);
    return new Response(upstream.body, { status: 200, headers });
  } catch {
    return new Response("Invalid or expired token.\n", {
      status: 403,
      headers: { "Cache-Control": IMAGE_CACHE, "X-Robots-Tag": "noindex" }
    });
  }
}
