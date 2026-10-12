import assert from "node:assert/strict";
import test from "node:test";
import { brandGuideCanIndex, brandGuideQualityScore, parseBrandGuide } from "../src/lib/brand-guide";

test("active catalogue brand remains indexable while editorial guide is incomplete", () => {
  const guide = parseBrandGuide({
    brand_guide: {
      status: "published",
      seo_indexable: true,
      why_it_stands_out: "Short",
      source_urls: []
    }
  });
  assert.equal(brandGuideCanIndex({
    guide,
    description: "Short",
    website: "https://example.com/",
    hasLogo: true,
    liveProductCount: 12
  }), true);
});

test("complete published brand guide can become indexable", () => {
  const guide = parseBrandGuide({
    brand_guide: {
      status: "published",
      seo_indexable: true,
      founded_year: 1978,
      brand_story: "A".repeat(140),
      why_it_stands_out: "B".repeat(130),
      known_for: ["Denim", "Contemporary fashion"],
      product_families: ["Jeans"],
      source_urls: [{ url: "https://example.com/about", label: "Official brand history", type: "official" }]
    }
  });
  const input = {
    guide,
    description: "C".repeat(90),
    countryCode: "IT",
    website: "https://example.com/",
    hasLogo: true,
    liveProductCount: 42
  };
  assert.ok(brandGuideQualityScore(input) >= 65);
  assert.equal(brandGuideCanIndex(input), true);
});

test("brand with no sellable catalogue products stays noindex even with a published guide", () => {
  const guide = parseBrandGuide({
    brand_guide: {
      status: "published",
      seo_indexable: true,
      why_it_stands_out: "B".repeat(130),
      source_urls: [{ url: "https://example.com/about" }]
    }
  });
  assert.equal(brandGuideCanIndex({
    guide,
    description: "C".repeat(90),
    website: "https://example.com/",
    hasLogo: true,
    liveProductCount: 0
  }), false);
});

test("brand with no live inventory and no editorial guide stays noindex", () => {
  const guide = parseBrandGuide(null);
  assert.equal(brandGuideCanIndex({
    guide,
    hasLogo: false,
    liveProductCount: 0
  }), false);
});
