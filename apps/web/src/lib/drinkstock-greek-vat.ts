/** Greek beverage VAT classifications; standard Greek rates checked against
 * AADE E.2047/2024, VAT Code Annex III (2025) and E.2113/2025.
 * See docs/drinkstock/greek-beverage-vat-2026.md. Tax calculation is not a
 * legal substitute for the merchant's own advisor or a fiscal issuer.
 */
export type BeverageVatClass="alcoholic"|"non_alcoholic"|"water"|"review_required";
export type HospitalityServiceMode="dine_in"|"takeaway"|"delivery";
export type GreekVatJurisdiction="standard"|"verified_island_reduced";
export const VAT_RULE_VERSION="GR-BEVERAGE-2026-10-20";
export const VAT_LEGAL_SOURCES=[
 "https://www.aade.gr/egkyklioi-kai-apofaseis/e-2047-28-06-2024",
 "https://www.aade.gr/sites/default/files/2025-12/parartima-III-ekdosi13_1.pdf",
 "https://www.aade.gr/egkyklioi-kai-apofaseis/e-2113-31-12-2025"
] as const;
export type VatResolution=Readonly<{
 rateBasisPoints:2400|1300|1700|900;
 class:BeverageVatClass;mode:HospitalityServiceMode;
 jurisdiction:GreekVatJurisdiction;version:typeof VAT_RULE_VERSION;
}>;
export function resolveGreekBeverageVat(input:{
 vatClass:BeverageVatClass;mode:HospitalityServiceMode;
 jurisdiction?:GreekVatJurisdiction;islandEligibilityVerified?:boolean
}):VatResolution{
 const {vatClass,mode}=input;
 if(!["dine_in","takeaway","delivery"].includes(mode))throw new Error("INVALID_VAT_SERVICE_MODE");
 if(!["alcoholic","non_alcoholic","water"].includes(vatClass))
  throw new Error("VAT_CLASSIFICATION_REVIEW_REQUIRED");
 const jurisdiction=input.jurisdiction??"standard";
 if(jurisdiction!=="standard"&&jurisdiction!=="verified_island_reduced")
  throw new Error("INVALID_VAT_JURISDICTION");
 if(jurisdiction==="verified_island_reduced"&&input.islandEligibilityVerified!==true)
  throw new Error("ISLAND_VAT_VERIFICATION_REQUIRED");
 // Water is 24% when part of a supplied on-premises catering service; a
 // standalone goods transfer is NOT 'dine_in', even inside a shop.
 const standard=mode==="dine_in"||vatClass==="alcoholic"?2400:1300;
 const rateBasisPoints=jurisdiction==="verified_island_reduced"?
  (standard===2400?1700:900):standard;
 return {class:vatClass,mode,jurisdiction,rateBasisPoints,version:VAT_RULE_VERSION};
}
/** Split a VAT-inclusive consumer price using integer minor units. */
export function splitGreekBeverageGross(grossCents:number,rateBasisPoints:VatResolution["rateBasisPoints"]){
 if(!Number.isSafeInteger(grossCents)||grossCents<0)throw new Error("INVALID_VAT_GROSS");
 if(![2400,1300,1700,900].includes(rateBasisPoints))throw new Error("INVALID_VAT_RATE");
 const netCents=Math.round(grossCents*10000/(10000+rateBasisPoints));
 return {grossCents,netCents,vatCents:grossCents-netCents,rateBasisPoints};
}
