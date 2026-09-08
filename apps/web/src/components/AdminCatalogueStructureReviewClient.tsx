"use client";

import Link from "next/link";
import { useState } from "react";
import type {
  CatalogueStructureReviewAttributesPage,
  CatalogueStructureReviewProductsPage,
  CatalogueStructureReviewProductScope,
  CatalogueStructureReviewSummary
} from "../lib/admin-catalogue-structure-review-runtime";

const PAGE_SIZE = 50;

type ProductsState = Readonly<{
  status: "idle" | "loading" | "ready" | "error";
  data?: CatalogueStructureReviewProductsPage;
  error?: string;
}>;

type AttributesState = Readonly<{
  status: "idle" | "loading" | "ready" | "error";
  data?: CatalogueStructureReviewAttributesPage;
  error?: string;
}>;

async function responseJson<T>(response: Response): Promise<T> {
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "Admin review query failed");
  return payload;
}

function compactValue(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") return value.length > 90 ? `${value.slice(0, 87)}…` : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    const serialized = JSON.stringify(value);
    return serialized.length > 90 ? `${serialized.slice(0, 87)}…` : serialized;
  } catch {
    return String(value);
  }
}

function scopeLabel(scope: CatalogueStructureReviewProductScope): string {
  if (scope === "unclassified") return "Without approved category";
  if (scope === "attributes") return "Products with unmapped attributes";
  return "Not linked to canonical catalogue";
}

function scopeCount(summary: CatalogueStructureReviewSummary, scope: CatalogueStructureReviewProductScope): number {
  if (scope === "unclassified") return summary.unclassifiedProducts;
  if (scope === "attributes") return summary.productsWithUnmappedAttributes;
  return summary.unlinkedProducts;
}

