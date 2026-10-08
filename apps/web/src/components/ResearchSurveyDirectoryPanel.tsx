import Link from "next/link";
import type { ResearchDirectoryKind, ResearchDirectoryResult } from "../lib/research-survey-directory";
import { WorkspaceSectionHeading, WorkspaceStatusBadge } from "./WorkspacePagePrimitives";

export function ResearchSurveyDirectoryPanel({ slug, kind, data }: {
  slug: string;
  kind: ResearchDirectoryKind;
  data: ResearchDirectoryResult;
}) {
  const isContact = kind === "contacts";
  const root = "/admin/research/surveys/" + encodeURIComponent(slug) + "/" + kind;
  const nextParams = new URLSearchParams({ search: "1", q: data.q, status: data.status });
  if (data.nextCursor) nextParams.set("cursor", data.nextCursor);
  const statuses = isContact
    ? [{ key: "active", label: "Active" }, { key: "suppressed", label: "Opted out / suppressed" }, { key: "bounced", label: "Bounced" }, { key: "invalid", label: "Invalid" }]
    : [{ key: "created", label: "Created" }, { key: "sent", label: "Sent" }, { key: "opened", label: "Opened" }, { key: "started", label: "Started" }, { key: "completed", label: "Completed" }, { key: "expired", label: "Expired" }, { key: "suppressed", label: "Suppressed" }];

  return <section className="shell vendor-section">
    <WorkspaceSectionHeading
      eyebrow={isContact ? "Επαφές" : "Προσκλήσεις"}
      title={isContact ? "Search research email contacts" : "Search research invitations"}
      note="No contact or invitation records load automatically. Only a submitted search loads one limited page of results."
    />
    <form action={root} className="workspace-queue-card" method="GET">
      <input name="search" type="hidden" value="1" />
      <div className="workspace-action-bar" style={{ gap: 12, flexWrap: "wrap" }}>
        <label style={{ flex: "1 1 240px" }}>
          Search
          <input name="q" type="search"
            aria-label={isContact ? "Full email (exact), business or municipality" : "Invitation ID or full email"}
            defaultValue={data.q}
            placeholder={isContact ? (data.canViewEmail ? "Full email (exact), business or municipality" : "Business or municipality") : (data.canViewEmail ? "Invitation ID or full email" : "Invitation ID")}
            maxLength={120} style={{ display: "block", width: "100%", marginTop: 6 }} />
        </label>
        <label style={{ flex: "1 1 180px" }}>
          Status
          <select name="status" defaultValue={data.status} aria-label="Status filter"
            style={{ display: "block", width: "100%", marginTop: 6 }}>
            <option value="">All statuses</option>
            {statuses.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <button className="button" type="submit" style={{ alignSelf: "end" }}>Search / filter</button>
        <Link prefetch={false} className="button button-secondary" href={root} style={{ alignSelf: "end" }}>Clear</Link>
      </div>
      <small>Search is server-side and on demand. Enter a full email for an exact private lookup, or search by business/municipality. At most 25 records per page. Email visibility follows Admin permissions and access is audited.</small>
    </form>
    {!data.requested
      ? <div className="workspace-inline-note" role="status">No records preloaded. Use the search or status filter above to retrieve a page.</div>
      : data.rows.length === 0
        ? <div className="workspace-inline-note" role="status">No matching results.</div>
        : <>
          <div className="workspace-action-bar">
            <strong>Results: {data.rows.length} on this page</strong>
            <small>These are matching rows, not an all-time total. No full-table count was performed.</small>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 780 }}>
              <thead><tr>
                {isContact
                  ? <><th>Email</th><th>Business</th><th>Municipality</th><th>Sector</th><th>Source</th><th>Status</th><th>Invitation</th></>
                  : <><th>Recipient</th><th>Invitation</th><th>Status</th><th>Sent</th><th>Expires</th><th>Response</th></>}
              </tr></thead>
              <tbody>
                {data.rows.map(row => <tr key={row.id}>
                  {isContact
                    ? <>
                        <td>{row.email ?? "Restricted"}</td>
                        <td>{row.legalName ?? "—"}</td>
                        <td>{[row.municipality, row.prefecture].filter(Boolean).join(" · ") || "—"}</td>
                        <td>{row.sector ?? "—"}</td>
                        <td>{row.source ?? "—"}</td>
                        <td><WorkspaceStatusBadge status={row.status} label={row.status} /></td>
                        <td>{row.inviteStatus ?? "Not invited"}</td>
                      </>
                    : <>
                        <td>{row.email ?? "Restricted"}</td>
                        <td style={{ fontFamily: "monospace" }}>{row.id.slice(0, 12)}…</td>
                        <td><WorkspaceStatusBadge status={row.status} label={row.status} /></td>
                        <td>{row.sentAt ? new Date(row.sentAt).toLocaleString("el-GR") : "—"}</td>
                        <td>{row.expiresAt ? new Date(row.expiresAt).toLocaleString("el-GR") : "—"}</td>
                        <td>{row.responseStatus ?? "—"}</td>
                      </>}
                </tr>)}
              </tbody>
            </table>
          </div>
          {data.nextCursor && <div className="workspace-action-buttons" style={{ marginTop: 12 }}>
            <Link prefetch={false} className="button button-secondary" href={root + "?" + nextParams.toString()}>Next 25 results →</Link>
          </div>}
        </>}
  </section>;
}
