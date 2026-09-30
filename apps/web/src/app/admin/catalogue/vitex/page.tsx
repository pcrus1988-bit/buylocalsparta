import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SqlRow } from "@buy-local-sparta/core";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { getAdminSession } from "../../../../lib/admin-session";
import { assertAdminCsrf, assertAdminPermission } from "../../../../lib/admin-runtime";
import { adminUpdateVitexPublicContent } from "../../../../lib/admin-vitex-catalogue";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "../../../../lib/postgres-runtime";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin · VITEX catalogue",
  robots: { index: false, follow: false }
};

type VitexRow = SqlRow & {
  canonical_id: string;
  slug: string;
  title: string;
  description: string | null;
  seo_title: string | null;
  seo_description: string | null;
  price_minor: number | string;
  match_status: string;
  match_confidence: number | string | null;
  manufacturer_product: string | null;
  manufacturer_verification: string | null;
  source_image_url: string | null;
};

type MetricRow = SqlRow & {
  total: number | string;
  manufacturer_matched: number | string;
  verified_matches: number | string;
  review_required: number | string;
};

const PAGE_SIZE = 50;
const asText = (value: unknown) => typeof value === "string" ? value : String(value ?? "");
const asInt = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const euro = (minor: unknown) => new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(asInt(minor) / 100);

function pageNumber(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

async function requireAdmin() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  assertAdminPermission(principal, "catalog.write");
  return principal;
}

async function updatePublicContent(formData: FormData) {
  "use server";
  const principal = await requireAdmin();
  assertAdminCsrf(principal, asText(formData.get("csrfToken")));

  const result = await adminUpdateVitexPublicContent(principal, {
    canonicalId: asText(formData.get("canonicalId")),
    title: asText(formData.get("title")),
    description: asText(formData.get("description")),
    seoTitle: asText(formData.get("seoTitle")),
    seoDescription: asText(formData.get("seoDescription")),
    imageUrl: asText(formData.get("imageUrl")),
    reason: asText(formData.get("reason"))
  });

  revalidatePath("/admin/catalogue/vitex");
  revalidatePath("/shop");
  revalidatePath(`/product/${encodeURIComponent(result.slug)}`);
}

async function loadVitexRows(query: string, page: number): Promise<readonly VitexRow[]> {
  const db = getProductionPostgresRuntime().sqlPool;
  const result = await db.query<VitexRow>(`
    SELECT cv.public_id AS canonical_id,
           cv.slug,
           COALESCE(pt.title,vcp.product_title) AS title,
           pt.description,
           pt.seo_title,
           pt.seo_description,
           vcp.price_minor,
           vcp.match_status,
           vcp.match_confidence,
           mp.product_name AS manufacturer_product,
           mp.verification_status AS manufacturer_verification,
           media.source_image_url
    FROM vitex_commerce_products vcp
    JOIN canonical_variants cv ON cv.id=vcp.canonical_variant_id
    LEFT JOIN product_translations pt ON pt.canonical_variant_id=cv.id AND pt.locale='el'
    LEFT JOIN manufacturer_products mp ON mp.id=vcp.manufacturer_product_id
    LEFT JOIN LATERAL (
      SELECT csp.source_image_url
      FROM catalog_source_products csp
      JOIN catalog_sources cs ON cs.id=csp.source_id
      JOIN catalog_source_snapshots css ON css.id=csp.snapshot_id
      WHERE cs.code='vitex-commerce-media'
        AND csp.source_product_key=vcp.import_fingerprint
      ORDER BY css.observed_at DESC NULLS LAST,csp.created_at DESC,csp.id DESC
      LIMIT 1
    ) media ON true
    WHERE vcp.active=true
      AND vcp.canonical_variant_id IS NOT NULL
      AND (
        $1=''
        OR COALESCE(pt.title,vcp.product_title) ILIKE '%'||$1||'%'
        OR COALESCE(mp.product_name,'') ILIKE '%'||$1||'%'
        OR cv.public_id ILIKE '%'||$1||'%'
      )
    ORDER BY COALESCE(pt.title,vcp.product_title),cv.public_id
    LIMIT $2 OFFSET $3
  `, [query, PAGE_SIZE, (page - 1) * PAGE_SIZE]);
  return result.rows;
}

