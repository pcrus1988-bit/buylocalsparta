import {
  PostgresUnitOfWork,
  formatMoney,
  money,
  type SessionPrincipal,
  type SqlRow
} from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { postgresVendorRuntimeEnabled, vendorDashboard } from "./vendor-runtime";

const euro = (minor: number) => formatMoney(money(minor, "EUR"));
const asInt = (value: unknown, field: string): number => {
  const parsed = Number(value ?? 0);
  if (!Number.isSafeInteger(parsed)) throw new Error(`Invalid integer ${field}`);
  return parsed;
};
const asText = (value: unknown, field: string): string => {
  if (typeof value !== "string") throw new Error(`Invalid text ${field}`);
  return value;
};
const optionalText = (value: unknown): string | undefined => typeof value === "string" && value.length ? value : undefined;
const asEpoch = (value: unknown, field: string): number => {
  const parsed = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  if (!Number.isFinite(parsed)) throw new Error(`Invalid timestamp ${field}`);
  return parsed;
};
const textArray = (value: unknown): string[] => Array.isArray(value) ? value.map(String) : [];

function requireVendorId(principal: SessionPrincipal): string {
  if (!principal.vendorId || !principal.roles.some((role) => role.startsWith("vendor_"))) throw new Error("VENDOR_AUTH_REQUIRED");
  return principal.vendorId;
}

function uow() {
  return new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 5_000 });
}

function scope(principal: SessionPrincipal) {
  return { actorUserId: principal.userId, vendorId: requireVendorId(principal), marketId: "sparta" } as const;
}

export type VendorManagedCatalogProduct = Readonly<{
  offerId: string;
  canonicalVariantId: string;
  title: string;
  vendorSku?: string;
  gtin?: string;
  brand?: string;
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  categoryPathIds: readonly string[];
  categoryPathCodes: readonly string[];
  categoryPathNames: readonly string[];
  categoryPath: string;
  retailPrice: string;
  retailPriceMinor: number;
  supplierPrice: string;
  onHand: number;
  reserved: number;
  blocked: number;
  safetyStock: number;
  availableToSell: number;
  offerStatus: string;
  productVisible: boolean;
  categoryVisible: boolean;
  effectiveVisible: boolean;
  merchantPauseActive: boolean;
  canToggleVisibility: boolean;
  updatedAt: number;
}>;

export type VendorCatalogCategoryControl = Readonly<{
  id: string;
  code: string;
  name: string;
  path: string;
  depth: number;
  productCount: number;
  configuredVisible: boolean;
  effectiveVisible: boolean;
}>;

export type VendorCatalogCategoryOption = Readonly<{
  id: string;
  code: string;
  name: string;
  path: string;
  depth: number;
}>;

