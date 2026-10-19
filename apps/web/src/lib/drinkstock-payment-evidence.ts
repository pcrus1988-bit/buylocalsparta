/** DrinkStock verification contract, shared by staff, TV and reports.
 * A paid flag alone is NOT proof of provider-settled payment.
 * This query is only safe with the order table aliased as "o".
 * The integration that records payment_verified must authenticate the PSP
 * server-to-server, check exact order/currency/amount and persist payload digest.
 */
export const VERIFIED_PAYMENT_EVIDENCE_SQL=`EXISTS(
 SELECT 1 FROM public.drinkstock_payment_events e
 WHERE e.order_id=o.id AND e.event_type='payment_verified'
   AND e.amount_cents=o.amount_gross_cents
   AND length(btrim(e.provider))>1 AND lower(e.provider) NOT IN ('demo','simulation','test')
   AND length(btrim(e.provider_event_id))>0
   AND e.payload_sha256 ~ '^[0-9a-f]{64}$'
)`;
/** Only a fiscal adapter may create an issued document, never a staff button. */
export const ISSUED_RECEIPT_EVIDENCE_SQL=`EXISTS(
 SELECT 1 FROM public.drinkstock_fiscal_documents f
 WHERE f.order_id=o.id AND f.document_kind='retail_receipt'
   AND f.state='issued' AND f.issued_at IS NOT NULL
   AND (length(btrim(f.provider_document_id))>0 OR length(btrim(f.provider_mark))>0)
)`;
export type VerifiedPaymentEvidence=Readonly<{
 paymentState:string;orderState:string;grossCents:number;
 eventType:string|null;eventAmountCents:number|null;provider:string|null;
 providerEventId:string|null;payloadSha256:string|null;
}>;
export function hasVerifiedPaymentEvidence(e:VerifiedPaymentEvidence):boolean{
 return e.paymentState==='paid' &&
 ['paid','accepted','preparing','ready','served'].includes(e.orderState) &&
 e.eventType==='payment_verified' &&
 Number.isSafeInteger(e.grossCents)&&e.grossCents>0&&e.eventAmountCents===e.grossCents &&
 typeof e.provider==='string'&&e.provider.trim().length>1&&
 !['demo','simulation','test'].includes(e.provider.toLowerCase()) &&
 typeof e.providerEventId==='string'&&e.providerEventId.trim().length>0 &&
 typeof e.payloadSha256==='string'&&/^[0-9a-f]{64}$/.test(e.payloadSha256);
}
export function parseReportDays(raw:unknown):7|30|90{
 if(raw===undefined||raw===null||raw===''||raw==='30')return 30;
 if(raw==='7')return 7;
 if(raw==='90')return 90;
 throw new Error('INVALID_REPORT_PERIOD');
}
