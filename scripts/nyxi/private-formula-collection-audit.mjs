/**
 * NYXI Agent 3: private, metadata-only audit of source-scoped INCI declarations.
 * Review diagnostic only; no authenticity, safety, current-formula or publication claim.
 */
import { comparePrivateProductFormulaVersions } from './private-formula-version-evidence.mjs';
const check=(ok,code)=>{if(!ok)throw new TypeError(code);};
const order=(a,b)=>a<b?-1:a>b?1:0;
function dense(rows){
 if(!Array.isArray(rows)||Object.getPrototypeOf(rows)!==Array.prototype||rows.length<1||rows.length>100||Reflect.ownKeys(rows).length!==rows.length+1)return false;
 for(let i=0;i<rows.length;i++){const d=Object.getOwnPropertyDescriptor(rows,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))return false;}
 return true;
}
export function auditPrivateFormulaDeclarationCollection(versions){
 check(dense(versions),'INVALID_PRIVATE_FORMULA_COLLECTION');
 const valid=comparePrivateProductFormulaVersions(versions);
 const snapshots=new Map(), declarations=new Map();
 for(const v of versions){
  let s=snapshots.get(v.snapshot_id);
  if(!s){s={fingerprints:new Set(),keys:[]};snapshots.set(v.snapshot_id,s);}
  s.fingerprints.add(v.declaration_fingerprint);s.keys.push(v.version_key);
  let d=declarations.get(v.declaration_fingerprint);
  if(!d){d={snapshots:new Set(),versions:0};declarations.set(v.declaration_fingerprint,d);}
  d.snapshots.add(v.snapshot_id);d.versions++;
 }
 const conflicts=[...snapshots.entries()].filter(([,x])=>x.fingerprints.size>1).sort(([a],[b])=>order(a,b)).map(([snapshot_id,x])=>Object.freeze({snapshot_id,declaration_fingerprint_count:x.fingerprints.size,version_count:x.keys.length,version_keys:Object.freeze(x.keys.sort(order)),reason:'MULTIPLE_INCI_DECLARATIONS_WITHIN_ONE_SNAPSHOT'}));
 const occurrences=[...declarations.entries()].sort(([a],[b])=>order(a,b)).map(([declaration_fingerprint,x])=>Object.freeze({declaration_fingerprint,snapshot_count:x.snapshots.size,version_count:x.versions}));
 return Object.freeze({
  schema_version:'nyxi-private-formula-collection-audit-v1',
  product_key:valid.product_key,source_id:valid.source_id,
  version_count:valid.version_count,snapshot_count:valid.snapshot_count,
  distinct_declaration_count:valid.distinct_declaration_count,
  snapshot_conflicts:Object.freeze(conflicts),declaration_occurrences:Object.freeze(occurrences),
  cross_snapshot_declaration_variation:valid.distinct_declaration_count>1,
  extraction_lifecycle_reconciliation_required:valid.any_lifecycle_reconciliation_required,
  snapshot_chronology_inferred:false,latest_or_current_formula_determined:false,
  formula_change_established:false,chemical_equivalence_assessed:false,
  source_authenticated_by_this_module:false,safety_or_compliance_assessed:false,
  independent_review_required:true,raw_inci_or_fragment_text_returned:false,
  private_only:true,independently_reviewed:false,publication_allowed:false
 });
}
