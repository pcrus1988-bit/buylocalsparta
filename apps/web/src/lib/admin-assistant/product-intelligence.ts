import "server-only";

import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { assertAdminPermission, postgresAdminRuntimeEnabled } from "../admin-runtime";
import { getProductionPostgresRuntime } from "../postgres-runtime";
import { prioritizeRecommendations, type RecommendationCandidate } from "./recommendations";
import type { AdminAssistantEvidence, AdminAssistantFinding, AdminAssistantSnapshot } from "./types";

export type AdminAssistantProductSearchResult = Readonly<{
  id: string;
  title: string;
  detail: string;
  href: string;
}>;

export type AdminAssistantProductState = Readonly<{
  id: string;
  slug: string;
  title?: string;
  description?: string;
  gtin?: string;
  brand?: string;
  model?: string;
  mpn?: string;
  categoryCode?: string;
  categoryName?: string;
  active: boolean;
  suppressed: boolean;
  recalled: boolean;
  identifiers: readonly Readonly<{ type: string; scope: string; value: string; primary: boolean }>[];
  offers: readonly Readonly<{
    id: string;
    vendorId: string;
    vendorName: string;
    status: string;
    priceMinor: number;
    merchantVisible: boolean;
    merchantPauseActive: boolean;
    onHand: number;
    activeReservations: number;
    safetyStock: number;
    blocked: number;
    inventoryUpdatedAt?: number;
    stockConfirmedAt?: number;
    freshnessTtlSeconds?: number;
    freshnessStatus?: string;
  }>[];
  sourceLinks: readonly Readonly<{ sourceName: string; sourceProductId: string; sourceProductKey?: string; confidence?: number; status: string }>[];
  unmappedAttributeCount: number;
  seo?: Readonly<{ id: string; route: string; desiredIndexable: boolean; desiredSitemap: boolean; active: boolean }>;
}>;

function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function optionalText(value: unknown): string | undefined { const valueText = text(value); return valueText || undefined; }
function integer(value: unknown): number { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0; }
function optionalInteger(value: unknown): number | undefined { if (value == null || value === "") return undefined; const parsed = Number(value); return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : undefined; }
function decimal(value: unknown): number | undefined { if (value == null) return undefined; const parsed = Number(value); return Number.isFinite(parsed) ? parsed : undefined; }
function epoch(value: unknown): number | undefined { if (!value) return undefined; const parsed = value instanceof Date ? value.getTime() : new Date(String(value)).getTime(); return Number.isFinite(parsed) ? parsed : undefined; }
function bool(value: unknown): boolean { return value === true || value === "true"; }

function uow() {
  return new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool, { statementTimeoutMs: 12_000, lockTimeoutMs: 2_000 });
}

