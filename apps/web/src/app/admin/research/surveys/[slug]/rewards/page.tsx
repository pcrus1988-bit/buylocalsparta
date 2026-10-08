import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PostgresUnitOfWork, type SqlRow } from "@buy-local-sparta/core";
import { AdminWorkspaceHeader } from "../../../../../../components/AdminWorkspaceHeader";
import { ResearchSurveyAdminNav } from "../../../../../../components/ResearchSurveyAdminNav";
import { hasAdminPermission } from "../../../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../../../lib/admin-session";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "../../../../../../lib/postgres-runtime";

export const metadata: Metadata = { title: "Admin · Research rewards", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Search = Promise<{ search?: string; q?: string; status?: string }>;
const statuses = ["all", "eligible", "issued", "redeemed", "expired", "cancelled"] as const;

const fmtDate = (value: unknown) => value
  ? new Date(String(value)).toLocaleString("el-GR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Athens" })
  : "—";
const euro = (cents: unknown) => new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(Number(cents || 0) / 100);

export default async function SurveyRewardsAdminPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Search;
}) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  if (!hasAdminPermission(principal, "research.read")) redirect("/admin");
  const { slug } = await params;
  const query = await searchParams;
  const searching = query.search === "1";
  const status = statuses.find(item => item === query.status) ?? "all";
  const q = (query.q ?? "").trim().slice(0, 90);
  const prepared = productionDatabaseConfigured();
  let studyTitle = slug;
  let counts: SqlRow = {};
  let rows: SqlRow[] = [];
  let unavailable = "";

  if (prepared) {
    try {
      const uow = new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool);
      const result = await uow.withTransaction(
        { platformAccess: true, marketId: "sparta", requestId: "admin-research-rewards" },
        async (tx) => {
          const st = await tx.query<SqlRow>("SELECT id,title FROM research_studies WHERE slug=$1 LIMIT 1", [slug]);
          if (!st.rows[0]) return undefined;
          const summary = await tx.query<SqlRow>(`
            SELECT count(*)::integer AS total,
              count(*) FILTER (WHERE re.status='eligible')::integer AS eligible,
              count(*) FILTER (WHERE re.status='issued')::integer AS issued,
              count(*) FILTER (WHERE re.status='redeemed')::integer AS redeemed,
              count(*) FILTER (WHERE re.status='expired')::integer AS expired,
              count(*) FILTER (WHERE re.status='cancelled')::integer AS cancelled
            FROM research_reward_entitlements re
            JOIN research_responses rr ON rr.id=re.response_id
            WHERE rr.study_id=$1 AND re.reward_kind='thank_you_code'
          `, [st.rows[0].id]);
          if (!searching) return { title: st.rows[0].title, counts: summary.rows[0], rows: [] };
          const entries = await tx.query<SqlRow>(`
            SELECT re.id::text AS id, re.status, re.created_at,
                   re.issued_at, re.redeemed_at, re.expires_at,
                   hp.public_id AS application_reference, hp.business_name,
                   rd.setup_fee_original_cents, rd.setup_discount_cents,
                   rd.setup_fee_payable_cents, rd.redeemed_at AS redemption_recorded_at
            FROM research_reward_entitlements re
            JOIN research_responses rr ON rr.id=re.response_id
            LEFT JOIN research_reward_redemptions rd ON rd.entitlement_id=re.id
            LEFT JOIN hub_expansion_prospects hp ON hp.id=rd.prospect_id
            WHERE rr.study_id=$1 AND re.reward_kind='thank_you_code'
              AND ($2::text='all' OR re.status=$2)
              AND ($3::text='' OR re.id::text=$3
                   OR hp.public_id=$3)
            ORDER BY re.created_at DESC,re.id DESC
            LIMIT 50
          `, [st.rows[0].id, status, q]);
          return { title: st.rows[0].title, counts: summary.rows[0], rows: entries.rows };
        }
      );
      if (result) {
        studyTitle = String(result.title);
        counts = result.counts ?? {};
        rows = result.rows;
      } else unavailable = "Η μελέτη δεν βρέθηκε.";
    } catch (error) {
      console.error(JSON.stringify({ event: "research.rewards.admin_unavailable", type: error instanceof Error ? error.name : "unknown" }));
      unavailable = "Η βάση δεν ανταποκρίνεται αυτή τη στιγμή. Δεν εμφανίζονται μη επαληθευμένα στοιχεία.";
    }
  } else unavailable = "Η βάση Research δεν έχει συνδεθεί.";

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel="Research · Rewards" />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div><div className="eyebrow">Research · Survey rewards</div><h1>Reward Management</h1>
        <p className="lead">{studyTitle} · Έκπτωση 50% μόνο στο εφάπαξ κόστος HUB onboarding.</p>
      </div>
    </section>
    <ResearchSurveyAdminNav slug={slug} current="rewards" />
    <section className="shell vendor-section">
      {unavailable ? <div className="workspace-inline-note form-error" role="alert">{unavailable}</div> : <>
        <div className="workspace-queue-card">
          <strong>Ενεργή πολιτική</strong>
          <p>Business onboarding 50% · Κατά την υποβολή ολοκληρωμένης αίτησης, όχι κατά την επαλήθευση του κωδικού.</p>
          <p>Η έκπτωση αφορά μόνο το one-time setup fee. Δεν ισχύει στο δωρεάν CLAIM, στη συνδρομή, στην προμήθεια ή σε επόμενες αιτήσεις. Οι κωδικοί εμφανίζονται μόνο στον συμμετέχοντα και δεν ανακτώνται από Admin.</p>
          <Link href={"/admin/research/surveys/" + encodeURIComponent(slug) + "/fieldwork"} className="button button-secondary" prefetch={false}>Issuance and email delivery →</Link>
        </div>
        <div className="workspace-queue-card" style={{ marginTop: 16 }}>
          <div className="workspace-action-bar" style={{ flexWrap: "wrap", gap: 14 }}>
            {([
              ["Eligible",counts.eligible],
              ["Issued",counts.issued],
              ["Redeemed",counts.redeemed],
              ["Expired",counts.expired],
              ["Cancelled",counts.cancelled]
            ] as const).map(([label,value]) => <span key={label}><strong>{Number(value || 0).toLocaleString("el-GR")}</strong> <small>{label}</small></span>)}
          </div>
          <small>Total entitlements: {Number(counts.total || 0).toLocaleString("el-GR")}. Search results are not loaded automatically.</small>
        </div>
        <form method="get" className="workspace-queue-card" style={{ marginTop: 16, display: "flex", alignItems: "end", gap: 12, flexWrap: "wrap" }}>
          <input type="hidden" name="search" value="1" />
          <label style={{ display: "grid", gap: 5 }}>Status
            <select name="status" defaultValue={status}>
              {statuses.map(item => <option value={item} key={item}>{item}</option>)}
            </select>
          </label>
          <label style={{ display: "grid", gap: 5 }}>Reward ID or application reference
            <input type="text" name="q" defaultValue={q} maxLength={90} placeholder="Optional exact ID" />
          </label>
          <button type="submit" className="button">Search rewards</button>
        </form>
        {searching && <section className="workspace-queue-card" style={{ marginTop: 16 }}>
          <strong>Found {rows.length} (first 50 matching entries)</strong>
          {rows.length === 0 ? <p>No matching records.</p> : <div style={{ overflowX: "auto", marginTop: 12 }}><table style={{ width: "100%", minWidth: 780, textAlign: "left" }}>
            <thead><tr><th>Reward ID</th><th>Status</th><th>Issued</th><th>Redeemed</th><th>Application / business</th><th>One-time fee</th></tr></thead>
            <tbody>{rows.map(row => <tr key={String(row.id)}>
              <td><code>{String(row.id).slice(0, 8)}…</code></td>
              <td><strong>{String(row.status)}</strong></td>
              <td>{fmtDate(row.issued_at)}</td>
              <td>{fmtDate(row.redeemed_at)}</td>
              <td>{row.application_reference ? <>{String(row.business_name ?? "")}<br /><small>{String(row.application_reference)}</small></> : "—"}</td>
              <td>{row.setup_fee_original_cents != null ? <><s>{euro(row.setup_fee_original_cents)}</s> → <strong>{euro(row.setup_fee_payable_cents)}</strong></> : "—"}</td>
            </tr>)}</tbody>
          </table></div>}
        </section>}
      </>}
    </section>
  </main>;
}
