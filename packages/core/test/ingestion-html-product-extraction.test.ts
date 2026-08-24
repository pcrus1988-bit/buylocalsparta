import test from "node:test";
import assert from "node:assert/strict";
import { analyzeHtmlProductPage } from "../src/index.ts";

test("extracts a POLO-style product page without Product JSON-LD", () => {
  const html = `<!doctype html>
  <html><head>
    <title>BACKPACK ORIGINAL DOUBLE SCARF | POLO</title>
    <meta property="og:title" content="BACKPACK ORIGINAL DOUBLE SCARF">
    <meta property="og:image" content="/media/backpack-scarf.jpg">
  </head>
  <body class="single-product">
    <h1>BACKPACK ORIGINAL DOUBLE SCARF</h1>
    <div class="product-code">901235-3671 [ R.R.P : €38.00 ]</div>
    <div class="product-description">A durable double-compartment school backpack with an ergonomic back, reinforced shoulder straps and organized internal storage for everyday school use.</div>
    <p>Categories: Back2School &gt; Backpacks &gt; Original Double Bags</p>
    <h2>Dimensions</h2>
    <p>H. 44 cm | L. 30 cm | W. 20 cm</p>
    <h2>Technical Details</h2>
    <p>Capacity: 25 lt</p>
    <p>Weight: 900 gr</p>
  </body></html>`;

  const result = analyzeHtmlProductPage(html, "https://www.polo.gr/en/bags/back2school/backpacks/en-backback-original-double-scarf-3671/");
  assert.equal(result.candidates.length, 1);
  const product = result.candidates[0];
  assert.equal(product.title, "BACKPACK ORIGINAL DOUBLE SCARF");
  assert.equal(product.sku, "901235-3671");
  assert.deepEqual(product.categoryPath, ["Back2School", "Backpacks", "Original Double Bags"]);
  assert.equal(product.attributes.capacity, "25 lt");
  assert.equal(product.attributes.weight, "900 gr");
  assert.match(product.description ?? "", /ergonomic back/i);
  assert.ok(product.images?.some((image) => image.url === "https://www.polo.gr/media/backpack-scarf.jpg"));
  assert.ok(product.prices?.some((price) => price.amountMinor === 3800 && price.currency === "EUR" && price.kind === "rrp"));
});

test("extracts generic commerce microdata and meta fields", () => {
  const html = `<!doctype html><html><head>
    <meta property="product:price:amount" content="129.90">
    <meta property="product:price:currency" content="EUR">
    <meta itemprop="sku" content="ABC-123">
    <meta itemprop="gtin13" content="5201234567890">
    <meta name="description" content="A compact product description with enough useful detail to identify the commercial item safely.">
  </head><body>
    <main itemscope itemtype="https://schema.org/Product">
      <h1>Universal Test Product</h1>
      <button>Add to cart</button>
    </main>
  </body></html>`;
  const result = analyzeHtmlProductPage(html, "https://shop.example.gr/item/universal-test-product/");
  assert.equal(result.candidates.length, 1);
  const product = result.candidates[0];
  assert.equal(product.title, "Universal Test Product");
  assert.equal(product.sku, "ABC-123");
  assert.equal(product.gtin, "5201234567890");
  assert.ok(product.prices?.some((price) => price.amountMinor === 12990 && price.currency === "EUR"));
});

test("extracts embedded application JSON used by modern storefronts", () => {
  const html = `<!doctype html><html><head><title>App Shop</title></head><body>
    <div id="app"></div>
    <script id="ProductJson" type="application/json">{
      "id":"prod-77",
      "title":"App State Running Shoe",
      "sku":"RUN-77-BLK-42",
      "ean":"5201234567890",
      "brand":"Example Athletics",
      "price":"79.95",
      "currency":"EUR",
      "color":"Black",
      "size":"42",
      "images":["/images/run-77.jpg"]
    }</script>
  </body></html>`;
  const result = analyzeHtmlProductPage(html, "https://shop.example.gr/products/run-77/");
  assert.equal(result.candidates.length, 1);
  const product = result.candidates[0];
  assert.equal(product.sourceProductKey, "RUN-77-BLK-42");
  assert.equal(product.brand, "Example Athletics");
  assert.deepEqual(product.variantAttributes, { color: "Black", size: "42" });
  assert.ok(product.prices?.some((price) => price.amountMinor === 7995));
  assert.equal(product.images?.[0]?.url, "https://shop.example.gr/images/run-77.jpg");
});

test("does not turn an ordinary category listing into a product", () => {
  const html = `<!doctype html><html><head><title>Backpacks</title></head>
  <body class="product-category archive-product category-page">
    <h1>Backpacks</h1>
    <div class="product-grid"><a href="/products/a">Product A</a><a href="/products/b">Product B</a></div>
  </body></html>`;
  const result = analyzeHtmlProductPage(html, "https://shop.example.gr/product-category/backpacks/");
  assert.equal(result.candidates.length, 0);
  assert.ok(result.productLikelihood < 0.65);
});
