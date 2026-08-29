import assert from "node:assert/strict";
import test from "node:test";
import {
  OpenIcecatClient,
  applyVerifiedGreekLocalization,
  assessGreekProductContent,
  normalizeOpenIcecatGreekProduct
} from "../src/ingestion/open-icecat/index.ts";

const GTIN = "4006381333931";

function productPayload(): any {
  return {
    data: {
      GeneralInfo: {
        IcecatId: "12345",
        Brand: "Bosch",
        BrandPartCode: "GBH-TEST",
        GTIN: [GTIN],
        GTINs: [{ GTIN, IsApproved: true }],
        TitleInfo: { GeneratedLocalTitle: { Value: "Bosch Professional Δοκιμαστικό Πιστολέτο", Language: "EL" } },
        ProductNameInfo: { ProductLocalName: { Value: "Δοκιμαστικό Πιστολέτο", Language: "EL" } },
        Category: { Name: { Value: "Ηλεκτρικά εργαλεία", Language: "EL" } },
        Description: { LongDesc: "Επαγγελματικό εργαλείο για απαιτητικές εφαρμογές.", Language: "EL" }
      },
      Image: { HighPic: "https://images.icecat.biz/main.jpg?content_token=secret-token" },
      FeaturesGroups: [{
        Features: [{
          ID: "feature-1",
          Feature: { ID: "feature-1", Name: { Value: "Τύπος προϊόντος", Language: "EL" } },
          PresentationValue: "Πιστολέτο",
          RawValue: "rotary hammer",
          Searchable: true
        }]
      }],
      Gallery: [{ Pic: "https://images.icecat.biz/example.jpg?content_token=secret-token" }],
      Variants: [{ VariantID: "v1", VariantIdentifiers: [{ "Identifier Type": "GTIN13", Value: GTIN, IsApproved: true }] }],
      ContentErrors: ""
    }
  };
}

test("normalizes native Greek content and strips Icecat asset tokens", () => {
  const product = normalizeOpenIcecatGreekProduct(productPayload(), GTIN);
  assert.equal(product.primaryGtin, GTIN);
  assert.equal(product.title.locale, "EL");
  assert.equal(product.title.origin, "ICECAT_NATIVE_EL");
  assert.equal(product.category?.value, "Ηλεκτρικά εργαλεία");
  assert.equal(product.greekQuality.status, "READY");
  assert.equal(product.greekQuality.score, 1);
  assert.equal(product.images[0]?.url.includes("content_token"), false);
  assert.equal(JSON.stringify(product.sourcePayload).includes("secret-token"), false);
});

test("blocks non-Greek Icecat fallback content until localization", () => {
  const payload = productPayload();
  payload.data.GeneralInfo.TitleInfo.GeneratedLocalTitle = { Value: "Bosch Professional Test Rotary Hammer", Language: "EN" };
  payload.data.GeneralInfo.Category = { Name: { Value: "Power tools", Language: "EN" } };
  payload.data.GeneralInfo.Description = { LongDesc: "Professional power tool.", Language: "EN" };
  payload.data.FeaturesGroups[0].Features[0].Feature.Name = { Value: "Product type", Language: "EN" };
  payload.data.FeaturesGroups[0].Features[0].PresentationValue = "Rotary hammer";

  const product = normalizeOpenIcecatGreekProduct(payload, GTIN);
  assert.equal(product.greekQuality.status, "NEEDS_ENRICHMENT");
  assert.deepEqual(product.greekQuality.missing, ["title", "description", "category", "specifications"]);
});

test("verified Greek localization cannot introduce a new specification", () => {
  const draft = normalizeOpenIcecatGreekProduct(productPayload(), GTIN);
  assert.throws(() => applyVerifiedGreekLocalization(draft, {
    specifications: [{ key: "invented", name: "Φανταστικό", value: "Ναι" }]
  }), /not present in verified source data/);
});

test("verified Greek localization cannot change numeric facts", () => {
  const payload = productPayload();
  payload.data.FeaturesGroups = [{
    Features: [{
      ID: "power",
      Feature: { ID: "power", Name: { Value: "Power", Language: "EN" } },
      PresentationValue: "830 W",
      RawValue: "830",
      Searchable: true
    }]
  }];
  const draft = normalizeOpenIcecatGreekProduct(payload, GTIN);
  assert.throws(() => applyVerifiedGreekLocalization(draft, {
    specifications: [{ key: "power", name: "Ισχύς", value: "850 W" }]
  }), /changed a numeric fact/);
});

test("client requests EL first and EN only when Greek enrichment is needed", async () => {
  const requests: string[] = [];
  const client = new OpenIcecatClient({
    username: "test-user",
    apiToken: "test-token",
    fetch: async (input) => {
      const url = new URL(input);
      requests.push(url.searchParams.get("lang") ?? "");
      const payload = productPayload();
      if (url.searchParams.get("lang") === "EL") {
        payload.data.GeneralInfo.TitleInfo.GeneratedLocalTitle = { Value: "English source title", Language: "EN" };
        payload.data.GeneralInfo.Category = { Name: { Value: "Power tools", Language: "EN" } };
        payload.data.GeneralInfo.Description = { LongDesc: "English source description", Language: "EN" };
        payload.data.FeaturesGroups = [];
      } else {
        payload.data.GeneralInfo.TitleInfo.GeneratedLocalTitle = { Value: "Bosch Professional Test Rotary Hammer", Language: "EN" };
        payload.data.GeneralInfo.Category = { Name: { Value: "Power tools", Language: "EN" } };
        payload.data.GeneralInfo.Description = { LongDesc: "Professional power tool.", Language: "EN" };
        payload.data.FeaturesGroups = [{
          Features: [{
            ID: "feature-1",
            Feature: { ID: "feature-1", Name: { Value: "Product type", Language: "EN" } },
            PresentationValue: "Rotary hammer",
            RawValue: "rotary hammer",
            Searchable: true
          }]
        }];
      }
      return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
    }
  });

  const product = await client.lookupByGtin(GTIN, {
    localize: async ({ sourceTitle }) => ({
      title: `Ελληνικός τίτλος — ${sourceTitle.includes("Bosch") ? "Bosch" : "προϊόν"}`,
      description: "Ελληνική περιγραφή βασισμένη αποκλειστικά στα επαληθευμένα στοιχεία της πηγής.",
      category: "Ηλεκτρικά εργαλεία",
      specifications: [{ key: "feature-1", name: "Τύπος", value: "Πιστολέτο" }]
    })
  });

  assert.deepEqual(requests, ["EL", "EN"]);
  assert.equal(product.greekQuality.status, "READY");
});

test("quality gate rejects invalid thresholds", () => {
  assert.throws(() => assessGreekProductContent({}, 1.1), /between 0 and 1/);
});
