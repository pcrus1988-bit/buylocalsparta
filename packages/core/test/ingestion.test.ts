import test from "node:test";
import assert from "node:assert/strict";
import {
  extractFournarakisCategoryProductUrls,
  extractFournarakisProductCandidates,
  isFournarakisProductUrl,
  isPublicIpAddress,
  normalizeFournarakisDiscoveredUrl,
  normalizeGtin,
  planCanonicalization,
  validateCrawlUrl,
  validateExtractedProductCandidate,
  validateRedirectTarget,
  type CrawlFetchPolicy,
  type ExtractedProductCandidate,
  type ProductIdentity
} from "../src/index.ts";

const policy: CrawlFetchPolicy = {
  allowedHosts: ["example.com"],
  allowSubdomains: true
};

test("crawl URL guard allows an HTTPS public source on an allowed host", () => {
  const result = validateCrawlUrl("https://shop.example.com/products/42#details", policy, ["93.184.216.34"]);
  assert.equal(result.decision, "allow");
  assert.equal(result.normalizedUrl, "https://shop.example.com/products/42");
});

test("crawl URL guard rejects private and local targets", () => {
  assert.equal(validateCrawlUrl("https://127.0.0.1/admin", { allowedHosts: ["127.0.0.1"] }).decision, "reject");
  assert.equal(validateCrawlUrl("https://localhost/product", { allowedHosts: ["localhost"] }).decision, "reject");
  assert.equal(validateCrawlUrl("https://[::1]/admin", { allowedHosts: ["::1"] }).decision, "reject");
  assert.equal(validateCrawlUrl("https://shop.example.com/product", policy, ["10.1.2.3"]).decision, "reject");
  assert.equal(isPublicIpAddress("::1"), false);
  assert.equal(isPublicIpAddress("fc00::1"), false);
});

test("crawl URL guard rejects unapproved hosts, credentials, ports and plain HTTP", () => {
  assert.equal(validateCrawlUrl("https://evil.example.net/product", policy).decision, "reject");
  assert.equal(validateCrawlUrl("https://user:pass@example.com/product", policy).decision, "reject");
  assert.equal(validateCrawlUrl("https://example.com:8443/product", policy).decision, "reject");
  assert.equal(validateCrawlUrl("http://example.com/product", policy).decision, "reject");
});

test("redirect targets are revalidated against host and DNS security policy", () => {
  assert.equal(validateRedirectTarget("https://shop.example.com/next", policy, ["93.184.216.34"]).decision, "allow");
  assert.equal(validateRedirectTarget("https://evil.example.net/next", policy, ["93.184.216.34"]).decision, "reject");
  assert.equal(validateRedirectTarget("https://shop.example.com/next", policy, ["169.254.169.254"]).decision, "reject");
});

test("GTIN normalization verifies standard GS1 check digits", () => {
  assert.equal(normalizeGtin("0195949052637"), "0195949052637");
  assert.equal(normalizeGtin("0 195949 052637"), "0195949052637");
  assert.equal(normalizeGtin("0195949052638"), undefined);
  assert.equal(normalizeGtin("123"), undefined);
});

test("extracted product validation requires trustworthy identity and provenance", () => {
  const candidate: ExtractedProductCandidate = {
    sourceProductKey: "sku-1",
    sourceUrl: "https://example.com/p/sku-1",
    title: "Example product",
    gtin: "0195949052637",
    attributes: { color: "Black", size: "42" },
    prices: [{
      amountMinor: 12900,
      currency: "EUR",
      kind: "selling",
      evidence: { origin: "json_ld", sourceUrl: "https://example.com/p/sku-1", confidence: 1 }
    }],
    fieldEvidence: {
      title: { origin: "json_ld", sourceUrl: "https://example.com/p/sku-1", confidence: 1 },
      gtin: { origin: "json_ld", sourceUrl: "https://example.com/p/sku-1", confidence: 1 }
    }
  };
  const result = validateExtractedProductCandidate(candidate);
  assert.equal(result.valid, true);
  assert.equal(result.normalizedGtin, "0195949052637");
});

const identity: ProductIdentity = {
  id: "source",
  title: "Nike Example Runner",
  brand: "Nike",
  model: "EX-42",
  gtin: "0195949052637",
  condition: "new",
  attributes: { color: "Black", size: "42" }
};

test("canonicalization links one exact identity but reviews ambiguous automatic matches", () => {
  const existing: ProductIdentity = { ...identity, id: "canonical-1" };
  assert.equal(planCanonicalization(identity, [existing]).disposition, "link_existing");

  const ambiguous = planCanonicalization(identity, [
    existing,
    { ...identity, id: "canonical-2" }
  ]);
  assert.equal(ambiguous.disposition, "review");
  assert.equal(ambiguous.candidates.length, 2);
});

