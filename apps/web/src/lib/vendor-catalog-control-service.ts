import { PostgresUnitOfWork, formatMoney, money, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { postgresVendorRuntimeEnabled, vendorDashboard } from "./vendor-runtime";

const text = (value: unknown, field: string) => {
  if (typeof value !== "string") throw new Error(`Invalid text ${field}`);
  return value;
};
const optionalText = (value: unknown) => typeof value === "string" && value.length ? value : undefined;
const integer = (value: unknown, field: string) => {
  const result = Number(value ?? 0);
  if (!Number.isSafeInteger(result)) throw new Error(`Invalid integer ${field}`);
  return result;
};
const strings = (value: unknown): string[] => Array.isArray(value) ? value.map(String) : [];
const epoch = (value: unknown, field: string) => {
  const result = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  if (!Number.isFinite(result)) throw new Error(`Invalid timestamp ${field}`);
  return result;
};
const euro = (minor: number) => formatMoney(money(minor, "EUR"));

function vendorId(principal: SessionPrincipal) {
  if (!principal.vendorId || !principal.roles.some((role) => role.startsWith("vendor_"))) throw new Error("VENDOR_AUTH_REQUIRED");
  return principal.vendorId;
}
function unitOfWork() {
  return new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 5_000 });
}
function vendorScope(principal: SessionPrincipal) {
  return { actorUserId: principal.userId, vendorId: vendorId(principal), marketId: "sparta" } as const;
}

export type VendorManagedCatalogProduct = Readonly<{
  offerId: string; canonicalVariantId: string; title: string; vendorSku?: string; gtin?: string; brand?: string;
  categoryId: string; categoryCode: string; categoryName: string; categoryPathIds: readonly string[];
  categoryPathCodes: readonly string[]; categoryPathNames: readonly string[]; categoryPath: string;
  retailPrice: string; retailPriceMinor: number; supplierPrice: string;
  onHand: number; reserved: number; blocked: number; safetyStock: number; availableToSell: number;
  offerStatus: string; productVisible: boolean; categoryVisible: boolean; effectiveVisible: boolean;
  merchantPauseActive: boolean; canToggleVisibility: boolean; updatedAt: number;
}>;
export type VendorCatalogCategoryControl = Readonly<{
  id: string; code: string; name: string; path: string; depth: number; productCount: number;
  configuredVisible: boolean; effectiveVisible: boolean;
}>;
export type VendorCatalogCategoryOption = Readonly<{
  id: string; code: string; name: string; path: string; depth: number;
}>;

function summarize(products: readonly VendorManagedCatalogProduct[]) {
  return {
    totalProducts: products.length,
    visibleProducts: products.filter((p) => p.effectiveVisible).length,
    hiddenProducts: products.filter((p) => !p.effectiveVisible).length,
    inStockProducts: products.filter((p) => p.availableToSell > 0).length,
    outOfStockProducts: products.filter((p) => p.availableToSell <= 0).length,
    lowStockProducts: products.filter((p) => p.availableToSell > 0 && p.availableToSell <= Math.max(2, p.safetyStock)).length,
    availableUnits: products.reduce((sum, p) => sum + p.availableToSell, 0),
    categoryCount: new Set(products.map((p) => p.categoryId)).size
  };
}

