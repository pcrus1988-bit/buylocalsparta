import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../../components/WorkspacePagePrimitives";
import { getAdminSession } from "../../../../lib/admin-session";
import { getMerchantCenterCatalogueProjection, type MerchantCenterReadinessState } from "../../../../lib/merchant-center-catalog";

export const metadata: Metadata = {
  title: "Merchant Center · SEO Admin",
  robots: { index: false, follow: false, nocache: true }
};

const money = new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" });
const dateTime = new Intl.DateTimeFormat("el-GR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens" });

function stateLabel(state: MerchantCenterReadinessState): string {
  if (state === "eligible") return "Feed eligible";
  if (state === "quality_hold") return "SEO quality hold";
  if (state === "governance_hold") return "Governance hold";
  if (state === "unavailable") return "No live offer";
  if (state === "missing_price") return "Missing price";
  if (state === "missing_image") return "Missing image";
  return "Missing description";
}

function stateRank(state: MerchantCenterReadinessState): number {
  return state === "eligible" ? 9 : state === "governance_hold" ? 1 : state === "quality_hold" ? 2 : state === "unavailable" ? 3 : 4;
}

export default async function AdminSeoMerchantCenterPage() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");

  let data: Awaited<ReturnType<typeof getMerchantCenterCatalogueProjection>> | undefined;
  let loadError: string | undefined;
  try {
    data = await getMerchantCenterCatalogueProjection();
  } catch (error) {
    loadError = error instanceof Error ? error.message : String(error);
  }

  const rows = data ? [...data.rows].sort((left, right) => stateRank(left.state) - stateRank(right.state) || left.title.localeCompare(right.title, "el")) : [];
  const attention = data ? data.metrics.totalPublic - data.metrics.feedEligible : 0;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Content · SEO & Visibility · Merchant Center</div>
        <h1>Google product-feed readiness</h1>
        <p className="lead">Η ίδια governed προβολή τροφοδοτεί το δημόσιο Merchant Center RSS και αυτό το diagnostic workspace. Έτσι τιμή, διαθεσιμότητα, canonical URL και product admission δεν αποκτούν δεύτερη ανεξάρτητη αλήθεια.</p>
      </div>
      <aside className={loadError || data?.feedOperational === false ? "dashboard-health-card needs-attention" : "dashboard-health-card"}>
        <span>Merchant feed</span>
        <strong>{loadError ? "Unavailable" : data?.feedOperational ? "Operational" : "Held safely"}</strong>
        <p>{data ? `${data.metrics.feedEligible} eligible · ${attention} held or unavailable` : "Read model could not be loaded"}</p>
      </aside>
    </section>

    <section className="shell admin-local-tabs-shell">
      <nav className="admin-local-tabs" aria-label="Merchant Center workspace navigation">
        <Link href="/admin/seo">Overview</Link>
        <Link href="/admin/seo/pages">Pages</Link>
        <Link href="/admin/seo/schema">Structured Data</Link>
        <Link href="/admin/seo/merchant-center">Merchant Center</Link>
        <Link href="/admin/seo/issues">Issues</Link>
        <Link href="/admin/seo/crawl">Crawl</Link>
        <Link href="/admin/seo/search-console">Search Console</Link>
      </nav>
    </section>

    {loadError || !data ? <section className="shell vendor-section"><div className="workspace-empty-state"><strong>Merchant Center readiness could not be loaded.</strong><span>{loadError ?? "The public catalogue projection is unavailable."}</span></div></section> : <>
      <WorkspaceMetricStrip items={[
        { label: "Feed eligible", value: data.metrics.feedEligible, tone: data.metrics.feedEligible ? "positive" : "attention", hint: `${data.metrics.totalPublic} public products` },
        { label: "Governed index allowed", value: data.metrics.governedIndexAllowed, tone: data.metrics.governedIndexAllowed ? "positive" : "attention", hint: `${data.metrics.qualityEligible} pass product quality` },
        { label: "Live availability held", value: data.metrics.unavailable, tone: data.metrics.unavailable ? "attention" : "positive", hint: `${data.metrics.missingPrice} missing current price` },
        { label: "Identifier warnings", value: data.metrics.invalidGtin + data.metrics.noPublicIdentifiers, tone: data.metrics.invalidGtin + data.metrics.noPublicIdentifiers ? "attention" : "positive", hint: `${data.metrics.validGtin} valid GTIN · ${data.metrics.invalidGtin} invalid GTIN` }
      ]} />

      <section className="shell vendor-section">
        <WorkspaceSectionHeading eyebrow="Primary product data source" title="One feed, one commerce projection" note="This page proves application-side feed readiness. It does not claim that a Google Merchant Center account has already fetched, approved or published the source; account-side status must come from Google itself." />
        <div className="admin-domain-card-grid">
          <article className="admin-domain-card"><span>Source</span><strong>RSS 2.0</strong><p>Public source generated dynamically from the governed KONTA MOU catalogue.</p><b>{data.metrics.feedEligible}</b><i>Current items</i></article>
          <article className="admin-domain-card"><span>Identity</span><strong>Product identifiers</strong><p>Invalid GTINs are omitted rather than asserted. Missing identifiers never trigger a manufactured identifier_exists claim.</p><b>{data.metrics.validGtin}</b><i>Valid GTIN</i></article>
          <article className="admin-domain-card"><span>Commerce</span><strong>Live offer projection</strong><p>Price and availability use the read-only crawler offer projection and do not consume the customer fairness rotation.</p><b>{data.metrics.unavailable}</b><i>Currently unavailable</i></article>
          <article className="admin-domain-card"><span>Safety</span><strong>Fail closed</strong><p>A systemic media/catalogue projection outage makes the public feed return HTTP 503 instead of pretending that the catalogue is empty.</p><b>{data.feedOperational ? "OK" : "503"}</b><i>Feed state</i></article>
        </div>
        <div className="workspace-action-bar" style={{ marginTop: 18 }}>
          <span>Feed URL: <code>{data.feedUrl}</code> · generated {dateTime.format(new Date(data.generatedAt))}</span>
          <div className="workspace-action-buttons"><a className="text-link" href={data.feedUrl} target="_blank" rel="noreferrer">Open XML feed ↗</a><Link className="text-link" href="/admin/seo/schema">Structured-data diagnostics →</Link></div>
        </div>
        {!data.feedOperational && <div className="workspace-empty-state" style={{ marginTop: 16 }}><strong>Feed is intentionally held.</strong><span>{data.operationalError}</span></div>}
        {!data.indexingEnabled && <div className="workspace-empty-state" style={{ marginTop: 16 }}><strong>Global indexing is disabled.</strong><span>The Merchant Center source remains valid but intentionally contains zero products until governed indexing is re-enabled.</span></div>}
      </section>

      <section className="vendor-section section-tint"><div className="shell">
        <WorkspaceSectionHeading eyebrow="Product diagnostics" title="What Google can receive right now" note="Held products remain in the normal public catalogue according to their own commerce rules; this table only explains Merchant Center/search-promotion readiness. Non-blocking identifier warnings are shown separately." />
        <div className="workspace-queue-list">
          {rows.length === 0 ? <div className="workspace-empty-state"><strong>No public product records are available.</strong><span>The readiness list will populate automatically when governed canonical products enter the public catalogue.</span></div> : rows.slice(0, 150).map((row) => <article className="workspace-queue-card" key={row.id}>
            <div className="workspace-queue-head">
              <div><strong>{row.title}</strong><small>{row.id}{row.vendorName ? ` · current fulfilment source ${row.vendorName}` : ""}</small></div>
              <span className="status-pill">{stateLabel(row.state)}</span>
            </div>
            <div className="workspace-queue-primary"><span>{row.reasons.join(" · ")}</span></div>
            <div className="workspace-compact-list" style={{ marginTop: 10 }}>
              <div className="workspace-compact-row"><strong>Current price</strong><span>{typeof row.priceMinor === "number" && row.priceMinor > 0 ? money.format(row.priceMinor / 100) : "Not feed-ready"}</span></div>
              <div className="workspace-compact-row"><strong>Brand / MPN</strong><span>{row.brand || "—"} · {row.mpn || "—"}</span></div>
              <div className="workspace-compact-row"><strong>GTIN</strong><span>{row.gtin || "—"}</span></div>
            </div>
            {row.warnings.length > 0 && <details className="workspace-tool-panel" style={{ marginTop: 12 }}><summary><span><strong>Non-blocking data-quality warnings</strong><small>{row.warnings.join(" · ")}</small></span></summary><div className="workspace-tool-body"><p>{row.warnings.join(" · ")}</p></div></details>}
            <div className="workspace-action-bar"><span>{row.state === "eligible" ? "Included in the current Merchant Center product source." : "Excluded from the current Merchant Center product source until this condition changes."}</span><div className="workspace-action-buttons"><a className="text-link" href={row.link} target="_blank" rel="noreferrer">Open public product ↗</a></div></div>
          </article>)}
        </div>
        {rows.length > 150 && <p style={{ marginTop: 16 }}>Showing the first 150 of {rows.length} products, with problems shown before feed-eligible records.</p>}
      </div></section>
    </>}
  </main>;
}