test("material variant conflicts never auto-link", () => {
  const differentSize: ProductIdentity = {
    ...identity,
    id: "canonical-size-43",
    gtin: undefined,
    attributes: { color: "Black", size: "43" }
  };
  const withoutGtin: ProductIdentity = { ...identity, gtin: undefined };
  assert.equal(planCanonicalization(withoutGtin, [differentSize]).disposition, "create_canonical");
});


test("Fournarakis adapter expands the product-family variant grid into orderable supplier SKUs", () => {
  const sourceUrl = "https://www.fournarakis.gr/el/product/0033/classic-rolo-dermatino-18mm";
  const html = [
    '<html><head><link rel="canonical" href="' + sourceUrl + '"></head><body>',
    '<main><nav><ol>',
    '<li><a href="/el/catalog/c/6/ergalia"><span>ΕΡΓΑΛΕΙΑ</span></a></li>',
    '<li><a href="/el/catalog/c/61/chromatopolio"><span>ΧΡΩΜΑΤΟΠΩΛΕΙΟ</span></a></li>',
    '<li><a href="/el/catalog/c/85/rola"><span>ΡΟΛΑ</span></a></li>',
    '</ol></nav>',
    '<h1>CLASSIC ΡΟΛΟ ΔΕΡΜΑΤΙΝΟ 18mm</h1>',
    '<div class="mainContent">',
    '<img alt="BENMAN" src="https://assets.fournarakis.gr/mycontainer/Brand%20Logos/BENMAN.svg">',
    '<a data-fancybox="gallery" href="https://assets.fournarakis.gr/mycontainer/Photos/1500x1500/0033.webp">',
    '<img alt="CLASSIC ΡΟΛΟ ΔΕΡΜΑΤΙΝΟ 18mm" src="https://assets.fournarakis.gr/mycontainer/Photos/0688x0688/0033.webp"></a>',
    '<div class="pt-6 pb-6 min-h-[60px]"><ul><li>Γούνα Merinos</li><li>Μεγάλη αντοχή</li></ul></div>',
    '<div id="var_list"><span>ΚΩΔΙΚΟΣ</span><span>ΣΥΝΟΛΙΚΟ ΜΗΚΟΣ</span><span>Ø ΚΥΛΙΝΔΡΟΥ</span><span>ΣΥΝΔΥΑΖΕΤΑΙ ΜΕ</span><span>ΤΜΧ /KOYTI</span></div>',
    '<div id="var_17202"><span>17202</span><span>10cm</span><span>50mm</span><span>22874</span><span>12</span></div>',
    '<div id="var_16323"><span>16323</span><span>18cm</span><span>50mm</span><span>22875</span><span>12</span></div>',
    '<div id="var_16324"><span>16324</span><span>24cm</span><span>50mm</span><span>22876</span><span>12</span></div>',
    '</div></main></body></html>'
  ].join("");

  const candidates = extractFournarakisProductCandidates(html, sourceUrl);
  assert.equal(candidates.length, 3);
  assert.deepEqual(candidates.map((item) => item.sku), ["17202", "16323", "16324"]);
  assert.equal(candidates[0].sourceProductKey, "17202");
  assert.equal(candidates[0].brand, "BENMAN");
  assert.deepEqual(candidates[0].categoryPath, ["ΕΡΓΑΛΕΙΑ", "ΧΡΩΜΑΤΟΠΩΛΕΙΟ", "ΡΟΛΑ"]);
  assert.equal(candidates[0].attributes["ΣΥΝΟΛΙΚΟ ΜΗΚΟΣ"], "10cm");
  assert.equal(candidates[0].attributes["Fournarakis family code"], "0033");
  assert.equal(candidates[0].images?.[0]?.url, "https://assets.fournarakis.gr/mycontainer/Photos/1500x1500/0033.webp");
  assert.equal((candidates[0].rawPayload as Record<string, unknown>).requiresPricingPdfJoin, true);
});

test("Fournarakis crawl scope keeps Greek catalogue/product pages and removes duplicate query filters", () => {
  const seed = "https://www.fournarakis.gr/";
  assert.equal(isFournarakisProductUrl("https://www.fournarakis.gr/el/product/0033/example"), true);
  assert.equal(
    normalizeFournarakisDiscoveredUrl("https://fournarakis.gr/el/catalog/b/15/ffg?tags=must_have#search-app", seed),
    "https://www.fournarakis.gr/el/catalog/b/15/ffg"
  );
  assert.equal(normalizeFournarakisDiscoveredUrl("https://www.fournarakis.gr/fr/product/0033/example", seed), undefined);
  assert.equal(normalizeFournarakisDiscoveredUrl("https://www.fournarakis.gr/el/etaireia/i-istoria-mas", seed), undefined);
  assert.equal(normalizeFournarakisDiscoveredUrl("https://assets.fournarakis.gr/mycontainer/Photos/1500x1500/0033.webp", seed), undefined);
});