export async function vendorCatalogControlWorkspace(principal: SessionPrincipal) {
  if (!postgresVendorRuntimeEnabled()) {
    const dashboard = await vendorDashboard(principal);
    const products: VendorManagedCatalogProduct[] = dashboard.products.map((p) => ({
      ...p, vendorSku: undefined, gtin: undefined, brand: undefined,
      categoryId: "uncategorized", categoryCode: "uncategorized", categoryName: "Χωρίς κατηγορία",
      categoryPathIds: ["uncategorized"], categoryPathCodes: ["uncategorized"], categoryPathNames: ["Χωρίς κατηγορία"], categoryPath: "Χωρίς κατηγορία",
      retailPriceMinor: 0, offerStatus: "approved", productVisible: true, categoryVisible: true,
      effectiveVisible: true, merchantPauseActive: false, canToggleVisibility: false
    }));
    return { catalogProducts: products, categories: [] as VendorCatalogCategoryControl[], categoryOptions: [] as VendorCatalogCategoryOption[], catalogMetrics: summarize(products) };
  }

  return unitOfWork().withTransaction(vendorScope(principal), async (tx) => {
    const id = vendorId(principal);
    const productRows = await tx.query<SqlRow>(`
      WITH RECURSIVE tree AS (
        SELECT c.id,c.parent_id,c.code,ARRAY[c.id]::uuid[] path_ids,ARRAY[c.code]::text[] path_codes,
               ARRAY[COALESCE(el.name,en.name,c.code)]::text[] path_names
        FROM categories c
        LEFT JOIN category_translations el ON el.category_id=c.id AND el.locale='el'
        LEFT JOIN category_translations en ON en.category_id=c.id AND en.locale='en'
        WHERE c.parent_id IS NULL
          AND (c.market_id IS NULL OR c.market_id=(SELECT market_id FROM vendor_businesses WHERE public_id=$1 OR id::text=$1 LIMIT 1))
        UNION ALL
        SELECT c.id,c.parent_id,c.code,t.path_ids||c.id,t.path_codes||c.code,t.path_names||COALESCE(el.name,en.name,c.code)
        FROM categories c JOIN tree t ON c.parent_id=t.id
        LEFT JOIN category_translations el ON el.category_id=c.id AND el.locale='el'
        LEFT JOIN category_translations en ON en.category_id=c.id AND en.locale='en'
        WHERE c.market_id IS NULL OR c.market_id=(SELECT market_id FROM vendor_businesses WHERE public_id=$1 OR id::text=$1 LIMIT 1)
      )
      SELECT vo.public_id offer_id,cv.public_id canonical_id,COALESCE(ptel.title,pten.title,cv.model,cv.slug) title,
             vo.vendor_sku,COALESCE(vo.source_gtin,cv.gtin) gtin,b.name brand,cv.category_id::text category_id,t.code category_code,
             t.path_ids,t.path_codes,t.path_names,vo.customer_price_minor,vo.supplier_unit_price_minor,
             vo.status::text offer_status,vo.merchant_visible,vo.merchant_pause_active,
             bls_private.vendor_category_effectively_visible(vo.vendor_id,cv.category_id) category_visible,
             ib.on_hand,ib.active_reservations,ib.blocked,ib.safety_stock,
             GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked) available_to_sell,
             GREATEST(vo.updated_at,ib.updated_at) updated_at
      FROM vendor_offers vo
      JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
      JOIN tree t ON t.id=cv.category_id
      JOIN inventory_balances ib ON ib.offer_id=vo.id
      LEFT JOIN brands b ON b.id=cv.brand_id
      LEFT JOIN product_translations ptel ON ptel.canonical_variant_id=cv.id AND ptel.locale='el'
      LEFT JOIN product_translations pten ON pten.canonical_variant_id=cv.id AND pten.locale='en'
      WHERE vo.vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$1 OR id::text=$1 LIMIT 1)
        AND (vo.status='approved' OR vo.merchant_pause_active=true OR vo.status IN ('archived','suppressed'))
      ORDER BY t.path_names,title,vo.public_id
    `, [id]);

    const products: VendorManagedCatalogProduct[] = productRows.rows.map((row) => {
      const pathIds = strings(row.path_ids), pathCodes = strings(row.path_codes), pathNames = strings(row.path_names);
      const offerStatus = text(row.offer_status,"offer_status"), productVisible = Boolean(row.merchant_visible), categoryVisible = Boolean(row.category_visible);
      const retailPriceMinor = integer(row.customer_price_minor,"customer_price_minor");
      return {
        offerId:text(row.offer_id,"offer_id"), canonicalVariantId:text(row.canonical_id,"canonical_id"), title:text(row.title,"title"),
        vendorSku:optionalText(row.vendor_sku), gtin:optionalText(row.gtin), brand:optionalText(row.brand),
        categoryId:text(row.category_id,"category_id"), categoryCode:text(row.category_code,"category_code"),
        categoryName:pathNames.at(-1) ?? text(row.category_code,"category_code"), categoryPathIds:pathIds, categoryPathCodes:pathCodes, categoryPathNames:pathNames, categoryPath:pathNames.join(" › "),
        retailPrice:euro(retailPriceMinor), retailPriceMinor, supplierPrice:euro(integer(row.supplier_unit_price_minor,"supplier_unit_price_minor")),
        onHand:integer(row.on_hand,"on_hand"), reserved:integer(row.active_reservations,"active_reservations"), blocked:integer(row.blocked,"blocked"), safetyStock:integer(row.safety_stock,"safety_stock"), availableToSell:integer(row.available_to_sell,"available_to_sell"),
        offerStatus, productVisible, categoryVisible, effectiveVisible:offerStatus === "approved" && productVisible && categoryVisible,
        merchantPauseActive:Boolean(row.merchant_pause_active), canToggleVisibility:offerStatus === "approved" || Boolean(row.merchant_pause_active), updatedAt:epoch(row.updated_at,"updated_at")
      };
    });

    const categoryBase = new Map<string,{id:string;code:string;name:string;path:string;depth:number;productCount:number}>();
    for (const p of products) for (let i=0;i<p.categoryPathIds.length;i+=1) {
      const categoryId=p.categoryPathIds[i], found=categoryBase.get(categoryId);
      if (found) found.productCount += 1;
      else categoryBase.set(categoryId,{id:categoryId,code:p.categoryPathCodes[i]??categoryId,name:p.categoryPathNames[i]??p.categoryPathCodes[i]??categoryId,path:p.categoryPathNames.slice(0,i+1).join(" › "),depth:i,productCount:1});
    }

    let categories: VendorCatalogCategoryControl[]=[];
    if (categoryBase.size) {
      const controls=await tx.query<SqlRow>(`
        SELECT c.id::text id,COALESCE(vcv.visible,true) configured_visible,
               bls_private.vendor_category_effectively_visible((SELECT id FROM vendor_businesses WHERE public_id=$1 OR id::text=$1 LIMIT 1),c.id) effective_visible
        FROM categories c LEFT JOIN vendor_category_visibility vcv ON vcv.category_id=c.id
          AND vcv.vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$1 OR id::text=$1 LIMIT 1)
        WHERE c.id=ANY($2::uuid[])
      `,[id,[...categoryBase.keys()]]);
      const flags=new Map(controls.rows.map((r)=>[text(r.id,"category_id"),{configuredVisible:Boolean(r.configured_visible),effectiveVisible:Boolean(r.effective_visible)}]));
      categories=[...categoryBase.values()].map((c)=>({...c,configuredVisible:flags.get(c.id)?.configuredVisible??true,effectiveVisible:flags.get(c.id)?.effectiveVisible??true})).sort((a,b)=>a.path.localeCompare(b.path,"el"));
    }

    const options=await tx.query<SqlRow>(`
      WITH RECURSIVE tree AS (
        SELECT c.id,c.parent_id,c.code,c.active,c.assignable,ARRAY[COALESCE(el.name,en.name,c.code)]::text[] path_names
        FROM categories c
        LEFT JOIN category_translations el ON el.category_id=c.id AND el.locale='el'
        LEFT JOIN category_translations en ON en.category_id=c.id AND en.locale='en'
        WHERE c.parent_id IS NULL AND (c.market_id IS NULL OR c.market_id=(SELECT market_id FROM vendor_businesses WHERE public_id=$1 OR id::text=$1 LIMIT 1))
        UNION ALL
        SELECT c.id,c.parent_id,c.code,c.active,c.assignable,t.path_names||COALESCE(el.name,en.name,c.code)
        FROM categories c JOIN tree t ON c.parent_id=t.id
        LEFT JOIN category_translations el ON el.category_id=c.id AND el.locale='el'
        LEFT JOIN category_translations en ON en.category_id=c.id AND en.locale='en'
        WHERE c.market_id IS NULL OR c.market_id=(SELECT market_id FROM vendor_businesses WHERE public_id=$1 OR id::text=$1 LIMIT 1)
      ) SELECT id::text id,code,path_names FROM tree WHERE active=true AND assignable=true ORDER BY path_names
    `,[id]);
    const categoryOptions: VendorCatalogCategoryOption[]=options.rows.map((r)=>{const names=strings(r.path_names);return{id:text(r.id,"category_id"),code:text(r.code,"category_code"),name:names.at(-1)??text(r.code,"category_code"),path:names.join(" › "),depth:Math.max(0,names.length-1)}});
    return { catalogProducts:products,categories,categoryOptions,catalogMetrics:summarize(products) };
  },{readOnly:true});
}

