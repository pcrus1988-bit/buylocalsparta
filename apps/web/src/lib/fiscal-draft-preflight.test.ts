import test from "node:test";
import assert from "node:assert/strict";
import {reviewFiscalSandboxDraft} from "./fiscal-draft-preflight.ts";
import {calculateFiscalPreview} from "./fiscal-preview-calculator.ts";

const business={
 id:"11111111-1111-4111-8111-111111111111",kind:"business",legalName:"Synthetic Trade",
 vatNumber:"111222333",countryCode:"GR",verificationStatus:"unverified"
};
const publicBody={...business,kind:"public_body",legalName:"Synthetic Public"};
const item={description:"Test service",quantityMilli:1000,unitPriceMinor:10000,vatRateBps:2400,discountBps:0};
const make=(overrides:Record<string,unknown>={})=>{
 const v=calculateFiscalPreview({lane:"b2b",items:[item]});
 return {
  lane:"b2b",reference:"sandbox-test-001",organizationStatus:"approved",
  grossMinor:String(v.totals.grossMinor),netMinor:String(v.totals.netMinor),
  vatMinor:String(v.totals.vatMinor),discountMinor:String(v.totals.discountMinor),
  calculationKind:"non_fiscal_test_preview",lines:v.items,counterparty:business,
  ...overrides
 };
};
const codes=(v:ReturnType<typeof reviewFiscalSandboxDraft>)=>v.checks.map(x=>x.code);

test("consistent sandbox arithmetic remains NEVER issuable or tax-approved",()=>{
 const result=reviewFiscalSandboxDraft(make());
 assert.equal(result.status,"consistent_test_data");
 assert.deepEqual(codes(result),["DRAFT_COUNTERPARTY_UNVERIFIED"]);
 assert.equal(result.fiscalIssuanceAllowed,false);
 assert.equal(result.taxClassificationVerified,false);
 assert.equal(result.identityVerified,false);
 assert.equal(result.legalReviewCompleted,false);
});
test("legacy amount-only drafts are incomplete but do not crash",()=>{
 const result=reviewFiscalSandboxDraft(make({lines:[],netMinor:null,vatMinor:null}));
 assert.equal(result.status,"incomplete_test_data");
 assert.ok(codes(result).includes("DRAFT_ITEMS_MISSING"));
 assert.equal(result.fiscalIssuanceAllowed,false);
});
test("B2B and B2G require correct test party kinds; B2C/POS cannot carry business party",()=>{
 for(const lane of ["b2b","b2g"]){
  const r=reviewFiscalSandboxDraft(make({lane,counterparty:null}));
  assert.equal(r.status,"incomplete_test_data");
  assert.ok(codes(r).includes("DRAFT_COUNTERPARTY_MISSING"));
 }
 const b2g=reviewFiscalSandboxDraft(make({lane:"b2g",counterparty:business}));
 assert.ok(codes(b2g).includes("DRAFT_COUNTERPARTY_KIND_MISMATCH"));
 const correct=reviewFiscalSandboxDraft(make({lane:"b2g",counterparty:publicBody}));
 assert.ok(!codes(correct).includes("DRAFT_COUNTERPARTY_KIND_MISMATCH"));
 for(const lane of ["b2c","pos"]){
  const r=reviewFiscalSandboxDraft(make({lane,counterparty:business}));
  assert.ok(codes(r).includes("DRAFT_COUNTERPARTY_UNEXPECTED"));
 }
});
test("arithmetic cannot be waived by spoofing a verified identity or setting totals",()=>{
 const bad=reviewFiscalSandboxDraft(make({
  grossMinor:"12345",counterparty:{...business,verificationStatus:"verified"}
 }));
 assert.equal(bad.status,"conflicting_test_data");
 assert.ok(codes(bad).includes("DRAFT_GROSS_MISMATCH"));
 assert.ok(codes(bad).includes("DRAFT_COUNTERPARTY_UNVERIFIED"));
 assert.equal(bad.fiscalIssuanceAllowed,false);
});
test("saved line tampering is detected independently of totals",()=>{
 const line=calculateFiscalPreview({lane:"b2b",items:[item]}).items[0];
 const r=reviewFiscalSandboxDraft(make({lines:[{...line,vatMinor:999}]}));
 assert.ok(codes(r).includes("DRAFT_LINES_CHANGED"));
 assert.equal(r.status,"conflicting_test_data");
});
test("stored net/tax/discount subtotals are independently recomputed",()=>{
 for(const key of ["netMinor","vatMinor","discountMinor"]){
  const r=reviewFiscalSandboxDraft(make({[key]:"1"}));
  assert.ok(codes(r).includes("DRAFT_SUBTOTAL_MISMATCH"));
 }
});
test("unknown or malformed lines fail closed",()=>{
 for(const lines of [[{...item,quantityMilli:0}],["not an item"],Array.from({length:31},()=>item)]){
  const r=reviewFiscalSandboxDraft(make({lines}));
  assert.equal(r.status,"conflicting_test_data");
  assert.ok(codes(r).includes("DRAFT_ITEMS_INVALID"));
 }
});
test("invalid or absent document amounts and pending businesses flag gaps",()=>{
 const invalid=reviewFiscalSandboxDraft(make({grossMinor:"-1",reference:"",organizationStatus:"pending_review"}));
 assert.ok(codes(invalid).includes("DRAFT_AMOUNT_INVALID"));
 assert.ok(codes(invalid).includes("DRAFT_REFERENCE_MISSING"));
 assert.ok(codes(invalid).includes("DRAFT_ORGANIZATION_UNAPPROVED"));
 assert.equal(invalid.fiscalIssuanceAllowed,false);
 const absent=reviewFiscalSandboxDraft(make({grossMinor:null}));
 assert.ok(codes(absent).includes("DRAFT_AMOUNT_MISSING"));
});
test("fraudulent fiscal calculation status cannot enable issuance",()=>{
 const result=reviewFiscalSandboxDraft(make({calculationKind:"certified_invoice"}));
 assert.equal(result.status,"conflicting_test_data");
 assert.ok(codes(result).includes("DRAFT_ITEMS_INVALID"));
 assert.equal(result.fiscalIssuanceAllowed,false);
});
test("zero-value test documents remain internally valid for simulation",()=>{
 const v=calculateFiscalPreview({lane:"b2c",items:[{...item,unitPriceMinor:0}]});
 const report=reviewFiscalSandboxDraft(make({
  lane:"b2c",counterparty:null,lines:v.items,netMinor:"0",vatMinor:"0",
  discountMinor:"0",grossMinor:"0"
 }));
 assert.equal(report.status,"consistent_test_data");
 assert.equal(report.fiscalIssuanceAllowed,false);
});
