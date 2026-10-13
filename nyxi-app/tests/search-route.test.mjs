import assert from "node:assert/strict";
import test from "node:test";
const called = [];
let status = 200;
let payload = { status: "no_approved_evidence", results: [] };
globalThis.fetch = async (url) => { called.push(String(url)); return Response.json(payload, { status }); };
process.env.NYXI_PUBLIC_SEARCH_URL = "";
const { GET } = await import("../app/api/search/route.ts");
const request = (q) => ({ nextUrl: new URL("https://nyxi.gr/api/search?q=" + encodeURIComponent(q)) });
test("fails closed without upstream", async () => {
  const r = await GET(request("HEMA"));
  assert.equal(r.status, 503);
  assert.equal(called.length, 0);
});
process.env.NYXI_PUBLIC_SEARCH_URL = "https://eemihhfreggbigxejjhj.supabase.co/functions/v1/nyxi-public-search";
const { GET: enabled } = await import("../app/api/search/route.ts?configured=1");
test("no approved evidence has explicit empty state", async () => {
  const r = await enabled(request("HEMA"));
  assert.equal(r.status, 200);
  assert.equal((await r.json()).status, "no_approved_evidence");
});
test("valid citation is returned", async () => {
  payload = { status: "ok", results: [{ id: "verified", excerpt: "evidence", citation_url: "https://example.org/" }] };
  const r = await enabled(request("HEMA"));
  assert.equal((await r.json()).results.length, 1);
});
test("upstream throttling is propagated", async () => {
  status = 429;
  const r = await enabled(request("HEMA"));
  assert.equal(r.status, 429);
  status = 200;
});
test("unexpected upstream status fails closed", async () => {
  payload = { status: "unexpected", results: [] };
  const r = await enabled(request("HEMA"));
  assert.equal(r.status, 503);
});
