import assert from "node:assert/strict";
import test from "node:test";
import {
  isValidGtin,
  parseOpenIcecatIndexCsv
} from "../src/ingestion/open-icecat/index.ts";

const GTIN = "4006381333931";

test("validates GTIN check digits before Icecat matching", () => {
  assert.equal(isValidGtin(GTIN), true);
  assert.equal(isValidGtin("4006381333932"), false);
  assert.equal(isValidGtin("not-a-gtin"), false);
});

test("Greek bulk index keeps approved, active Greek-market candidates", () => {
  const csv = [
    "path,product_id,updated,quality,supplier_id,prod_id,catid,ean_upc,on_market,country_market,model_name,product_view,high_pic,ean_upc_is_approved,Limited",
    `"/export/freexml/EL/12345.xml",12345,20260829100000,ICECAT,77,GBH-TEST,123,${GTIN},1,"GR;CY","GBH Test",100,"https://images.icecat.biz/main.jpg",1,No`,
    `"/export/freexml/EL/99999.xml",99999,20260829100000,REMOVED,77,OLD,123,${GTIN},1,GR,Old,1,,1,No`
  ].join("\n");

  const entries = parseOpenIcecatIndexCsv(csv, {
    requireOnMarket: true,
    requireApprovedGtin: true,
    country: "GR",
    qualities: ["ICECAT", "SUPPLIER"]
  });
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.productId, "12345");
  assert.deepEqual(entries[0]?.countryMarkets, ["GR", "CY"]);
  assert.equal(entries[0]?.limited, false);
});
