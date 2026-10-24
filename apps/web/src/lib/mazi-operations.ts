import type {SessionPrincipal} from "@buy-local-sparta/core";
import {getAdminPostgresRuntime} from "./postgres-runtime";
import {marketplaceMaziActor} from "./mazi-superadmin";

/** Live, aggregate-only MAZI operations. Never expose applicants' AFM,
 * contacts, identifiers or individual audit evidence on this overview.
 * One database round trip on the separately bounded Admin connection.
 */
export type MaziOperationsSnapshot = {
 interest_total:number;
 interest_pending:number;
 interest_approved:number;
 interest_registry_stale:number;
 invitations_total:number;
 invitations_delivery_unconfirmed:number;
 invitations_delivery_failed:number;
 invitations_expired_unconsumed:number;
 invitations_active:number;
 invitations_consumed:number;
 acceptances:number;
 members_total:number;
 members_kyb_verified:number;
 members_voting_eligible:number;
 members_suspended:number;
 proposals_total:number;
 ballots_total:number;
 audit_events_total:number;
 ledger_total:number;
 grant_offers_total:number;
 finance_enabled_cycles:number;
 safe_founding_cycles:number;
 last_audit_at:Date|null;
};

export async function maziOperationsSnapshot(principal:SessionPrincipal):Promise<MaziOperationsSnapshot>{
 await marketplaceMaziActor(principal);
 // Limits/filters are deliberate; this is a live overview and not a PII export.
 const query = [
  "SELECT",
  "(SELECT count(*)::int FROM public.mazi_interest_applications) AS interest_total,",
  "(SELECT count(*)::int FROM public.mazi_interest_applications WHERE status IN ('pending_review','registry_review_required')) AS interest_pending,",
  "(SELECT count(*)::int FROM public.mazi_interest_applications WHERE status='approved_pending_invite') AS interest_approved,",
  "(SELECT count(*)::int FROM public.mazi_interest_applications WHERE status='approved_pending_invite' AND registry_checked_at < now()-interval '7 days') AS interest_registry_stale,",
  "(SELECT count(*)::int FROM public.mazi_invitations) AS invitations_total,",
  "(SELECT count(*)::int FROM public.mazi_invitations WHERE status='pending_delivery' AND issued_at < now()-interval '10 minutes') AS invitations_delivery_unconfirmed,",
  "(SELECT count(*)::int FROM public.mazi_invitations WHERE status='delivery_failed') AS invitations_delivery_failed,",
  "(SELECT count(*)::int FROM public.mazi_invitations WHERE status='email_sent' AND expires_at<=now()) AS invitations_expired_unconsumed,",
  "(SELECT count(*)::int FROM public.mazi_invitations WHERE status='email_sent' AND expires_at>now()) AS invitations_active,",
  "(SELECT count(*)::int FROM public.mazi_invitations WHERE status='consumed') AS invitations_consumed,",
  "(SELECT count(*)::int FROM public.mazi_invitation_acceptances) AS acceptances,",
  "(SELECT count(*)::int FROM public.mazi_members) AS members_total,",
  "(SELECT count(*)::int FROM public.mazi_members WHERE identity_verified_at IS NOT NULL) AS members_kyb_verified,",
  "(SELECT count(*)::int FROM public.mazi_members WHERE voting_eligible) AS members_voting_eligible,",
  "(SELECT count(*)::int FROM public.mazi_members WHERE status='suspended') AS members_suspended,",
  "(SELECT count(*)::int FROM public.mazi_proposals) AS proposals_total,",
  "(SELECT count(*)::int FROM public.mazi_votes) AS ballots_total,",
  "(SELECT count(*)::int FROM public.mazi_audit_events) AS audit_events_total,",
  "(SELECT count(*)::int FROM public.mazi_fund_ledger) AS ledger_total,",
  "(SELECT count(*)::int FROM public.mazi_grant_award_offers) AS grant_offers_total,",
  "(SELECT count(*)::int FROM public.mazi_cycles WHERE finance_activated OR funding_budget_cents<>0) AS finance_enabled_cycles,",
  "(SELECT count(*)::int FROM public.mazi_cycles WHERE slug='founding-needs-2026' AND kind='needs_assessment' AND NOT finance_activated AND funding_budget_cents=0) AS safe_founding_cycles,",
  "(SELECT max(happened_at) FROM public.mazi_audit_events) AS last_audit_at"
 ].join("\n");
 const result=await getAdminPostgresRuntime().nativePool.query<MaziOperationsSnapshot>(query);
 if(result.rows.length!==1)throw Error("MAZI_OPERATIONS_UNAVAILABLE");
 return result.rows[0];
}