async function loadSelectedVitex(canonicalId: string): Promise<VitexRow | undefined> {
  if (!canonicalId) return undefined;
  const db = getProductionPostgresRuntime().sqlPool;
  const result = await db.query<VitexRow>(`
    SELECT cv.public_id AS canonical_id,
           cv.slug,
           COALESCE(pt.title,vcp.product_title) AS title,
           pt.description,
           pt.seo_title,
           pt.seo_description,
           vcp.price_minor,
           vcp.match_status,
           vcp.match_confidence,
           mp.product_name AS manufacturer_product,
           mp.verification_status AS manufacturer_verification,
           media.source_image_url
    FROM vitex_commerce_products vcp
    JOIN canonical_variants cv ON cv.id=vcp.canonical_variant_id
    LEFT JOIN product_translations pt ON pt.canonical_variant_id=cv.id AND pt.locale='el'
    LEFT JOIN manufacturer_products mp ON mp.id=vcp.manufacturer_product_id
    LEFT JOIN LATERAL (
      SELECT csp.source_image_url
      FROM catalog_source_products csp
      JOIN catalog_sources cs ON cs.id=csp.source_id
      JOIN catalog_source_snapshots css ON css.id=csp.snapshot_id
      WHERE cs.code='vitex-commerce-media'
        AND csp.source_product_key=vcp.import_fingerprint
      ORDER BY css.observed_at DESC NULLS LAST,csp.created_at DESC,csp.id DESC
      LIMIT 1
    ) media ON true
    WHERE vcp.active=true
      AND (cv.public_id=$1 OR cv.id::text=$1)
    LIMIT 1
  `, [canonicalId]);
  return result.rows[0];
}

