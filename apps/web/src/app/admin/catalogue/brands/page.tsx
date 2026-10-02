import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminBrandManagement } from "../../../../components/AdminBrandManagement";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../../components/WorkspacePagePrimitives";
import { adminBrandWorkspace } from "../../../../lib/admin-brand-runtime";
import { getAdminSession } from "../../../../lib/admin-session";
import { BRAND_GUIDE_STATUSES, type BrandGuideStatus } from "../../../../lib/brand-guide";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: {
  searchParams: Promise<{ q?: string; coverage?: string; guide?: string; page?: string }>;
}) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");

  const params = await searchParams;
  const query = params.q?.trim().slice(0, 120) || undefined;
  const coverage = params.coverage === "with_logo" || params.coverage === "missing_logo" ? params.coverage : "all";
  const guide: "all" | BrandGuideStatus = BRAND_GUIDE_STATUSES.includes(params.guide as BrandGuideStatus)
    ? params.guide as BrandGuideStatus
    : "all";
  const pageNumber = Math.max(1, Math.floor(Number(params.page ?? "1")) || 1);
  const pageSize = 30;
  const data = await adminBrandWorkspace(principal, {
    q: query,
    coverage,
    guide,
    limit: pageSize,
    offset: (pageNumber - 1) * pageSize
  });
  const coveragePct = data.totalBrands ? Math.round((data.withLogo / data.totalBrands) * 1000) / 10 : 0;

  const pageHref = (nextPage: number) => {
    const search = new URLSearchParams();
    if (query) search.set("q", query);
    if (coverage !== "all") search.set("coverage", coverage);
    if (guide !== "all") search.set("guide", guide);
    if (nextPage > 1) search.set("page", String(nextPage));
    return `/admin/catalogue/brands${search.size ? `?${search.toString()}` : ""}`;
  };

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Catalogue · canonical brand governance</div>
        <h1>Brands &amp; Brand Guides</h1>
        <p className="lead">Το ίδιο canonical brand record διαχειρίζεται πλέον identity, logo, official website, provenance και editorial Brand Guide. Το public page χρησιμοποιεί live catalogue data· το AI enrichment γεμίζει μόνο το ελεγχόμενο structured schema.</p>
      </div>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Used brands", value: data.totalBrands },
      { label: "With logo", value: data.withLogo, tone: data.withLogo === data.totalBrands ? "positive" : "default" },
      { label: "Missing logo", value: data.missingLogo, tone: data.missingLogo ? "attention" : "positive" },
      { label: "Logo coverage", value: `${coveragePct}%`, hint: data.filteredTotal !== data.totalBrands ? `${data.filteredTotal.toLocaleString("el-GR")} in current filter` : undefined }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading
        eyebrow="Brand knowledge"
        title="Identity, sources & Brand Guide enrichment"
        note="30 brands ανά σελίδα. Μπορείς να κάνεις preview το public guide, να συμπληρώσεις περιεχόμενο ή να βάλεις το brand στην ουρά του μελλοντικού enrichment agent. SEO indexing ενεργοποιείται μόνο όταν περνά το hard quality gate."
      />
      <AdminBrandManagement
        brands={data.brands}
        csrfToken={data.csrfToken}
        query={query ?? ""}
        coverage={coverage}
        guide={guide}
        filteredTotal={data.filteredTotal}
      />
      {data.filteredTotal > pageSize ? <div className="workspace-action-bar" style={{ marginTop: "1rem" }}>
        <span>Showing {data.filteredTotal ? data.offset + 1 : 0}–{Math.min(data.offset + data.brands.length, data.filteredTotal)} of {data.filteredTotal.toLocaleString("el-GR")} brands.</span>
        <div className="workspace-action-buttons">
          {pageNumber > 1 ? <Link className="button button-secondary" href={pageHref(pageNumber - 1)}>Previous</Link> : null}
          {data.hasMore ? <Link className="button button-secondary" href={pageHref(pageNumber + 1)}>Next</Link> : null}
        </div>
      </div> : null}
    </section>
  </main>;
}
