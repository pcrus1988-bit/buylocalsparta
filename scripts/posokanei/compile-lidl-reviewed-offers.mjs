#!/usr/bin/env node
/** Compile reviewed Lidl + PosoKanei IDs to a local, unpublished badge artifact. */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {productIdentityHash,verifiedLidlBadges} from './lidl-weekly-overlay.mjs';
const get=flag=>{const i=process.argv.indexOf(flag);return i<0?null:process.argv[i+1]};
const fail=x=>{throw Error('Lidl review compilation refused: '+x)};
const isDateTime=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))&&/(Z|[+-]\d\d:\d\d)$/.test(x);
export function compileLidlReview({products,batch,mappings,permission,generatedAt}){
  if(!Array.isArray(products)||!products.length||!batch||batch.contract_version!==1||
    batch.retailer!=='lidl_gr'||!Array.isArray(batch.candidates)||
    !mappings||mappings.version!==1||!Array.isArray(mappings.entries)||
    !/^[a-zA-Z0-9_-]{8,120}$/.test(permission||'')||!isDateTime(generatedAt))fail('invalid batch, mappings or approval reference');
  const byId=new Map(products.map(p=>[p.source_product_id,p]));
  if(byId.size!==products.length)fail('duplicate PosoKanei source IDs');
  const bySku=new Map();
  for(const m of mappings.entries){
    if(!m||typeof m.retailer_product_id!=='string'||typeof m.source_product_id!=='string'||
      typeof m.source_product_hash!=='string'||!isDateTime(m.reviewed_at)||
      typeof m.reviewed_by!=='string'||!m.reviewed_by.trim()||
      m.identity_verified!==true||m.packaging_verified!==true||
      m.promotional_terms_verified!==true||m.no_membership_required_verified!==true)fail('unreviewed mapping');
    if(bySku.has(m.retailer_product_id))fail('duplicate Lidl SKU mapping');
    const p=byId.get(m.source_product_id);
    if(!p||productIdentityHash(p)!==m.source_product_hash)fail('PosoKanei product fingerprint mismatch');
    bySku.set(m.retailer_product_id,m);
  }
  const offers=[];
  for(const c of batch.candidates){
    if(c?.source!=='lidl_plus_public_offers'||c.retailer!=='lidl_gr')fail('foreign data in Lidl batch');
    if(c.validity_status!=='current'||!Array.isArray(c.retailer_product_ids)||c.retailer_product_ids.length!==1)continue;
    const sku=c.retailer_product_ids[0],mapping=bySku.get(sku);
    if(!mapping)continue; // only approved crosswalks; never name-match directly
    if(c.offer_type!=='StoreMonetaryOnProductDiscount'||c.redemption_channel!=='Store')continue;
    if(!Number.isSafeInteger(c.price_cents)||c.price_cents<=0||c.currency!=='EUR'||
      typeof c.retailer_store_key!=='string'||!c.retailer_store_key.startsWith('GR'))continue;
    offers.push({source_product_id:mapping.source_product_id,source_product_hash:mapping.source_product_hash,
      lidl_product_id:sku,offer_id:c.retailer_offer_id,store_key:c.retailer_store_key,
      store_name:c.retailer_store_key,valid_from:c.valid_from,valid_to:c.valid_to,
      observed_at:c.observed_at,reviewed_at:mapping.reviewed_at,reviewed_by:mapping.reviewed_by,
      identity_verified:true,packaging_verified:true,promotional_terms_verified:true,
      no_membership_required_verified:true,currency:'EUR',price_cents:c.price_cents,
      reference_price_cents:c.reference_price_cents??null});
  }
  const artifact={schema_version:1,source:'lidl_plus_public_offers',generated_at:generatedAt,
    permission_reference:permission,offers};
  // Do not create an artifact which fails the exact same check as the web runtime.
  verifiedLidlBadges({products},artifact,{now:new Date(generatedAt)});
  return artifact;
}
export async function runCli(){
  const files=['--products','--review-batch','--mappings','--out'];
  if(files.some(x=>!get(x))||!process.argv.includes('--rights-verified')||!get('--permission-ref'))
    fail('required: --products reference-products.jsonl --review-batch lidl-review.json --mappings crosswalk.json --out offers.json --rights-verified --permission-ref DOCUMENTED_APPROVAL');
  const readJson=async p=>JSON.parse(await readFile(resolve(p),'utf8'));
  const products=(await readFile(resolve(get('--products')),'utf8')).split('\n').filter(Boolean).map(s=>JSON.parse(s));
  const artifact=compileLidlReview({products,batch:await readJson(get('--review-batch')),
    mappings:await readJson(get('--mappings')),permission:get('--permission-ref'),generatedAt:new Date().toISOString()});
  const target=resolve(get('--out'));await mkdir(dirname(target),{recursive:true});
  const temp=target+'.tmp';await writeFile(temp,JSON.stringify(artifact)+'\n');await rename(temp,target);
  console.log(JSON.stringify({out:target,approvedOffers:artifact.offers.length,published:false}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  runCli().catch(e=>{console.error(e.message);process.exitCode=1});
