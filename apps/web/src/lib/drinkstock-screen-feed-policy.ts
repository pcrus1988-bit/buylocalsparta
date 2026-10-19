/** TV feed safety policies; both modes are read-only.
 * "Actual" means a venue/session-bound, provider-verified paid order, not just
 * arbitrary database order history or an untrusted browser claim.
 */
export const DRINKSTOCK_TV_MODES=["simulation","actual"] as const;
export type TvFeedMode=typeof DRINKSTOCK_TV_MODES[number];
export function isTvFeedMode(value:unknown):value is TvFeedMode{
 return value==="simulation"||value==="actual";
}
export function mayDisplayActualOrder(
 paymentState:string,orderState:string,verificationEventType:string|null,
 productBelongsToSameVenue:boolean
):boolean{
 return paymentState==="paid"&&
 ["paid","accepted","preparing","ready","served"].includes(orderState)&&
 verificationEventType==="payment_verified"&&productBelongsToSameVenue;
}
export function shouldRenderDemoTicker(mode:TvFeedMode,sessionState:string):boolean{
 return mode==="simulation"&&(sessionState==="running"||sessionState==="crashing");
}