test("Fournarakis adapter parses the server-side inline const data payload without browser rendering", () => {
  const sourceUrl = "https://www.fournarakis.gr/el/product/0033/classic-rolo-dermatino-18mm";
  const inline = {
    search_result_data: {
      code_catalogue: "0033",
      title: "CLASSIC ΡΟΛΟ ΔΕΡΜΑΤΙΝΟ 18mm",
      brand: { name: "BENMAN" },
      features: [{ type: "bullet", text: "Δερμάτινο ρολό" }]
    },
    brandInfo: { name: "BENMAN" },
    categories: [
      { id: 6, name: "Εργαλεία", slug: "ergalia" },
      { id: 61, name: "Χρωματοπωλείο", slug: "chromatopolio" },
      { id: 85, name: "Ρολά", slug: "rola" },
      { id: 88, name: "Ρολά Δερμάτινα", slug: "rola-dermatina" }
    ],
    elements: { features: [{ type: "bullet", text: "Μεγάλη αντοχή" }] },
    highResImages: [{ highRes_x1: { width: 1500, height: 1500, url: "/mycontainer/Photos/1500x1500/0033" } }],
    images: [{ slider_desktop_x2: { width: 960, height: 960, url: "/mycontainer/Photos/0960x0960/0033" } }],
    tags: [{ id: "best_seller", name: "Ταχυκίνητο είδος" }, { id: "must_have", name: "Αναγκαίο είδος" }],
    wh_codes: ["17202", "16323", "16324"],
    variations: [
      ["ΚΩΔΙΚΟΣ", "ΣΥΝΟΛΙΚΟ ΜΗΚΟΣ", "Ø ΚΥΛΙΝΔΡΟΥ", "Ø ΣΥΝΟΛΙΚΗ", "ΣΥΝΔΥΑΖΕΤΑΙ ΜΕ", "ΤΜΧ /KOYTI"],
      ["17202", "10cm", "50mm", "86mm", "22874", "12"],
      ["16323", "18cm", "50mm", "86mm", "22875", "12"],
      ["16324", "24cm", "50mm", "86mm", "22876", "12"]
    ],
    item_code: [
      { code: { name: "ΚΩΔΙΚΟΣ", value: "17202" }, price: { label: "€ /ΤΜΧ", value: "7,00" } }
    ]
  };
  const html = '<html><body><main><script>\\nconst data = ' + JSON.stringify(inline) + ';\\nconst ajaxUrl = "";\\n</script><div id="product-app"></div></main></body></html>';

  const candidates = extractFournarakisProductCandidates(html, sourceUrl);
  assert.equal(candidates.length, 3);
  assert.deepEqual(candidates.map((item) => item.sku), ["17202", "16323", "16324"]);
  assert.equal(candidates[0].brand, "BENMAN");
  assert.equal(candidates[0].attributes["ΣΥΝΟΛΙΚΟ ΜΗΚΟΣ"], "10cm");
  assert.equal(candidates[0].prices, undefined);
  assert.equal(candidates[0].images?.[0]?.url, "https://assets.fournarakis.gr/mycontainer/Photos/1500x1500/0033.webp");
  assert.deepEqual(candidates[0].categoryPath, ["Εργαλεία", "Χρωματοπωλείο", "Ρολά", "Ρολά Δερμάτινα"]);
  assert.equal((candidates[0].rawPayload as Record<string, unknown>).requiresPricingPdfJoin, true);
  assert.equal((candidates[0].rawPayload as Record<string, unknown>).webPriceAuthoritative, false);
});


