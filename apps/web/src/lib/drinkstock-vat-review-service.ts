import {getProductionPostgresRuntime,productionDatabaseConfigured} from "./postgres-runtime";
import {DrinkStockVatReviewError,type VatReviewCommand} from "./drinkstock-vat-review-policy";

/**
 * Merchant owner confirmation only. Manager/staff and browser/table tokens
 * cannot revise the legally relevant VAT classification. Every edit is atomic,
 * partner/venue scoped, idempotent, and recorded before commit.
 */
export async function reviewDrinkStockProductVat(
 userId:string,partnerId:string,venueId:string,command:VatReviewCommand
) {
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 if(!userId||!uuid.test(partnerId)||!uuid.test(venueId))
  throw new DrinkStockVatReviewError("NOT_FOUND",404);
 if(!productionDatabaseConfigured())
  throw new DrinkStockVatReviewError("VAT_REVIEW_UNAVAILABLE",503);
 const client=await getProductionPostgresRuntime().sqlPool.connect();
 let committed=false;
 try{
  await client.query("BEGIN");
  await client.query("SET LOCAL statement_timeout='8s'");
  // Lock the venue before modifying its products, matching session start.
  const scope=await client.query<{role:string}>(`
   SELECT m.role FROM public.hospitality_venues v
   JOIN public.hospitality_partners p ON p.id=v.partner_id AND p.status='active'
   JOIN public.hospitality_partner_apps a ON a.partner_id=p.id AND a.app_key='drinkStock' AND a.enabled
   JOIN public.hospitality_partner_memberships m ON m.partner_id=p.id
     AND m.user_id=$1 AND m.status='active'
   WHERE v.partner_id=$2::uuid AND v.id=$3::uuid AND v.status='active'
   FOR UPDATE OF v
  `,[userId,partnerId,venueId]);
  if(!scope.rows[0])throw new DrinkStockVatReviewError("NOT_FOUND",404);
  if(scope.rows[0].role!=="owner")throw new DrinkStockVatReviewError("OWNER_ONLY",403);
  const earlier=await client.query<{product_id:string;vat_class:string;reviewed:boolean;review_basis:string}>(`
   SELECT product_id::text,vat_class,reviewed,review_basis
   FROM public.drinkstock_vat_review_events
   WHERE partner_id=$1::uuid AND venue_id=$2::uuid AND request_key=$3::uuid
  `,[partnerId,venueId,command.requestKey]);
  if(earlier.rows.length){
   const e=earlier.rows[0]!;
   if(e.product_id!==command.productId||e.vat_class!==command.vatClass||
      e.reviewed!==command.reviewed||e.review_basis!==command.reviewBasis)
    throw new DrinkStockVatReviewError("VAT_REVIEW_REQUEST_CONFLICT",409);
   await client.query("COMMIT");committed=true;
   return {replayed:true,productId:command.productId,vatClass:e.vat_class,reviewed:e.reviewed};
  }
  const active=await client.query<{id:string}>(`
   SELECT id::text FROM public.drinkstock_sessions
   WHERE partner_id=$1::uuid AND venue_id=$2::uuid
    AND state IN ('scheduled','running','paused','crashing')
   LIMIT 1
  `,[partnerId,venueId]);
  if(active.rows.length)throw new DrinkStockVatReviewError("SESSION_ACTIVE",409);
  const product=await client.query<{id:string;vat_class:string;vat_reviewed:boolean}>(`
   SELECT id::text,vat_class,vat_reviewed
   FROM public.drinkstock_products
   WHERE partner_id=$1::uuid AND venue_id=$2::uuid
     AND id=$3::uuid AND active
   FOR UPDATE
  `,[partnerId,venueId,command.productId]);
  const old=product.rows[0];
  if(!old)throw new DrinkStockVatReviewError("PRODUCT_NOT_FOUND",404);
  await client.query(`
    UPDATE public.drinkstock_products
    SET vat_class=$4,vat_reviewed=$5,updated_at=now()
    WHERE partner_id=$1::uuid AND venue_id=$2::uuid AND id=$3::uuid
  `,[partnerId,venueId,command.productId,command.vatClass,command.reviewed]);
  await client.query(`
    INSERT INTO public.drinkstock_vat_review_events(
     partner_id,venue_id,product_id,request_key,actor_user_id,
     previous_vat_class,previous_reviewed,vat_class,reviewed,review_basis)
    VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7,$8,$9,$10)
  `,[partnerId,venueId,command.productId,command.requestKey,userId,
      old.vat_class,old.vat_reviewed,command.vatClass,command.reviewed,command.reviewBasis]);
  await client.query("COMMIT");committed=true;
  return {replayed:false,productId:command.productId,
   vatClass:command.vatClass,reviewed:command.reviewed};
 }catch(error){
  if(!committed)try{await client.query("ROLLBACK");}catch{}
  throw error;
 }finally{client.release();}
}
