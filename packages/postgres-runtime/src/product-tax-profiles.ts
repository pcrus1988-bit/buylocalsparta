import { createHash, randomUUID } from "node:crypto";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlPool, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "./admin-auth.ts";

export type ProductTaxProfileRow=Readonly<{
  variantId:string; slug:string; title:string; existingTaxRateBps:number; active:boolean;
  profile?:Readonly<{id:string;vatCategory:number;vatRateBps:number;vatExemptionCategory?:number;effectiveFrom:string;effectiveUntil?:string;approved:boolean;approvalVersion?:string;approvedAt?:number;notes?:string;profileHash?:string}>;
}>;

export class PostgresProductTaxProfileService{
  readonly #uow:PostgresUnitOfWork;readonly #marketCode:string;
  constructor(pool:SqlPool,env:NodeJS.ProcessEnv=process.env){this.#uow=new PostgresUnitOfWork(pool);this.#marketCode=env.DEFAULT_MARKET?.trim()||"sparta";}

  async workspace(principal:SessionPrincipal):Promise<{variants:readonly ProductTaxProfileRow[];vatCategories:readonly {code:number;rateBps:number;label:string;specialCategory:boolean}[]}>
  {return this.#uow.withTransaction(platformScope(principal.userId),async tx=>{
    const [variants,vat]=await Promise.all([
      tx.query<SqlRow>(`SELECT cv.public_id,cv.slug,cv.model,cv.variant_attributes,cv.tax_rate_bps,cv.active,
          p.public_id AS profile_public_id,p.vat_category,p.vat_rate_bps,p.vat_exemption_category,p.effective_from,p.effective_until,p.accountant_approved,p.approval_version,p.approved_at,p.approval_notes,p.profile_hash
        FROM canonical_variants cv JOIN markets m ON m.id=cv.market_id
        LEFT JOIN LATERAL (
          SELECT x.* FROM product_tax_profiles x WHERE x.canonical_variant_id=cv.id
          ORDER BY x.effective_from DESC,x.created_at DESC LIMIT 1
        ) p ON true
        WHERE m.code=$1 AND cv.active=true AND cv.suppressed=false AND cv.recalled=false
        ORDER BY COALESCE(p.accountant_approved,false),cv.created_at DESC LIMIT 1000`,[this.#marketCode]),
      tx.query<SqlRow>(`SELECT code,rate_bps,label,special_category FROM mydata_vat_category_catalog ORDER BY code`)
    ]);
    return{variants:variants.rows.map(r=>({variantId:text(r.public_id),slug:text(r.slug),title:productTitle(r),existingTaxRateBps:int(r.tax_rate_bps),active:bool(r.active),profile:optional(r.profile_public_id)?{id:text(r.profile_public_id),vatCategory:int(r.vat_category),vatRateBps:int(r.vat_rate_bps),vatExemptionCategory:intOptional(r.vat_exemption_category),effectiveFrom:dateText(r.effective_from),effectiveUntil:dateOptional(r.effective_until),approved:bool(r.accountant_approved),approvalVersion:optional(r.approval_version),approvedAt:epochOptional(r.approved_at),notes:optional(r.approval_notes),profileHash:optional(r.profile_hash)}:undefined})),vatCategories:vat.rows.map(r=>({code:int(r.code),rateBps:int(r.rate_bps),label:text(r.label),specialCategory:bool(r.special_category)}))};
  },{readOnly:true});}

  async propose(principal:SessionPrincipal,input:{variantId:string;vatCategory:number;vatExemptionCategory?:number;effectiveFrom:string;notes:string}){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom))throw new Error("effectiveFrom must use YYYY-MM-DD");
    return this.#uow.withTransaction(platformScope(principal.userId),async tx=>{
      const policy=await tx.query<SqlRow>(`SELECT p.id::text,p.version FROM accounting_tax_policies p JOIN markets m ON m.id=p.market_id WHERE m.code=$1 AND p.status IN ('draft','review') ORDER BY p.created_at DESC LIMIT 1 FOR UPDATE OF p`,[this.#marketCode]);
      if(!policy.rowCount)throw new Error("An editable Accounting Mapping is required");
      const vat=await tx.query<SqlRow>(`SELECT code,rate_bps FROM mydata_vat_category_catalog WHERE code=$1`,[input.vatCategory]);if(!vat.rowCount)throw new Error("Unknown AADE VAT category");
      if(input.vatCategory===7&&!Number.isSafeInteger(input.vatExemptionCategory))throw new Error("VAT category 7 requires an exemption category");
      if(input.vatCategory!==7&&input.vatExemptionCategory!=null)throw new Error("VAT exemption category is allowed only with VAT category 7");
      const variant=await tx.query<SqlRow>(`SELECT cv.id::text,cv.market_id::text FROM canonical_variants cv JOIN markets m ON m.id=cv.market_id WHERE cv.public_id=$1 AND m.code=$2 AND cv.active=true FOR UPDATE OF cv`,[input.variantId,this.#marketCode]);if(!variant.rowCount)throw new Error("Active product variant was not found");
      const publicId=`taxprof_${randomUUID().replaceAll("-","")}`;
      const result=await tx.query<SqlRow>(`INSERT INTO product_tax_profiles(public_id,market_id,canonical_variant_id,vat_category,vat_rate_bps,vat_exemption_category,effective_from,accountant_approved,created_by,approval_notes)
        VALUES($1,$2::uuid,$3::uuid,$4,$5,$6,$7::date,false,${actorUuidExpression(8)},$9)
        RETURNING public_id`,[publicId,text(variant.rows[0].market_id),text(variant.rows[0].id),input.vatCategory,int(vat.rows[0].rate_bps),input.vatExemptionCategory??null,input.effectiveFrom,principal.userId,input.notes]);
      return{ok:true,profileId:text(result.rows[0].public_id),policyVersion:text(policy.rows[0].version)};
    },{isolation:"serializable"});
  }

  async approve(principal:SessionPrincipal,input:{profileId:string;notes:string;now?:number}){
    const now=input.now??Date.now();
    return this.#uow.withTransaction(platformScope(principal.userId),async tx=>{
      const found=await tx.query<SqlRow>(`SELECT ptp.id::text,ptp.public_id,ptp.market_id::text,ptp.canonical_variant_id::text,ptp.vat_category,ptp.vat_rate_bps,ptp.vat_exemption_category,ptp.effective_from,ptp.effective_until,ptp.accountant_approved,
          p.id::text AS policy_id,p.version,p.status AS policy_status
        FROM product_tax_profiles ptp JOIN markets m ON m.id=ptp.market_id
        JOIN accounting_tax_policies p ON p.market_id=ptp.market_id AND p.status IN ('draft','review')
        WHERE ptp.public_id=$1 AND m.code=$2 FOR UPDATE OF ptp,p`,[input.profileId,this.#marketCode]);
      if(!found.rowCount)throw new Error("Tax profile or editable Accounting Mapping was not found");const r=found.rows[0];
      if(bool(r.accountant_approved))return{ok:true,profileId:input.profileId,alreadyApproved:true};
      const effective=dateText(r.effective_from);
      if(int(r.vat_category)===7&&!Number.isSafeInteger(intOptional(r.vat_exemption_category)))throw new Error("VAT category 7 requires an exemption category");
      const future=await tx.query<SqlRow>(`SELECT public_id FROM product_tax_profiles WHERE canonical_variant_id=$1::uuid AND accountant_approved=true AND effective_from >= $2::date ORDER BY effective_from LIMIT 1`,[text(r.canonical_variant_id),effective]);
      if(future.rowCount)throw new Error("An approved profile already starts on or after this effective date; supersession would be ambiguous");
      await tx.query(`UPDATE product_tax_profiles SET effective_until=($2::date-1) WHERE canonical_variant_id=$1::uuid AND accountant_approved=true AND effective_from<$2::date AND (effective_until IS NULL OR effective_until >= $2::date)`,[text(r.canonical_variant_id),effective]);
      const hash=profileHash({variantId:text(r.canonical_variant_id),vatCategory:int(r.vat_category),vatRateBps:int(r.vat_rate_bps),exemption:intOptional(r.vat_exemption_category),effectiveFrom:effective,effectiveUntil:dateOptional(r.effective_until),policyVersion:text(r.version)});
      await tx.query(`UPDATE product_tax_profiles SET accountant_approved=true,approval_version=$2,approved_by=${actorUuidExpression(3)},approved_at=$4,approval_notes=concat_ws(E'\n',NULLIF(approval_notes,''),$5),profile_hash=$6 WHERE id=$1::uuid`,[text(r.id),text(r.version),principal.userId,new Date(now),input.notes,hash]);
      return{ok:true,profileId:input.profileId,policyVersion:text(r.version),profileHash:hash};
    },{isolation:"serializable"});
  }
}

function actorUuidExpression(index:number){return `(SELECT u.id FROM users u WHERE u.id::text=$${index} OR u.public_id=$${index} LIMIT 1)`;}
function profileHash(v:Record<string,unknown>){return createHash("sha256").update(JSON.stringify(v)).digest("hex");}
function productTitle(r:SqlRow){const model=optional(r.model);if(model&&model!=="none")return model;const attrs=obj(r.variant_attributes);for(const key of ["title","name","item_name"]){const x=attrs[key];if(typeof x==="string"&&x.trim())return x.trim();}return text(r.slug);}
function obj(v:unknown):Record<string,unknown>{return v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};}function text(v:unknown):string{if(typeof v!=="string"||!v)throw new Error("Invalid database text");return v;}function optional(v:unknown):string|undefined{return typeof v==="string"&&v?v:undefined;}function bool(v:unknown):boolean{return v===true;}function int(v:unknown):number{const n=Number(v);if(!Number.isSafeInteger(n))throw new Error("Invalid database integer");return n;}function intOptional(v:unknown):number|undefined{return v==null?undefined:int(v);}function dateText(v:unknown):string{if(v instanceof Date)return v.toISOString().slice(0,10);const s=String(v);if(!/^\d{4}-\d{2}-\d{2}/.test(s))throw new Error("Invalid database date");return s.slice(0,10);}function dateOptional(v:unknown):string|undefined{return v==null?undefined:dateText(v);}function epochOptional(v:unknown):number|undefined{if(v==null)return undefined;const n=v instanceof Date?v.getTime():new Date(String(v)).getTime();return Number.isFinite(n)?n:undefined;}
