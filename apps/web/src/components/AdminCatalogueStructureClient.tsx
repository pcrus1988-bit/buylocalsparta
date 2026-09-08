"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type {
  CatalogueStructureAttribute,
  CatalogueStructureCategory,
  CatalogueStructureCategoryDetails,
  CatalogueStructureWorkspace
} from "../lib/admin-catalogue-structure-runtime";

const TAXONOMY_ROLES = ["department", "navigation_group", "category", "subcategory", "product_class", "merchant_legacy"] as const;
const ATTRIBUTE_DATA_TYPES = ["boolean", "dimension", "enum", "multienum", "number", "text"] as const;
const ATTRIBUTE_VALUE_MODES = ["controlled", "free"] as const;
const PRODUCT_PAGE_SIZE = 50;

type DetailState = Readonly<{
  status: "loading" | "ready" | "error";
  data?: CatalogueStructureCategoryDetails;
  error?: string;
}>;

type SaveState = Readonly<{
  status: "saving" | "saved" | "error";
  message?: string;
}>;

function roleLabel(role: string): string {
  switch (role) {
    case "department": return "Τμήμα";
    case "navigation_group": return "Ομάδα πλοήγησης";
    case "category": return "Κατηγορία";
    case "subcategory": return "Υποκατηγορία";
    case "product_class": return "Κλάση προϊόντος";
    case "merchant_legacy": return "Legacy κατηγορία";
    default: return role;
  }
}

function sourceLabel(source: string): string {
  switch (source) {
    case "category": return "Category rule";
    case "product_type": return "Product Type";
    case "observed": return "Present on products";
    default: return source;
  }
}

function statusLabel(category: CatalogueStructureCategory): string {
  if (!category.active) return "Inactive";
  if (!category.discoverable) return "Hidden";
  return "Active";
}

async function responseJson<T>(response: Response): Promise<T> {
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "Admin action failed");
  return payload;
}

