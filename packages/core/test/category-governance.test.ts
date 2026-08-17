import test from "node:test";
import assert from "node:assert/strict";
import { CategoryGovernanceService } from "../src/index.ts";

function service() {
  const governance = new CategoryGovernanceService();
  governance.registerAttribute({ code: "colour", labelEl: "Χρώμα", dataType: "enum", values: ["white", "black", "brass"], variantIdentity: true, filterable: true });
  governance.registerAttribute({ code: "connector", labelEl: "Σύνδεση", dataType: "enum", values: ["USB-C", "Lightning"], filterable: true });
  governance.registerAttribute({ code: "waterproof", labelEl: "Αδιάβροχο", dataType: "boolean", filterable: true });
  governance.registerCategory({ categoryCode: "mobile-telecom-electronics", labelEl: "Κινητά & Ηλεκτρονικά", commerceMode: "compatibility_sensitive", attributes: [{ attributeCode: "colour", required: true }, { attributeCode: "connector", required: true }, { attributeCode: "waterproof" }] });
  governance.registerCategory({ categoryCode: "tobacco-smoking-goods", labelEl: "Καπνικά", commerceMode: "directory_only", counterofferAllowed: false });
  governance.registerCategory({ categoryCode: "orthopaedic-medical-hearing", labelEl: "Ιατρικά", commerceMode: "regulated_mixed" });
  return governance;
}

test("category schemas validate governed attributes and preserve extra source data", () => {
  const governance = service();
  const invalid = governance.validateAttributes("mobile-telecom-electronics", { colour: "red", connector: "USB-C" });
  assert.equal(invalid.valid, false);
  assert.equal(invalid.issues[0].attributeCode, "colour");
  const valid = governance.validateAttributes("mobile-telecom-electronics", { colour: "WHITE", connector: "usb-c", waterproof: "ναι", vendor_note: "demo" });
  assert.equal(valid.valid, true);
  assert.deepEqual(valid.normalized, { colour: "white", connector: "USB-C", waterproof: "true", vendor_note: "demo" });
});

test("compatibility-sensitive checkout requires explicit customer confirmation", () => {
  const governance = service();
  const blocked = governance.decide({ categoryCode: "mobile-telecom-electronics", action: "checkout", fulfilmentMode: "pickup" });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.code, "compatibility_confirmation_required");
  assert.equal(governance.decide({ categoryCode: "mobile-telecom-electronics", action: "checkout", fulfilmentMode: "pickup", compatibilityConfirmed: true }).allowed, true);
});

test("directory-only and uncleared regulated categories cannot silently enter ordinary checkout", () => {
  const governance = service();
  assert.equal(governance.decide({ categoryCode: "tobacco-smoking-goods", action: "checkout" }).code, "enquiry_only");
  assert.equal(governance.decide({ categoryCode: "tobacco-smoking-goods", action: "counteroffer" }).allowed, false);
  assert.equal(governance.decide({ categoryCode: "orthopaedic-medical-hearing", action: "checkout" }).code, "regulated_checkout_blocked");
  assert.equal(governance.decide({ categoryCode: "orthopaedic-medical-hearing", action: "checkout", complianceCleared: true }).allowed, true);
});

test("attribute facets are generated only from governed filterable fields", () => {
  const governance = service();
  const facets = governance.facetValues("mobile-telecom-electronics", [
    { colour: "white", connector: "USB-C", vendor_note: "one" },
    { colour: "white", connector: "Lightning", vendor_note: "two" },
    { colour: "black", connector: "USB-C", vendor_note: "three" }
  ]);
  assert.deepEqual(facets.colour, [{ value: "white", count: 2 }, { value: "black", count: 1 }]);
  assert.deepEqual(facets.connector, [{ value: "USB-C", count: 2 }, { value: "Lightning", count: 1 }]);
  assert.equal(Object.prototype.hasOwnProperty.call(facets, "vendor_note"), false);
});

test("governed attribute definitions are exposed as defensive copies for admin schema tooling", () => {
  const governance = service();
  const definitions = governance.attributeDefinitions();
  assert.equal(definitions.some((item) => item.code === "colour"), true);
  const colour = definitions.find((item) => item.code === "colour");
  assert.deepEqual(colour?.values, ["white", "black", "brass"]);
});