export async function vendorCatalogControlWorkspace(principal: SessionPrincipal) {
  if (!postgresVendorRuntimeEnabled()) {
    const dashboard = await vendorDashboard(principal);
    const products: VendorManagedCatalogProduct[] = dashboard.products.map((product) => ({
      ...product,
      vendorSku: undefined,
      gtin: undefined,
      brand: undefined,
      categoryId: "uncategorized",
      categoryCode: "uncategorized",
      categoryName: "Χωρίς κατηγορία",
      categoryPathIds: ["uncategorized"],
      categoryPathCodes: ["uncategorized"],
      categoryPathNames: ["Χωρίς κατηγορία"],
      categoryPath: "Χωρίς κατηγορία",
      retailPriceMinor: 0,
      offerStatus: "approved",
      productVisible: true,
      categoryVisible: true,
      effectiveVisible: true,
      merchantPauseActive: false,
      canToggleVisibility: false
    }));
    return {
      catalogProducts: products,
      categories: [] as VendorCatalogCategoryControl[],
      categoryOptions: [] as VendorCatalogCategoryOption[],
      catalogMetrics: summarize(products)
    };
  }

  return uow().withTransaction(scope(principal), async (tx) => {
    const vendorId = requireVendorId(principal);
    const rows = await tx.query<SqlRow>(`
      WITH RECURSIVE category_tree AS (
        SELECT c.id,c.parent_id,c.code,
               ARRAY[c.id]::uuid[] AS path_ids,
               ARRAY[c.code]::text[] AS path_codes,
               ARRAY[COALESCE(el.name,en.name,c.code)]::text[] AS path_names
        FROM categories c
        LEFT JOIN category_translations el ON el.category_id=c.id AND el.locale='el'
        LEFT JOIN category_translations en ON en.category_id=c.id AND en.locale='en'
        WHERE c.parent_id IS NULL
          AND (c.market_id IS NULL OR c.market_id=(SELECT market_id FROM vendor_businesses WHERE public_id=$1 OR id::text=$1 LIMIT 1))
        UNION ALL
        SELECT child.id,child.parent_id,child.code,
               parent.path_ids || child.id,
               parent.path_codes || child.code,
               parent.path_names || COALESCE(el.name,en.name,child.code)
        FROM categories child
        JOIN category_tree parent ON child.parent_id=parent.id
        LEFT JOIN category_translations el ON el.category_id=child.id AND el.locale='el'
        LEFT JOIN category_translations en ON en.category_id=child.id AND en.locale='en'
        WHERE child.market_id IS NULL OR child.market_id=(SELECT market_id FROM vendor_businesses WHERE public_id=$1 OR id::text=$1 LIMIT 1)
      )
      SELECT vo.public_id AS offer_id,cv.public_id AS canonical_id,
             COALESCE(ptel.title,pten.title,cv.model,cv.slug) AS title,
             vo.vendor_sku,COALESCE(vo.source_gtin,cv.gtin) AS gtin,b.name AS brand,
             cv.category_id::text AS category_id,ct.code AS category_code,
             COALESCE(ct.path_names[array_length(ct.path_names,1)],ct.code) AS category_name,
             ct.path_ids::text[] AS category_path_ids,ct.path_codes AS category_path_codes,ct.path_names AS category_path_names,
             vo.customer_price_minor,vo.supplier_unit_price_minor,vo.status::text AS offer_status,
             vo.merchant_visible,vo.merchant_pause_active,
             bls_private.vendor_category_effectively_visible(vo.vendor_id,cv.category_id) AS category_visible,
             ib.on_hand,ib.active_reservations,ib.blocked,ib.safety_stock,
             GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked) AS available_to_sell,
             GREATEST(vo.updated_at,ib.updated_at) AS updated_at
      FROM vendor_offers vo
      JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
      JOIN category_tree ct ON ct.id=cv.category_id
      LEFT JOIN brands b ON b.id=cv.brand_id
      JOIN inventory_balances ib ON ib.offer_id=vo.id
      LEFT JOIN product_translations ptel ON ptel.canonical_variant_id=cv.id AND ptel.locale='el'
      LEFT JOIN product_translations pten ON pten.canonical_variant_id=cv.id AND pten.locale='en'
      WHERE vo.vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$1 OR id::text=$1 LIMIT 1)
        AND (vo.status='approved' OR vo.merchant_pause_active=true OR vo.status IN ('archived','suppressed'))
      ORDER BY ct.path_names, title, vo.public_id
    `, [vendorId]);

    const products: VendorManagedCatalogProduct[] = rows.rows.map((row) => {
      const pathIds = textArray(row.category_path_ids);
      const pathCodes = textArray(row.category_path_codes);
      const pathNames = textArray(row.category_path_names);
      const offerStatus = asText(row.offer_status, "offer_status");
      const merchantPauseActive = Boolean(row.merchant_pause_active);
      const productVisible = Boolean(row.merchant_visible);
      const categoryVisible = Boolean(row.category_visible);
      const retailPriceMinor = asInt(row.customer_price_minor, "customer_price_minor");
      return {
        offerId: asText(row.offer_id, "offer_id"),
        canonicalVariantId: asText(row.canonical_id, "canonical_id"),
        title: asText(row.title, "title"),
        vendorSku: optionalText(row.vendor_sku),
        gtin: optionalText(row.gtin),
        brand: optionalText(row.brand),
        categoryId: asText(row.category_id, "category_id"),
        categoryCode: asText(row.category_code, "category_code"),
        categoryName: asText(row.category_name, "category_name"),
        categoryPathIds: pathIds,
        categoryPathCodes: pathCodes,
        categoryPathNames: pathNames,
        categoryPath: pathNames.join(" › "),
        retailPrice: euro(retailPriceMinor),
        retailPriceMinor,
        supplierPrice: euro(asInt(row.supplier_unit_price_minor, "supplier_unit_price_minor")),
        onHand: asInt(row.on_hand, "on_hand"),
        reserved: asInt(row.active_reservations, "active_reservations"),
        blocked: asInt(row.blocked, "blocked"),
        safetyStock: asInt(row.safety_stock, "safety_stock"),
        availableToSell: asInt(row.available_to_sell, "available_to_sell"),
        offerStatus,
        productVisible,
        categoryVisible,
        effectiveVisible: offerStatus === "approved" && productVisible && categoryVisible,
        merchantPauseActive,
        canToggleVisibility: offerStatus === "approved" || merchantPauseActive,
        updatedAt: asEpoch(row.updated_at, "updated_at")
      };
    });

    const categoryMap = new Map<string, { id:string; code:string; name:string; path:string; depth:number; productCount:number }>();
    for (const product of products) {
      for (let i = 0; i < product.categoryPathIds.length; i += 1) {
        const id = product.categoryPathIds[i];
        const current = categoryMap.get(id);
        if (current) current.productCount += 1;
        else categoryMap.set(id, {
          id,
          code: product.categoryPathCodes[i] ?? id,
          name: product.categoryPathNames[i] ?? product.categoryPathCodes[i] ?? id,
          path: product.categoryPathNames.slice(0, i + 1).join(" › "),
          depth: i,
          productCount: 1
        });
      }
    }

    let categories: VendorCatalogCategoryControl[] = [];
    if (categoryMap.size) {
      const categoryIds = [...categoryMap.keys()];
      const controls = await tx.query<SqlRow>(`
        SELECT c.id::text AS id,COALESCE(vcv.visible,true) AS configured_visible,
               bls_private.vendor_category_effectively_visible(
                 (SELECT id FROM vendor_businesses WHERE public_id=$1 OR id::text=$1 LIMIT 1),c.id
               ) AS effective_visible
        FROM categories c
        LEFT JOIN vendor_category_visibility vcv
          ON vcv.category_id=c.id
         AND vcv.vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$1 OR id::text=$1 LIMIT 1)
        WHERE c.id=ANY($2::uuid[])
      `, [vendorId, categoryIds]);
      const visibility = new Map(controls.rows.map((row) => [asText(row.id,"category_id"), { configuredVisible:Boolean(row.configured_visible), effectiveVisible:Boolean(row.effective_visible) }]));
      categories = [...categoryMap.values()].map((category) => ({
        ...category,
        configuredVisible: visibility.get(category.id)?.configuredVisible ?? true,
        effectiveVisible: visibility.get(category.id)?.effectiveVisible ?? true
      })).sort((a,b) => a.path.localeCompare(b.path,"el"));
    }

    const optionRows = await tx.query<SqlRow>(`
      WITH RECURSIVE category_tree AS (
        SELECT c.id,c.parent_id,c.code,c.active,c.assignable,
               ARRAY[COALESCE(el.name,en.name,c.code)]::text[] AS path_names
        FROM categories c
        LEFT JOIN category_translations el ON el.category_id=c.id AND el.locale='el'
        LEFT JOIN category_translations en ON en.category_id=c.id AND en.locale='en'
        WHERE c.parent_id IS NULL
          AND (c.market_id IS NULL OR c.market_id=(SELECT market_id FROM vendor_businesses WHERE public_id=$1 OR id::text=$1 LIMIT 1))
        UNION ALL
        SELECT child.id,child.parent_id,child.code,child.active,child.assignable,
               parent.path_names || COALESCE(el.name,en.name,child.code)
        FROM categories child
        JOIN category_tree parent ON child.parent_id=parent.id
        LEFT JOIN category_translations el ON el.category_id=child.id AND el.locale='el'
        LEFT JOIN category_translations en ON en.category_id=child.id AND en.locale='en'
        WHERE child.market_id IS NULL OR child.market_id=(SELECT market_id FROM vendor_businesses WHERE public_id=$1 OR id::text=$1 LIMIT 1)
      )
      SELECT id::text AS id,code,path_names
      FROM category_tree
      WHERE active=true AND assignable=true
      ORDER BY path_names
    `, [vendorId]);
    const categoryOptions: VendorCatalogCategoryOption[] = optionRows.rows.map((row) => {
      const pathNames = textArray(row.path_names);
      return {
        id: asText(row.id,"category_id"),
        code: asText(row.code,"category_code"),
        name: pathNames[pathNames.length - 1] ?? asText(row.code,"category_code"),
        path: pathNames.join(" › "),
        depth: Math.max(0,pathNames.length - 1)
      };
    });

    return { catalogProducts: products, categories, categoryOptions, catalogMetrics: summarize(products) };
  }, { readOnly: true });
}

