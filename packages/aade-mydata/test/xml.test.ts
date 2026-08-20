import test from "node:test";
import assert from "node:assert/strict";
import {
  childText,
  descendants,
  parseXmlDocument,
  serializeXmlElement
} from "../src/index.ts";

test("XML parser handles AADE namespace prefixes, comments, CDATA and numeric entities", () => {
  const root = parseXmlDocument(`<?xml version="1.0"?>
    <m.data:ResponseDoc xmlns:m.data="urn:aade:test">
      <!-- provider comment -->
      <m.data:response>
        <m.data:statusCode>Success</m.data:statusCode>
        <m.data:message><![CDATA[MARK & UID]]> &#x2713;</m.data:message>
      </m.data:response>
    </m.data:ResponseDoc>`);
  assert.equal(root.localName, "ResponseDoc");
  const response = descendants(root, "response")[0];
  assert.ok(response);
  assert.equal(childText(response, "statusCode"), "Success");
  assert.equal(childText(response, "message"), "MARK & UID ✓");
});

test("XML parser rejects mismatched tags and DOCTYPE", () => {
  assert.throws(() => parseXmlDocument(`<ResponseDoc><response></ResponseDoc>`), /Mismatched XML closing tag/);
  assert.throws(() => parseXmlDocument(`<!DOCTYPE ResponseDoc><ResponseDoc/>`), /DOCTYPE is not allowed/);
});

test("XML serializer preserves explicit AADE child order and escapes values", () => {
  const xml = serializeXmlElement({
    name: "invoice",
    attributes: { "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance" },
    children: [
      { name: "issuer", text: "SP & BUSINESS" },
      { name: "invoiceHeader", children: [
        { name: "series", text: "KMR26" },
        { name: "aa", text: 1 }
      ] },
      { name: "invoiceSummary", text: "<gross>" }
    ]
  });
  assert.equal(
    xml,
    `<invoice xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><issuer>SP &amp; BUSINESS</issuer><invoiceHeader><series>KMR26</series><aa>1</aa></invoiceHeader><invoiceSummary>&lt;gross&gt;</invoiceSummary></invoice>`
  );
  assert.ok(xml.indexOf("<issuer>") < xml.indexOf("<invoiceHeader>"));
  assert.ok(xml.indexOf("<invoiceHeader>") < xml.indexOf("<invoiceSummary>"));
});
