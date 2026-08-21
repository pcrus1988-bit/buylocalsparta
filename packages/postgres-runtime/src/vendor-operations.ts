import { randomUUID } from "node:crypto";
import {
  PostgresUnitOfWork,
  formatMoney,
  money,
  type SessionPrincipal,
  type SqlExecutor,
  type SqlPool,
  type SqlRow
} from "@buy-local-sparta/core";
import { vendorScope } from "./vendor-auth.ts";
import { PostgresCustomerCommerceService } from "./customer-commerce.ts";

const euro = (minor: number) => formatMoney(money(minor, "EUR"));
const int = (value: unknown, field: string): number => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`Invalid integer ${field}`);
  return parsed;
};
const text = (value: unknown, field: string): string => {
  if (typeof value !== "string") throw new Error(`Invalid text ${field}`);
  return value;
};
const optionalText = (value: unknown): string | undefined => typeof value === "string" && value.length ? value : undefined;
const epoch = (value: unknown, field: string): number => {
  const parsed = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  if (!Number.isFinite(parsed)) throw new Error(`Invalid timestamp ${field}`);
  return parsed;
};

export class PostgresVendorOperationsService {
  readonly #pool: SqlPool;
  readonly #uow: PostgresUnitOfWork;
  readonly #commerce: PostgresCustomerCommerceService;

  constructor(pool: SqlPool) {
    this.#pool = pool;
    this.#uow = new PostgresUnitOfWork(pool);
    this.#commerce = new PostgresCustomerCommerceService(pool);
  }