function summarize(products: readonly VendorManagedCatalogProduct[]) {
  return {
    totalProducts: products.length,
    visibleProducts: products.filter((item) => item.effectiveVisible).length,
    hiddenProducts: products.filter((item) => !item.effectiveVisible).length,
    inStockProducts: products.filter((item) => item.availableToSell > 0).length,
    outOfStockProducts: products.filter((item) => item.availableToSell <= 0).length,
    lowStockProducts: products.filter((item) => item.availableToSell > 0 && item.availableToSell <= Math.max(2,item.safetyStock)).length,
    availableUnits: products.reduce((sum,item) => sum + item.availableToSell,0),
    categoryCount: new Set(products.map((item) => item.categoryId)).size
  };
}

export async function setVendorCatalogVisibility(principal: SessionPrincipal, input: Readonly<{
  scope: "product" | "category";
  visible: boolean;
  offerId?: string;
  categoryId?: string;
}>) {
  if (!postgresVendorRuntimeEnabled()) throw new Error("Visibility controls require the PostgreSQL vendor runtime");
  return uow().withTransaction(scope(principal), async (tx) => {
    const vendorId = requireVendorId(principal);
    if (typeof input.visible !== "boolean") throw new Error("Visibility must be true or false");
    if (input.scope === "product") {
      if (!input.offerId?.trim()) throw new Error("Product offer is required");
      const changed = await tx.query<SqlRow>(`
        UPDATE vendor_offers
        SET merchant_visible=$3,
            merchant_visibility_updated_by=NULLIF(current_setting('app.actor_user_id',true),'')::uuid,
            merchant_visibility_updated_at=now(),updated_at=now()
        WHERE public_id=$1
          AND vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$2 OR id::text=$2 LIMIT 1)
          AND (status='approved' OR merchant_pause_active=true)
        RETURNING id::text AS id,category_id::text AS category_id,status::text AS status,merchant_visible,merchant_pause_active
      `, [input.offerId.trim(), vendorId, input.visible]);
      if (!changed.rowCount) throw new Error("This product cannot be changed by the vendor");
      const row = changed.rows[0];
      await tx.query(`
        INSERT INTO vendor_catalog_visibility_events(vendor_id,offer_id,scope,visible,actor_id,metadata)
        VALUES(
          (SELECT id FROM vendor_businesses WHERE public_id=$1 OR id::text=$1 LIMIT 1),
          $2::uuid,'product',$3,NULLIF(current_setting('app.actor_user_id',true),'')::uuid,
          jsonb_build_object('source','vendor_dashboard','offer_public_id',$4)
        )
      `, [vendorId, asText(row.id,"offer_id"), input.visible, input.offerId.trim()]);
      return { ok:true, status:asText(row.status,"status"), visible:Boolean(row.merchant_visible), paused:Boolean(row.merchant_pause_active) };
    }

    if (!input.categoryId?.trim()) throw new Error("Category is required");
    const allowed = await tx.query<SqlRow>(`
      WITH RECURSIVE descendants AS (
        SELECT id FROM categories WHERE id=$1::uuid
        UNION ALL
        SELECT child.id FROM categories child JOIN descendants parent ON child.parent_id=parent.id
      )
      SELECT $1::uuid::text AS id
      WHERE EXISTS (
        SELECT 1 FROM vendor_offers vo
        JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
        WHERE vo.vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$2 OR id::text=$2 LIMIT 1)
          AND cv.category_id IN (SELECT id FROM descendants)
      )
    `, [input.categoryId.trim(), vendorId]);
    if (!allowed.rowCount) throw new Error("Category is not part of this vendor catalogue");
    await tx.query(`
      INSERT INTO vendor_category_visibility(vendor_id,category_id,visible,updated_by,created_at,updated_at)
      VALUES(
        (SELECT id FROM vendor_businesses WHERE public_id=$1 OR id::text=$1 LIMIT 1),
        $2::uuid,$3,NULLIF(current_setting('app.actor_user_id',true),'')::uuid,now(),now()
      )
      ON CONFLICT(vendor_id,category_id) DO UPDATE SET
        visible=EXCLUDED.visible,updated_by=EXCLUDED.updated_by,updated_at=now()
    `, [vendorId, input.categoryId.trim(), input.visible]);
    await tx.query(`
      INSERT INTO vendor_catalog_visibility_events(vendor_id,category_id,scope,visible,actor_id,metadata)
      VALUES(
        (SELECT id FROM vendor_businesses WHERE public_id=$1 OR id::text=$1 LIMIT 1),
        $2::uuid,'category',$3,NULLIF(current_setting('app.actor_user_id',true),'')::uuid,
        jsonb_build_object('source','vendor_dashboard')
      )
    `, [vendorId, input.categoryId.trim(), input.visible]);
    return { ok:true, visible:input.visible };
  }, { isolation:"serializable" });
}