test("Fournarakis adapter keeps single-orderable machine products without a variant grid", () => {
  const sourceUrl = "https://www.fournarakis.gr/el/product/0257/skil-pack-alysopriono-mpatarias";
  const inline = {
    search_result_data: {
      code_catalogue: "0257",
      title: "SKIL PACK ΑΛΥΣΟΠΡΙΟΝΟ ΜΠΑΤΑΡΙΑΣ",
      brand: { name: "SKIL" }
    },
    brandInfo: { name: "SKIL" },
    categories: [
      { id: 1, name: "Μηχανήματα", slug: "michanimata" },
      { id: 500, name: "Μηχανήματα Κήπου - Αγρού - Δάσους", slug: "michanimata-kipou" },
      { id: 501, name: "Μηχανήματα Μπαταρίας", slug: "michanimata-mpatarias" },
      { id: 502, name: "Αλυσοπρίονα Ευρείας Χρήσης", slug: "alysopriona" }
    ],
    elements: {
      features: [
        { type: "bullet", text: "Κινητήρας χωρίς ψήκτρες" },
        { type: "bullet", text: "Αυτόματη λίπανση αλυσίδας" }
      ]
    },
    highResImages: [
      { highRes_x1: { width: 1500, height: 1500, url: "/mycontainer/Photos/1500x1500/0257" } }
    ],
    wh_codes: ["0257"],
    variations: []
  };
  const html = '<html><body><main><script>const data = ' + JSON.stringify(inline) + ';</script><div id="product-app"></div></main></body></html>';

  const candidates = extractFournarakisProductCandidates(html, sourceUrl);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].sourceProductKey, "0257");
  assert.equal(candidates[0].sku, "0257");
  assert.equal(candidates[0].brand, "SKIL");
  assert.deepEqual(candidates[0].categoryPath, [
    "Μηχανήματα",
    "Μηχανήματα Κήπου - Αγρού - Δάσους",
    "Μηχανήματα Μπαταρίας",
    "Αλυσοπρίονα Ευρείας Χρήσης"
  ]);
  assert.equal(candidates[0].attributes["Fournarakis family code"], "0257");
  assert.equal((candidates[0].rawPayload as Record<string, unknown>).singleOrderableProduct, true);
  assert.equal((candidates[0].rawPayload as Record<string, unknown>).requiresPricingPdfJoin, true);
});


test("Fournarakis category discovery reads only product URLs from the embedded category payload", () => {
  const sourceUrl = "https://www.fournarakis.gr/el/catalog/c/170/raoula-odigi-siromenis-portas";
  const payload = {
    breadcrumbs: [{ label: "ΕΡΓΑΛΕΙΑ", href: "/el/catalog/c/6/ergalia" }],
    items: [
      { code_catalogue: "4475", href: "/el/product/4475/raoulo-bidwto-me-rouleman-gia-syromenh-porta" },
      { code_catalogue: "3900", href: "/el/product/3900/raoulo-me-rouleman-gia-syromenh-porta-me-mpouloni" },
      { code_catalogue: "3899", href: "/el/product/3899/odhgos-syromenhs-portas-nailon-me-bida-paksimadia" },
      { code_catalogue: "1470", href: "/el/product/1470/raoulo-me-rouleman-gia-syromenh-porta-me-bash" }
    ],
    facets: [
      { items: [{ url: "/el/catalog/c/6/ergalia" }, { url: "/el/catalog/c/170/raoula-odigi-siromenis-portas?tags=must_have" }] }
    ],
    count: 4,
    pager: { current: 1, total: 1 }
  };
  const html = '<html><body><script>let data = ' + JSON.stringify(payload) + ';</script><div id="search-app"></div></body></html>';

  assert.deepEqual(extractFournarakisCategoryProductUrls(html, sourceUrl), [
    "https://www.fournarakis.gr/el/product/4475/raoulo-bidwto-me-rouleman-gia-syromenh-porta",
    "https://www.fournarakis.gr/el/product/3900/raoulo-me-rouleman-gia-syromenh-porta-me-mpouloni",
    "https://www.fournarakis.gr/el/product/3899/odhgos-syromenhs-portas-nailon-me-bida-paksimadia",
    "https://www.fournarakis.gr/el/product/1470/raoulo-me-rouleman-gia-syromenh-porta-me-bash"
  ]);
});


test("Fournarakis full-crawl discovery can harvest product links outside the listing items array", () => {
  const sourceUrl = "https://www.fournarakis.gr/el/catalog/c/6/ergalia";
  const payload = {
    isLanding: true,
    children: [{ name: "Χρωματοπωλείο", url: "/el/catalog/c/61/chromatopolio" }],
    items: [],
    carousels: [
      {
        label: "Νέα",
        items: [
          { code_catalogue: "8299", href: "/el/product/8299/akrofysio-anameikshs" },
          { code_catalogue: "8226", href: "/el/product/8226/prioni-kladou" }
        ]
      }
    ]
  };
  const html = '<html><body><script>let data = ' + JSON.stringify(payload) + ';</script><div id="search-app"></div></body></html>';

  assert.deepEqual(extractFournarakisCategoryProductUrls(html, sourceUrl), []);
  assert.deepEqual(extractFournarakisCategoryProductUrls(html, sourceUrl, "all"), [
    "https://www.fournarakis.gr/el/product/8299/akrofysio-anameikshs",
    "https://www.fournarakis.gr/el/product/8226/prioni-kladou"
  ]);
});
