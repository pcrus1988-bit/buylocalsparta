import test from "node:test";
import assert from "node:assert/strict";
import {
  parseVendorProductXml,
  parseXmlCurrency,
  parseXmlMoneyMinor,
  parseXmlStock,
  xmlFieldValue
} from "../src/index.ts";

test("parses generic product XML and suggests common mappings", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<products>
  <product>
    <id>SKU-001</id>
    <title>Organic &amp; Cotton T-Shirt</title>
    <description><![CDATA[Soft everyday tee]]></description>
    <brand>Example Co</brand>
    <ean>5201234567890</ean>
    <price currency="EUR">29.99</price>
    <quantity>8</quantity>
    <category>Apparel > Shirts</category>
    <image_link>https://merchant.example/image.jpg</image_link>
  </product>
</products>`;

  const parsed = parseVendorProductXml(xml);
  assert.equal(parsed.itemTag, "product");
  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.suggestedMapping.externalId, "id");
  assert.equal(parsed.suggestedMapping.title, "title");
  assert.equal(parsed.suggestedMapping.gtin, "ean");
  assert.equal(parsed.suggestedMapping.price, "price");
  assert.equal(parsed.suggestedMapping.currency, "price@currency");
  assert.equal(xmlFieldValue(parsed.records[0], parsed.suggestedMapping.title), "Organic & Cotton T-Shirt");
  assert.equal(parseXmlMoneyMinor(xmlFieldValue(parsed.records[0], parsed.suggestedMapping.price)), 2999);
  assert.equal(parseXmlStock(xmlFieldValue(parsed.records[0], parsed.suggestedMapping.stock)), 8);
  assert.equal(parseXmlCurrency(xmlFieldValue(parsed.records[0], parsed.suggestedMapping.currency)), "EUR");
});

test("parses Google Merchant RSS item namespaces", () => {
  const xml = `<rss xmlns:g="http://base.google.com/ns/1.0"><channel><item>
    <g:id>merchant-42</g:id>
    <g:title>Sneaker</g:title>
    <g:brand>Brand</g:brand>
    <g:gtin>4006381333931</g:gtin>
    <g:price>79,90 EUR</g:price>
    <g:availability>in stock</g:availability>
    <g:product_type>Shoes &gt; Sneakers</g:product_type>
  </item></channel></rss>`;

  const parsed = parseVendorProductXml(xml);
  assert.equal(parsed.itemTag, "item");
  assert.equal(parsed.suggestedMapping.externalId, "g:id");
  assert.equal(parsed.suggestedMapping.title, "g:title");
  assert.equal(parsed.suggestedMapping.price, "g:price");
  assert.equal(parsed.suggestedMapping.availability, "g:availability");
  assert.equal(parseXmlMoneyMinor(xmlFieldValue(parsed.records[0], parsed.suggestedMapping.price)), 7990);
  assert.equal(parseXmlStock(undefined, xmlFieldValue(parsed.records[0], parsed.suggestedMapping.availability)), 1);
});

test("rejects DTD and entity declarations", () => {
  assert.throws(
    () => parseVendorProductXml(`<!DOCTYPE products [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><products><product><id>&xxe;</id></product></products>`),
    /DTD and ENTITY/
  );
});

test("rejects malformed mismatched XML", () => {
  assert.throws(
    () => parseVendorProductXml("<products><product><id>1</id></item></products>"),
    /Mismatched XML closing tag/
  );
});
