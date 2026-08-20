export function GET(request: Request) {
  const url = new URL(request.url);
  const supplied = url.searchParams.get("target") ?? "/daily";
  const target = supplied.startsWith("/daily") && !supplied.startsWith("//") ? supplied : "/daily";
  return Response.redirect(`https://kontamou.site${target}`, 302);
}