export default async function Page({
  searchParams
}: {
  searchParams: Promise<{ q?: string; page?: string; edit?: string }>;
}) {
  const principal = await requireAdmin();
  if (!productionDatabaseConfigured()) {
    return <main className="vendor-app admin-app">
      <AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel="VITEX catalogue" />
      <section className="shell vendor-section">
        <h1>VITEX catalogue</h1>
        <p>Production database is not configured.</p>
      </section>
    </main>;
  }

  const params = await searchParams;
  const query = asText(params.q).trim().slice(0, 160);
  const page = pageNumber(params.page);
  const editId = asText(params.edit).trim();

  const db = getProductionPostgresRuntime().sqlPool;
  const [metricsResult, rows, selected, filteredCountResult] = await Promise.all([
    db.query<MetricRow>(`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE manufacturer_product_id IS NOT NULL)::int AS manufacturer_matched,
             count(*) FILTER (WHERE match_status='verified')::int AS verified_matches,
             count(*) FILTER (WHERE match_status='review_required')::int AS review_required
      FROM vitex_commerce_products
      WHERE active=true AND canonical_variant_id IS NOT NULL
    `),
    loadVitexRows(query, page),
    loadSelectedVitex(editId),
    db.query<SqlRow>(`
      SELECT count(*)::int AS total
      FROM vitex_commerce_products vcp
      JOIN canonical_variants cv ON cv.id=vcp.canonical_variant_id
      LEFT JOIN product_translations pt ON pt.canonical_variant_id=cv.id AND pt.locale='el'
      LEFT JOIN manufacturer_products mp ON mp.id=vcp.manufacturer_product_id
      WHERE vcp.active=true
        AND vcp.canonical_variant_id IS NOT NULL
        AND (
          $1=''
          OR COALESCE(pt.title,vcp.product_title) ILIKE '%'||$1||'%'
          OR COALESCE(mp.product_name,'') ILIKE '%'||$1||'%'
          OR cv.public_id ILIKE '%'||$1||'%'
        )
    `, [query])
  ]);

  const metrics = metricsResult.rows[0] ?? {} as MetricRow;
  const filteredTotal = asInt(filteredCountResult.rows[0]?.total);
  const hasPrevious = page > 1;
  const hasNext = page * PAGE_SIZE < filteredTotal;
  const qPart = query ? `&q=${encodeURIComponent(query)}` : "";

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel="VITEX catalogue" />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Admin · Canonical catalogue</div>
        <h1>VITEX products</h1>
        <p className="lead">Manage the public VITEX catalogue independently from vendor commercial assignments. Official technical facts remain separated from editable public catalogue copy.</p>
      </div>
    </section>

    <section className="shell vendor-section">
      <div className="admin-local-tabs">
        <Link href="/admin/catalogue">Catalogue overview</Link>
        <Link href="/admin/vendors">Vendors</Link>
      </div>
      <div className="workspace-metric-strip">
        <div><span>Canonical products</span><strong>{asInt(metrics.total)}</strong></div>
        <div><span>Manufacturer matched</span><strong>{asInt(metrics.manufacturer_matched)}</strong></div>
        <div><span>Verified commerce matches</span><strong>{asInt(metrics.verified_matches)}</strong></div>
        <div><span>Needs match review</span><strong>{asInt(metrics.review_required)}</strong></div>
      </div>
    </section>

    {selected ? <section className="shell vendor-section">
      <div className="workspace-section-heading">
        <div><div className="eyebrow">Public content editor</div><h2>{asText(selected.title)}</h2></div>
        <Link className="button button-secondary" href={`/admin/catalogue/vitex?page=${page}${qPart}`}>Close editor</Link>
      </div>
      <p>These fields control customer-visible catalogue copy. Editing them does not overwrite the manufacturer technical evidence used by Paint &amp; Build Studio.</p>
      <div className="catalogue-workflow-grid">
        <article className="catalogue-workflow-card">
          {selected.source_image_url ? <img
            src={asText(selected.source_image_url)}
            alt={asText(selected.title)}
            style={{ width: "100%", maxHeight: 280, objectFit: "contain", background: "#fff", borderRadius: 12 }}
            referrerPolicy="no-referrer"
          /> : <p>No product image is currently linked.</p>}
          <small>{asText(selected.manufacturer_product) || "Manufacturer record not matched"}</small>
          <strong>{euro(selected.price_minor)}</strong>
        </article>
        <form action={updatePublicContent} className="workspace-queue-card">
          <input type="hidden" name="csrfToken" value={principal.csrfToken} />
          <input type="hidden" name="canonicalId" value={asText(selected.canonical_id)} />
          <label><span>Public title</span><input name="title" defaultValue={asText(selected.title)} minLength={3} maxLength={240} required /></label>
          <label><span>Public description</span><textarea name="description" defaultValue={asText(selected.description)} rows={7} maxLength={12000} /></label>
          <label><span>SEO title</span><input name="seoTitle" defaultValue={asText(selected.seo_title)} maxLength={300} /></label>
          <label><span>SEO description</span><textarea name="seoDescription" defaultValue={asText(selected.seo_description)} rows={3} maxLength={600} /></label>
          <label><span>Product image URL</span><input name="imageUrl" type="url" defaultValue={asText(selected.source_image_url)} /></label>
          <label><span>Audit reason</span><input name="reason" defaultValue="Update VITEX public catalogue content" minLength={3} maxLength={500} required /></label>
          <button className="button" type="submit">Save public content</button>
        </form>
      </div>
    </section> : null}

    <section className="shell vendor-section">
      <div className="workspace-section-heading">
        <div><div className="eyebrow">297-product catalogue</div><h2>Products</h2></div>
        <span>{filteredTotal} results</span>
      </div>
      <form method="get" className="admin-directory-filters">
        <label><span>Find VITEX product</span><input name="q" defaultValue={query} placeholder="Public title, VITEX product name or canonical ID" /></label>
        <button className="button button-secondary" type="submit">Search</button>
      </form>

      <div className="admin-directory-table" role="table" aria-label="VITEX products">
        <div className="admin-directory-head" role="row">
          <span>Product</span><span>Reference price</span><span>Manufacturer match</span><span>Match state</span><span>Action</span>
        </div>
        {rows.map((item) => <div className="admin-directory-row" role="row" key={asText(item.canonical_id)}>
          <span><strong>{asText(item.title)}</strong><small>{asText(item.canonical_id)}</small></span>
          <span>{euro(item.price_minor)}</span>
          <span>{asText(item.manufacturer_product) || "—"}<small>{asText(item.manufacturer_verification)}</small></span>
          <span>{asText(item.match_status)}{item.match_confidence != null ? <small>{Math.round(Number(item.match_confidence) * 100)}%</small> : null}</span>
          <span><Link className="button button-secondary" href={`/admin/catalogue/vitex?edit=${encodeURIComponent(asText(item.canonical_id))}&page=${page}${qPart}`}>Edit public content</Link></span>
        </div>)}
      </div>

      <div className="workspace-action-bar">
        <span>Page {page}</span>
        <div>
          {hasPrevious ? <Link className="button button-secondary" href={`/admin/catalogue/vitex?page=${page - 1}${qPart}`}>← Previous</Link> : null}
          {hasNext ? <Link className="button button-secondary" href={`/admin/catalogue/vitex?page=${page + 1}${qPart}`}>Next →</Link> : null}
        </div>
      </div>
    </section>
  </main>;
}
