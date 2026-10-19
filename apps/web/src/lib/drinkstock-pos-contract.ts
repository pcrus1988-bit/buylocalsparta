/**
 * Provider-neutral DrinkStock POS event contract.
 * This layer validates STRUCTURE only; it does not authenticate providers,
 * accept payments, issue receipts, create orders or move market prices.
 *
 * Ingesting code must independently authenticate the transport, resolve the
 * partner + venue from a server-owned active connection, reconcile the sale
 * with the provider, atomically deduplicate, and then apply the market event.
 */
import {createHash} from "node:crypto";

export const POS_CAPABILITIES=[
 "catalog_read","sales_read","order_write","price_write",
 "payment_status","refunds_read","inventory_read","fulfilment_write"
] as const;
export type PosCapability=typeof POS_CAPABILITIES[number];
export type PosProvider="square"|"lightspeed_k"|"toast"|"soft1"|"custom_api"|"local_bridge";
export type PosConnectionMode="observe_only"|"two_way";
export type PosEventKind="sale_finalized"|"sale_voided"|"refund_finalized";
export type PosItem={
 externalItemId:string;
 quantity:number;
 unitGrossCents:number;
 lineGrossCents:number;
};
export type PosNormalizedEvent={
 /** External IDs are references, NEVER authority over partner/venue/session. */
 eventId:string; externalOrderId:string; externalLocationId:string;
 kind:PosEventKind; occurredAt:string; currency:"EUR";
 totalGrossCents:number; items:PosItem[];
};
export class PosContractError extends Error {
 readonly code:string;
 constructor(code:string){super(code);this.code=code;}
}
const record=(v:unknown):v is Record<string,unknown> =>
 !!v&&typeof v==="object"&&!Array.isArray(v);
const externalId=(v:unknown):v is string=>
 typeof v==="string"&&v.length>=1&&v.length<=160&&
 /^[\p{L}\p{N}_.:/@+\-]+$/u.test(v);
const cents=(v:unknown):v is number=>Number.isSafeInteger(v)&&Number(v)>=0&&Number(v)<=100000000;
const kinds:readonly string[]=["sale_finalized","sale_voided","refund_finalized"];

/** A *normalized* payload produced by a provider adapter; never use on raw webhooks. */
export function validateNormalizedPosEvent(input:unknown):PosNormalizedEvent{
 if(!record(input))throw new PosContractError("INVALID_POS_EVENT");
 const {eventId,externalOrderId,externalLocationId,kind,occurredAt,currency,totalGrossCents,items}=input;
 if(!externalId(eventId)||!externalId(externalOrderId)||!externalId(externalLocationId)||
  !kinds.includes(String(kind))||currency!=="EUR"||!cents(totalGrossCents)||
  typeof occurredAt!=="string"||!/^\d{4}-\d\d-\d\dT/.test(occurredAt)||
  !Number.isFinite(Date.parse(occurredAt))||!Array.isArray(items)||items.length>100)
  throw new PosContractError("INVALID_POS_EVENT");
 if(kind==="sale_finalized"&&items.length===0)throw new PosContractError("EMPTY_POS_SALE");
 const sanitized:PosItem[]=items.map(raw=>{
  if(!record(raw)||!externalId(raw.externalItemId)||
   !Number.isSafeInteger(raw.quantity)||Number(raw.quantity)<1||Number(raw.quantity)>200||
   !cents(raw.unitGrossCents)||!cents(raw.lineGrossCents)||
   Number(raw.lineGrossCents)>Number(raw.quantity)*Number(raw.unitGrossCents))
   throw new PosContractError("INVALID_POS_LINE");
  return {externalItemId:raw.externalItemId as string,quantity:raw.quantity as number,
   unitGrossCents:raw.unitGrossCents as number,lineGrossCents:raw.lineGrossCents as number};
 });
 if(kind==="sale_finalized"){
  const sum=sanitized.reduce((n,x)=>n+x.lineGrossCents,0);
  // Tip, delivery fees, discounts and fiscal tax breakdown must be handled
  // by the actual provider adapter. A live sale must not carry an unexplained
  // amount that could be treated as an authoritative DrinkStock item price.
  if(!Number.isSafeInteger(sum)||sum!==totalGrossCents)
   throw new PosContractError("POS_TOTAL_MISMATCH");
 }
 return {eventId:eventId as string,externalOrderId:externalOrderId as string,
  externalLocationId:externalLocationId as string,kind:kind as PosEventKind,
  occurredAt:new Date(occurredAt).toISOString(),currency:"EUR",
  totalGrossCents:totalGrossCents as number,items:sanitized};
}

/** Use as part of a unique DB constraint, not as the only replay protection. */
export function posEventDedupKey(connectionId:string,eventId:string):string{
 if(!externalId(connectionId)||!externalId(eventId))throw new PosContractError("INVALID_POS_EVENT_ID");
 return createHash("sha256").update(connectionId).update("\0").update(eventId).digest("hex");
}

export type PosTradingEvidence={
 signatureVerified:boolean;
 connectionActive:boolean;
 providerLocationMatches:boolean;
 orderPaidConfirmedByProvider:boolean;
 mappedToVenueProducts:boolean;
 activeSessionAtSale:boolean;
 notAlreadyProcessed:boolean;
 notVoidedOrRefunded:boolean;
};
/**
 * All flags must come from server-side provider reconciliation and scoped DB
 * queries. A request body or POS-origin claimed boolean is never evidence.
 * This is only a fail-closed policy helper; it does not change financial state.
 */
export function posSaleMayMoveMarket(kind:PosEventKind,evidence:PosTradingEvidence):boolean{
 return kind==="sale_finalized"&&Object.values(evidence).every(value=>value===true);
}
