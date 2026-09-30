const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#111827"/>
  <circle cx="48" cy="16" r="7" fill="#ffffff" opacity="0.18"/>
  <text x="32" y="40" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="27" font-weight="700" letter-spacing="-2" fill="#ffffff">ΚΜ</text>
</svg>`;

export function GET(): Response {
  return new Response(FAVICON_SVG, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400"
    }
  });
}
