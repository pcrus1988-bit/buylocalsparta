import test from "node:test";
import assert from "node:assert/strict";
import { analyzeHtmlProductPage } from "../src/index.ts";

test("JSON-LD product suppresses an anonymous generic HTML product fallback on the same page", () => {
  const url = "https://shop.example.com/dorokarta/";
  const analysis = analyzeHtmlProductPage(`
    <html>
      <head>
        <script type="application/ld+json">
          {
            "@context":"https://schema.org",
            "@type":"Product",
            "name":"Δωροκάρτα Example Shop",
            "url":"https://shop.example.com/dorokarta/",
            "image":"https://shop.example.com/gift-card.jpg",
            "offers":{"@type":"Offer","price":"25.00","priceCurrency":"EUR"}
          }
        </script>
      </head>
      <body class="single-product">
        <h1>Προσαρμόστε τη δωροκάρτα σας</h1>
        <p>Τιμή: 25.00 EUR</p>
        <button>Προσθήκη στο καλάθι</button>
        <h2>Χαρακτηριστικά</h2>
      </body>
    </html>
  `, url);

  assert.equal(
    analysis.candidates.some((candidate) => candidate.title === "Προσαρμόστε τη δωροκάρτα σας"),
    false
  );
});

test("identifier-bearing HTML evidence is retained beside JSON-LD so safe enrichment is still possible", () => {
  const url = "https://shop.example.com/product/case-40806/";
  const analysis = analyzeHtmlProductPage(`
    <html>
      <head>
        <script type="application/ld+json">
          {
            "@context":"https://schema.org",
            "@type":"Product",
            "name":"Θήκη Samsung Galaxy",
            "sku":"040806",
            "url":"https://shop.example.com/product/case-40806/",
            "offers":{"@type":"Offer","price":"12.90","priceCurrency":"EUR"}
          }
        </script>
      </head>
      <body class="single-product">
        <h1>Θήκη Samsung Galaxy</h1>
        <p>SKU: 040806</p>
        <p>Τιμή: 12.90 EUR</p>
        <button>Προσθήκη στο καλάθι</button>
      </body>
    </html>
  `, url);

  assert.equal(
    analysis.candidates.some((candidate) => candidate.sku === "040806"),
    true
  );
});

test("generic HTML extraction removes storefront form controls from catalogue attributes", () => {
  const url = "https://shop.example.com/product/case-1/";
  const analysis = analyzeHtmlProductPage(`
    <html>
      <body class="single-product">
        <h1>Θήκη κινητού μαύρη</h1>
        <p>SKU: CASE-1</p>
        <p>Τιμή: 12.90 EUR</p>
        <button>Προσθήκη στο καλάθι</button>
        <table class="woocommerce-product-attributes">
          <tr><th>Χρώμα</th><td>Μαύρο</td></tr>
          <tr><th>Αποδοχή GDPR</th><td>Αποδέχομαι την πολιτική απορρήτου</td></tr>
          <tr><th>Ειδοποίησέ με όταν θα είναι και πάλι διαθέσιμο</th><td>Email:</td></tr>
        </table>
      </body>
    </html>
  `, url);

  const candidate = analysis.candidates.find((item) => item.sku === "CASE-1") ?? analysis.candidates[0];
  assert.ok(candidate);
  const keys = Object.keys(candidate.attributes).map((key) => key.toLocaleLowerCase("el"));
  assert.equal(keys.some((key) => key.includes("gdpr")), false);
  assert.equal(keys.some((key) => key.includes("ειδο")), false);
});