export async function updateVendorCatalogInventory(principal: SessionPrincipal, input: Readonly<{
  offerId: string;
  onHand: number;
  safetyStock: number;
}>) {
  if (!postgresVendorRuntimeEnabled()) throw new Error("Inventory controls require the PostgreSQL vendor runtime");
  if (!input.offerId?.trim()) throw new Error("Product offer is required");
  if (!Number.isSafeInteger(input.onHand) || input.onHand < 0 || input.onHand > 1_000_000) throw new Error("On-hand stock must be a non-negative integer");
  if (!Number.isSafeInteger(input.safetyStock) || input.safetyStock < 0 || input.safetyStock > 1_000_000) throw new Error("Safety stock must be a non-negative integer");

  return uow().withTransaction(scope(principal), async (tx) => {
    const vendorId = requireVendorId(principal);
    const found = await tx.query<SqlRow>(`
      SELECT vo.id::text AS offer_uuid,ib.on_hand,ib.active_reservations,ib.safety_stock
      FROM vendor_offers vo JOIN inventory_balances ib ON ib.offer_id=vo.id
      WHERE vo.public_id=$1
        AND vo.vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$2 OR id::text=$2 LIMIT 1)
      FOR UPDATE OF ib
    `, [input.offerId.trim(), vendorId]);
    if (!found.rowCount) throw new Error("Vendor inventory access denied");
    const row = found.rows[0];
    const offerUuid = asText(row.offer_uuid,"offer_uuid");
    const oldOnHand = asInt(row.on_hand,"on_hand");
    const reserved = asInt(row.active_reservations,"active_reservations");
    if (input.onHand < reserved) throw new Error("On-hand stock cannot be lower than active reservations");
    if (input.safetyStock > input.onHand - reserved) throw new Error("Safety stock cannot exceed unreserved on-hand stock");

    await tx.query(`
      UPDATE inventory_balances
      SET on_hand=$2,safety_stock=$3,source='manual',source_confidence='merchant_confirmed',
          stock_confirmed_at=now(),freshness_status='fresh',updated_at=now()
      WHERE offer_id=$1::uuid
    `, [offerUuid, input.onHand, input.safetyStock]);

    const delta = input.onHand - oldOnHand;
    if (delta !== 0) {
      await tx.query(`
        INSERT INTO inventory_movements(id,public_id,offer_id,movement_type,quantity_delta,source,actor_id,metadata,created_at)
        VALUES(gen_random_uuid(),'im_'||gen_random_uuid()::text,$1::uuid,'vendor_adjustment',$2,'vendor_backoffice',
               NULLIF(current_setting('app.actor_user_id',true),'')::uuid,
               jsonb_build_object('from', $3, 'to', $4, 'safety_stock', $5),now())
      `, [offerUuid, delta, oldOnHand, input.onHand, input.safetyStock]);
    }
    return { ok:true, onHand:input.onHand, safetyStock:input.safetyStock, reserved };
  }, { isolation:"serializable" });
}
