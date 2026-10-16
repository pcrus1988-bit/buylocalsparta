#!/usr/bin/env node
/**
 * Manual promotion from an audited local importer staging directory to a
 * single public read-model artifact. NEVER copies images or commerce offers.
 * Does not publish anything to the web or modify production databases.
 *
 * Human approval must independently confirm rights to re-use database entries.
 * A third-party software license is not sufficient.
 */
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {packageQuantity} from './comparison-engine.mjs';
const arg=flag=>{const i=process.argv.indexOf(flag);return i<0?null:process.argv[i+1]};
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const date=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x));
const fail=m=>{throw Error('Public PosoKanei artifact refused: '+m)};
async function json(path){return JSON.parse(await readFile(path,'utf8'))}
async function jsonl(path){
  const raw=await readFile(path,'utf8');
  return raw.split('\n').filter(Boolean).map((line,i)=>{
    try{return JSON.parse(line)}catch{fail('invalid JSONL row '+i)}
  });
}
async function main(){
  const staging=arg('--staging'),out=arg('--out'),groupsPath=arg('--groups');
  const permission=arg('--permission-ref');
  const approved=process.argv.includes('--rights-verified');
  if(!staging||!out||!groupsPath||!approved||!permission||!/^\w{8,120}$/.test(permission)){
    console.error('Usage: node scripts/posokanei/build-public-snapshot.mjs --staging DIR --groups REVIEWED.json --out FILE --rights-verified --permission-ref VERIFIED_REFERENCE');
    process.exitCode=2;return;
  }
  const manifest=await json(join(resolve(staging),'manifest.json'));
  if(manifest.source!=='posokanei.gov.gr'||manifest.permissions!=='RESEARCH_ONLY_RIGHTS_UNVERIFIED'||
    !date(manifest.snapshot_date)||manifest.source_total!==manifest.source_collected||
    !Number.isSafeInteger(manifest.source_total)||manifest.source_total<1||
    !/^[a-f0-9]{64}$/.test(manifest.snapshot_sha256||'')||
    !Array.isArray(manifest.countries)||!manifest.countries.includes('GR'))fail('missing or incomplete importer audit manifest');
  const products=await jsonl(join(resolve(staging),'reference-products.jsonl'));
  const originalPrices=await jsonl(join(resolve(staging),'reference-prices.jsonl'));
  if(products.length!==manifest.source_total||originalPrices.length!==manifest.reference_price_observations||
    products.length>100000||originalPrices.length>1_000_000)fail('staged row count mismatch');
  const byId=new Map();
  const cleaned=products.map(p=>{
    if(!id(p.source_product_id)||byId.has(p.source_product_id)||!p.name||
      p.snapshot_date!==manifest.snapshot_date)fail('invalid or duplicate product');
    byId.set(p.source_product_id,p);
    return {source_product_id:p.source_product_id,name:String(p.name),brand:p.brand||null,
      category:p.category||null,unit:p.unit||null,unit_quantity:p.unit_quantity??null,
      snapshot_date:p.snapshot_date};
  });
  const observations=[],seen=new Set();
  for(const p of originalPrices){
    if(p.country!=='GR')continue;
    const key=p.source_product_id+':'+p.retailer_id;
    if(!byId.has(p.source_product_id)||!id(p.retailer_id)||seen.has(key)||
      p.snapshot_date!==manifest.snapshot_date)fail('invalid or duplicate observation');
    seen.add(key);
    if(!Number.isFinite(p.price_eur)||p.price_eur<0||p.price_eur>100000)fail('invalid price');
    if(p.price_eur===0)continue; // unavailable, never free
    observations.push({source_product_id:p.source_product_id,snapshot_date:p.snapshot_date,
      country:'GR',retailer_id:p.retailer_id,retailer_name:p.retailer_name||p.retailer_id,
      price_eur:p.price_eur,source_price_updated_at:p.source_price_updated_at||null,
      is_discount:p.is_discount===true});
  }
  const groups=await json(resolve(groupsPath));
  if(!Array.isArray(groups))fail('reviewed groups must be an array');
  const groupIds=new Set(),approvedGroups=[];
  for(const g of groups){
    if(g.status!=='approved')continue;
    if(!id(g.id)||groupIds.has(g.id)||typeof g.label!=='string'||!g.label.trim()||
      !['kg','l','piece'].includes(g.basis)||!Array.isArray(g.memberIds)||
      g.memberIds.length<2||new Set(g.memberIds).size!==g.memberIds.length||
      typeof g.reviewer!=='string'||!g.reviewer.trim()||!date(g.reviewed_at))fail('unreviewed or invalid approved equivalence group');
    for(const member of g.memberIds){
      const p=byId.get(member),unit=packageQuantity(p);
      if(!p||!unit||unit.unit!==g.basis)fail('equivalence group contains incompatible or missing pack');
    }
    groupIds.add(g.id);
    approvedGroups.push({id:g.id,label:g.label,status:'approved',basis:g.basis,memberIds:g.memberIds});
  }
  if(observations.length===0)fail('no valid GR price observations');
  const output={
    schema_version:1,source:'posokanei.gov.gr',snapshot_date:manifest.snapshot_date,
    snapshot_sha256:manifest.snapshot_sha256,source_total:manifest.source_total,
    permission_reference:permission,products:cleaned,observations,approvedGroups
  };
  // Atomic local publication candidate. Operator separately uploads to approved storage.
  const target=resolve(out);await mkdir(dirname(target),{recursive:true});
  const temp=target+'.tmp';
  await writeFile(temp,JSON.stringify(output)+'\n',{flag:'w'});
  await rename(temp,target);
  console.log(JSON.stringify({file:target,date:manifest.snapshot_date,products:cleaned.length,
    prices:observations.length,approvedGroups:approvedGroups.length,permissionReference:permission},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1});