export function AdminCatalogueStructureReviewClient({ summary }: Readonly<{ summary: CatalogueStructureReviewSummary }>) {
  const [productsOpen, setProductsOpen] = useState(false);
  const [attributesOpen, setAttributesOpen] = useState(false);
  const [productScope, setProductScope] = useState<CatalogueStructureReviewProductScope>("unlinked");
  const [productQuery, setProductQuery] = useState("");
  const [attributeQuery, setAttributeQuery] = useState("");
  const [productsState, setProductsState] = useState<ProductsState>({ status: "idle" });
  const [attributesState, setAttributesState] = useState<AttributesState>({ status: "idle" });

  async function loadProducts(scope: CatalogueStructureReviewProductScope, offset = 0, q = productQuery) {
    if (offset === 0) setProductsState({ status: "loading" });
    try {
      const params = new URLSearchParams({ review: "products", scope, offset: String(offset), limit: String(PAGE_SIZE) });
      if (q.trim()) params.set("q", q.trim());
      const response = await fetch(`/api/admin/catalogue/structure?${params.toString()}`, { cache: "no-store" });
      const payload = await responseJson<CatalogueStructureReviewProductsPage>(response);
      setProductsState((current) => {
        if (offset === 0 || !current.data || current.data.scope !== scope) return { status: "ready", data: payload };
        return {
          status: "ready",
          data: {
            ...payload,
            products: [...current.data.products, ...payload.products],
            offset: 0
          }
        };
      });
    } catch (error) {
      setProductsState({ status: "error", error: error instanceof Error ? error.message : "Could not load review products" });
    }
  }

  async function loadAttributes(offset = 0, q = attributeQuery) {
    if (offset === 0) setAttributesState({ status: "loading" });
    try {
      const params = new URLSearchParams({ review: "attributes", offset: String(offset), limit: String(PAGE_SIZE) });
      if (q.trim()) params.set("q", q.trim());
      const response = await fetch(`/api/admin/catalogue/structure?${params.toString()}`, { cache: "no-store" });
      const payload = await responseJson<CatalogueStructureReviewAttributesPage>(response);
      setAttributesState((current) => {
        if (offset === 0 || !current.data) return { status: "ready", data: payload };
        return {
          status: "ready",
          data: {
            ...payload,
            attributes: [...current.data.attributes, ...payload.attributes],
            offset: 0
          }
        };
      });
    } catch (error) {
      setAttributesState({ status: "error", error: error instanceof Error ? error.message : "Could not load unmapped attributes" });
    }
  }

  function toggleProducts() {
    const next = !productsOpen;
    setProductsOpen(next);
    if (next && productsState.status === "idle") void loadProducts(productScope);
  }

  function toggleAttributes() {
    const next = !attributesOpen;
    setAttributesOpen(next);
    if (next && attributesState.status === "idle") void loadAttributes();
  }

  function chooseProductScope(scope: CatalogueStructureReviewProductScope) {
    setProductScope(scope);
    setProductsOpen(true);
    void loadProducts(scope, 0, productQuery);
  }

  const productData = productsState.data;
  const attributeData = attributesState.data;

  return <section className="structure-review-zone" aria-labelledby="structure-review-title">
    <div className="structure-review-heading">
      <div>
        <div className="eyebrow">System buckets · outside the mapped tree</div>
        <h2 id="structure-review-title">UNMAPPED / NEEDS REVIEW</h2>
        <p>These records are intentionally visible before they are correctly mapped. Counts use the latest snapshot from each supplier/source, so older imports do not inflate the review queue.</p>
      </div>
      <Link className="button button-secondary" href="/admin/catalogue-intake/attributes">Open full Attribute Review Centre</Link>
    </div>

    <div className="structure-review-cards">
      <div className="structure-review-card is-neutral">
        <span>Current source intake</span>
        <strong>{summary.currentSourceProducts.toLocaleString("el-GR")}</strong>
        <small>products in latest source snapshots</small>
      </div>
      <button className="structure-review-card is-attention" type="button" aria-expanded={productsOpen && productScope === "unlinked"} onClick={() => chooseProductScope("unlinked")}>
        <span>Unmapped products</span>
        <strong>{summary.unlinkedProducts.toLocaleString("el-GR")}</strong>
        <small>not represented by an approved canonical link</small>
      </button>
      <button className="structure-review-card is-attention" type="button" aria-expanded={productsOpen && productScope === "unclassified"} onClick={() => chooseProductScope("unclassified")}>
        <span>Unclassified products</span>
        <strong>{summary.unclassifiedProducts.toLocaleString("el-GR")}</strong>
        <small>without an approved category mapping</small>
      </button>
      <button className="structure-review-card is-attention" type="button" aria-expanded={attributesOpen} onClick={toggleAttributes}>
        <span>Unmapped attributes</span>
        <strong>{summary.unmappedAttributeObservations.toLocaleString("el-GR")}</strong>
        <small>{summary.unmappedAttributeKeys.toLocaleString("el-GR")} source keys · {summary.productsWithUnmappedAttributes.toLocaleString("el-GR")} products</small>
      </button>
      <Link className="structure-review-card is-review" href="/admin/catalogue-intake/attributes?stage=review">
        <span>Already under review</span>
        <strong>{summary.reviewRequiredAttributeObservations.toLocaleString("el-GR")}</strong>
        <small>mapped meanings still needing value/unit decisions</small>
      </Link>
    </div>

    {productsOpen && <div className="structure-review-drawer">
      <div className="structure-review-drawer-head">
        <div>
          <h3>Products needing catalogue mapping</h3>
          <p>{scopeLabel(productScope)}. Open any source product to inspect its evidence and continue mapping in the existing intake workflow.</p>
        </div>
        <button className="button button-secondary" type="button" onClick={toggleProducts}>Close</button>
      </div>

      <div className="structure-review-tabs" role="tablist" aria-label="Product review scope">
        {(["unlinked", "unclassified", "attributes"] as const).map((scope) => <button
          key={scope}
          type="button"
          role="tab"
          aria-selected={productScope === scope}
          className={productScope === scope ? "is-selected" : ""}
          onClick={() => chooseProductScope(scope)}
        >{scopeLabel(scope)} <b>{scopeCount(summary, scope).toLocaleString("el-GR")}</b></button>)}
      </div>

      <form className="structure-review-search" onSubmit={(event) => { event.preventDefault(); void loadProducts(productScope, 0, productQuery); }}>
        <label><span>Search current intake products</span><input type="search" value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder="Title, supplier code, brand, model or source key…" /></label>
        <button className="button button-secondary" type="submit">Search</button>
      </form>

      {productsState.status === "loading" && <div className="structure-loading" role="status">Loading current source products…</div>}
      {productsState.status === "error" && <div className="structure-error" role="alert"><span>{productsState.error}</span><button className="button button-secondary" type="button" onClick={() => void loadProducts(productScope)}>Retry</button></div>}
      {productsState.status === "ready" && productData && <>
        <div className="structure-review-result-head"><strong>{productData.total.toLocaleString("el-GR")}</strong><span>matching current source products</span></div>
        {productData.products.length === 0 ? <div className="structure-empty">No products match this review scope/search.</div> : <div className="structure-review-product-list">
          {productData.products.map((product) => {
            const intakeParams = new URLSearchParams({ snapshot: product.snapshotId, product: product.id });
            const intelligenceParams = new URLSearchParams({ source: product.sourceId, kind: "category_new" });
            return <article className="structure-review-product" key={product.id}>
              <div className="structure-review-product-main">
                <div><strong>{product.title}</strong><small>{product.sourceName} · {product.sourceProductKey}{product.supplierCode ? ` · ${product.supplierCode}` : ""}</small></div>
                <div className="structure-review-badges">
                  <span className={product.hasApprovedCanonicalLink ? "is-ok" : "is-attention"}>{product.hasApprovedCanonicalLink ? "Canonical linked" : "No canonical link"}</span>
                  <span className={product.approvedCategoryCode ? "is-ok" : "is-attention"}>{product.approvedCategoryCode ?? "No approved category"}</span>
                  {product.unmappedAttributes > 0 && <span className="is-attention">{product.unmappedAttributes} unmapped attrs</span>}
                </div>
              </div>
              <div className="structure-review-product-meta">
                <span><b>Taxonomy</b>{product.taxonomyPath.join(" › ") || "—"}</span>
                <span><b>Brand / model</b>{[product.brand, product.model].filter(Boolean).join(" · ") || "—"}</span>
                <span><b>Intake state</b>{product.priceState} · {product.classificationStatus}</span>
              </div>
              <div className="structure-inline-actions">
                <Link className="button button-primary" href={`/admin/catalogue-intake?${intakeParams.toString()}`}>Open intake product</Link>
                {!product.approvedCategoryCode && <Link className="button button-secondary" href={`/admin/catalogue-intake/intelligence?${intelligenceParams.toString()}`}>Review taxonomy</Link>}
                {product.sourceUrl && <a className="button button-secondary" href={product.sourceUrl} target="_blank" rel="noreferrer">Source page</a>}
              </div>
            </article>;
          })}
        </div>}
        {productData.hasMore && <div className="structure-load-more"><button className="button button-secondary" type="button" onClick={() => void loadProducts(productScope, productData.products.length, productQuery)}>Load 50 more products</button></div>}
      </>}
    </div>}

    {attributesOpen && <div className="structure-review-drawer">
      <div className="structure-review-drawer-head">
        <div>
          <h3>Unmapped source attributes</h3>
          <p>Grouped by source + raw attribute key across the current snapshots. These are visible here even though they do not yet belong to a governed category/Product Type attribute.</p>
        </div>
        <button className="button button-secondary" type="button" onClick={toggleAttributes}>Close</button>
      </div>

      <form className="structure-review-search" onSubmit={(event) => { event.preventDefault(); void loadAttributes(0, attributeQuery); }}>
        <label><span>Search unmapped attributes</span><input type="search" value={attributeQuery} onChange={(event) => setAttributeQuery(event.target.value)} placeholder="Raw attribute key or source…" /></label>
        <button className="button button-secondary" type="submit">Search</button>
      </form>

      {attributesState.status === "loading" && <div className="structure-loading" role="status">Loading unmapped attribute groups…</div>}
      {attributesState.status === "error" && <div className="structure-error" role="alert"><span>{attributesState.error}</span><button className="button button-secondary" type="button" onClick={() => void loadAttributes()}>Retry</button></div>}
      {attributesState.status === "ready" && attributeData && <>
        <div className="structure-review-result-head"><strong>{attributeData.total.toLocaleString("el-GR")}</strong><span>unmapped source-key groups</span></div>
        {attributeData.attributes.length === 0 ? <div className="structure-empty">No unmapped attributes match this search.</div> : <div className="structure-attribute-list">
          {attributeData.attributes.map((attribute) => {
            const reviewParams = new URLSearchParams({ snapshot: attribute.snapshotId, stage: "unmapped" });
            const representative = attribute.samples[0];
            const productParams = representative ? new URLSearchParams({ snapshot: attribute.snapshotId, product: representative.productId }) : undefined;
            return <details className="structure-attribute" key={`${attribute.sourceId}:${attribute.sourceAttributeKey}`}>
              <summary>
                <span className="structure-attribute-title"><strong>{attribute.sourceAttributeKey}</strong><small>{attribute.sourceName} · raw/unmapped</small></span>
                <span className="structure-attribute-count"><strong>{attribute.observationCount.toLocaleString("el-GR")}</strong><small>observations</small></span>
                <span className="structure-attribute-flags"><i>{attribute.productCount.toLocaleString("el-GR")} products</i><i>{attribute.contextCount.toLocaleString("el-GR")} contexts</i></span>
              </summary>
              <div className="structure-attribute-body">
                <div className="structure-attribute-meta">
                  <span><b>Source</b>{attribute.sourceName}</span>
                  <span><b>Units seen</b>{attribute.sourceUnits.join(" · ") || "—"}</span>
                  <span><b>Products</b>{attribute.productCount.toLocaleString("el-GR")}</span>
                  <span><b>Taxonomy contexts</b>{attribute.contextCount.toLocaleString("el-GR")}</span>
                </div>
                {attribute.samples.length > 0 && <div className="structure-attribute-products"><b>Sample evidence</b>{attribute.samples.map((sample) => <span key={sample.productId}>{sample.title}<small>{compactValue(sample.rawValue)}</small></span>)}</div>}
                <div className="structure-inline-actions">
                  <Link className="button button-primary" href={`/admin/catalogue-intake/attributes?${reviewParams.toString()}`}>Open attribute review</Link>
                  {productParams && <Link className="button button-secondary" href={`/admin/catalogue-intake?${productParams.toString()}`}>Open representative product</Link>}
                </div>
              </div>
            </details>;
          })}
        </div>}
        {attributeData.hasMore && <div className="structure-load-more"><button className="button button-secondary" type="button" onClick={() => void loadAttributes(attributeData.attributes.length, attributeQuery)}>Load 50 more attributes</button></div>}
      </>}
    </div>}
  </section>;
}