export async function searchAdminProducts(principal: SessionPrincipal, rawQuery: string): Promise<readonly AdminAssistantProductSearchResult[]> {
  assertAdminPermission(principal, "catalog.read");
  if (!postgresAdminRuntimeEnabled()) return [];
  const query = rawQuery.trim().replace(/\s+/g, " ").slice(0, 200);
  if (query.length < 2) return [];
  const digits = query.replace(/\D/g, "");
  return uow().withTransaction(platformScope(principal.userId, "sparta"), async (tx) => {
    const rows = await tx.query<SqlRow>(`
      SELECT cv.public_id,
             COALESCE(NULLIF(el.title,''),NULLIF(en.title,''),cv.model,cv.mpn,cv.slug) AS title,
             cv.gtin,cv.model,cv.mpn,b.name AS brand,c.code AS category_code,
             seo.public_id AS seo_id,seo.route AS seo_route,
             CASE
               WHEN lower(cv.public_id)=lower($1) THEN 1000
               WHEN regexp_replace(COALESCE(cv.gtin,''),'\\D','','g')=$2 AND $2<>'' THEN 990
               WHEN lower(COALESCE(cv.model,''))=lower($1) OR lower(COALESCE(cv.mpn,''))=lower($1) THEN 960
               WHEN lower(COALESCE(el.title,en.title,''))=lower($1) THEN 940
               WHEN EXISTS (
                 SELECT 1 FROM public.product_identifiers pi
                 WHERE pi.canonical_variant_id=cv.id AND pi.active=true
                   AND lower(pi.normalized_value)=lower($1)
               ) THEN 930
               WHEN strpos(lower(COALESCE(el.title,en.title,'')),lower($1))>0 THEN 840
               WHEN strpos(lower(COALESCE(cv.model,'')),lower($1))>0
                 OR strpos(lower(COALESCE(cv.mpn,'')),lower($1))>0
                 OR strpos(lower(COALESCE(b.name,'')),lower($1))>0 THEN 800
               WHEN $2<>'' AND EXISTS (
                 SELECT 1 FROM public.product_identifiers pi
                 WHERE pi.canonical_variant_id=cv.id AND pi.active=true
                   AND strpos(regexp_replace(COALESCE(pi.normalized_value,''),'\\D','','g'),$2)>0
               ) THEN 780
               ELSE 0
             END AS match_score
      FROM public.canonical_variants cv
      LEFT JOIN public.product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
      LEFT JOIN public.product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
      LEFT JOIN public.brands b ON b.id=cv.brand_id
      LEFT JOIN public.categories c ON c.id=cv.category_id
      LEFT JOIN LATERAL (
        SELECT u.public_id,u.route
        FROM public.seo_urls u
        WHERE u.market_id=cv.market_id
          AND (u.source_key=cv.public_id OR u.source_key='product:'||cv.public_id)
        ORDER BY u.active DESC,u.last_seen_at DESC
        LIMIT 1
      ) seo ON true
      WHERE cv.market_id=nullif(current_setting('app.market_id',true),'')::uuid
      ORDER BY match_score DESC,title,cv.public_id
      LIMIT 40
    `, [query, digits]);
    return rows.rows
      .filter((row) => Number(row.match_score ?? 0) > 0)
      .slice(0, 12)
      .map((row) => {
        const id = text(row.public_id);
        const title = text(row.title) || id;
        const identifiers = [optionalText(row.brand), optionalText(row.model), optionalText(row.mpn), optionalText(row.gtin)].filter(Boolean).join(" · ");
        const seoId = optionalText(row.seo_id);
        return {
          id,
          title,
          detail: `${optionalText(row.category_code) ?? "uncategorized"}${identifiers ? ` · ${identifiers}` : ""}`,
          href: seoId ? `/admin/seo/pages/${encodeURIComponent(seoId)}` : `/admin/matching?q=${encodeURIComponent(id)}`
        };
      });
  }, { readOnly: true, statementTimeoutMs: 12_000 });
}

