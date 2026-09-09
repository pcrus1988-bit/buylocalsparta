import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type PartnerDashboardSnapshot = Readonly<{
  id: string;
  partnerCode: string;
  status: string;
  rank: string;
  homeMarketName?: string;
  personalConvertedVendors: number;
  directTeamPartners: number;
  heldAmountCents: number;
  payableAmountCents: number;
  paidAmountCents: number;
}>;

export type PartnerNetworkAdminSnapshot = Readonly<{
  totalPartners: number;
  activePartners: number;
  convertedVendors: number;
  heldAmountCents: number;
  payableAmountCents: number;
  paidAmountCents: number;
  payoutsPending: number;
}>;

export async function partnerDashboardForUser(userId: string): Promise<PartnerDashboardSnapshot | undefined> {
  if (!productionDatabaseConfigured()) return undefined;
  const runtime = getProductionPostgresRuntime();
  const result = await runtime.nativePool.query({
    text: `
      SELECT pa.id::text,
             pa.partner_code,
             pa.status,
             pa.rank,
             m.name AS home_market_name,
             COALESCE((SELECT COUNT(*) FROM public.partner_attributions a WHERE a.partner_id = pa.id AND a.status = 'CONVERTED'), 0)::int AS personal_converted_vendors,
             COALESCE((SELECT COUNT(*) FROM public.partner_accounts child WHERE child.sponsor_partner_id = pa.id AND child.status = 'ACTIVE'), 0)::int AS direct_team_partners,
             COALESCE(es.held_amount_cents, 0)::bigint AS held_amount_cents,
             COALESCE(es.payable_amount_cents, 0)::bigint AS payable_amount_cents,
             COALESCE(es.paid_amount_cents, 0)::bigint AS paid_amount_cents
        FROM public.partner_accounts pa
        LEFT JOIN public.markets m ON m.id = pa.home_market_id
        LEFT JOIN public.partner_earnings_summary es ON es.partner_id = pa.id
       WHERE pa.user_id = $1::uuid
       LIMIT 1
    `,
    values: [userId]
  });
  const row = result.rows[0];
  if (!row) return undefined;
  return {
    id: String(row.id),
    partnerCode: String(row.partner_code),
    status: String(row.status),
    rank: String(row.rank),
    homeMarketName: row.home_market_name == null ? undefined : String(row.home_market_name),
    personalConvertedVendors: Number(row.personal_converted_vendors ?? 0),
    directTeamPartners: Number(row.direct_team_partners ?? 0),
    heldAmountCents: Number(row.held_amount_cents ?? 0),
    payableAmountCents: Number(row.payable_amount_cents ?? 0),
    paidAmountCents: Number(row.paid_amount_cents ?? 0)
  };
}

export async function partnerNetworkAdminSnapshot(): Promise<PartnerNetworkAdminSnapshot | undefined> {
  if (!productionDatabaseConfigured()) return undefined;
  const runtime = getProductionPostgresRuntime();
  const result = await runtime.nativePool.query(`
    SELECT
      (SELECT COUNT(*) FROM public.partner_accounts)::int AS total_partners,
      (SELECT COUNT(*) FROM public.partner_accounts WHERE status = 'ACTIVE')::int AS active_partners,
      (SELECT COUNT(*) FROM public.partner_attributions WHERE status = 'CONVERTED')::int AS converted_vendors,
      COALESCE((SELECT SUM(commission_amount_cents) FROM public.partner_commission_events WHERE status = 'HOLD'), 0)::bigint AS held_amount_cents,
      COALESCE((SELECT SUM(commission_amount_cents) FROM public.partner_commission_events WHERE status = 'PAYABLE'), 0)::bigint AS payable_amount_cents,
      COALESCE((SELECT SUM(commission_amount_cents) FROM public.partner_commission_events WHERE status = 'PAID'), 0)::bigint AS paid_amount_cents,
      (SELECT COUNT(*) FROM public.partner_payouts WHERE status IN ('DRAFT','APPROVED','PROCESSING'))::int AS payouts_pending
  `);
  const row = result.rows[0];
  if (!row) return undefined;
  return {
    totalPartners: Number(row.total_partners ?? 0),
    activePartners: Number(row.active_partners ?? 0),
    convertedVendors: Number(row.converted_vendors ?? 0),
    heldAmountCents: Number(row.held_amount_cents ?? 0),
    payableAmountCents: Number(row.payable_amount_cents ?? 0),
    paidAmountCents: Number(row.paid_amount_cents ?? 0),
    payoutsPending: Number(row.payouts_pending ?? 0)
  };
}
