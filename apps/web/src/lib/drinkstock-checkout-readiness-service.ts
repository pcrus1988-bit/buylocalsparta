import {getProductionPostgresRuntime,productionDatabaseConfigured} from "./postgres-runtime";
import {managerSessionView,SessionError} from "./drinkstock-session-service";
import {CURRENT_DRINKSTOCK_PRODUCTION_CAPABILITIES,evaluateDrinkStockCheckoutReadiness} from "./drinkstock-checkout-readiness";

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
 const r=await getProductionPostgresRuntime().sqlPool.query<{
   active_count:number;vat_pending_count:number
 }>(`
 SELECT COUNT(*)::int AS active_count,
 COUNT(*) FILTER (WHERE NOT vat_reviewed
   OR vat_class NOT IN ('alcoholic','non_alcoholic','water'))::int AS vat_pending_count
 FROM public.drinkstock_products
 WHERE partner_id=$1::uuid AND venue_id=$2::uuid AND active
 `,[partnerId,venueId]);
 const activeProductCount=Number(r.rows[0]?.active_count??0);
 const productsNeedingVatReview=Number(r.rows[0]?.vat_pending_count??0);
 const approval=view.checkoutFallback;
 const adminApproved=Boolean(approval?.adminEnabled&&approval.posUnavailable&&
  approval.merchantAuthorizationReviewed&&approval.settlementReviewed&&approval.fiscalReviewed);
 return {
  partnerId,venueId,venueName:view.venue.name,canReviewVat:view.venue.role==="owner",
  sessionTrading:view.session?.state==="running"||view.session?.state==="crashing",
  activeProductCount,productsNeedingVatReview,
  ...evaluateDrinkStockCheckoutReadiness({
   adminApproved,venueActive:true,activeProductCount,productsNeedingVatReview,
   ...CURRENT_DRINKSTOCK_PRODUCTION_CAPABILITIES
  })
 };
}
