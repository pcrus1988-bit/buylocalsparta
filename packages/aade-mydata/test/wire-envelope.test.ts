import test from "node:test";
import assert from "node:assert/strict";
import {
  AadeMyDataClient,
  decodeAadeXmlEnvelope,
  escapeXml,
  parseTransmissionResponse
} from "../src/index.ts";
import { AadeMyDataClient as PublicAadeMyDataClient } from "../src/public.ts";

const cfg = {
  environment: "production" as const,
  baseUrl: "https://mydatapi.aade.gr/myDATA",
  userId: "erp-user",
  subscriptionKey: "secret",
  requestTimeoutMs: 1_000,
  specVersion: "2.0.2"
};

function serialized(inner: string): string {
  return `<string xmlns="http://schemas.microsoft.com/2003/10/Serialization/">${escapeXml(inner)}</string>`;
}

test("decodes the Microsoft serialization envelope returned by production AADE SendInvoices", () => {
  const inner = `<?xml version="1.0" encoding="utf-8"?>\r\n<ResponseDoc xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><response><index>1</index><invoiceUid>EE51C85EE96C41A596BBEA45208A82E18AC5877B</invoiceUid><invoiceMark>400014928538806</invoiceMark><qrUrl>https://mydatapi.aade.gr/myDATA/TimologioQR/QRInfo?q=test</qrUrl><statusCode>Success</statusCode></response></ResponseDoc>`;
  const wire = serialized(inner);
  const decoded = decodeAadeXmlEnvelope(wire);
  assert.equal(decoded.wrapped, true);
  assert.equal(decoded.wireXml, wire);
  assert.equal(decoded.xml, inner);

  const result = parseTransmissionResponse(wire);
  assert.equal(result.ok, true);
  assert.equal(result.items[0]?.statusCode, "Success");
  assert.equal(result.items[0]?.invoiceMark, "400014928538806");
  assert.equal(result.items[0]?.invoiceUid, "EE51C85EE96C41A596BBEA45208A82E18AC5877B");
  assert.equal(result.items[0]?.qrUrl, "https://mydatapi.aade.gr/myDATA/TimologioQR/QRInfo?q=test");
  assert.equal(result.rawXml, wire, "raw wire response must remain available for audit evidence");
});

test("never manufactures Success when the AADE response omits statusCode", () => {
  const wire = serialized(`<ResponseDoc><response><index>1</index><invoiceMark>400014928538806</invoiceMark></response></ResponseDoc>`);
  assert.throws(() => parseTransmissionResponse(wire), /missing mandatory statusCode/i);
  assert.throws(() => parseTransmissionResponse(serialized(`<ResponseDoc/>`)), /did not contain a response element/i);
});

test("RequestTransmittedDocs returns the decoded RequestedDoc rather than the outer string envelope", async () => {
  const requested = `<?xml version="1.0" encoding="utf-8"?><RequestedDoc xmlns="http://www.aade.gr/myDATA/invoice/v1.0"><invoicesDoc><invoice><uid>DC46B5C5BFA225BFD9015CBE55BC08A239E04FC9</uid><mark>400014927656362</mark><invoiceHeader><series>KMR26</series><aa>2</aa><issueDate>2026-08-20</issueDate><invoiceType>11.1</invoiceType></invoiceHeader><invoiceSummary><totalGrossValue>1.00</totalGrossValue></invoiceSummary><qrCodeUrl>https://mydatapi.aade.gr/myDATA/TimologioQR/QRInfo?q=test2</qrCodeUrl></invoice></invoicesDoc></RequestedDoc>`;
  const client = new AadeMyDataClient(cfg, async () => new Response(serialized(requested), { status: 200 }));
  const xml = await client.requestTransmittedDocs({ mark: "400014925864660", dateFrom: "20/08/2026", dateTo: "20/08/2026" });
  assert.equal(xml, requested);
  assert.match(xml, /<mark>400014927656362<\/mark>/);
  assert.doesNotMatch(xml, /^<string\b/);
});

test("extended read endpoints decode the same production envelope before their parsers run", async () => {
  const vatInfo = `<?xml version="1.0" encoding="utf-8"?><RequestedVatInfo><VatInfo><Mark>400014927656362</Mark><IssueDate>2026-08-20</IssueDate><IsCancelled>false</IsCancelled><Vat24>0.19</Vat24></VatInfo></RequestedVatInfo>`;
  const client = new PublicAadeMyDataClient(cfg, async () => new Response(serialized(vatInfo), { status: 200 }));
  const xml = await client.requestVatInfo({ dateFrom: "20/08/2026", dateTo: "20/08/2026" });
  assert.equal(xml, vatInfo);
  const parsed = await client.requestVatInfoParsed({ dateFrom: "20/08/2026", dateTo: "20/08/2026" });
  assert.equal(parsed.records[0]?.mark, "400014927656362");
  assert.equal(parsed.records[0]?.issueDate, "2026-08-20");
  assert.equal(parsed.records[0]?.amounts.Vat24, 0.19);
});