export function AdminCatalogueStructureClient({ workspace }: Readonly<{ workspace: CatalogueStructureWorkspace }>) {
  const router = useRouter();
  const [categories, setCategories] = useState<readonly CatalogueStructureCategory[]>(workspace.categories);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [details, setDetails] = useState<Readonly<Record<string, DetailState>>>({});
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editingAttribute, setEditingAttribute] = useState<string | null>(null);
  const [saveStates, setSaveStates] = useState<Readonly<Record<string, SaveState>>>({});
  const [query, setQuery] = useState("");

  useEffect(() => {
    setCategories(workspace.categories);
  }, [workspace.categories]);

  const byCode = useMemo(() => new Map(categories.map((category) => [category.categoryCode, category] as const)), [categories]);
  const children = useMemo(() => {
    const result = new Map<string | undefined, CatalogueStructureCategory[]>();
    for (const category of categories) {
      const bucket = result.get(category.parentCategoryCode) ?? [];
      bucket.push(category);
      result.set(category.parentCategoryCode, bucket);
    }
    for (const bucket of result.values()) {
      bucket.sort((a, b) => a.sortOrder - b.sortOrder || a.labelEl.localeCompare(b.labelEl, "el", { sensitivity: "base" }));
    }
    return result;
  }, [categories]);

  const visibleCodes = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("el");
    if (!needle) return undefined;
    const visible = new Set<string>();
    for (const category of categories) {
      const haystack = `${category.labelEl} ${category.categoryCode} ${category.pathLabels.join(" ")} ${roleLabel(category.taxonomyRole)}`.toLocaleLowerCase("el");
      if (!haystack.includes(needle)) continue;
      let cursor: CatalogueStructureCategory | undefined = category;
      const seen = new Set<string>();
      while (cursor && !seen.has(cursor.categoryCode)) {
        seen.add(cursor.categoryCode);
        visible.add(cursor.categoryCode);
        cursor = cursor.parentCategoryCode ? byCode.get(cursor.parentCategoryCode) : undefined;
      }
    }
    return visible;
  }, [byCode, categories, query]);

  async function loadDetails(categoryCode: string, offset = 0) {
    const existing = details[categoryCode];
    if (offset === 0 && (existing?.status === "loading" || existing?.status === "ready")) return;
    if (offset === 0) setDetails((current) => ({ ...current, [categoryCode]: { status: "loading" } }));
    try {
      const response = await fetch(`/api/admin/catalogue/structure?category=${encodeURIComponent(categoryCode)}&offset=${offset}&limit=${PRODUCT_PAGE_SIZE}`, {
        method: "GET",
        cache: "no-store"
      });
      const payload = await responseJson<CatalogueStructureCategoryDetails>(response);
      setDetails((current) => {
        if (offset === 0 || !current[categoryCode]?.data) return { ...current, [categoryCode]: { status: "ready", data: payload } };
        const previous = current[categoryCode].data!;
        return {
          ...current,
          [categoryCode]: {
            status: "ready",
            data: {
              ...payload,
              attributes: previous.attributes,
              productTypes: previous.productTypes,
              products: [...previous.products, ...payload.products],
              offset: 0
            }
          }
        };
      });
    } catch (error) {
      setDetails((current) => ({ ...current, [categoryCode]: { status: "error", error: error instanceof Error ? error.message : "Could not load category details" } }));
    }
  }

  function toggleCategory(categoryCode: string) {
    const isExpanded = expanded.has(categoryCode);
    setExpanded((current) => {
      const next = new Set(current);
      if (isExpanded) next.delete(categoryCode); else next.add(categoryCode);
      return next;
    });
    if (!isExpanded) void loadDetails(categoryCode);
  }

  async function patch(body: Record<string, unknown>) {
    const response = await fetch("/api/admin/catalogue/structure", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": workspace.csrfToken
      },
      body: JSON.stringify(body)
    });
    return responseJson<{ kind: string; updated: Record<string, unknown> }>(response);
  }

  async function saveCategory(event: React.FormEvent<HTMLFormElement>, category: CatalogueStructureCategory) {
    event.preventDefault();
    const key = `category:${category.categoryCode}`;
    setSaveStates((current) => ({ ...current, [key]: { status: "saving" } }));
    const form = new FormData(event.currentTarget);
    const body = {
      kind: "category",
      categoryCode: category.categoryCode,
      labelEl: String(form.get("labelEl") ?? ""),
      parentCategoryCode: String(form.get("parentCategoryCode") ?? ""),
      taxonomyRole: String(form.get("taxonomyRole") ?? ""),
      assignable: form.get("assignable") === "on",
      discoverable: form.get("discoverable") === "on",
      active: form.get("active") === "on",
      sortOrder: Number(form.get("sortOrder") ?? 0)
    };
    try {
      const result = await patch(body);
      const updated = result.updated;
      setCategories((current) => current.map((item) => item.categoryCode === category.categoryCode ? {
        ...item,
        labelEl: String(updated.labelEl ?? item.labelEl),
        parentCategoryCode: typeof updated.parentCategoryCode === "string" && updated.parentCategoryCode ? updated.parentCategoryCode : undefined,
        taxonomyRole: String(updated.taxonomyRole ?? item.taxonomyRole),
        assignable: Boolean(updated.assignable),
        discoverable: Boolean(updated.discoverable),
        active: Boolean(updated.active),
        sortOrder: Number(updated.sortOrder ?? item.sortOrder)
      } : item));
      setSaveStates((current) => ({ ...current, [key]: { status: "saved", message: "Saved · effective now" } }));
      setEditingCategory(null);
      router.refresh();
    } catch (error) {
      setSaveStates((current) => ({ ...current, [key]: { status: "error", message: error instanceof Error ? error.message : "Save failed" } }));
    }
  }

  async function saveAttribute(event: React.FormEvent<HTMLFormElement>, categoryCode: string, attribute: CatalogueStructureAttribute) {
    event.preventDefault();
    const key = `attribute:${attribute.code}`;
    setSaveStates((current) => ({ ...current, [key]: { status: "saving" } }));
    const form = new FormData(event.currentTarget);
    const body = {
      kind: "attribute",
      code: attribute.code,
      labelEl: String(form.get("labelEl") ?? ""),
      dataType: String(form.get("dataType") ?? ""),
      unit: String(form.get("unit") ?? ""),
      valueMode: String(form.get("valueMode") ?? ""),
      groupCode: String(form.get("groupCode") ?? ""),
      active: form.get("active") === "on",
      filterable: form.get("filterable") === "on",
      variantIdentity: form.get("variantIdentity") === "on"
    };
    try {
      const result = await patch(body);
      const updated = result.updated;
      setDetails((current) => {
        const state = current[categoryCode];
        if (!state?.data) return current;
        return {
          ...current,
          [categoryCode]: {
            ...state,
            data: {
              ...state.data,
              attributes: state.data.attributes.map((item) => item.code === attribute.code ? {
                ...item,
                labelEl: String(updated.labelEl ?? item.labelEl),
                dataType: String(updated.dataType ?? item.dataType),
                unit: typeof updated.unit === "string" && updated.unit ? updated.unit : undefined,
                valueMode: String(updated.valueMode ?? item.valueMode),
                groupCode: typeof updated.groupCode === "string" && updated.groupCode ? updated.groupCode : undefined,
                active: Boolean(updated.active),
                filterable: Boolean(updated.filterable),
                variantIdentity: Boolean(updated.variantIdentity)
              } : item)
            }
          }
        };
      });
      setSaveStates((current) => ({ ...current, [key]: { status: "saved", message: "Saved · effective now" } }));
      setEditingAttribute(null);
    } catch (error) {
      setSaveStates((current) => ({ ...current, [key]: { status: "error", message: error instanceof Error ? error.message : "Save failed" } }));
    }
  }

  function categoryEditor(category: CatalogueStructureCategory) {
    const state = saveStates[`category:${category.categoryCode}`];
    return <form className="structure-inline-editor structure-category-editor" onSubmit={(event) => void saveCategory(event, category)}>
      <div className="structure-editor-grid">
        <label><span>Greek label</span><input name="labelEl" defaultValue={category.labelEl} required /></label>
        <label><span>Stable code</span><input value={category.categoryCode} disabled /></label>
        <label><span>Parent</span><select name="parentCategoryCode" defaultValue={category.parentCategoryCode ?? ""}>
          <option value="">— root —</option>
          {categories.filter((candidate) => candidate.categoryCode !== category.categoryCode).map((candidate) => <option key={candidate.categoryCode} value={candidate.categoryCode}>{candidate.pathLabels.join(" › ")}</option>)}
        </select></label>
        <label><span>Taxonomy role</span><select name="taxonomyRole" defaultValue={category.taxonomyRole}>{TAXONOMY_ROLES.map((role) => <option key={role} value={role}>{roleLabel(role)} · {role}</option>)}</select></label>
        <label><span>Sort order</span><input name="sortOrder" type="number" step="1" defaultValue={category.sortOrder} /></label>
      </div>
      <div className="structure-editor-switches">
        <label><input name="active" type="checkbox" defaultChecked={category.active} /> Active</label>
        <label><input name="assignable" type="checkbox" defaultChecked={category.assignable} /> Assignable</label>
        <label><input name="discoverable" type="checkbox" defaultChecked={category.discoverable} /> Discoverable</label>
      </div>
      <div className="structure-editor-actions">
        <button className="button" type="submit" disabled={state?.status === "saving"}>{state?.status === "saving" ? "Saving…" : "Save category"}</button>
        <button className="button button-secondary" type="button" onClick={() => setEditingCategory(null)}>Cancel</button>
        {state?.message && <small className={state.status === "error" ? "structure-save-error" : "structure-save-ok"} role={state.status === "error" ? "alert" : "status"}>{state.message}</small>}
      </div>
    </form>;
  }

  function attributeEditor(categoryCode: string, attribute: CatalogueStructureAttribute) {
    const state = saveStates[`attribute:${attribute.code}`];
    return <form className="structure-inline-editor structure-attribute-editor" onSubmit={(event) => void saveAttribute(event, categoryCode, attribute)}>
      <div className="structure-editor-grid">
        <label><span>Greek label</span><input name="labelEl" defaultValue={attribute.labelEl} required /></label>
        <label><span>Stable code</span><input value={attribute.code} disabled /></label>
        <label><span>Data type</span><select name="dataType" defaultValue={attribute.dataType}>{ATTRIBUTE_DATA_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
        <label><span>Value mode</span><select name="valueMode" defaultValue={attribute.valueMode}>{ATTRIBUTE_VALUE_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}</select></label>
        <label><span>Unit</span><input name="unit" defaultValue={attribute.unit ?? ""} placeholder="optional" /></label>
        <label><span>Group</span><input name="groupCode" defaultValue={attribute.groupCode ?? ""} placeholder="optional" /></label>
      </div>
      <div className="structure-editor-switches">
        <label><input name="active" type="checkbox" defaultChecked={attribute.active} /> Active</label>
        <label><input name="filterable" type="checkbox" defaultChecked={attribute.filterable} /> Filterable</label>
        <label><input name="variantIdentity" type="checkbox" defaultChecked={attribute.variantIdentity} /> Variant identity</label>
      </div>
      <div className="structure-editor-actions">
        <button className="button" type="submit" disabled={state?.status === "saving"}>{state?.status === "saving" ? "Saving…" : "Save attribute"}</button>
        <button className="button button-secondary" type="button" onClick={() => setEditingAttribute(null)}>Cancel</button>
        {state?.message && <small className={state.status === "error" ? "structure-save-error" : "structure-save-ok"} role={state.status === "error" ? "alert" : "status"}>{state.message}</small>}
      </div>
    </form>;
  }

  function categoryDetails(category: CatalogueStructureCategory) {
    const state = details[category.categoryCode];
    if (!state || state.status === "loading") return <div className="structure-loading" role="status">Loading attributes and products…</div>;
    if (state.status === "error") return <div className="structure-error" role="alert"><span>{state.error}</span><button className="button button-secondary" onClick={() => void loadDetails(category.categoryCode)}>Retry</button></div>;
    const data = state.data!;
    const attributeLabels = new Map(data.attributes.map((attribute) => [attribute.code, attribute.labelEl] as const));

    return <div className="structure-category-detail">
      <div className="structure-detail-summary">
        <span><strong>{data.attributes.length}</strong><small>attributes present/configured</small></span>
        <span><strong>{data.productTypes.length}</strong><small>Product Types</small></span>
        <span><strong>{data.productsTotal}</strong><small>direct products</small></span>
      </div>

      {data.productTypes.length > 0 && <section className="structure-detail-section">
        <h4>Product Types</h4>
        <div className="structure-chip-row">{data.productTypes.map((type) => <span className="structure-chip" key={type.code}><b>{type.labelEl}</b> · {type.productCount} products{type.isDefault ? " · default" : ""}</span>)}</div>
      </section>}

      <section className="structure-detail-section">
        <div className="structure-section-head"><div><h4>Attributes</h4><p>Configured by category/Product Type plus attributes actually present on products.</p></div></div>
        {data.attributes.length === 0 ? <p className="structure-muted">No attributes are configured or present directly in this category.</p> : <div className="structure-attribute-list">
          {data.attributes.map((attribute) => {
            const attributeKey = `${category.categoryCode}:${attribute.code}`;
            return <details className="structure-attribute" key={attribute.code}>
              <summary>
                <span className="structure-attribute-title"><strong>{attribute.labelEl}</strong><small>{attribute.code} · {attribute.dataType}{attribute.unit ? ` · ${attribute.unit}` : ""}</small></span>
                <span className="structure-attribute-count"><strong>{attribute.productsWithValue}</strong><small>products with value</small></span>
                <span className="structure-attribute-flags">{attribute.required && <i>required</i>}{attribute.filterable && <i>filter</i>}{!attribute.active && <i>inactive</i>}</span>
              </summary>
              <div className="structure-attribute-body">
                <div className="structure-attribute-meta">
                  <span><b>Sources</b>{attribute.sources.map(sourceLabel).join(" · ") || "—"}</span>
                  <span><b>Product Types</b>{attribute.productTypes.join(" · ") || "—"}</span>
                  <span><b>Value mode</b>{attribute.valueMode}</span>
                  <span><b>Group</b>{attribute.groupCode ?? "—"}</span>
                </div>
                {attribute.productSamples.length > 0 && <div className="structure-attribute-products"><b>Products using this attribute</b>{attribute.productSamples.map((product) => <span key={product.publicId}>{product.title}<small>{product.publicId}</small></span>)}</div>}
                {editingAttribute === attributeKey ? attributeEditor(category.categoryCode, attribute) : <div className="structure-inline-actions"><button className="button button-secondary" type="button" onClick={() => setEditingAttribute(attributeKey)}>Edit attribute</button></div>}
              </div>
            </details>;
          })}
        </div>}
      </section>

      <section className="structure-detail-section">
        <div className="structure-section-head"><div><h4>Products</h4><p>Directly assigned to this category. Expand a product to see which governed attributes currently have values.</p></div><span>{data.products.length} / {data.productsTotal}</span></div>
        {data.products.length === 0 ? <p className="structure-muted">No products are directly assigned to this category.</p> : <div className="structure-product-list">
          {data.products.map((product) => <details className="structure-product" key={product.publicId}>
            <summary>
              <span><strong>{product.title}</strong><small>{product.publicId}{product.productTypeName ? ` · ${product.productTypeName}` : ""}</small></span>
              <span><strong>{product.attributeCodes.length}</strong><small>attributes with values</small></span>
              <span className={`structure-product-state${product.active && !product.suppressed && !product.recalled ? " is-live" : ""}`}>{product.active && !product.suppressed && !product.recalled ? "Live" : product.recalled ? "Recalled" : product.suppressed ? "Suppressed" : "Inactive"}</span>
            </summary>
            <div className="structure-product-body">
              <div className="structure-product-identifiers"><span>GTIN <b>{product.gtin ?? "—"}</b></span><span>MPN <b>{product.mpn ?? "—"}</b></span><span>Model <b>{product.model ?? "—"}</b></span></div>
              <div className="structure-chip-row">{product.attributeCodes.length === 0 ? <span className="structure-muted">No governed attribute values yet.</span> : product.attributeCodes.map((code) => <span className="structure-chip" key={code}>{attributeLabels.get(code) ?? code}<small>{code}</small></span>)}</div>
            </div>
          </details>)}
        </div>}
        {data.hasMore && <div className="structure-load-more"><button className="button button-secondary" type="button" onClick={() => void loadDetails(category.categoryCode, data.products.length)}>Load 50 more products</button></div>}
      </section>
    </div>;
  }

  function renderCategory(category: CatalogueStructureCategory): React.ReactNode {
    if (visibleCodes && !visibleCodes.has(category.categoryCode)) return null;
    const childRows = children.get(category.categoryCode) ?? [];
    const forcedOpen = Boolean(visibleCodes && childRows.some((child) => visibleCodes.has(child.categoryCode)));
    const isExpanded = expanded.has(category.categoryCode) || forcedOpen;
    const canExpand = childRows.length > 0 || category.directProducts > 0 || category.configuredAttributeCount > 0 || category.productTypeCount > 0;

    return <div className={`structure-tree-node depth-${Math.min(category.depth, 8)}`} key={category.categoryCode}>
      <div className={`structure-node-row${!category.active ? " is-inactive" : ""}`}>
        <button
          className="structure-node-toggle"
          type="button"
          aria-expanded={isExpanded}
          onClick={() => {
            if (!canExpand) return;
            toggleCategory(category.categoryCode);
          }}
          disabled={!canExpand}
        >
          <span className="structure-chevron" aria-hidden="true">{canExpand ? (isExpanded ? "▾" : "▸") : "·"}</span>
          <span className="structure-node-identity"><strong>{category.labelEl}</strong><small>{roleLabel(category.taxonomyRole)} · {category.categoryCode}</small></span>
        </button>
        <div className="structure-node-metrics" aria-label={`Counts for ${category.labelEl}`}>
          <span><b>{category.directProducts}</b><small>direct</small></span>
          <span><b>{category.subtreeProducts}</b><small>branch</small></span>
          <span><b>{category.configuredAttributeCount}</b><small>attributes</small></span>
          <span><b>{category.childCount}</b><small>children</small></span>
        </div>
        <span className={`structure-node-status${category.active && category.discoverable ? " is-active" : ""}`}>{statusLabel(category)}</span>
        <button className="structure-edit-button" type="button" onClick={() => setEditingCategory(editingCategory === category.categoryCode ? null : category.categoryCode)}>Edit</button>
      </div>

      {editingCategory === category.categoryCode && categoryEditor(category)}

      {isExpanded && <div className="structure-node-expanded">
        {expanded.has(category.categoryCode) && categoryDetails(category)}
        {childRows.length > 0 && <div className="structure-children">{childRows.map(renderCategory)}</div>}
      </div>}
    </div>;
  }

  const roots = children.get(undefined) ?? [];
  const resultCount = visibleCodes?.size ?? categories.length;

  return <div className="catalogue-structure-client">
    <div className="structure-toolbar">
      <label className="structure-search"><span>Search structure</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Category, code, path or role…" /></label>
      <div className="structure-toolbar-status"><strong>{resultCount}</strong><span>{visibleCodes ? "nodes in matching paths" : "taxonomy nodes"}</span></div>
      <button className="button button-secondary" type="button" onClick={() => setExpanded(new Set())}>Collapse all</button>
    </div>

    <div className="structure-tree-head" aria-hidden="true">
      <span>Category hierarchy</span><span>Products · attributes</span><span>Status</span><span>Edit</span>
    </div>
    <div className="structure-tree" role="tree" aria-label="Catalogue category structure">
      {roots.length === 0 ? <div className="structure-empty">No taxonomy roots are available.</div> : roots.map(renderCategory)}
    </div>
  </div>;
}
