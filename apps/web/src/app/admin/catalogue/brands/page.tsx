import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminBrandManagement } from "../../../../components/AdminBrandManagement";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../../components/WorkspacePagePrimitives";
import { adminBrandWorkspace } from "../../../../lib/admin-brand-runtime";
import { getAdminSession } from "../../../../lib/admin-session";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; coverage?: string; page?: string }> }) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");

  const params = await searchParams;
  const query = params.q?.trim().slice(0, 120) || undefined;
  const coverage = params.coverage === "with_logo" || params.coverage === "missing_logo" ? params.coverage : "all";
  const pageNumber = Math.max(1, Math.floor(Number(params.page ?? "1")) || 1);
  const pageSize = 30;
  const data = await adminBrandWorkspace(principal, {
    q: query,
    coverage,
    limit: pageSize,
    offset: (pageNumber - 1) * pageSize
  });
  const coveragePct = data.totalBrands ? Math.round((data.withLogo / data.totalBrands) * 1000) / 10 : 0;

  const pageHref = (nextPage: number) => {
    const search = new URLSearchParams();
    if (query) search.set("q", query);
    if (coverage !== "all") search.set("coverage", coverage);
    if (nextPage > 1) search.set("page", String(nextPage));
    return `/admin/catalogue/brands${search.size ? `?${search.toString()}` : ""}`;
  };

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Catalogue · canonical brand governance</div>
        <h1>Brands &amp; Logos</h1>
        <p className="lead">Server-side search και bounded pages κρατούν το workspace γρήγορο ακόμη και όταν μεγαλώνει ο supplier catalogue. Logo, official website και provenance παραμένουν πάνω στο υπάρχον canonical brand record.</p>
      </div>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Used brands", value: data.totalBrands },
      { label: "With logo", value: data.withLogo, tone: data.withLogo === data.totalBrands ? "positive" : "default" },
      { label: "Missing logo", value: data.missingLogo, tone: data.missingLogo ? "attention" : "positive" },
      { label: "Coverage", value: `${coveragePct}%`, hint: data.filteredTotal !== data.totalBrands ? `${data.filteredTotal.toLocaleString("el-GR")} in current filter` : undefined }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Brand management" title="Λογότυπα και επίσημες πηγές" note="Η λίστα φορτώνει 30 brands τη φορά. Search και logo coverage εκτελούνται στη βάση πριν γίνει hydration του UI." />
      <AdminBrandManagement brands={data.brands} csrfToken={data.csrfToken} query={query ?? ""} coverage={coverage} filteredTotal={data.filteredTotal} />
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
