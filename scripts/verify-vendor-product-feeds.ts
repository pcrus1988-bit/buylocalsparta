import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { analyzeVendorProductXml } from "../apps/web/src/lib/vendor-product-feed-xml.ts";

const googleFeed=`<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0"><channel>
  <item>
    <g:id>SKU-001</g:id>
    <g:title>Nike Air Max</g:title>
    <g:price>129.90 EUR</g:price>
    <g:availability>in stock</g:availability>
    <g:brand>Nike</g:brand>
    <g:gtin>5201234567890</g:gtin>
    <g:image_link>https://merchant.example/images/sku-001.jpg</g:image_link>
  </item>
  <item>
    <g:id>SKU-001</g:id>
    <g:title>Duplicate row</g:title>
    <g:price>129.90 EUR</g:price>
    <g:availability>in stock</g:availability>
    <g:image_link>https://merchant.example/images/duplicate.jpg</g:image_link>
  </item>
</channel></rss>`;

const google=analyzeVendorProductXml(googleFeed);
assert.equal(google.detectedFormat,"google_merchant");
assert.equal(google.mapping.id,"id");
assert.equal(google.mapping.image,"image_link");
assert.equal(google.productCount,2);
assert.equal(google.readyCount,1);
assert.equal(google.excludedCount,1);
assert.equal(google.items[0]?.externalProductId,"SKU-001");
assert.equal(google.items[0]?.priceMinor,12990);
assert.equal(google.items[0]?.currency,"EUR");
assert.equal(google.items[0]?.availability,"in_stock");

const variantFeed=`<?xml version="1.0" encoding="UTF-8"?>
<products>
  <product>
    <id>STYLE-10</id>
    <title>Organic Cotton T-Shirt</title>
    <description>Soft everyday tee.</description>
    <price>29.99</price>
    <currency>EUR</currency>
    <stock>7</stock>
    <brand>Example Co</brand>
    <category>Fashion &gt; T-Shirts</category>
    <image_link>https://merchant.example/images/style-10.jpg</image_link>
    <variants>
      <variant><sku>STYLE-10-S-BLK</sku><size>S</size><color>Black</color></variant>
      <variant><sku>STYLE-10-M-BLK</sku><size>M</size><color>Black</color></variant>
    </variants>
  </product>
</products>`;

const variants=analyzeVendorProductXml(variantFeed);
assert.equal(variants.detectedFormat,"kontamou");
assert.equal(variants.productCount,2);
assert.equal(variants.mapping.id,"variant_sku");
assert.deepEqual(variants.items.map((item)=>item.externalProductId),["STYLE-10-S-BLK","STYLE-10-M-BLK"]);
assert.deepEqual(variants.items.map((item)=>item.size),["S","M"]);
assert.deepEqual(variants.items.map((item)=>item.color),["Black","Black"]);

const custom=`<catalog><offer><code>ABC</code><name>Custom item</name><retail_price>15,50 EUR</retail_price><qty>2</qty><picture>https://merchant.example/a.jpg</picture></offer></catalog>`;
const mapped=analyzeVendorProductXml(custom,{id:"code",title:"name",price:"retail_price",stock:"qty",image:"picture"});
assert.equal(mapped.detectedFormat,"custom");
assert.equal(mapped.productCount,1);
assert.equal(mapped.items[0]?.priceMinor,1550);
assert.equal(mapped.items[0]?.stockQuantity,2);

assert.throws(
  ()=>analyzeVendorProductXml(`<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><products><product><id>1</id><title>&xxe;</title></product></products>`),
  /DTD\\/entity/
);

const [migration,navigation,rootVercel,webVercel,runtime,service,adminPage,vendorPage]=await Promise.all([
  readFile("db/migrations/0300_vendor_product_feeds.sql","utf8"),
  readFile("apps/web/src/lib/workspace-navigation.ts","utf8"),
  readFile("vercel.json","utf8"),
  readFile("apps/web/vercel.json","utf8"),
  readFile("packages/postgres-runtime/src/index.ts","utf8"),
  readFile("apps/web/src/lib/vendor-product-feed-service.ts","utf8"),
  readFile("apps/web/src/app/admin/catalogue/vendor-feeds/page.tsx","utf8"),
  readFile("apps/web/src/app/vendor/catalog/feed/page.tsx","utf8")
]);

assert.match(migration,/vendor_product_feeds/);
assert.match(migration,/vendor_product_feed_runs/);
assert.match(migration,/vendor_product_feed_items/);
assert.match(migration,/source IN \\('manual','csv','api','xml_feed'\\)/);
assert.match(migration,/missing_grace_runs integer NOT NULL DEFAULT 2/);
assert.match(navigation,/\\/vendor\\/catalog\\/feed/);
assert.match(navigation,/\\/admin\\/catalogue\\/vendor-feeds/);
assert.equal(JSON.parse(rootVercel).crons.some((cron:{path:string})=>cron.path==="/api/cron/vendor-product-feeds"),true);
assert.equal(JSON.parse(webVercel).crons.some((cron:{path:string})=>cron.path==="/api/cron/vendor-product-feeds"),true);
assert.match(runtime,/EXPECTED_SCHEMA_VERSION = 300/);
assert.match(service,/feed_reconcile/);
assert.match(service,/vendor_catalog_visibility_events/);
assert.match(service,/additionalImageUrls/);
assert.match(adminPage,/Force sync \\/ Reprocess/);
assert.match(adminPage,/Save mapping/);
assert.match(vendorPage,/XML Feed/);

console.log("Vendor product feed verification OK");