export async function getAdminAssistantProductState(principal: SessionPrincipal, requestedId: string): Promise<AdminAssistantProductState | undefined> {
  assertAdminPermission(principal, "catalog.read");
  if (!postgresAdminRuntimeEnabled()) return undefined;
  const id = requestedId.trim().slice(0, 200);
  if (!id) return undefined;
  return uow().withTransaction(platformScope(principal.userId, "sparta"), async (tx) => {
    const productResult = await tx.query<SqlRow>(`
      SELECT cv.id::text AS canonical_uuid,cv.public_id,cv.slug,cv.gtin,cv.model,cv.mpn,
             cv.active,cv.suppressed,cv.recalled,b.name AS brand,c.code AS category_code,
             COALESCE(NULLIF(ctel.name,''),NULLIF(cten.name,''),c.code) AS category_name,
             NULLIF(el.title,'') AS title,NULLIF(el.description,'') AS description,
             seo.public_id AS seo_id,seo.route AS seo_route,seo.desired_indexable,seo.desired_sitemap,seo.active AS seo_active
      FROM public.canonical_variants cv
      LEFT JOIN public.product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
      LEFT JOIN public.brands b ON b.id=cv.brand_id
      LEFT JOIN public.categories c ON c.id=cv.category_id
      LEFT JOIN public.category_translations ctel ON ctel.category_id=c.id AND ctel.locale='el'
      LEFT JOIN public.category_translations cten ON cten.category_id=c.id AND cten.locale='en'
      LEFT JOIN LATERAL (
        SELECT u.public_id,u.route,u.desired_indexable,u.desired_sitemap,u.active
        FROM public.seo_urls u
        WHERE u.market_id=cv.market_id
          AND (u.source_key=cv.public_id OR u.source_key='product:'||cv.public_id)
        ORDER BY u.active DESC,u.last_seen_at DESC
        LIMIT 1
      ) seo ON true
      WHERE cv.market_id=nullif(current_setting('app.market_id',true),'')::uuid
        AND (cv.public_id=$1 OR cv.id::text=$1)
      LIMIT 1
    `, [id]);
    const row = productResult.rows[0];
    if (!row) return undefined;
    const canonicalUuid = text(row.canonical_uuid);
    const [identifierResult, offerResult, sourceResult, unmappedResult] = await Promise.all([
      tx.query<SqlRow>(`
        SELECT identifier_type,identifier_scope,normalized_value,is_primary
        FROM public.product_identifiers
        WHERE canonical_variant_id=$1::uuid AND active=true
        ORDER BY is_primary DESC,created_at,id
        LIMIT 30
      `, [canonicalUuid]),
      tx.query<SqlRow>(`
        SELECT vo.public_id,vb.public_id AS vendor_id,vb.trading_name AS vendor_name,
               vo.status::text AS offer_status,vo.customer_price_minor,vo.merchant_visible,vo.merchant_pause_active,
               COALESCE(ib.on_hand,0)::integer AS on_hand,
               COALESCE(ib.active_reservations,0)::integer AS active_reservations,
               COALESCE(ib.safety_stock,0)::integer AS safety_stock,
               COALESCE(ib.blocked,0)::integer AS blocked,ib.updated_at AS inventory_updated_at,
               ib.stock_confirmed_at,ib.freshness_ttl_seconds,ib.freshness_status
        FROM public.vendor_offers vo
        JOIN public.vendor_businesses vb ON vb.id=vo.vendor_id
        LEFT JOIN public.inventory_balances ib ON ib.offer_id=vo.id
        WHERE vo.canonical_variant_id=$1::uuid
        ORDER BY CASE vo.status::text WHEN 'approved' THEN 0 WHEN 'draft' THEN 1 WHEN 'archived' THEN 2 ELSE 3 END,
                 vo.merchant_visible DESC,vo.updated_at DESC
        LIMIT 50
      `, [canonicalUuid]),
      tx.query<SqlRow>(`
        SELECT s.name AS source_name,csp.id::text AS source_product_id,csp.source_product_key,
               cspl.confidence,cspl.link_status::text AS link_status
        FROM public.catalog_source_product_links cspl
        JOIN public.catalog_source_products csp ON csp.id=cspl.source_product_id
        JOIN public.catalog_sources s ON s.id=csp.source_id
        WHERE cspl.canonical_variant_id=$1::uuid
        ORDER BY CASE cspl.link_status::text WHEN 'approved' THEN 0 ELSE 1 END,cspl.confidence DESC NULLS LAST,cspl.reviewed_at DESC NULLS LAST
        LIMIT 30
      `, [canonicalUuid]),
      tx.query<SqlRow>(`
        SELECT count(*)::integer AS total
        FROM public.catalog_source_product_links cspl
        JOIN public.catalog_source_attribute_observations a ON a.source_product_id=cspl.source_product_id
        WHERE cspl.canonical_variant_id=$1::uuid
          AND cspl.link_status='approved'
          AND a.mapping_status='unmapped'
          AND a.attribute_id IS NULL
      `, [canonicalUuid])
    ]);

    return {
      id: text(row.public_id),
      slug: text(row.slug),
      title: optionalText(row.title),
      description: optionalText(row.description),
      gtin: optionalText(row.gtin),
      brand: optionalText(row.brand),
      model: optionalText(row.model),
      mpn: optionalText(row.mpn),
      categoryCode: optionalText(row.category_code),
      categoryName: optionalText(row.category_name),
      active: bool(row.active),
      suppressed: bool(row.suppressed),
      recalled: bool(row.recalled),
      identifiers: identifierResult.rows.map((item) => ({
        type: text(item.identifier_type),
        scope: text(item.identifier_scope),
        value: text(item.normalized_value),
        primary: bool(item.is_primary)
      })),
      offers: offerResult.rows.map((item) => ({
        id: text(item.public_id),
        vendorId: text(item.vendor_id),
        vendorName: text(item.vendor_name),
        status: text(item.offer_status),
        priceMinor: integer(item.customer_price_minor),
        merchantVisible: bool(item.merchant_visible),
        merchantPauseActive: bool(item.merchant_pause_active),
        onHand: integer(item.on_hand),
        activeReservations: integer(item.active_reservations),
        safetyStock: integer(item.safety_stock),
        blocked: integer(item.blocked),
        inventoryUpdatedAt: epoch(item.inventory_updated_at),
        stockConfirmedAt: epoch(item.stock_confirmed_at),
        freshnessTtlSeconds: optionalInteger(item.freshness_ttl_seconds),
        freshnessStatus: optionalText(item.freshness_status)
      })),
      sourceLinks: sourceResult.rows.map((item) => ({
        sourceName: text(item.source_name),
        sourceProductId: text(item.source_product_id),
        sourceProductKey: optionalText(item.source_product_key),
        confidence: decimal(item.confidence),
        status: text(item.link_status)
      })),
      unmappedAttributeCount: integer(unmappedResult.rows[0]?.total),
      seo: optionalText(row.seo_id) ? {
        id: text(row.seo_id),
        route: text(row.seo_route),
        desiredIndexable: bool(row.desired_indexable),
        desiredSitemap: bool(row.desired_sitemap),
        active: bool(row.seo_active)
      } : undefined
    };
  }, { readOnly: true, statementTimeoutMs: 12_000 });
}

