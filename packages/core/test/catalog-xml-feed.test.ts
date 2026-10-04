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

test("reports HTML documents before the generic DTD rejection", () => {
  assert.throws(
    () => parseVendorProductXml("<!DOCTYPE html><html><body>Vendor dashboard</body></html>"),
    /returned HTML instead of a product XML document/
  );
});


test("rejects malformed mismatched XML", () => {
  assert.throws(
    () => parseVendorProductXml("<products><product><id>1</id></item></products>"),
    /Mismatched XML closing tag/
  );
});


test("recognizes common variant and additional-image fields", () => {
  const xml = `<products><product>
    <id>shoe-42-blue-41</id>
    <title>Runner</title>
    <price>89.90 EUR</price>
    <stock>3</stock>
    <g:item_group_id xmlns:g="http://base.google.com/ns/1.0">shoe-42</g:item_group_id>
    <g:size xmlns:g="http://base.google.com/ns/1.0">41</g:size>
    <g:color xmlns:g="http://base.google.com/ns/1.0">Blue</g:color>
    <g:additional_image_link xmlns:g="http://base.google.com/ns/1.0">https://merchant.example/2.jpg</g:additional_image_link>
  </product></products>`;

  const parsed = parseVendorProductXml(xml);
  assert.equal(parsed.suggestedMapping.itemGroupId, "g:item_group_id");
  assert.equal(parsed.suggestedMapping.size, "g:size");
  assert.equal(parsed.suggestedMapping.color, "g:color");
  assert.equal(parsed.suggestedMapping.additionalImageUrl, "g:additional_image_link");
});


test("does not coerce foreign currency symbols to EUR", () => {
  assert.equal(parseXmlMoneyMinor("12.00 $"), 1200);
  assert.equal(parseXmlCurrency(undefined, "12.00 $"), "USD");
  assert.equal(parseXmlCurrency(undefined, "12.00 £"), "GBP");
  assert.equal(parseXmlCurrency(undefined, "12.00 €"), "EUR");
  assert.equal(parseXmlCurrency(undefined, "12.00 RON"), "RON");
  assert.equal(parseXmlCurrency("USD", "12.00"), "USD");
  assert.equal(parseXmlCurrency(undefined, "12.00"), "EUR");
});


test("prefers stable regular price mapping when Google feed mixes sale and non-sale products", () => {
  const xml = `<rss xmlns:g="http://base.google.com/ns/1.0"><channel>
    <item><g:id>1</g:id><g:title>Regular</g:title><g:price>59,00 EUR</g:price><g:sale_price></g:sale_price></item>
    <item><g:id>2</g:id><g:title>Sale</g:title><g:price>69,00 EUR</g:price><g:sale_price>49,00 EUR</g:sale_price></item>
  </channel></rss>`;
  const parsed = parseVendorProductXml(xml);
  assert.equal(parsed.suggestedMapping.price, "g:price");
  assert.equal(parseXmlMoneyMinor(xmlFieldValue(parsed.records[0], parsed.suggestedMapping.price)), 5900);
  assert.equal(parseXmlMoneyMinor(xmlFieldValue(parsed.records[1], parsed.suggestedMapping.price)), 6900);
});
