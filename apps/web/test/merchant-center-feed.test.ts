import assert from "node:assert/strict";
import test from "node:test";
import { buildMerchantCenterRss } from "../src/lib/merchant-center-feed.ts";

test("exports evidence-backed fashion attributes without supplier identity", () => {
  const xml = buildMerchantCenterRss({
    title: "KONTA MOY · Merchant Center",
    link: "https://kontamou.site",
    description: "Products",
    products: [{
      id: "cv_test",
      title: "Example Shoe",
      description: "Example description",
      link: "https://kontamou.site/product/example-shoe",
      imageLink: "https://kontamou.site/api/media/example",
      priceMinor: 12900,
      availability: "in_stock",
      brand: "Example",
      color: "Black",
      size: "42"
    }]
  });

  assert.match(xml, /<g:color>Black<\/g:color>/);
  assert.match(xml, /<g:size>42<\/g:size>/);
  assert.doesNotMatch(xml, /supplier|nova|brandsgateway|symphonya/i);
});
