/**
 * Read-only, membership-scoped KYB checklist retrieval for signed-in merchants.
 * No source_reference, reviewer identity, notes, evidence URLs or document
 * contents are ever selected, logged, or exposed to the merchant.
 */
import {fiscalPool} from "./fiscal-runtime";
import {FISCAL_MERCHANT_KYB_PROGRESS_SQL} from "./fiscal-merchant-kyb-query";
import {summarizeFiscalMerchantKybProgress} from "./fiscal-merchant-kyb-progress";
import type {FiscalMerchantKybProgress} from "./fiscal-merchant-kyb-progress";
import type {FiscalActor} from "./fiscal-auth";

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadFiscalMerchantKybProgress(
  actor:Pick<FiscalActor,"id"|"role">,organizationId:string
):Promise<FiscalMerchantKybProgress>{
 if(actor.role!=="merchant"||!uuid.test(organizationId))
  throw new Error("FISCAL_KYB_ORGANIZATION_ACCESS_DENIED");
 const query=await fiscalPool().query<{check_type:string|null;outcome:string|null}>(
  FISCAL_MERCHANT_KYB_PROGRESS_SQL,[organizationId,actor.id]
 );
 // A missing membership is not equivalent to an empty checklist.
 // Explicitly deny stale or revoked access even after an earlier dashboard read.
 if(query.rows.length===0)
  throw new Error("FISCAL_KYB_ORGANIZATION_ACCESS_DENIED");
 return summarizeFiscalMerchantKybProgress(query.rows.filter(x=>x.check_type!==null));
}