  async dashboard(principal: SessionPrincipal) {
    const vendorId = requiredVendorId(principal);
    return this.#uow.withTransaction(vendorScope(principal.userId, vendorId), async (tx) => {
      const vendor = await tx.query<SqlRow>(`
        SELECT vb.public_id, vb.trading_name,
               COALESCE((SELECT ap.display_name FROM adviser_profiles ap JOIN vendor_users vu ON vu.id=ap.vendor_user_id WHERE vu.vendor_id=vb.id AND ap.active ORDER BY ap.created_at LIMIT 1), vb.trading_name) AS adviser
        FROM vendor_businesses vb WHERE vb.public_id=$1 LIMIT 1`, [vendorId]);
      if (!vendor.rowCount) throw new Error("Vendor profile not found");
      const products = await tx.query<SqlRow>(`
        SELECT vo.public_id AS offer_id,cv.public_id AS canonical_id,
               COALESCE(el.title,en.title,cv.model,cv.slug) AS title,cv.platform_price_minor,vo.supplier_unit_price_minor,
               ib.on_hand,ib.active_reservations,ib.blocked,ib.safety_stock,
               GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked) AS available_to_sell,ib.updated_at
        FROM vendor_offers vo JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
        JOIN inventory_balances ib ON ib.offer_id=vo.id
        LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
        LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
        WHERE vo.vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$1) AND vo.status='approved'
        ORDER BY ib.updated_at DESC,vo.public_id`, [vendorId]);
      const fulfilments = await tx.query<SqlRow>(`
        SELECT fo.id::text AS fulfilment_uuid,fo.public_id AS fulfilment_id,co.public_id AS order_id,co.status::text AS order_status,
               fo.status::text AS status,fo.mode::text AS mode,COALESCE(co.shipping_address_snapshot->>'postcode',co.billing_address_snapshot->>'postcode','23100') AS postcode,
               co.created_at,(co.user_id IS NOT NULL) AS customer_identified,
               COALESCE(SUM(ol.retail_unit_price_minor*ol.quantity),0) AS merchandise_minor,
               COALESCE(fo.delivery_charge_minor,0) AS delivery_minor
        FROM fulfilment_orders fo JOIN customer_orders co ON co.id=fo.order_id
        LEFT JOIN fulfilment_order_lines fol ON fol.fulfilment_order_id=fo.id
        LEFT JOIN order_lines ol ON ol.id=fol.order_line_id
        WHERE fo.vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$1)
        GROUP BY fo.id,co.id ORDER BY co.created_at DESC`, [vendorId]);
      const lineResult = await tx.query<SqlRow>(`
        SELECT fo.public_id AS fulfilment_id,ol.public_id AS line_id,COALESCE(ol.product_snapshot->>'title',cv.model,cv.slug) AS title,ol.quantity,ol.status
        FROM fulfilment_orders fo JOIN fulfilment_order_lines fol ON fol.fulfilment_order_id=fo.id JOIN order_lines ol ON ol.id=fol.order_line_id
        JOIN canonical_variants cv ON cv.id=ol.canonical_variant_id
        WHERE fo.vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$1)`, [vendorId]);
      const linesByFulfilment = new Map<string, Array<{id:string;title:string;quantity:number;status:string}>>();
      for (const row of lineResult.rows) {
        const key = text(row.fulfilment_id,"fulfilment_id");
        const list = linesByFulfilment.get(key) ?? [];
        list.push({ id:text(row.line_id,"line_id"), title:text(row.title,"title"), quantity:int(row.quantity,"quantity"), status:text(row.status,"status") });
        linesByFulfilment.set(key,list);
      }
      const ownValue = await tx.query<SqlRow>(`
        SELECT COALESCE(SUM(ol.supplier_unit_price_minor*ol.quantity),0) AS value_minor FROM order_lines ol
        WHERE ol.vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$1) AND ol.status<>'cancelled'`, [vendorId]);
      const mappedProducts = products.rows.map((row) => ({
        offerId:text(row.offer_id,"offer_id"), canonicalVariantId:text(row.canonical_id,"canonical_id"), title:text(row.title,"title"),
        retailPrice:euro(int(row.platform_price_minor,"platform_price_minor")), supplierPrice:euro(int(row.supplier_unit_price_minor,"supplier_unit_price_minor")),
        onHand:int(row.on_hand,"on_hand"), reserved:int(row.active_reservations,"active_reservations"), blocked:int(row.blocked,"blocked"), safetyStock:int(row.safety_stock,"safety_stock"),
        availableToSell:int(row.available_to_sell,"available_to_sell"), updatedAt:epoch(row.updated_at,"updated_at")
      }));
      const mappedFulfilments = fulfilments.rows.map((row) => {
        const orderStatus=text(row.order_status,"order_status"), mode=text(row.mode,"mode"), status=text(row.status,"status"), id=text(row.fulfilment_id,"fulfilment_id");
        return { id, orderId:text(row.order_id,"order_id"), orderStatus,status,mode,postcode:text(row.postcode,"postcode"),createdAt:epoch(row.created_at,"created_at"),
          customerIdentified:Boolean(row.customer_identified),merchandiseSubtotal:euro(int(row.merchandise_minor,"merchandise_minor")),deliveryCharge:euro(int(row.delivery_minor,"delivery_minor")),
          lines:linesByFulfilment.get(id)??[],actions:fulfilmentActions(orderStatus,mode,status) };
      });
      return {
        vendor:{id:text(vendor.rows[0].public_id,"public_id"),name:text(vendor.rows[0].trading_name,"trading_name"),adviser:text(vendor.rows[0].adviser,"adviser")},
        account:{email:principal.email,roles:principal.roles}, csrfToken:principal.csrfToken,
        metrics:{ordersRequiringAction:mappedFulfilments.filter((x)=>["awaiting_acceptance","accepted","picking","packed"].includes(x.status)).length,activeProducts:mappedProducts.length,
          availableUnits:mappedProducts.reduce((s,p)=>s+p.availableToSell,0),openFulfilments:mappedFulfilments.filter((x)=>!["delivered","rejected","cancelled","failed"].includes(x.status)).length},
        products:mappedProducts,fulfilments:mappedFulfilments,
        finance:{supplierValueSnapshot:euro(int(ownValue.rows[0]?.value_minor??0,"supplier_value")),note:"Operational supplier-value snapshot only. Supplier invoices, platform fees, settlement approval and payout remain governed by the finance workflow."}
      };
    }, { readOnly:true });
  }

  async updateStock(principal: SessionPrincipal, input: { offerId: string; onHand: number; now?: number }) {
    const vendorId=requiredVendorId(principal); const now=input.now??Date.now();
    if(!Number.isSafeInteger(input.onHand)||input.onHand<0||input.onHand>1_000_000) throw new Error("Stock must be a non-negative integer");
    return this.#uow.withTransaction(vendorScope(principal.userId,vendorId),async(tx)=>{
      const current=await tx.query<SqlRow>(`SELECT vo.id::text AS offer_uuid,ib.on_hand,ib.active_reservations FROM vendor_offers vo JOIN inventory_balances ib ON ib.offer_id=vo.id
        WHERE vo.public_id=$1 AND vo.vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$2) FOR UPDATE OF ib`,[input.offerId,vendorId]);
      if(!current.rowCount) throw new Error("Vendor inventory access denied");
      const row=current.rows[0],reserved=int(row.active_reservations,"active_reservations"),old=int(row.on_hand,"on_hand");
      if(input.onHand<reserved) throw new Error("On-hand stock cannot be lower than active customer reservations");
      await tx.query(`UPDATE inventory_balances SET on_hand=$2,source='manual',source_confidence='merchant_confirmed',stock_confirmed_at=$3,updated_at=$3 WHERE offer_id=$1`,[text(row.offer_uuid,"offer_uuid"),input.onHand,new Date(now)]);
      await tx.query(`INSERT INTO inventory_movements(id,public_id,offer_id,movement_type,quantity_delta,source,actor_id,metadata,created_at)
        VALUES($1,$2,$3,'vendor_adjustment',$4,'vendor_backoffice',(SELECT id FROM users WHERE public_id=$5),$6::jsonb,$7)`,[randomUUID(),`im_${randomUUID()}`,text(row.offer_uuid,"offer_uuid"),input.onHand-old,principal.userId,JSON.stringify({from:old,to:input.onHand}),new Date(now)]);
      return { onHand:input.onHand,activeReservations:reserved };
    },{isolation:"serializable"});
  }

  async actOnFulfilment(principal: SessionPrincipal,input:{fulfilmentId:string;action:string;now?:number}) {
    const vendorId=requiredVendorId(principal);const now=input.now??Date.now();
    if(input.action==="reject") return this.#commerce.rejectVendorFulfilment({actorUserId:principal.userId,vendorId,fulfilmentId:input.fulfilmentId,now});
    return this.#uow.withTransaction(vendorScope(principal.userId,vendorId),async(tx)=>{
      const found=await tx.query<SqlRow>(`SELECT fo.id::text AS id,fo.status::text AS status,fo.mode::text AS mode,co.id::text AS order_uuid,co.status::text AS order_status
        FROM fulfilment_orders fo JOIN customer_orders co ON co.id=fo.order_id
        WHERE fo.public_id=$1 AND fo.vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$2) FOR UPDATE OF fo`,[input.fulfilmentId,vendorId]);
      if(!found.rowCount) throw new Error("Vendor fulfilment access denied");
      const row=found.rows[0],id=text(row.id,"id"),status=text(row.status,"status"),mode=text(row.mode,"mode"),orderStatus=text(row.order_status,"order_status");
      if(input.action==="accept"){
        if(status!=="awaiting_acceptance") throw new Error("Only awaiting fulfilment can be accepted");
        if(!["confirmed","partially_fulfilled"].includes(orderStatus)) throw new Error("Order must be payment-confirmed before vendor acceptance");
        await tx.query(`SELECT consume_stock_reservation(sr.id,$2,(SELECT id FROM users WHERE public_id=$3))
          FROM stock_reservations sr JOIN fulfilment_order_lines fol ON fol.order_line_id=sr.order_line_id
          WHERE fol.fulfilment_order_id=$1 AND sr.status='active'`,[id,new Date(now),principal.userId]);
        await tx.query("UPDATE fulfilment_orders SET status='accepted',accepted_at=$2,updated_at=$2 WHERE id=$1",[id,new Date(now)]);
      } else if(input.action==="ready"){
        if(!["confirmed","partially_fulfilled"].includes(orderStatus)) throw new Error("Order must be confirmed before pickup preparation can complete");
        if(mode!=="pickup") throw new Error("Ready-for-pickup is only valid for pickup fulfilments");
        if(!["accepted","picking","packed"].includes(status)) throw new Error("Fulfilment is not ready for this action");
        await tx.query("UPDATE fulfilment_orders SET status='ready_for_handover',updated_at=$2 WHERE id=$1",[id,new Date(now)]);
        await tx.query("UPDATE pickup_groups SET ready_at=COALESCE(ready_at,$2) WHERE fulfilment_order_id=$1",[id,new Date(now)]);
      } else if(input.action==="delivered"){
        if(!["confirmed","partially_fulfilled"].includes(orderStatus)) throw new Error("Order must be confirmed before local delivery can complete");
        if(mode!=="local_delivery") throw new Error("Vendor delivery confirmation is only allowed for local-delivery fulfilments; shipping delivery is carrier-confirmed");
        if(!["accepted","picking","packed","ready_for_handover"].includes(status)) throw new Error("Fulfilment is not ready for this action");
        await tx.query("UPDATE fulfilment_orders SET status='delivered',delivered_at=$2,updated_at=$2 WHERE id=$1",[id,new Date(now)]);
        await tx.query(`UPDATE order_lines SET status='fulfilled',fulfilled_quantity=quantity,fulfilled_at=COALESCE(fulfilled_at,$2)
          WHERE id IN (SELECT order_line_id FROM fulfilment_order_lines WHERE fulfilment_order_id=$1)`,[id,new Date(now)]);
      } else throw new Error("Unsupported fulfilment action");
      return {ok:true};
    },{isolation:"serializable"});
  }

  async catalogWorkspace(principal:SessionPrincipal){
    const vendorId=requiredVendorId(principal);
    return this.#uow.withTransaction(vendorScope(principal.userId,vendorId),async(tx)=>{
      const rows=await tx.query<SqlRow>(`SELECT s.public_id,s.vendor_sku,s.source_identity,c.code AS category_code,s.status,s.supplier_unit_price_minor,s.stock_on_hand,s.fulfilment_modes,s.advice_available,s.rejection_reason,s.updated_at,cv.public_id AS canonical_public_id
        FROM vendor_product_submissions s JOIN categories c ON c.id=s.category_id LEFT JOIN canonical_variants cv ON cv.id=s.canonical_variant_id
        WHERE s.vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$1) ORDER BY s.updated_at DESC`,[vendorId]);
      const candidateRows=await tx.query<SqlRow>(`SELECT pmc.public_id,pmc.submission_id::text AS submission_uuid,cv.public_id AS canonical_public_id,COALESCE(el.title,en.title,cv.model,cv.slug) AS canonical_title,
        pmc.match_level,pmc.confidence,pmc.status FROM product_merge_candidates pmc JOIN canonical_variants cv ON cv.id=pmc.candidate_variant_id
        LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el' LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
        WHERE pmc.source_vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$1)`,[vendorId]);
      const subIds=await tx.query<SqlRow>(`SELECT id::text AS id,public_id FROM vendor_product_submissions WHERE vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$1)`,[vendorId]);
      const pubByUuid=new Map(subIds.rows.map(r=>[text(r.id,"id"),text(r.public_id,"public_id")]));
      const candidates=new Map<string,any[]>();
      for(const c of candidateRows.rows){const key=pubByUuid.get(text(c.submission_uuid,"submission_uuid"));if(!key)continue;const list=candidates.get(key)??[];list.push({id:text(c.public_id,"public_id"),canonicalVariantId:text(c.canonical_public_id,"canonical_public_id"),canonicalTitle:text(c.canonical_title,"canonical_title"),level:text(c.match_level,"match_level"),confidence:Number(c.confidence),status:text(c.status,"status")});candidates.set(key,list)}
      return {csrfToken:principal.csrfToken,vendorId,submissions:rows.rows.map(r=>{const identity=(r.source_identity??{}) as Record<string,unknown>;const id=text(r.public_id,"public_id");return {id,vendorSku:optionalText(r.vendor_sku),title:typeof identity.title==="string"?identity.title:"Untitled",categoryCode:text(r.category_code,"category_code"),status:text(r.status,"status"),canonicalVariantId:optionalText(r.canonical_public_id),supplierPrice:euro(int(r.supplier_unit_price_minor,"supplier_unit_price_minor")),stockOnHand:int(r.stock_on_hand,"stock_on_hand"),fulfilmentModes:Array.isArray(r.fulfilment_modes)?r.fulfilment_modes.map(String):[],adviceAvailable:Boolean(r.advice_available),rejectionReason:optionalText(r.rejection_reason),updatedAt:epoch(r.updated_at,"updated_at"),candidates:candidates.get(id)??[]}}),
        csvTemplate:"vendor_sku,category_code,title,brand,model,gtin,supplier_price_minor,stock_on_hand,safety_stock,fulfilment_modes,advice_available,attributes"};
    },{readOnly:true});
  }

  async createProductDraft(principal:SessionPrincipal,input:{title:string;categoryCode:string;vendorSku?:string;brand?:string;model?:string;gtin?:string;supplierUnitPriceMinor:number;stockOnHand:number;safetyStock?:number;adviceAvailable?:boolean;source?:"manual"|"csv"}){
    const vendorId=requiredVendorId(principal); const safety=input.safetyStock??0;
    if(!input.title.trim()||!input.categoryCode.trim()) throw new Error("Title and category are required");
    if(!Number.isSafeInteger(input.supplierUnitPriceMinor)||input.supplierUnitPriceMinor<0) throw new Error("Supplier price must use non-negative integer minor units");
    if(!Number.isSafeInteger(input.stockOnHand)||input.stockOnHand<0||!Number.isSafeInteger(safety)||safety<0||safety>input.stockOnHand) throw new Error("Invalid stock/safety stock");
    return this.#uow.withTransaction(vendorScope(principal.userId,vendorId),async(tx)=>{
      const refs=await tx.query<SqlRow>(`SELECT vb.id::text AS vendor_uuid,(SELECT id::text FROM vendor_locations WHERE vendor_id=vb.id AND active ORDER BY created_at LIMIT 1) AS location_uuid,
        (SELECT id::text FROM categories WHERE code=$2 AND market_id=vb.market_id LIMIT 1) AS category_uuid,(SELECT id::text FROM users WHERE public_id=$3) AS user_uuid,vb.market_id::text AS market_uuid
        FROM vendor_businesses vb WHERE vb.public_id=$1`,[vendorId,input.categoryCode,principal.userId]);
      if(!refs.rowCount||!refs.rows[0].location_uuid) throw new Error("Vendor location is not configured");if(!refs.rows[0].category_uuid) throw new Error("Unknown category");
      const publicId=`vps_${randomUUID()}`;const identity={title:input.title.trim(),brand:input.brand?.trim()||undefined,model:input.model?.trim()||undefined,gtin:input.gtin?.trim()||undefined};
      await tx.query(`INSERT INTO vendor_product_submissions(id,public_id,market_id,vendor_id,location_id,vendor_sku,category_id,source_identity,supplier_unit_price_minor,currency,stock_on_hand,safety_stock,fulfilment_modes,advice_available,source,source_payload,status,created_by,created_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,'EUR',$10,$11,ARRAY['pickup']::fulfilment_mode[],$12,$13,'{}'::jsonb,'draft',$14,now(),now())`,[randomUUID(),publicId,text(refs.rows[0].market_uuid,"market_uuid"),text(refs.rows[0].vendor_uuid,"vendor_uuid"),text(refs.rows[0].location_uuid,"location_uuid"),input.vendorSku?.trim()||null,text(refs.rows[0].category_uuid,"category_uuid"),JSON.stringify(identity),input.supplierUnitPriceMinor,input.stockOnHand,safety,input.adviceAvailable!==false,input.source??"manual",text(refs.rows[0].user_uuid,"user_uuid")]);
      return {id:publicId};
    });
  }

  async submitProduct(principal:SessionPrincipal,submissionId:string){
    const vendorId=requiredVendorId(principal);
    return this.#uow.withTransaction(vendorScope(principal.userId,vendorId),async(tx)=>{
      const changed=await tx.query<SqlRow>(`UPDATE vendor_product_submissions SET status='submitted',updated_at=now() WHERE public_id=$1 AND vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$2) AND status='draft' RETURNING id::text AS id`,[submissionId,vendorId]);
      if(!changed.rowCount) throw new Error("Only an owned draft can be submitted");
      await tx.query(`INSERT INTO catalog_workflow_events(id,public_id,submission_id,actor_id,action,from_status,to_status,metadata,created_at)
        VALUES($1,$2,$3,(SELECT id FROM users WHERE public_id=$4),'submit','draft','submitted','{}'::jsonb,now())`,[randomUUID(),`cwe_${randomUUID()}`,text(changed.rows[0].id,"id"),principal.userId]);
      return {ok:true};
    });
  }

  async trustWorkspace(principal:SessionPrincipal){
    const vendorId=requiredVendorId(principal);
    return this.#uow.withTransaction(vendorScope(principal.userId,vendorId),async(tx)=>{
      const canonical=await tx.query<SqlRow>(`SELECT DISTINCT cv.public_id,COALESCE(el.title,en.title,cv.model,cv.slug) AS title FROM canonical_variants cv
        JOIN vendor_offers vo ON vo.canonical_variant_id=cv.id LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el' LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
        WHERE vo.vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$1) ORDER BY title`,[vendorId]);
      const assets=await tx.query<SqlRow>(`SELECT pm.public_id,cv.public_id AS canonical_public_id,pm.kind,pm.original_filename,pm.content_type,pm.byte_size,pm.scan_status,pm.rights_status,pm.moderation_status,pm.rejection_reason,pm.created_at
        FROM product_media pm LEFT JOIN canonical_variants cv ON cv.id=pm.canonical_variant_id WHERE pm.vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$1) ORDER BY pm.created_at DESC`,[vendorId]);
      const docs=await tx.query<SqlRow>(`SELECT d.public_id,cv.public_id AS canonical_public_id,d.type,d.issuer,d.identifier,d.status,d.valid_to,d.rejection_reason,d.created_at,linked_media.public_id AS media_public_id FROM product_compliance_documents d
        JOIN canonical_variants cv ON cv.id=d.canonical_variant_id LEFT JOIN product_media linked_media ON linked_media.id=d.media_asset_id WHERE d.vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$1) ORDER BY d.created_at DESC`,[vendorId]);
      return {csrfToken:principal.csrfToken,canonicalProducts:canonical.rows.map(r=>({id:text(r.public_id,"public_id"),title:text(r.title,"title")})),assets:assets.rows.map(r=>({id:text(r.public_id,"public_id"),canonicalVariantId:optionalText(r.canonical_public_id),kind:text(r.kind,"kind"),filename:optionalText(r.original_filename)??"media",contentType:optionalText(r.content_type)??"application/octet-stream",byteSize:int(r.byte_size??0,"byte_size"),scanStatus:text(r.scan_status,"scan_status"),rightsStatus:text(r.rights_status,"rights_status"),moderationStatus:text(r.moderation_status,"moderation_status"),rejectionReason:optionalText(r.rejection_reason),createdAt:epoch(r.created_at,"created_at")})),documents:docs.rows.map(r=>({id:text(r.public_id,"public_id"),canonicalVariantId:text(r.canonical_public_id,"canonical_public_id"),type:text(r.type,"type"),issuer:optionalText(r.issuer),identifier:optionalText(r.identifier),mediaAssetId:optionalText(r.media_public_id),status:text(r.status,"status"),validTo:r.valid_to?epoch(r.valid_to,"valid_to"):undefined,rejectionReason:optionalText(r.rejection_reason),createdAt:epoch(r.created_at,"created_at")}))};
    },{readOnly:true});
  }

  async submitCompliance(principal:SessionPrincipal,input:{canonicalVariantId:string;type:string;issuer?:string;identifier?:string;mediaAssetId?:string;validTo?:number}){
    const vendorId=requiredVendorId(principal);if(!input.type.trim()) throw new Error("Compliance document type is required");
    return this.#uow.withTransaction(vendorScope(principal.userId,vendorId),async(tx)=>{
      const canonical=await tx.query<SqlRow>(`SELECT cv.id::text AS id FROM canonical_variants cv WHERE cv.public_id=$1 AND EXISTS(SELECT 1 FROM vendor_offers vo WHERE vo.canonical_variant_id=cv.id AND vo.vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$2))`,[input.canonicalVariantId,vendorId]);
      if(!canonical.rowCount) throw new Error("Vendor compliance access denied for canonical product");
      let mediaUuid:null|string=null;let objectKey:null|string=null;
      if(input.mediaAssetId){const media=await tx.query<SqlRow>(`SELECT id::text AS id,object_key FROM product_media WHERE public_id=$1 AND vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$2)`,[input.mediaAssetId,vendorId]);if(!media.rowCount)throw new Error("Compliance evidence belongs to another vendor");mediaUuid=text(media.rows[0].id,"id");objectKey=text(media.rows[0].object_key,"object_key")}
      const publicId=`pcd_${randomUUID()}`;
      await tx.query(`INSERT INTO product_compliance_documents(id,public_id,canonical_variant_id,type,issuer,identifier,object_key,valid_to,vendor_id,media_asset_id,status,created_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,(SELECT id FROM vendor_businesses WHERE public_id=$9),$10,'pending',now())`,[randomUUID(),publicId,text(canonical.rows[0].id,"id"),input.type.trim(),input.issuer?.trim()||null,input.identifier?.trim()||null,objectKey,input.validTo?new Date(input.validTo).toISOString().slice(0,10):null,vendorId,mediaUuid]);
      return {id:publicId,status:"pending"};
    });
  }

  async adviceWorkspace(principal:SessionPrincipal){
    const vendorId=requiredVendorId(principal);
    return this.#uow.withTransaction(vendorScope(principal.userId,vendorId),async(tx)=>{
      const conv=await tx.query<SqlRow>(`SELECT c.id::text AS uuid,c.public_id,c.status::text AS state,cv.public_id AS canonical_public_id,c.updated_at FROM conversations c LEFT JOIN canonical_variants cv ON cv.id=c.canonical_variant_id
        WHERE c.vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$1) ORDER BY c.updated_at DESC`,[vendorId]);
      const messages=await tx.query<SqlRow>(`SELECT c.public_id AS conversation_id,m.public_id,m.sender_type,m.body,m.created_at FROM messages m JOIN conversations c ON c.id=m.conversation_id
        WHERE c.vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$1) ORDER BY m.created_at`,[vendorId]);
      const msgMap=new Map<string,any[]>();for(const r of messages.rows){const k=text(r.conversation_id,"conversation_id"),l=msgMap.get(k)??[];l.push({id:text(r.public_id,"public_id"),senderType:text(r.sender_type,"sender_type"),body:optionalText(r.body)??"",createdAt:epoch(r.created_at,"created_at")});msgMap.set(k,l)}
      const appointments=await tx.query<SqlRow>(`SELECT a.public_id,a.status::text,a.channel,a.starts_at,a.ends_at,cv.public_id AS canonical_public_id FROM appointments a LEFT JOIN canonical_variants cv ON cv.id=a.canonical_variant_id
        WHERE a.vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$1) ORDER BY a.starts_at DESC`,[vendorId]);
      const counteroffers=await tx.query<SqlRow>(`SELECT cr.public_id,cr.status::text,cv.public_id AS canonical_public_id,cr.source_metadata,cr.created_at FROM counteroffer_requests cr LEFT JOIN canonical_variants cv ON cv.id=cr.canonical_variant_id
        WHERE cr.assigned_vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$1) ORDER BY cr.created_at DESC`,[vendorId]);
      const privateOffers=await tx.query<SqlRow>(`SELECT po.public_id,po.status,cv.public_id AS canonical_public_id,po.price_minor,po.currency,po.created_at FROM private_offers po JOIN canonical_variants cv ON cv.id=po.canonical_variant_id
        WHERE po.vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$1) ORDER BY po.created_at DESC`,[vendorId]);
      const notifications=await tx.query<SqlRow>(`SELECT public_id,event_type,payload,status,created_at FROM notifications WHERE vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$1) AND channel='in_app' ORDER BY created_at DESC LIMIT 30`,[vendorId]);
      return {csrfToken:principal.csrfToken,conversations:conv.rows.map(r=>({id:text(r.public_id,"public_id"),state:text(r.state,"state"),canonicalVariantId:optionalText(r.canonical_public_id),updatedAt:epoch(r.updated_at,"updated_at"),messages:msgMap.get(text(r.public_id,"public_id"))??[]})),appointments:appointments.rows.map(r=>({id:text(r.public_id,"public_id"),status:text(r.status,"status"),channel:text(r.channel,"channel"),startsAt:epoch(r.starts_at,"starts_at"),endsAt:epoch(r.ends_at,"ends_at"),canonicalVariantId:optionalText(r.canonical_public_id)})),counteroffers:counteroffers.rows.map(r=>({id:text(r.public_id,"public_id"),status:text(r.status,"status"),canonicalVariantId:optionalText(r.canonical_public_id),need:((r.source_metadata??{}) as Record<string,unknown>).need??"Local request",createdAt:epoch(r.created_at,"created_at")})),privateOffers:privateOffers.rows.map(r=>({id:text(r.public_id,"public_id"),status:text(r.status,"status"),canonicalVariantId:text(r.canonical_public_id,"canonical_public_id"),price:euro(int(r.price_minor,"price_minor")),createdAt:epoch(r.created_at,"created_at")})),notifications:notifications.rows.map(r=>{const p=(r.payload??{}) as Record<string,unknown>;return{id:text(r.public_id,"public_id"),title:typeof p.title==="string"?p.title:text(r.event_type,"event_type"),body:typeof p.body==="string"?p.body:"",status:text(r.status,"status"),createdAt:epoch(r.created_at,"created_at")}})};
    },{readOnly:true});
  }

  async sendAdviceMessage(principal:SessionPrincipal,conversationId:string,body:string){
    const vendorId=requiredVendorId(principal);if(!body.trim())throw new Error("Message body is required");
    return this.#uow.withTransaction(vendorScope(principal.userId,vendorId),async(tx)=>{
      const conv=await tx.query<SqlRow>(`SELECT id::text AS id FROM conversations WHERE public_id=$1 AND vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$2)`,[conversationId,vendorId]);if(!conv.rowCount)throw new Error("Vendor advice access denied");
      const publicId=`msg_${randomUUID()}`;await tx.query(`INSERT INTO messages(id,public_id,conversation_id,sender_user_id,sender_type,body,created_at) VALUES($1,$2,$3,(SELECT id FROM users WHERE public_id=$4),'vendor',$5,now())`,[randomUUID(),publicId,text(conv.rows[0].id,"id"),principal.userId,body.trim()]);await tx.query("UPDATE conversations SET updated_at=now() WHERE id=$1",[text(conv.rows[0].id,"id")]);return{id:publicId};
    });
  }

  async appointmentAction(principal:SessionPrincipal,appointmentId:string,action:"complete"|"cancel"){
    const vendorId=requiredVendorId(principal);return this.#uow.withTransaction(vendorScope(principal.userId,vendorId),async(tx)=>{
      const next=action==="complete"?"completed":"cancelled";const changed=await tx.query(`UPDATE appointments SET status=$3,updated_at=now() WHERE public_id=$1 AND vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$2) AND status IN ('pending','confirmed')`,[appointmentId,vendorId,next]);if(!changed.rowCount)throw new Error("Vendor appointment access denied or invalid state");return{ok:true};
    });
  }

  async financeWorkspace(principal:SessionPrincipal){
    const vendorId=requiredVendorId(principal);
    return this.#uow.withTransaction(vendorScope(principal.userId,vendorId),async(tx)=>{
      const procurement=await tx.query<SqlRow>(`SELECT p.public_id,p.status::text,co.public_id AS order_id,p.supplier_net_minor,p.supplier_tax_minor,p.shipping_reimbursement_minor,p.service_fee_minor,p.payable_minor,p.updated_at,
        (SELECT vi.invoice_number FROM procurement_invoice_matches pim JOIN vendor_invoices vi ON vi.id=pim.vendor_invoice_id WHERE pim.procurement_id=p.id ORDER BY pim.created_at DESC LIMIT 1) AS invoice_number,
        (SELECT COALESCE(sl.payout_reference,sb.payout_reference) FROM settlement_lines sl JOIN settlement_batches sb ON sb.id=sl.batch_id WHERE sl.procurement_id=p.id ORDER BY sb.created_at DESC LIMIT 1) AS payout_reference
        FROM procurements p JOIN customer_orders co ON co.id=p.order_id WHERE p.vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$1) ORDER BY p.updated_at DESC`,[vendorId]);
      const settlements=await tx.query<SqlRow>(`SELECT sb.public_id,sb.batch_number,sb.status,COALESCE(SUM(sl.final_minor),0) AS total_payable,sb.period_start,sb.period_end,sb.paid_at,sb.payout_reference
        FROM settlement_lines sl JOIN settlement_batches sb ON sb.id=sl.batch_id WHERE sl.vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$1) GROUP BY sb.id ORDER BY sb.created_at DESC`,[vendorId]);
      return {csrfToken:principal.csrfToken,procurements:procurement.rows.map(r=>{const gross=int(r.supplier_net_minor,"supplier_net_minor")+int(r.supplier_tax_minor,"supplier_tax_minor");return{id:text(r.public_id,"public_id"),orderId:text(r.order_id,"order_id"),status:text(r.status,"status"),invoiceNumber:optionalText(r.invoice_number),gross:euro(gross),serviceFeeGross:euro(int(r.service_fee_minor??0,"service_fee_minor")),shippingReimbursement:euro(int(r.shipping_reimbursement_minor??0,"shipping_reimbursement_minor")),payable:euro(int(r.payable_minor,"payable_minor")),payoutReference:optionalText(r.payout_reference),updatedAt:epoch(r.updated_at,"updated_at")}}),settlements:settlements.rows.map(r=>({id:text(r.public_id,"public_id"),batchNumber:text(r.batch_number,"batch_number"),status:text(r.status,"status"),totalPayable:euro(int(r.total_payable,"total_payable")),periodStart:epoch(r.period_start,"period_start"),periodEnd:epoch(r.period_end,"period_end"),paidAt:r.paid_at?epoch(r.paid_at,"paid_at"):undefined,payoutReference:optionalText(r.payout_reference),lines:[]}))};
    },{readOnly:true});
  }

  async submitInvoice(principal:SessionPrincipal,input:{procurementId:string;invoiceNumber:string;invoiceGrossMinor:number}){
    const vendorId=requiredVendorId(principal);if(!input.invoiceNumber.trim())throw new Error("Invoice number is required");if(!Number.isSafeInteger(input.invoiceGrossMinor)||input.invoiceGrossMinor<0)throw new Error("Invoice gross must use non-negative integer minor units");
    return this.#uow.withTransaction(vendorScope(principal.userId,vendorId),async(tx)=>{
      const p=await tx.query<SqlRow>(`SELECT id::text AS id,status::text,supplier_net_minor,supplier_tax_minor FROM procurements WHERE public_id=$1 AND vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$2) FOR UPDATE`,[input.procurementId,vendorId]);if(!p.rowCount)throw new Error("Vendor finance access denied");const row=p.rows[0],status=text(row.status,"status");if(["settled","reversed"].includes(status))throw new Error(`Cannot match invoice in ${status}`);const gross=int(row.supplier_net_minor,"net")+int(row.supplier_tax_minor,"tax");
      const invoiceId=`vinv_${randomUUID()}`;const invoiceUuid=randomUUID();await tx.query(`INSERT INTO vendor_invoices(id,public_id,vendor_id,invoice_number,invoice_date,currency,net_minor,tax_minor,gross_minor,status,created_at)
        VALUES($1,$2,(SELECT id FROM vendor_businesses WHERE public_id=$3),$4,current_date,'EUR',$5,$6,$7,'received',now())`,[invoiceUuid,invoiceId,vendorId,input.invoiceNumber.trim(),int(row.supplier_net_minor,"net"),int(row.supplier_tax_minor,"tax"),input.invoiceGrossMinor]);await tx.query(`INSERT INTO procurement_invoice_matches(procurement_id,vendor_invoice_id,matched_minor,created_at) VALUES($1,$2,$3,now())`,[text(row.id,"id"),invoiceUuid,Math.min(gross,input.invoiceGrossMinor)]);await tx.query("UPDATE procurements SET status=$2,updated_at=now() WHERE id=$1",[text(row.id,"id"),input.invoiceGrossMinor===gross?"matched":"disputed"]);return{id:invoiceId,status:input.invoiceGrossMinor===gross?"matched":"disputed"};
    },{isolation:"serializable"});
  }

  async analyticsWorkspace(principal:SessionPrincipal){
    const vendorId=requiredVendorId(principal);
    return this.#uow.withTransaction(vendorScope(principal.userId,vendorId),async(tx)=>{
      const rows=await tx.query<SqlRow>(`SELECT metrics FROM analytics_vendor_daily WHERE vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$1) AND day>=current_date-30 ORDER BY day`,[vendorId]);
      const totals:Record<string,number>={};for(const r of rows.rows){const m=(r.metrics??{}) as Record<string,unknown>;for(const [k,v] of Object.entries(m))if(typeof v==="number"&&Number.isFinite(v))totals[k]=(totals[k]??0)+v}
      return {period:"30d",qualifiedImpressions:totals.qualifiedImpressions??0,productViews:totals.productViews??0,cartAdds:totals.cartAdds??0,attributedOrders:totals.attributedOrders??0,attributedUnits:totals.attributedUnits??0,attributedRetailSales:euro(Math.round(totals.attributedRetailSalesMinor??0)),adviceStarts:totals.adviceStarts??0,appointmentsBooked:totals.appointmentsBooked??0,counterofferRequests:totals.counterofferRequests??0,counterofferOffers:totals.counterofferOffers??0,counterofferAccepted:totals.counterofferAccepted??0};
    },{readOnly:true});
  }

  async returnsWorkspace(principal:SessionPrincipal){
    const vendorId=requiredVendorId(principal);
    return this.#uow.withTransaction(vendorScope(principal.userId,vendorId),async(tx)=>{
      const rows=await tx.query<SqlRow>(`SELECT r.public_id,co.public_id AS order_id,ol.public_id AS line_id,cv.public_id AS canonical_public_id,rl.quantity,r.reason_type,r.requested_remedy,r.status::text,r.created_at,r.rma_code,r.destination_instructions,
        rr.public_id AS replacement_id,rr.status AS replacement_status,rr.reference AS replacement_reference,rr.fulfilment_mode::text AS replacement_fulfilment_mode,rp.public_id AS repair_id,rp.status AS repair_status,rp.repairer_reference
        FROM returns r JOIN customer_orders co ON co.id=r.order_id JOIN return_lines rl ON rl.return_id=r.id JOIN order_lines ol ON ol.id=rl.order_line_id JOIN canonical_variants cv ON cv.id=ol.canonical_variant_id
        LEFT JOIN return_replacements rr ON rr.return_id=r.id AND rr.vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$1)
        LEFT JOIN return_repairs rp ON rp.return_id=r.id AND rp.vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$1)
        WHERE r.destination_vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$1) OR rr.vendor_id IS NOT NULL OR rp.vendor_id IS NOT NULL ORDER BY r.created_at DESC`,[vendorId]);
      return {csrfToken:principal.csrfToken,returns:rows.rows.map(r=>({id:text(r.public_id,"public_id"),orderId:text(r.order_id,"order_id"),orderLineId:text(r.line_id,"line_id"),canonicalVariantId:text(r.canonical_public_id,"canonical_public_id"),quantity:int(r.quantity,"quantity"),reason:text(r.reason_type,"reason_type"),requestedRemedy:optionalText(r.requested_remedy),status:text(r.status,"status"),requestedAt:epoch(r.created_at,"created_at"),authorization:r.rma_code?{rmaCode:text(r.rma_code,"rma_code"),instructions:optionalText(r.destination_instructions)??"Follow platform return instructions"}:undefined,replacement:r.replacement_id?{id:text(r.replacement_id,"replacement_id"),status:text(r.replacement_status,"replacement_status"),fulfilmentMode:text(r.replacement_fulfilment_mode,"replacement_fulfilment_mode"),reference:optionalText(r.replacement_reference)}:undefined,repair:r.repair_id?{id:text(r.repair_id,"repair_id"),status:text(r.repair_status,"repair_status"),reference:optionalText(r.repairer_reference)}:undefined}))};
    },{readOnly:true});
  }

  async returnAction(principal:SessionPrincipal,input:{returnId:string;kind:"replacement"|"repair";action:string;reference?:string}){
    const vendorId=requiredVendorId(principal);const now=new Date();
    return this.#uow.withTransaction(vendorScope(principal.userId,vendorId),async(tx)=>{
      if(input.kind==="replacement"){
        const transitions:Record<string,string>={accept:"accepted",ready:"ready_for_handover",ship:"shipped",deliver:"delivered",reject:"rejected"};const next=transitions[input.action];if(!next)throw new Error("Unsupported replacement action");
        const changed=await tx.query(`UPDATE return_replacements rr SET status=$3,reference=COALESCE($4,reference),accepted_at=CASE WHEN $3='accepted' THEN COALESCE(accepted_at,$5) ELSE accepted_at END,delivered_at=CASE WHEN $3='delivered' THEN $5 ELSE delivered_at END,updated_at=$5
          FROM returns r WHERE rr.return_id=r.id AND r.public_id=$1 AND rr.vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$2)`,[input.returnId,vendorId,next,input.reference?.trim()||null,now]);if(!changed.rowCount)throw new Error("Vendor return access denied");return{ok:true};
      }
      const transitions:Record<string,string>={start:"in_repair",await_part:"awaiting_part",ready:"ready_for_customer",return_to_customer:"returned",fail:"failed"};const next=transitions[input.action];if(!next)throw new Error("Unsupported repair action");
      const changed=await tx.query(`UPDATE return_repairs rp SET status=$3,repairer_reference=COALESCE($4,repairer_reference),started_at=CASE WHEN $3='in_repair' THEN COALESCE(started_at,$5) ELSE started_at END,ready_at=CASE WHEN $3='ready_for_customer' THEN $5 ELSE ready_at END,returned_at=CASE WHEN $3='returned' THEN $5 ELSE returned_at END,updated_at=$5
        FROM returns r WHERE rp.return_id=r.id AND r.public_id=$1 AND rp.vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$2)`,[input.returnId,vendorId,next,input.reference?.trim()||null,now]);if(!changed.rowCount)throw new Error("Vendor return access denied");return{ok:true};
    },{isolation:"serializable"});
  }
}

function requiredVendorId(principal:SessionPrincipal):string{if(!principal.vendorId||!principal.roles.some(r=>r.startsWith("vendor_")))throw new Error("VENDOR_AUTH_REQUIRED");return principal.vendorId}
function fulfilmentActions(orderStatus:string,mode:string,status:string):readonly string[]{if(!["confirmed","partially_fulfilled"].includes(orderStatus))return[];if(status==="awaiting_acceptance")return["accept","reject"];if(mode==="pickup"&&["accepted","picking","packed"].includes(status))return["ready"];if(mode==="local_delivery"&&["accepted","picking","packed","ready_for_handover"].includes(status))return["delivered"];return[]}
