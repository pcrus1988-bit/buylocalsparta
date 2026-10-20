import {getProductionPostgresRuntime,productionDatabaseConfigured} from "./postgres-runtime";
import {managerSessionView,SessionError} from "./drinkstock-session-service";
import {CURRENT_DRINKSTOCK_PRODUCTION_CAPABILITIES,evaluateDrinkStockCheckoutReadiness} from "./drinkstock-checkout-readiness";
import {VERIFIED_PAYMENT_EVIDENCE_SQL} from "./drinkstock-payment-evidence";

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Partner/venue-only diagnostic. No PSP key, fiscal credential, customer table
 * token or merchant payout identifier is exposed. This method cannot mutate
 * orders, payments, partner approvals, or receipt state.
 */
export async function drinkStockVenueCheckoutReadiness(userId:string,partnerId:string,venueId:string){
 if(!uuid.test(partnerId)||!uuid.test(venueId))throw new SessionError("NOT_FOUND",404);
 if(!productionDatabaseConfigured())throw new SessionError("DATABASE_UNAVAILABLE",503);
 const view=await managerSessionView(userId,partnerId,venueId);
 if(!["owner","manager"].includes(view.venue.role??""))throw new SessionError("MANAGER_ONLY",403);
 const db=getProductionPostgresRuntime().sqlPool;
 const [r,connections,fiscalBacklog]=await Promise.all([db.query<{
   active_count:number;vat_pending_count:number
 }>(`
 SELECT COUNT(*)::int AS active_count,
 COUNT(*) FILTER (WHERE NOT vat_reviewed
   OR vat_class NOT IN ('alcoholic','non_alcoholic','water'))::int AS vat_pending_count
 FROM public.drinkstock_products
 WHERE partner_id=$1::uuid AND venue_id=$2::uuid AND active
 `,[partnerId,venueId]),db.query<{
  standard_rate_confirmed:boolean;payments_capability:string|null;
  settlements_capability:string|null;verified_at:Date|null;disabled_at:Date|null;
  mollie_profile_id:string|null;fiscal_issuance_route:string|null;
  aade_environment:string|null;connectivity_state:string|null;
  receipt_issuance_verified:boolean|null
 }>(`
 SELECT COALESCE(t.standard_rate_confirmed,FALSE) AS standard_rate_confirmed,
  m.payments_capability,m.settlements_capability,m.verified_at,m.disabled_at,
  m.mollie_profile_id,a.fiscal_issuance_route,a.aade_environment,
  a.connectivity_state,a.receipt_issuance_verified
 FROM public.hospitality_venues v
 LEFT JOIN public.drinkstock_venue_tax_context t
  ON t.venue_id=v.id AND t.partner_id=v.partner_id AND t.service_mode='dine_in' AND t.jurisdiction='standard'
 LEFT JOIN public.drinkstock_mollie_merchant_connections m ON m.partner_id=v.partner_id
 LEFT JOIN public.drinkstock_merchant_aade_connections a ON a.partner_id=v.partner_id
 WHERE v.id=$1::uuid AND v.partner_id=$2::uuid
 LIMIT 1
 `,[venueId,partnerId]),db.query<{paid_unreceipted:number}>(`
 SELECT COUNT(*)::int AS paid_unreceipted
 FROM public.drinkstock_orders o
 WHERE o.partner_id=$1::uuid AND o.venue_id=$2::uuid
 AND o.payment_state='paid' AND o.fiscal_state IN ('pending','failed')
 AND o.order_state='awaiting_payment' AND ${VERIFIED_PAYMENT_EVIDENCE_SQL}
 `,[partnerId,venueId])]);
 const merchant=connections.rows[0];
 const mollieConnectionValid=Boolean(merchant?.mollie_profile_id&&merchant.payments_capability==="enabled"&&
  merchant.settlements_capability==="enabled"&&!merchant.disabled_at&&merchant.verified_at&&
  (Date.now()-new Date(merchant.verified_at).getTime())<=7*24*3600*1000);
 const taxVerified=Boolean(merchant?.standard_rate_confirmed);
 // AADE/myDATA reporting is not a certified fiscal retail-receipt transport.
 // Report the connection as a prerequisite, but do NOT flip the receipt-adapter
 // capability true until the actual issuer (FHM/eSEND/approved provider) exists.
 const fiscalProviderConnected=Boolean(merchant?.receipt_issuance_verified&&
  merchant.aade_environment==="production"&&merchant.connectivity_state==="verified"&&
  merchant.fiscal_issuance_route&&merchant.fiscal_issuance_route!=="unverified");
 const activeProductCount=Number(r.rows[0]?.active_count??0);
 const productsNeedingVatReview=Number(r.rows[0]?.vat_pending_count??0);
 const approval=view.checkoutFallback;
 const adminApproved=Boolean(approval?.adminEnabled&&approval.posUnavailable&&
  approval.merchantAuthorizationReviewed&&approval.settlementReviewed&&approval.fiscalReviewed);
 return {
  partnerId,venueId,venueName:view.venue.name,canReviewVat:view.venue.role==="owner",
  sessionTrading:view.session?.state==="running"||view.session?.state==="crashing",
  activeProductCount,productsNeedingVatReview,
  paidOrdersAwaitingFiscalResolution:Number(fiscalBacklog.rows[0]?.paid_unreceipted??0),
  merchantConnectionVerified:mollieConnectionValid,
  merchantFiscalConnectionRecorded:fiscalProviderConnected,
  standardVatJurisdictionReviewed:taxVerified,
  ...evaluateDrinkStockCheckoutReadiness({
   adminApproved,venueActive:true,activeProductCount,productsNeedingVatReview,
   ...CURRENT_DRINKSTOCK_PRODUCTION_CAPABILITIES,
   vatJurisdictionVerified:taxVerified,
   merchantSettlementOperational:mollieConnectionValid
  })
 };
}
