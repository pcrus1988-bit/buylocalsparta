import { hashSearchDocument, PostgresUnitOfWork, type SearchDocument, type SearchQuery, type SearchHit, type SqlExecutor, type SqlPool, type SqlRow } from "@buy-local-sparta/core";
import { MeilisearchClient, type MeilisearchConfig } from "@buy-local-sparta/meilisearch-search";

function text(value:unknown,label:string):string{if(typeof value!=="string"||!value)throw new Error(`Invalid ${label}`);return value;}
function optional(value:unknown):string|undefined{return typeof value==="string"&&value.length?value:undefined;}
function int(value:unknown,label:string):number{const n=Number(value);if(!Number.isSafeInteger(n))throw new Error(`Invalid integer ${label}`);return n;}
function stringRecord(value:unknown):Readonly<Record<string,string>>{if(!value||typeof value!=="object"||Array.isArray(value))return{};const out:Record<string,string>={};for(const [k,v] of Object.entries(value as Record<string,unknown>)){if(typeof v==="string")out[k]=v;else if(typeof v==="number"||typeof v==="boolean")out[k]=String(v);else if(Array.isArray(v))out[k]=v.map(String).join("|");}return out;}

export class PostgresProductionSearchService {
  readonly #uow:PostgresUnitOfWork;readonly #client:MeilisearchClient;
  constructor(pool:SqlPool,config:MeilisearchConfig,fetchImpl:typeof fetch=fetch){this.#uow=new PostgresUnitOfWork(pool);this.#client=new MeilisearchClient(config,fetchImpl);}
  async readiness(){return this.#client.health();}
  async configure(){await this.#client.configureIndex();}
  async search(query:SearchQuery & {sort?:"price-asc"|"price-desc"}):Promise<readonly SearchHit[]>{return this.#client.search(query);}
  async autocomplete(input:{marketId:string;q:string;limit?:number}){return this.#client.autocomplete(input);}

  async resolveProductDocument(id:string,now=Date.now()):Promise<SearchDocument|undefined>{
    return this.#uow.withTransaction({platformAccess:true,marketId:"sparta",requestId:`search-resolve:${id}`},tx=>this.#resolveProductDocument(tx,id,now),{readOnly:true});
  }

  async reindexProduct(id:string,now=Date.now()):Promise<{entityId:string;action:"upserted"|"removed"|"unchanged";documentHash?:string}>{
    const document=await this.resolveProductDocument(id,now);
    const state=await this.#uow.withTransaction({platformAccess:true,marketId:"sparta",requestId:`search-state:${id}`},async tx=>{
      const result=await tx.query<SqlRow>(`SELECT document_hash,status FROM search_index_state WHERE market_id=nullif(current_setting('app.market_id',true),'')::uuid AND entity_type='product' AND entity_public_id=$1`,[id]);
      return result.rows[0];
    },{readOnly:true});
    if(!document){
      if(state?.status==="removed")return{entityId:id,action:"unchanged"};
      await this.#client.remove(id);await this.#record(id,{entityId:id,action:"removed"},now);return{entityId:id,action:"removed"};
    }
    const documentHash=hashSearchDocument(document);
    if(state?.status==="indexed"&&state?.document_hash===documentHash)return{entityId:id,action:"unchanged",documentHash};
    try{await this.#client.upsert(document);const result={entityId:id,action:"upserted" as const,documentHash};await this.#record(id,result,now);return result;}
    catch(error){await this.#record(id,{entityId:id,action:"upserted",documentHash},now,error instanceof Error?error.message:String(error));throw error;}
  }

  async reconcileAll(now=Date.now()):Promise<{checked:number;upserted:number;removed:number;unchanged:number;failed:number}>{
    const ids=await this.#uow.withTransaction({platformAccess:true,marketId:"sparta",requestId:"search-reconcile-list"},async tx=>{
      const result=await tx.query<SqlRow>(`
        SELECT cv.public_id AS id FROM canonical_variants cv WHERE cv.market_id=nullif(current_setting('app.market_id',true),'')::uuid
        UNION
        SELECT entity_public_id AS id FROM search_index_state WHERE market_id=nullif(current_setting('app.market_id',true),'')::uuid AND entity_type='product'
      `);
      return result.rows.map(row=>text(row.id,"id"));
    },{readOnly:true});
    let upserted=0,removed=0,unchanged=0,failed=0;
    for(const id of ids){try{const result=await this.reindexProduct(id,now);if(result.action==="upserted")upserted++;else if(result.action==="removed")removed++;else unchanged++;}catch{failed++;}}
    return{checked:ids.length,upserted,removed,unchanged,failed};
  }

  async #resolveProductDocument(tx:SqlExecutor,id:string,now:number):Promise<SearchDocument|undefined>{
    const result=await tx.query<SqlRow>(`
      SELECT cv.public_id,m.code AS market_code,c.code AS category_code,
             COALESCE(el.title,en.title,cv.model,cv.slug) AS title,
             el.title AS title_el,en.title AS title_en,
             COALESCE(el.description,en.description,'') AS body,
             b.name AS brand,cv.model,cv.gtin,cv.mpn,cv.variant_attributes,cv.platform_price_minor,
             EXISTS(
               SELECT 1 FROM vendor_offers vo JOIN vendor_businesses vb ON vb.id=vo.vendor_id JOIN vendor_locations vl ON vl.id=vo.location_id JOIN inventory_balances ib ON ib.offer_id=vo.id
               WHERE vo.canonical_variant_id=cv.id AND vo.status='approved' AND vb.status='active' AND vl.active=true
                 AND GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked)>0
                 AND ib.stock_confirmed_at + make_interval(secs=>ib.freshness_ttl_seconds) > $2
             ) AS available,
             EXISTS(
               SELECT 1 FROM vendor_offers vo JOIN vendor_businesses vb ON vb.id=vo.vendor_id JOIN vendor_locations vl ON vl.id=vo.location_id JOIN inventory_balances ib ON ib.offer_id=vo.id
               WHERE vo.canonical_variant_id=cv.id AND vo.status='approved' AND vb.status='active' AND vl.active=true AND 'pickup'=ANY(vo.fulfilment_modes)
                 AND GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked)>0
                 AND ib.stock_confirmed_at + make_interval(secs=>ib.freshness_ttl_seconds) > $2
             ) AS pickup_today,
             EXISTS(SELECT 1 FROM vendor_offers vo WHERE vo.canonical_variant_id=cv.id AND vo.status='approved' AND vo.advice_capabilities <> '{}'::jsonb) AS advice_available
      FROM canonical_variants cv
      JOIN markets m ON m.id=cv.market_id JOIN categories c ON c.id=cv.category_id
      LEFT JOIN brands b ON b.id=cv.brand_id
      LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
      LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
      WHERE (cv.public_id=$1 OR cv.id::text=$1) AND cv.market_id=nullif(current_setting('app.market_id',true),'')::uuid
        AND cv.active=true AND cv.suppressed=false AND cv.recalled=false
      LIMIT 1
    `,[id,new Date(now)]);
    if(!result.rowCount)return undefined;const r=result.rows[0];const identifiers=[optional(r.gtin),optional(r.mpn)].filter((v):v is string=>Boolean(v));
    return{id:text(r.public_id,"public_id"),type:"product",marketId:text(r.market_code,"market_code"),title:text(r.title,"title"),titleEl:optional(r.title_el),titleEn:optional(r.title_en),body:optional(r.body),brand:optional(r.brand),model:optional(r.model),identifiers,categoryCodes:[text(r.category_code,"category_code")],available:r.available===true,pickupToday:r.pickup_today===true,adviceAvailable:r.advice_available===true,priceMinor:int(r.platform_price_minor,"platform_price_minor"),attributes:stringRecord(r.variant_attributes),metadata:{projectionVersion:1}};
  }

  async #record(entityId:string,result:{entityId:string;action:"upserted"|"removed"|"unchanged";documentHash?:string},now:number,error?:string){
    await this.#uow.withTransaction({platformAccess:true,marketId:"sparta",requestId:`search-record:${entityId}`},async tx=>{
      const status=error?"failed":result.action==="removed"?"removed":"indexed";
      await tx.query(`INSERT INTO search_index_state(market_id,entity_type,entity_public_id,document_hash,status,indexed_at,last_error,version,updated_at) VALUES(nullif(current_setting('app.market_id',true),'')::uuid,'product',$1,$2,$3,$4,$5,1,$4) ON CONFLICT(market_id,entity_type,entity_public_id) DO UPDATE SET document_hash=EXCLUDED.document_hash,status=EXCLUDED.status,indexed_at=EXCLUDED.indexed_at,last_error=EXCLUDED.last_error,version=search_index_state.version+1,updated_at=EXCLUDED.updated_at`,[entityId,result.documentHash??null,status,new Date(now),error??null]);
    });
  }
}
