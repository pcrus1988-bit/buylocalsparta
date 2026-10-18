/** DrinkStock payment/fiscal state guards. Financial amounts use integer euro cents. */
export type DrinkOrderState="awaiting_payment"|"paid"|"accepted"|"preparing"|"ready"|"served"|"cancelled"|"refunded";
export type PaymentState="unpaid"|"pending"|"paid"|"failed"|"refunded"|"partially_refunded";
const next:Record<DrinkOrderState,readonly DrinkOrderState[]>={
 awaiting_payment:["paid","cancelled"],paid:["accepted","cancelled","refunded"],
 accepted:["preparing","cancelled","refunded"],preparing:["ready","cancelled","refunded"],
 ready:["served","refunded"],served:["refunded"],cancelled:[],refunded:[]
};
export function mayAdvanceOrder(from:DrinkOrderState,to:DrinkOrderState,payment:PaymentState){
 if(!next[from].includes(to))return false;
 if(["paid","accepted","preparing","ready","served"].includes(to) && payment!=="paid")return false;
 if(to==="refunded" && payment!=="refunded" && payment!=="partially_refunded")return false;
 return true;
}
export function grossVatSplit(grossCents:number,vatBasisPoints:number){
 if(!Number.isSafeInteger(grossCents)||grossCents<0)throw new Error("INVALID_GROSS");
 if(![0,400,600,900,1300,1700,2400].includes(vatBasisPoints))throw new Error("VAT_RATE_NOT_APPROVED");
 const netCents=Math.round(grossCents*10000/(10000+vatBasisPoints));
 return {grossCents,netCents,vatCents:grossCents-netCents,vatBasisPoints};
}
/** Client prices are advisory only; server must snapshot the locked price in a transaction. */
export function assertQuoteIsLive(quotedAtMs:number,nowMs:number,maxAgeMs=15000){
 return Number.isSafeInteger(quotedAtMs)&&Number.isSafeInteger(nowMs)&&
  nowMs>=quotedAtMs&&nowMs-quotedAtMs<=maxAgeMs;
}