export async function setVendorCatalogVisibility(principal: SessionPrincipal,input:Readonly<{scope:"product"|"category";visible:boolean;offerId?:string;categoryId?:string}>) {
  if (!postgresVendorRuntimeEnabled()) throw new Error("Visibility controls require the PostgreSQL vendor runtime");
  if (typeof input.visible !== "boolean") throw new Error("Visibility must be true or false");
  return unitOfWork().withTransaction(vendorScope(principal),async(tx)=>{
    const id=vendorId(principal);
    if(input.scope==="product"){
      if(!input.offerId?.trim()) throw new Error("Product offer is required");
      const changed=await tx.query<SqlRow>(`UPDATE vendor_offers SET merchant_visible=$3,merchant_visibility_updated_by=NULLIF(current_setting('app.actor_user_id',true),'')::uuid,merchant_visibility_updated_at=now(),updated_at=now()
        WHERE public_id=$1 AND vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$2 OR id::text=$2 LIMIT 1) AND (status='approved' OR merchant_pause_active=true)
        RETURNING id::text id,status::text status,merchant_visible,merchant_pause_active`,[input.offerId.trim(),id,input.visible]);
      if(!changed.rowCount) throw new Error("This product cannot be changed by the vendor");
      const row=changed.rows[0];
      await tx.query(`INSERT INTO vendor_catalog_visibility_events(vendor_id,offer_id,scope,visible,actor_id,metadata)
        VALUES((SELECT id FROM vendor_businesses WHERE public_id=$1 OR id::text=$1 LIMIT 1),$2::uuid,'product',$3,NULLIF(current_setting('app.actor_user_id',true),'')::uuid,jsonb_build_object('source','vendor_dashboard','offer_public_id',$4))`,[id,text(row.id,"offer_id"),input.visible,input.offerId.trim()]);
      return {ok:true,status:text(row.status,"status"),visible:Boolean(row.merchant_visible),paused:Boolean(row.merchant_pause_active)};
    }
    if(!input.categoryId?.trim()) throw new Error("Category is required");
    const allowed=await tx.query<SqlRow>(`WITH RECURSIVE d AS (SELECT id FROM categories WHERE id=$1::uuid UNION ALL SELECT c.id FROM categories c JOIN d p ON c.parent_id=p.id)
      SELECT $1::uuid::text id WHERE EXISTS(SELECT 1 FROM vendor_offers vo JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id WHERE vo.vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$2 OR id::text=$2 LIMIT 1) AND cv.category_id IN(SELECT id FROM d))`,[input.categoryId.trim(),id]);
    if(!allowed.rowCount) throw new Error("Category is not part of this vendor catalogue");
    await tx.query(`INSERT INTO vendor_category_visibility(vendor_id,category_id,visible,updated_by,created_at,updated_at)
      VALUES((SELECT id FROM vendor_businesses WHERE public_id=$1 OR id::text=$1 LIMIT 1),$2::uuid,$3,NULLIF(current_setting('app.actor_user_id',true),'')::uuid,now(),now())
      ON CONFLICT(vendor_id,category_id) DO UPDATE SET visible=EXCLUDED.visible,updated_by=EXCLUDED.updated_by,updated_at=now()`,[id,input.categoryId.trim(),input.visible]);
    await tx.query(`INSERT INTO vendor_catalog_visibility_events(vendor_id,category_id,scope,visible,actor_id,metadata)
      VALUES((SELECT id FROM vendor_businesses WHERE public_id=$1 OR id::text=$1 LIMIT 1),$2::uuid,'category',$3,NULLIF(current_setting('app.actor_user_id',true),'')::uuid,jsonb_build_object('source','vendor_dashboard'))`,[id,input.categoryId.trim(),input.visible]);
    return {ok:true,visible:input.visible};
  },{isolation:"serializable"});
}

