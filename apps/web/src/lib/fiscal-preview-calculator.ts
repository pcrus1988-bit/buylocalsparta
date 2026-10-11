/**
 * FISCAL engineering sandbox arithmetic. NOT a Greek tax rule engine.
 * The caller explicitly supplies a rate; no rate is inferred as legally valid.
 * All arithmetic is integer/BigInt; half-up rounding at each line.
 */
export type FiscalPreviewLane="b2c"|"pos"|"b2b"|"b2g";
export type FiscalPreviewLine=Readonly<{
  description:string;
  quantityMilli:number; // 1000 means 1.000 units; fractional units supported
  unitPriceMinor:number; // €0.01 = 1, per whole unit, excluding VAT
  vatRateBps:number; // 2400 = 24%; caller-defined, not a classification
  discountBps:number; // 1000 = 10% line discount
}>;
export type FiscalCalculatedLine=FiscalPreviewLine&Readonly<{
  beforeDiscountMinor:number;
  discountMinor:number;
  netMinor:number;
  vatMinor:number;
  grossMinor:number;
}>;
export type FiscalPreviewResult=Readonly<{
  kind:"non_fiscal_test_preview";
  currency:"EUR";
  lane:FiscalPreviewLane;
  rounding:"HALF_UP_PER_LINE";
  items:FiscalCalculatedLine[];
  totals:{netMinor:number;vatMinor:number;grossMinor:number;discountMinor:number};
  issuanceEnabled:false;
  legalTaxClassification:false;
}>;

const MAX_LINES=30;
const MAX_TOTAL=1_000_000_000_000n;
const integer=(value:unknown,min:number,max:number)=>typeof value==="number"&&Number.isSafeInteger(value)&&value>=min&&value<=max;
const fields=["description","quantityMilli","unitPriceMinor","vatRateBps","discountBps"];
const asAmount=(value:bigint)=>{
 if(value<0n||value>MAX_TOTAL)throw new Error("PREVIEW_AMOUNT_OUT_OF_RANGE");
 return Number(value);
};
function roundHalfUp(numerator:bigint,denominator:bigint):bigint {
 if(numerator<0n||denominator<=0n)throw new Error("PREVIEW_INVALID_ROUNDING");
 return (numerator+denominator/2n)/denominator;
}
export function calculateFiscalPreview(raw:unknown):FiscalPreviewResult {
 if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new Error("PREVIEW_INVALID_INPUT");
 const source=raw as Record<string,unknown>;
 if(Object.keys(source).some(key=>!["lane","items"].includes(key)))throw new Error("PREVIEW_UNKNOWN_FIELDS");
 if(!["b2c","pos","b2b","b2g"].includes(source.lane as string))throw new Error("PREVIEW_INVALID_LANE");
 if(!Array.isArray(source.items)||source.items.length<1||source.items.length>MAX_LINES)
   throw new Error("PREVIEW_INVALID_ITEM_COUNT");
 let sumNet=0n,sumVat=0n,sumDiscount=0n,sumGross=0n;
 const calculated:FiscalCalculatedLine[]=source.items.map((value:unknown)=>{
  if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("PREVIEW_INVALID_LINE");
  const item=value as Record<string,unknown>;
  if(Object.keys(item).some(key=>!fields.includes(key)))throw new Error("PREVIEW_UNKNOWN_LINE_FIELDS");
  const {description,quantityMilli,unitPriceMinor,vatRateBps,discountBps}=item;
  if(typeof description!=="string"||description.trim().length<1||description.length>160||/[\u0000-\u001f\u007f]/.test(description))
   throw new Error("PREVIEW_INVALID_DESCRIPTION");
  if(!integer(quantityMilli,1,1_000_000)||!integer(unitPriceMinor,0,1_000_000_000)||
     !integer(vatRateBps,0,10_000)||!integer(discountBps,0,10_000))
   throw new Error("PREVIEW_INVALID_MONETARY_INPUT");
  const before=roundHalfUp(BigInt(quantityMilli as number)*BigInt(unitPriceMinor as number),1000n);
  const discount=roundHalfUp(before*BigInt(discountBps as number),10_000n);
  const net=before-discount;
  const vat=roundHalfUp(net*BigInt(vatRateBps as number),10_000n);
  const gross=net+vat;
  sumNet+=net;sumVat+=vat;sumDiscount+=discount;sumGross+=gross;
  if(sumNet>MAX_TOTAL||sumVat>MAX_TOTAL||sumDiscount>MAX_TOTAL||sumGross>MAX_TOTAL)
    throw new Error("PREVIEW_AMOUNT_OUT_OF_RANGE");
  return {
   description:description.trim(),quantityMilli:quantityMilli as number,
   unitPriceMinor:unitPriceMinor as number,vatRateBps:vatRateBps as number,
   discountBps:discountBps as number,
   beforeDiscountMinor:asAmount(before),discountMinor:asAmount(discount),
   netMinor:asAmount(net),vatMinor:asAmount(vat),grossMinor:asAmount(gross)
  };
 });
 return {
  kind:"non_fiscal_test_preview",currency:"EUR",lane:source.lane as FiscalPreviewLane,
  rounding:"HALF_UP_PER_LINE",items:calculated,
  totals:{netMinor:asAmount(sumNet),vatMinor:asAmount(sumVat),
          grossMinor:asAmount(sumGross),discountMinor:asAmount(sumDiscount)},
  issuanceEnabled:false,legalTaxClassification:false
 };
}
