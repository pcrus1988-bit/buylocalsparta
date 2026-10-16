#!/usr/bin/env node
/**
 * Run KONTA MOY × PosoKanei basket evaluation over *local* staged data.
 * No network access, no database writes, and no user-facing price publication.
 *
 * node scripts/posokanei/optimize-basket.mjs \
 *   --staging /tmp/kontamou-posokanei --list /tmp/list.json \
 *   [--groups /tmp/reviewed-groups.json] [--store-limit 3] [--out /tmp/result.json]
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { optimizeReferenceBasket } from './basket-optimizer.mjs';

const args=process.argv.slice(2);
function value(flag) {
  const index=args.indexOf(flag);
  return index<0 ? null : args[index+1] ?? null;
}
async function json(path) {
  const data=await readFile(path,'utf8');
  if(data.length>100*1024*1024) throw new Error('Evaluation input exceeds 100 MB');
  return JSON.parse(data);
}
async function jsonl(path) {
  const data=await readFile(path,'utf8');
  if(data.length>100*1024*1024) throw new Error('Evaluation input exceeds 100 MB');
  return data.split(/\r?\n/).filter(Boolean).map((row,i)=>{
    try{return JSON.parse(row);} catch {throw new Error('Invalid JSONL row '+(i+1)+' at '+path);}
  });
}
async function main() {
  const staging=value('--staging'),list=value('--list'),groups=value('--groups'),out=value('--out');
  if(!staging||!list) {
    throw new Error('Usage: optimize-basket.mjs --staging DIR --list list.json [--groups reviewed-groups.json] [--store-limit 1..4] [--out output.json]');
  }
  const limitArg=value('--store-limit');
  const storeLimit=limitArg==null?3:Number(limitArg);
  const root=resolve(staging);
  const [manifest,products,observations,basket,groupFile]=await Promise.all([
    json(join(root,'manifest.json')),
    jsonl(join(root,'reference-products.jsonl')),
    jsonl(join(root,'reference-prices.jsonl')),
    json(resolve(list)),
    groups?json(resolve(groups)):Promise.resolve([])
  ]);
  if(manifest.source!=='posokanei.gov.gr' || manifest.permissions!=='RESEARCH_ONLY_RIGHTS_UNVERIFIED' ||
    manifest.source_total!==manifest.source_collected || manifest.reference_products!==products.length ||
    manifest.reference_price_observations!==observations.length) {
    throw new Error('Source manifest invalid, incomplete or not marked private evaluation');
  }
  if(!basket||!Array.isArray(basket.lines) || !Array.isArray(groupFile)) {
    throw new Error('Expected list as {lines:[...]} and groups as an array');
  }
  const result=optimizeReferenceBasket({
    lines:basket.lines,products,observations,approvedGroups:groupFile,
    snapshotDate:manifest.snapshot_date,country:'GR',
    retailerIds:basket.retailerIds,storeLimit
  });
  const report={
    status:'PRIVATE_RESEARCH_EVALUATION_ONLY',
    source:manifest.source,
    snapshotSha256:manifest.snapshot_sha256??null,
    generatedAt:new Date().toISOString(),
    ...result
  };
  const rendered=JSON.stringify(report,null,2)+'\n';
  if(out) {
    await writeFile(resolve(out),rendered,{flag:'wx'}); // fail safely if output exists
    console.log('Wrote private evaluation plan to '+resolve(out));
  } else process.stdout.write(rendered);
}
main().catch(err=>{console.error('Basket evaluation failed:',err.message);process.exitCode=1;});