export async function updateVendorCatalogInventory(principal:SessionPrincipal,input:Readonly<{offerId:string;onHand:number;safetyStock:number}>) {
  if(!postgresVendorRuntimeEnabled()) throw new Error("Inventory controls require the PostgreSQL vendor runtime");
  if(!input.offerId?.trim()) throw new Error("Product offer is required");
  if(!Number.isSafeInteger(input.onHand)||input.onHand<0||input.onHand>1_000_000) throw new Error("On-hand stock must be a non-negative integer");
  if(!Number.isSafeInteger(input.safetyStock)||input.safetyStock<0||input.safetyStock>1_000_000) throw new Error("Safety stock must be a non-negative integer");
  return unitOfWork().withTransaction(vendorScope(principal),async(tx)=>{
    const id=vendorId(principal);
    const found=await tx.query<SqlRow>(`SELECT vo.id::text offer_uuid,ib.on_hand,ib.active_reservations FROM vendor_offers vo JOIN inventory_balances ib ON ib.offer_id=vo.id
      WHERE vo.public_id=$1 AND vo.vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$2 OR id::text=$2 LIMIT 1) FOR UPDATE OF ib`,[input.offerId.trim(),id]);
    if(!found.rowCount) throw new Error("Vendor inventory access denied");
    const row=found.rows[0],offerUuid=text(row.offer_uuid,"offer_uuid"),oldOnHand=integer(row.on_hand,"on_hand"),reserved=integer(row.active_reservations,"active_reservations");
    if(input.onHand<reserved) throw new Error("On-hand stock cannot be lower than active reservations");
    if(input.safetyStock>input.onHand-reserved) throw new Error("Safety stock cannot exceed unreserved on-hand stock");
    await tx.query(`UPDATE inventory_balances SET on_hand=$2,safety_stock=$3,source='manual',source_confidence='merchant_confirmed',stock_confirmed_at=now(),freshness_status='fresh',updated_at=now() WHERE offer_id=$1::uuid`,[offerUuid,input.onHand,input.safetyStock]);
    const delta=input.onHand-oldOnHand;
    if(delta!==0) await tx.query(`INSERT INTO inventory_movements(id,public_id,offer_id,movement_type,quantity_delta,source,actor_id,metadata,created_at)
      VALUES(gen_random_uuid(),'im_'||gen_random_uuid()::text,$1::uuid,'vendor_adjustment',$2,'vendor_backoffice',NULLIF(current_setting('app.actor_user_id',true),'')::uuid,jsonb_build_object('from',$3,'to',$4,'safety_stock',$5),now())`,[offerUuid,delta,oldOnHand,input.onHand,input.safetyStock]);
    return {ok:true,onHand:input.onHand,safetyStock:input.safetyStock,reserved};
  },{isolation:"serializable"});
}
