import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../../components/WorkspacePagePrimitives";
import { getAdminSession } from "../../../../lib/admin-session";
import { adminVendorVisibilityReport } from "../../../../lib/vendor-visibility";

function pct(value: number): string {
  return `${(value * 100).toFixed(value > 0 && value < 0.1 ? 1 : 0)}%`;
}

const th = { textAlign: "left", padding: "10px 12px", whiteSpace: "nowrap", borderBottom: "1px solid var(--border, #ddd)" } as const;
const td = { padding: "10px 12px", whiteSpace: "nowrap", borderBottom: "1px solid var(--border, #eee)" } as const;

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const rows = await adminVendorVisibilityReport();
  const unclaimed = rows.filter((row) => !row.claimed);
  const totalImpressions = unclaimed.reduce((sum, row) => sum + row.impressions, 0);
  const totalClicks = unclaimed.reduce((sum, row) => sum + row.clicks, 0);
  const totalViews = unclaimed.reduce((sum, row) => sum + row.pageViews, 0);

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div>
      <div className="eyebrow">Acquisition intelligence · Google + GA4</div>
      <h1>Vendor Visibility</h1>
      <p className="lead">Πραγματική οργανική προβολή ανά vendor page. Οι μη διεκδικημένες επιχειρήσεις εμφανίζονται πρώτες ώστε η ομάδα να βλέπει πού υπάρχει ήδη μετρήσιμη ζήτηση.</p>
    </div></section>

    <WorkspaceMetricStrip items={[
      { label: "Unclaimed vendors", value: unclaimed.length, hint: `${rows.length} total tracked` },
      { label: "Google impressions · 30d", value: totalImpressions },
      { label: "Google clicks · 30d", value: totalClicks, hint: totalImpressions > 0 ? `${pct(totalClicks / totalImpressions)} CTR` : "No GSC data yet" },
      { label: "Vendor page views · 30d", value: totalViews }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Highest unclaimed opportunity" title="Search visibility by local business" note="Default order: unclaimed first, then Google impressions, then page views. No customer-level data is exposed." />
      <div className="workspace-action-bar" style={{ marginBottom: 14 }}>
        <span>Rolling 30-day window · automatically refreshed</span>
        <div className="workspace-action-buttons"><Link className="text-link" href="/admin/analytics">Commerce analytics</Link></div>
      </div>
      {rows.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν ακόμη visibility snapshots." body="Μετά την πρώτη επιτυχημένη Google sync, τα vendors θα εμφανιστούν εδώ αυτόματα." /> : <div className="workspace-queue-card" style={{ overflowX: "auto", padding: 0 }}>
        <table style={{ width: "100%", minWidth: 1180, borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={th}>Vendor</th><th style={th}>Status</th><th style={th}>Google impressions</th><th style={th}>Clicks</th><th style={th}>CTR</th><th style={th}>Avg position</th><th style={th}>Page views</th><th style={th}>Active users</th><th style={th}>Claim</th><th style={th}>Phone</th><th style={th}>Website</th><th style={th}>Directions</th>
          </tr></thead>
          <tbody>{rows.map((row) => <tr key={row.vendorId}>
            <td style={td}><strong>{row.vendorName}</strong><br /><Link className="text-link" href={`/vendor/${encodeURIComponent(row.vendorId)}`}>{row.vendorId}</Link></td>
            <td style={td}><span className="status-pill">{row.claimed ? "Claimed / active" : "Unclaimed / research"}</span></td>
            <td style={td}><strong>{row.impressions}</strong></td>
            <td style={td}>{row.clicks}</td>
            <td style={td}>{pct(row.ctr)}</td>
            <td style={td}>{row.averagePosition > 0 ? row.averagePosition.toFixed(1) : "—"}</td>
            <td style={td}>{row.pageViews}</td>
            <td style={td}>{row.activeUsers}</td>
            <td style={td}>{row.claimClicks}</td>
            <td style={td}>{row.phoneClicks}</td>
            <td style={td}>{row.websiteClicks}</td>
            <td style={td}>{row.directionsClicks}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
  </main>;
}
