const TRIGGER_KEY = "8eb685afee915f492456068b0f09e03ff0f5fc0e54a8a994";
const EDGE_URL = "https://eemihhfreggbigxejjhj.supabase.co/functions/v1/research-seed-restore-20260817?token=07eb10e3a5e4936fa8c467b647fb1d8ee40d9a3e2f04e93774045a27fc16165f";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("key") !== TRIGGER_KEY) return Response.json({ error: "not_found" }, { status: 404 });
  const response = await fetch(EDGE_URL, { method: "GET", cache: "no-store" });
  const body = await response.text();
  return new Response(body, { status: response.status, headers: { "content-type": response.headers.get("content-type") ?? "application/json", "cache-control": "no-store" } });
}
