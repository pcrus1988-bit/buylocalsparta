import assert from "node:assert/strict";
import test from "node:test";
import {
  GemiOpenDataClient,
  GemiOpenDataError,
  resolveProspectWithGemi
} from "../src/index.ts";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

test("client sends api_key header and canonical company endpoint", async () => {
  const calls: Array<{ url: string; key: string | null }> = [];
  const client = new GemiOpenDataClient({
    apiKey: "test-secret",
    fetchImpl: async (input, init) => {
      const headers = new Headers(init?.headers);
      calls.push({ url: String(input), key: headers.get("api_key") });
      return jsonResponse({ arGemi: 115331937000, afm: "999050439", coNameEl: "Π. ΠΕΤΙΚΙΔΗΣ ΕΠΙΠΛΑ ΑΕ" });
    }
  });
  const result = await client.getCompany("115331937000");
  assert.equal(result.afm, "999050439");
  assert.equal(calls[0]?.url, "https://opendata-api.businessportal.gr/api/opendata/v1/companies/115331937000");
  assert.equal(calls[0]?.key, "test-secret");
});

test("client does not retry 401", async () => {
  let calls = 0;
  const client = new GemiOpenDataClient({
    apiKey: "bad",
    maxRetries: 3,
    sleep: async () => undefined,
    fetchImpl: async () => { calls += 1; return jsonResponse({ message: "unauthorized" }, 401); }
  });
  await assert.rejects(() => client.getCompany("115331937000"), (error: unknown) => {
    assert.ok(error instanceof GemiOpenDataError);
    assert.equal(error.code, "UNAUTHORIZED");
    return true;
  });
  assert.equal(calls, 1);
});

test("client retries 429 and 5xx", async () => {
  const statuses = [429, 503, 200];
  let sleeps = 0;
  const client = new GemiOpenDataClient({
    apiKey: "ok",
    maxRetries: 3,
    sleep: async () => { sleeps += 1; },
    fetchImpl: async () => jsonResponse(statuses.shift() === 200 ? { arGemi: 371601000 } : { temporary: true }, statuses.length === 2 ? 429 : statuses.length === 1 ? 503 : 200)
  });
  const company = await client.getCompany("371601000");
  assert.equal(company.arGemi, 371601000);
  assert.equal(sleeps, 2);
});

test("exact AFM match is automatically verified", async () => {
  const client = new GemiOpenDataClient({
    apiKey: "ok",
    fetchImpl: async () => jsonResponse({
      searchMetadata: { totalCount: 1, resultsOffset: 0, resultsSize: "25" },
      searchResults: [{ arGemi: 123456789000, afm: "800443009", coNameEl: "ΜΑΡΚΕΛΛΟΥ ΕΛΕΥΘΕΡΙΑ ΚΑΙ ΣΙΑ ΟΕ" }]
    })
  });
  const resolution = await resolveProspectWithGemi(client, {
    prospectId: "KM-PROS-008-00191",
    businessName: "PLAY SPORTS",
    afm: "800443009"
  }, { retrievedAt: "2026-09-03T12:00:00.000Z" });
  assert.equal(resolution.status, "VERIFIED_GEMI_OPENDATA");
  assert.equal(resolution.provenance?.matchMethod, "AFM_EXACT");
});

test("name-only candidate is never auto-promoted", async () => {
  const client = new GemiOpenDataClient({
    apiKey: "ok",
    fetchImpl: async () => jsonResponse({
      searchMetadata: { totalCount: 1, resultsOffset: 0, resultsSize: "25" },
      searchResults: [{ arGemi: 123456789000, coNameEl: "LIGNUM FOR HOME", city: "ΚΟΡΙΝΘΟΣ" }]
    })
  });
  const resolution = await resolveProspectWithGemi(client, {
    prospectId: "KM-PROS-008-00223",
    businessName: "LIGNUM FOR HOME",
    town: "Κόρινθος"
  });
  assert.equal(resolution.status, "CANDIDATE_MATCH");
});

test("configured request rate cannot exceed GEMI documented allowance", () => {
  assert.throws(() => new GemiOpenDataClient({ apiKey: "ok", requestsPerMinute: 9 }), /cannot exceed/);
});