export async function productOperationalIntelligence(
  principal: SessionPrincipal,
  base: AdminAssistantSnapshot,
  productId: string
): Promise<AdminAssistantSnapshot> {
  const product = await getAdminAssistantProductState(principal, productId).catch(() => undefined);
  if (!product) return base;
  const evidence: AdminAssistantEvidence[] = [...(base.evidence ?? [])];
  const findings: AdminAssistantFinding[] = [];
  const candidates: RecommendationCandidate[] = [];
  const add = (finding: AdminAssistantFinding, dimensions: RecommendationCandidate["dimensions"]) => { findings.push(finding); candidates.push({ finding, dimensions }); };
  const approvedOffers = product.offers.filter((offer) => offer.status === "approved");
  const visibleOffers = approvedOffers.filter((offer) => offer.merchantVisible && !offer.merchantPauseActive);
  const staleVisibleOffers = visibleOffers.filter((offer) => offer.freshnessStatus === "stale" || offer.freshnessStatus === "expired");
  const sellableStock = visibleOffers.reduce((sum, offer) => sum + Math.max(0, offer.onHand - offer.activeReservations - offer.safetyStock - offer.blocked), 0);

  evidence.push(
    { id: "product:identity", kind: "kontamou", label: "Canonical identity", detail: `${product.id} · ${product.title ?? "missing Greek title"} · ${product.categoryName ?? product.categoryCode ?? "no category"}.`, metric: product.id, sourceTool: "getProductIntelligence" },
    { id: "product:offers", kind: "kontamou", label: "Vendor offers", detail: `${product.offers.length} offer(s), ${approvedOffers.length} approved, ${visibleOffers.length} merchant-visible; sellable stock estimate ${sellableStock}; ${staleVisibleOffers.length} visible offer(s) have stale/expired inventory freshness.`, metric: product.offers.length, sourceTool: "getProductIntelligence" },
    { id: "product:sources", kind: "kontamou", label: "Source evidence", detail: `${product.sourceLinks.length} source link(s); ${product.unmappedAttributeCount} unresolved attribute observation(s) remain on approved linked source evidence.`, metric: product.unmappedAttributeCount, sourceTool: "getProductIntelligence" }
  );

  if (!product.title) add({ id: "product-missing-greek-title", ruleId: "product_missing_greek_title", severity: "critical", category: "data_quality", title: "Canonical product has no Greek title", detail: "The canonical product exists without a Greek title, so customer-facing and SEO presentation cannot be treated as complete.", evidence: ["greekTitle = missing"], evidenceIds: ["product:identity"], recommendation: "Add governed Greek title evidence before treating the product as publication-ready.", href: product.seo ? `/admin/seo/pages/${encodeURIComponent(product.seo.id)}` : "/admin/catalogue", affectedCount: 1, confidence: "high" }, { dataQualityImpact: 10, customerImpact: 9, seoImpact: 9, urgency: 9, effort: 3 });
  if (!product.description) add({ id: "product-missing-greek-description", ruleId: "product_missing_greek_description", severity: "warning", category: "data_quality", title: "Canonical product has no Greek description", detail: "The Greek product description is empty even though the canonical identity exists.", evidence: ["greekDescription = missing"], evidenceIds: ["product:identity"], recommendation: "Enrich the Greek description from governed source/manufacturer evidence before SEO/content expansion.", href: product.seo ? `/admin/seo/pages/${encodeURIComponent(product.seo.id)}` : "/admin/catalogue", affectedCount: 1, confidence: "high" }, { dataQualityImpact: 8, customerImpact: 7, seoImpact: 8, urgency: 6, effort: 4 });
  if (product.unmappedAttributeCount > 0) add({ id: "product-unmapped-attributes", ruleId: "product_unmapped_attributes", severity: "warning", category: "data_quality", title: `${product.unmappedAttributeCount} linked source attribute observation(s) remain unmapped`, detail: "Approved source evidence for this canonical still contains unresolved attribute semantics.", evidence: [`unmappedAttributeCount = ${product.unmappedAttributeCount}`], evidenceIds: ["product:sources"], recommendation: "Open Attribute Mapping and prioritize the source contexts affecting this canonical before manually copying values into the product.", href: "/admin/catalogue-intake/attributes", affectedCount: product.unmappedAttributeCount, confidence: "high" }, { dataQualityImpact: 9, customerImpact: 5, seoImpact: 5, urgency: 6, effort: 5 });
  if (!approvedOffers.length) add({ id: "product-no-approved-offers", ruleId: "product_no_approved_vendor_offer", severity: "warning", category: "catalog", title: "Canonical product has no approved vendor offer", detail: "The product identity may be valid, but there is no approved commercial vendor offer attached to it.", evidence: [`offerCount = ${product.offers.length}`, "approvedOffers = 0"], evidenceIds: ["product:offers"], recommendation: "Use vendor catalogue assignment/Quick Add only after confirming the correct local partner and commercial evidence.", href: "/admin/partners", affectedCount: 1, confidence: "high" }, { vendorImpact: 8, customerImpact: 7, urgency: 5, effort: 5 });
  else if (visibleOffers.length && sellableStock <= 0) add({ id: "product-visible-without-sellable-stock", ruleId: "product_visible_without_sellable_stock", severity: "warning", category: "catalog", title: "Visible approved offers have no sellable stock", detail: "At least one approved offer is merchant-visible, but on-hand stock minus reservations, safety stock and blocked quantity is not positive.", evidence: [`visibleApprovedOffers = ${visibleOffers.length}`, `sellableStock = ${sellableStock}`], evidenceIds: ["product:offers"], recommendation: "Confirm current vendor stock before treating this product as commercially available.", href: "/admin/partners", affectedCount: visibleOffers.length, confidence: "high" }, { customerImpact: 9, vendorImpact: 7, urgency: 8, effort: 3 });
  if (staleVisibleOffers.length) add({ id: "product-stale-inventory", ruleId: "inventory_stale", severity: "warning", category: "catalog", title: `${staleVisibleOffers.length} visible approved offer(s) have stale inventory`, detail: "KONTA MOY inventory freshness policy marks these merchant-visible offers as stale or expired. The assistant does not invent its own age threshold.", evidence: staleVisibleOffers.slice(0, 5).map((offer) => `${offer.vendorName}: freshness=${offer.freshnessStatus ?? "unknown"}, confirmedAt=${offer.stockConfirmedAt ?? "missing"}, ttlSeconds=${offer.freshnessTtlSeconds ?? "default"}`), evidenceIds: ["product:offers"], recommendation: "Ask the affected partner(s) to reconfirm physical stock before relying on storefront availability.", href: "/admin/partners", affectedCount: staleVisibleOffers.length, confidence: "high" }, { customerImpact: 9, vendorImpact: 8, dataQualityImpact: 8, urgency: 8, effort: 3 });
  if (product.active && (product.suppressed || product.recalled)) add({ id: "product-active-safety-suppression", ruleId: "product_active_but_suppressed", severity: "critical", category: "compliance", title: product.recalled ? "Product is active but recalled" : "Product is active but suppressed", detail: "Canonical active state does not override suppression/recall. Commerce and publication must continue to respect the safety/governance hold.", evidence: [`active = ${product.active}`, `suppressed = ${product.suppressed}`, `recalled = ${product.recalled}`], evidenceIds: ["product:identity"], recommendation: "Investigate the existing safety/governance hold; do not reactivate publication by changing offer state.", href: "/admin/catalogue", affectedCount: 1, confidence: "high" }, { complianceRisk: 10, customerImpact: 10, urgency: 10, effort: 5 });
  if (product.seo && product.seo.desiredIndexable && (!product.active || product.suppressed || product.recalled || !product.title)) add({ id: "product-seo-indexability-contradiction", ruleId: "seo_non_indexable_product", severity: "warning", category: "seo", title: "SEO intent conflicts with current product readiness", detail: "The SEO registry currently desires indexability while the canonical product has a publication/readiness blocker.", evidence: [`desiredIndexable = ${product.seo.desiredIndexable}`, `active = ${product.active}`, `suppressed = ${product.suppressed}`, `recalled = ${product.recalled}`, `greekTitle = ${product.title ? "present" : "missing"}`], evidenceIds: ["product:identity"], recommendation: "Review the SEO page evidence and product quality gate together before changing index policy.", href: `/admin/seo/pages/${encodeURIComponent(product.seo.id)}`, affectedCount: 1, confidence: "high" }, { seoImpact: 9, dataQualityImpact: 7, urgency: 7, effort: 4 });

  const recommendations = prioritizeRecommendations(candidates, 5);
  const rank = { critical: 0, warning: 1, opportunity: 2, info: 3 } as const;
  const byId = new Map<string, AdminAssistantFinding>();
  for (const item of [...findings, ...base.findings]) if (!byId.has(item.id)) byId.set(item.id, item);
  return {
    ...base,
    summary: `${product.title ?? product.id}: ${approvedOffers.length} approved offer(s), ${visibleOffers.length} visible, sellable stock ${sellableStock}; ${product.unmappedAttributeCount} unresolved linked attribute observation(s); ${staleVisibleOffers.length} stale/expired visible inventory record(s). ${findings.length ? `${findings.length} deterministic product issue(s) need attention.` : "No high-signal product contradiction crossed the current checks."}`,
    facts: [
      `Canonical: ${product.id} · ${product.categoryName ?? product.categoryCode ?? "uncategorized"}.`,
      `Identity: GTIN ${product.gtin ?? "missing"} · brand ${product.brand ?? "missing"} · model ${product.model ?? "missing"}.`,
      `Commerce: ${approvedOffers.length} approved offer(s) · ${visibleOffers.length} visible · sellable stock ${sellableStock}.`,
      `Inventory freshness: ${staleVisibleOffers.length} visible offer(s) stale/expired according to persisted freshness state.`,
      `Source evidence: ${product.sourceLinks.length} link(s) · ${product.unmappedAttributeCount} unmapped observation(s).`,
      `SEO: ${product.seo ? `${product.seo.route} · desired index=${product.seo.desiredIndexable}` : "no registry record resolved"}.`
    ],
    evidence,
    findings: [...byId.values()].sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, 8),
    recommendations: [...recommendations, ...(base.recommendations ?? []).filter((existing) => !recommendations.some((item) => item.id === existing.id))].slice(0, 5)
  };
}
