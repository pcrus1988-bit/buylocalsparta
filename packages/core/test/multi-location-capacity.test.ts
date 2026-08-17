import test from "node:test";
import assert from "node:assert/strict";
import { FairVendorExposureEngine, FulfilmentCapacityService, VendorLocationDirectory } from "../src/index.ts";
import type { EligibleOffer } from "../src/fairness/types.ts";

function offer(vendorId: string, locationId: string, offerId: string): EligibleOffer {
  return { offerId, vendorId, locationId, canonicalVariantId: "cv-1", marketId: "sparta", approved: true, vendorActive: true, locationActive: true, productAllowed: true, availableToSell: 5, stockFresh: true, canServe: true, costWithinCeiling: true, capacityOpen: true, capacityWeight: 1, fulfilmentMode: "pickup", fulfilmentFit: locationId.endsWith("2") ? 2 : 1, stockConfirmedAt: 1_000 };
}

test("multiple locations of one merchant do not create multiple fairness tickets", () => {
  const engine = new FairVendorExposureEngine({ qualifiedViewStickyMs: 0, warmStartCredit: 0 });
  const offers = [offer("vendor-a", "loc-a1", "a1"), offer("vendor-a", "loc-a2", "a2"), offer("vendor-b", "loc-b1", "b1")];
  for (let i=0;i<10_000;i++) engine.select({ marketId:"sparta", canonicalVariantId:"cv-1", visitorKey:`v-${i}`, postcode:"23100", desiredFulfilment:"pickup", reason:"search_card", now: 1_000+i }, offers);
  const exposures = engine.snapshot({ marketId:"sparta", canonicalVariantId:"cv-1" }).exposures;
  assert.equal(Object.keys(exposures).length, 2);
  const shareA = exposures["vendor-a"] / (exposures["vendor-a"] + exposures["vendor-b"]);
  assert.ok(Math.abs(shareA - 0.5) < 0.02, `vendor-a share ${shareA}`);
});

test("location directory keeps one primary branch and vendor isolation", () => {
  const directory = new VendorLocationDirectory();
  directory.register({ id:"l1", vendorId:"v1", marketId:"sparta", name:"Main", addressLine1:"1 Demo", locality:"Sparta", postcode:"23100", timezone:"Europe/Athens", active:true, primary:true });
  directory.register({ id:"l2", vendorId:"v1", marketId:"sparta", name:"Second", addressLine1:"2 Demo", locality:"Sparta", postcode:"23100", timezone:"Europe/Athens", active:true, primary:false });
  directory.update({ vendorId:"v1", locationId:"l2", patch:{ primary:true } });
  assert.equal(directory.primary("v1")?.id, "l2");
  assert.throws(() => directory.update({ vendorId:"v2", locationId:"l2", patch:{ active:false } }), /ownership/);
});

test("capacity service closes a location only when its configured operational ceiling is reached", () => {
  const capacity = new FulfilmentCapacityService();
  capacity.register({ id:"cap-1", vendorId:"v1", locationId:"l1", mode:"pickup", maxOpenFulfilments:2, active:true, priority:10, startsAt:0 });
  assert.equal(capacity.status({ vendorId:"v1", locationId:"l1", mode:"pickup", currentOpenFulfilments:1, now:100 }).open, true);
  const full = capacity.status({ vendorId:"v1", locationId:"l1", mode:"pickup", currentOpenFulfilments:2, now:100 });
  assert.equal(full.open, false);
  assert.equal(full.remainingSlots, 0);
  assert.match(full.reason, /capacity is full/);
});
