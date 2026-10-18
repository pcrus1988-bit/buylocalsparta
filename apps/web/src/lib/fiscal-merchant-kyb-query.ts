/**
 * Tenant-bound, private merchant KYB inventory query.
 * Only two finite, non-identifying columns may leave PostgreSQL.
 * The membership/role constraint must remain inside the database query, not
 * just in a dashboard selection made earlier in a request.
 */
export const FISCAL_MERCHANT_KYB_PROGRESS_SQL=`
SELECT latest.check_type,latest.outcome
  FROM public.fiscal_memberships AS membership
  LEFT JOIN LATERAL (
    SELECT DISTINCT ON (event.check_type) event.check_type,event.outcome
      FROM public.fiscal_kyb_evidence_events AS event
      WHERE event.organization_id=membership.organization_id
      ORDER BY event.check_type,event.recorded_at DESC,event.id DESC
  ) AS latest ON TRUE
 WHERE membership.organization_id=$1
   AND membership.user_id=$2
   AND membership.role IN ('owner','accountant')
 ORDER BY latest.check_type
`;
