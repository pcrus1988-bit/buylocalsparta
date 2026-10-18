/** NYXI private-only structural binding; not identity authentication or approval. */
import {types as utilTypes} from 'node:util';
const UUID=/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;
const KINDS=new Set(['manufacturer','brand','family','product','shade','inci']);
const PARENT={manufacturer:null,brand:'manufacturer',family:'brand',product:'family',shade:'product',inci:null};
const CANDIDATE_FIELDS=['candidate_key','kind','source_id','parent_key','display_label','identity_status','reconciliation_required','independently_reviewed','publication_allowed'];
const LINK_FIELDS=['product_candidate_key','shade_candidate_key','source_id'];
const fail=(condition,reason)=>{if(!condition)throw new TypeError(reason);};
function safeArray(value,limit,code){
 fail(Array.isArray(value)&&!utilTypes.isProxy(value)&&Object.getPrototypeOf(value)===Array.prototype&&
  value.length>0&&value.length<=limit,code);
 const keys=Reflect.ownKeys(value);
 fail(keys.length===value.length+1&&keys.includes('length'),code);
 for(let i=0;i<value.length;i++){
  const d=Object.getOwnPropertyDescriptor(value,String(i));
  fail(d?.enumerable===true&&Object.hasOwn(d,'value'),code);
 }
}
function safeObject(value,fields,code){
 fail(value!==null&&typeof value==='object'&&!Array.isArray(value)&&!utilTypes.isProxy(value),code);
 const proto=Object.getPrototypeOf(value);
 fail(proto===Object.prototype||proto===null,code);
 const keys=Reflect.ownKeys(value);
 fail(keys.length===fields.length&&keys.every(key=>{
  if(typeof key!=='string'||!fields.includes(key))return false;
  const d=Object.getOwnPropertyDescriptor(value,key);
  return d?.enumerable===true&&Object.hasOwn(d,'value');
 }),code);
}
/**
 * All records must be supplied by an authorized private caller. Opaque IDs
 * are not proof of source authenticity. No private names or excerpts returned.
 */
export function auditPrivateFormulaCandidateBinding(links,candidates){
 safeArray(links,500,'INVALID_FORMULA_LINKS');
 safeArray(candidates,1000,'INVALID_CANDIDATE_GRAPH');
 const index=new Map();
 for(const row of candidates){
  safeObject(row,CANDIDATE_FIELDS,'INVALID_CANDIDATE_ROW');
  fail(typeof row.kind==='string'&&KINDS.has(row.kind),'INVALID_KIND');
  fail(typeof row.candidate_key==='string'&&
   new RegExp(`^nyxi:v2:${row.kind}:[a-f\\d]{64}$`).test(row.candidate_key),'INVALID_CANDIDATE_KEY');
  fail(typeof row.source_id==='string'&&UUID.test(row.source_id),'INVALID_CANDIDATE_SOURCE');
  fail(typeof row.display_label==='string'&&row.display_label.trim().length>0&&row.display_label.length<=512&& !/[\x00-\x1f\x7f]/u.test(row.display_label),'INVALID_DISPLAY_LABEL');
  fail(row.identity_status==='source_scoped_candidate'&&row.reconciliation_required===true&&row.independently_reviewed===false&&
   row.publication_allowed===false,'UNREVIEWED_CANDIDATE_REQUIRED');
  fail(!index.has(row.candidate_key),'DUPLICATE_CANDIDATE');
  index.set(row.candidate_key,{kind:row.kind,source:row.source_id.toLowerCase(),parent:row.parent_key});
 }
 for(const row of index.values()){
  const required=PARENT[row.kind];
  if(required===null){fail(row.parent===null,'UNEXPECTED_PARENT');continue;}
  fail(typeof row.parent==='string','MISSING_PARENT');
  const parent=index.get(row.parent);
  fail(parent!==undefined,'PARENT_NOT_IN_GRAPH');
  fail(parent.kind===required,'PARENT_KIND_MISMATCH');
  fail(parent.source===row.source,'CROSS_SOURCE_PARENT');
 }
 let shadeScoped=0;
 for(const link of links){
  safeObject(link,LINK_FIELDS,'INVALID_FORMULA_LINK');
  fail(typeof link.source_id==='string'&&UUID.test(link.source_id),'INVALID_LINK_SOURCE');
  const source=link.source_id.toLowerCase();
  const product=index.get(link.product_candidate_key);
  fail(product?.kind==='product','PRODUCT_NOT_IN_GRAPH');
  fail(product.source===source,'PRODUCT_SOURCE_MISMATCH');
  if(link.shade_candidate_key!==null){
   const shade=index.get(link.shade_candidate_key);
   fail(shade?.kind==='shade','SHADE_NOT_IN_GRAPH');
   fail(shade.source===source,'SHADE_SOURCE_MISMATCH');
   fail(shade.parent===link.product_candidate_key,'SHADE_PRODUCT_MISMATCH');
   shadeScoped++;
  }
 }
 return Object.freeze({schema_version:'nyxi-private-formula-candidate-binding-v1',
  link_count:links.length,candidate_count:index.size,shade_scoped_link_count:shadeScoped,
  structural_relationships_consistent:true,source_authenticity_verified:false,
  identity_independently_verified:false,inci_declaration_verified:false,
  ingredient_safety_assessed:false,independently_reviewed:false,
  private_only:true,publication_allowed:false});
}
