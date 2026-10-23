/**
 * Independent, read-only Lidl promotion labels for PosoKanei catalogue cards.
 * Does NOT replace government prices, create sale offers or enter basket optimization.
 * Promotion data must be separately authorised, reviewed and published by the operator.
 */
import {createHash} from 'node:crypto';
const ID=/^[a-zA-Z0-9_-]{1,100}$/;
const STORE=/^GR[a-zA-Z0-9_-]{2,12}$/;
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const ISO=/^\d{4}-\d{2}-\d{2}T/;
const fail=reason=>{throw Error('Invalid Lidl weekly overlay: '+reason)};
const validDay=s=>typeof s==='string'&&DAY.test(s)&&!Number.isNaN(Date.parse(s+'T00:00:00Z'));
const ts=s=>typeof s==='string'&&ISO.test(s)&&Number.isFinite(Date.parse(s))&&/(Z|[+-]\d\d:\d\d)$/.test(s);
export const productIdentityHash=p=>createHash('sha256').update(JSON.stringify([
  p.source_product_id,p.name,p.brand??null,p.category??null,p.unit??null,p.unit_quantity??null
])).digest('hex');

/**
 * The supplied artifact must be compiled from reviewed crosswalk entries.
 * A source-level Lidl productIds field is a SKU, NOT a barcode/GTIN.
 * The display is branch-scoped: one Greek Lidl store; no inference of national price.
 */
export function verifiedLidlBadges(snapshot,artifact,{now=new Date(),maxAgeHours=48}={}){
  if(!snapshot||!Array.isArray(snapshot.products))fail('catalogue missing');
  if(!artifact||artifact.schema_version!==1||artifact.source!=='lidl_plus_public_offers'||
    !ts(artifact.generated_at)||!Array.isArray(artifact.offers)||artifact.offers.length>3000||
    typeof artifact.permission_reference!=='string'||
    !/^[a-zA-Z0-9_-]{8,120}$/.test(artifact.permission_reference))fail('unapproved artifact metadata');
  if(!Number.isFinite(now.getTime())||!Number.isInteger(maxAgeHours)||maxAgeHours<1||maxAgeHours>168)fail('invalid clock');
  const at=now.getTime(), generated=Date.parse(artifact.generated_at);
  if(generated>at+300000||generated<at-maxAgeHours*3600000)fail('artifact is stale or future-dated');
  const catalogue=new Map(snapshot.products.map(p=>[p.source_product_id,p]));
  const seen=new Set(),result=new Map();
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Athens',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  for(const o of artifact.offers){
    if(!o||typeof o!=='object'||!ID.test(o.source_product_id)||
      !STORE.test(o.store_key)||typeof o.offer_id!=='string'||!o.offer_id||
      !/^[0-9a-zA-Z._-]{1,64}$/.test(o.lidl_product_id)||
      !validDay(o.valid_from)||!validDay(o.valid_to)||o.valid_to<o.valid_from||
      !ts(o.observed_at)||!ts(o.reviewed_at)||
      typeof o.reviewed_by!=='string'||!o.reviewed_by.trim()||
      typeof o.source_product_hash!=='string'||! /^[a-f0-9]{64}$/.test(o.source_product_hash)||
      o.identity_verified!==true||o.packaging_verified!==true||
      o.promotional_terms_verified!==true||o.no_membership_required_verified!==true||
      o.currency!=='EUR'||!Number.isSafeInteger(o.price_cents)||
      o.price_cents<=0||o.price_cents>10000000)fail('unreviewed or invalid promotion');
    if(o.reference_price_cents!==null&&o.reference_price_cents!==undefined&&
      (!Number.isSafeInteger(o.reference_price_cents)||o.reference_price_cents<=o.price_cents))fail('invalid old price');
    const p=catalogue.get(o.source_product_id);
    if(!p||p.source_product_id!==o.source_product_id||
      productIdentityHash(p)!==o.source_product_hash)fail('catalogue identity changed');
    const key=[o.store_key,o.offer_id,o.source_product_id].join(':');
    if(seen.has(key))fail('duplicate store offer');
    seen.add(key);
    if(o.valid_from>today||o.valid_to<today)continue;
    if(Date.parse(o.observed_at)>at+300000||Date.parse(o.observed_at)<at-maxAgeHours*3600000)continue;
    if(Date.parse(o.reviewed_at)>at+300000)fail('future review');
    const badge={retailerId:'lidl_gr',retailerName:'Lidl',storeKey:o.store_key,
      storeName:(typeof o.store_name==='string'&&o.store_name.length<=140?o.store_name:o.store_key),
      offerPriceEur:o.price_cents/100,
      previousPriceEur:o.reference_price_cents==null?null:o.reference_price_cents/100,
      validFrom:o.valid_from,validTo:o.valid_to,observedAt:o.observed_at,
      offerId:o.offer_id,scope:'specific_store',basketEligible:false};
    const group=result.get(o.source_product_id)||[];
    group.push(badge);result.set(o.source_product_id,group);
  }
  for(const group of result.values())group.sort((a,b)=>a.offerPriceEur-b.offerPriceEur||a.storeKey.localeCompare(b.storeKey));
  return result;
}
