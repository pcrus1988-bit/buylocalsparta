import { getProductionPostgresRuntime } from "../../../../lib/postgres-runtime";
import { getShopCatalogPage } from "../../../../lib/shop-catalog-page";
import { getVisitorKey } from "../../../../lib/visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AccessoryRuleRow = Readonly<{
  accessory_key: string;
  label_el: string;
  category_code: string;
  role: "recommended_working" | "optional_extra";
  default_selected: boolean;
  quantity_rule: "fixed" | "area_ceiling";
  base_quantity: number;
  area_per_unit_m2: number | string | null;
  max_quantity: number;
  application_method: string | null;
  search_terms: string[];
  sort_order: number;
}>;

type RequestBody = Readonly<{
  manufacturerProductId?: unknown;
  areaM2?: unknown;
  postcode?: unknown;
}>;

function quantityFor(rule: AccessoryRuleRow, areaM2: number): number {
  if (rule.quantity_rule === "fixed") return Math.min(rule.max_quantity, Math.max(1, rule.base_quantity));
  const perUnit = Number(rule.area_per_unit_m2);
  if (!Number.isFinite(perUnit) || perUnit <= 0) return Math.min(rule.max_quantity, Math.max(1, rule.base_quantity));
  return Math.min(rule.max_quantity, Math.max(rule.base_quantity, Math.ceil(areaM2 / perUnit)));
}

function normalizedMethod(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as RequestBody;
    const manufacturerProductId = typeof body.manufacturerProductId === "string" ? body.manufacturerProductId.trim() : "";
    const areaM2 = Number(body.areaM2);
    const postcode = typeof body.postcode === "string" && body.postcode.trim() ? body.postcode.trim().slice(0, 16) : "23100";

    if (!manufacturerProductId) throw new Error("manufacturerProductId is required");
    if (!Number.isFinite(areaM2) || areaM2 <= 0 || areaM2 > 100000) throw new Error("areaM2 is invalid");

    const db = getProductionPostgresRuntime().nativePool;
    const [rulesResult, profileResult] = await Promise.all([
      db.query<AccessoryRuleRow>(`
        select accessory_key,label_el,category_code,role,default_selected,quantity_rule,
               base_quantity,area_per_unit_m2,max_quantity,application_method,search_terms,sort_order
        from public.build_project_accessory_rules
        where project_type='paint' and active=true
        order by sort_order,accessory_key
      `),
      db.query<{ application_methods: string[] }>(`
        select application_methods
        from public.manufacturer_application_profiles
        where product_id=$1
          and source_layer='manufacturer'
          and verification_status='verified'
          and is_current=true
          and (valid_from is null or valid_from<=current_date)
          and (valid_to is null or valid_to>=current_date)
        order by updated_at desc
        limit 1
      `, [manufacturerProductId])
    ]);

    const methods = new Set((profileResult.rows[0]?.application_methods ?? []).map(normalizedMethod));
    const rules = rulesResult.rows.filter((rule) =>
      !rule.application_method || methods.has(normalizedMethod(rule.application_method))
    );

    const visitorKey = await getVisitorKey();
    const searchResults = await Promise.all(rules.map(async (rule) => {
      const terms = Array.isArray(rule.search_terms) ? rule.search_terms.filter(Boolean).slice(0, 2) : [];
      for (const query of terms) {
        const page = await getShopCatalogPage({
          visitorKey,
          postcode,
          query,
          limit: 8,
          offset: 0
        }).catch(() => ({ products: [], total: 0, hasMore: false }));
        const product = page.products.find((candidate) =>
          candidate.available && candidate.availableToSell > 0 && candidate.priceMinor > 0
        );
        if (product) return product;
      }
      return undefined;
    }));

    const used = new Set<string>();
    const items = rules.map((rule, index) => {
      const discovered = searchResults[index];
      const product = discovered && !used.has(discovered.id) ? discovered : undefined;
      if (product) used.add(product.id);
      return {
        key: rule.accessory_key,
        label: rule.label_el,
        categoryCode: rule.category_code,
        role: rule.role,
        defaultSelected: rule.default_selected,
        quantity: quantityFor(rule, areaM2),
        sourceLayer: "KONTA_MOU_RULE" as const,
        quantityBasis: rule.quantity_rule === "fixed"
          ? "fixed_per_project"
          : `area_ceiling:${Number(rule.area_per_unit_m2)}m2`,
        product: product ? {
          canonicalVariantId: product.id,
          title: product.title,
          price: product.price,
          priceMinor: product.priceMinor,
          imageUrl: product.imageUrl,
          mediaId: product.mediaId,
          mediaAlt: product.mediaAlt,
          categoryCode: product.categoryCode
        } : undefined
      };
    });

    return Response.json({ items }, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const validation = /required|invalid/i.test(message);
    if (!validation) {
      console.error(JSON.stringify({ level: "error", event: "build_studio.accessories_failed", message }));
    }
    return Response.json({
      error: validation ? "invalid_accessory_request" : "accessories_unavailable",
      message: validation ? message : "Δεν ήταν δυνατή η φόρτωση των υλικών εργασίας."
    }, {
      status: validation ? 400 : 503,
      headers: { "Cache-Control": "private, no-store, max-age=0" }
    });
  }
}
