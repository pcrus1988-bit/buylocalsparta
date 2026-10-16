#!/usr/bin/env node
/**
 * Manual evidence queue, NOT an approved product registry.
 * Run after scripts/posokanei/import-snapshot.mjs; no network access needed.
 *
 * node scripts/posokanei/build-comparable-review-queue.mjs IMPORT_DIR --out REVIEW_QUEUE.json [--approved approved-equivalence-groups.json] [--limit 100]
 */
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {resolve,join,dirname,basename} from "node:path";
import {rankComparableReviewQueue} from "./comparable-review-queue.mjs";

const arg=flag=>{const i=process.argv.indexOf(flag);return i<0?null:process.argv[i+1];};
const input=process.argv[2],out=arg("--out");
if(!input||input.startsWith("--")||!out||
  /^(?:approved-equivalence-groups|reference-products|reference-prices)\./.test(basename(out))){
  console.error("Usage: node scripts/posokanei/build-comparable-review-queue.mjs IMPORT_DIR --out REVIEW_QUEUE.json [--approved GROUPS.json] [--limit 100]");
  process.exit(2);
}
const jsonl=async name=>(await readFile(join(resolve(input),name),"utf8"))
  .split("\n").filter(Boolean).map(line=>JSON.parse(line));
const [products,prices]=await Promise.all([jsonl("reference-products.jsonl"),jsonl("reference-prices.jsonl")]);
const approved=arg("--approved")?JSON.parse(await readFile(resolve(arg("--approved")),"utf8")):[];
const offersByProduct=new Map();
for(const row of prices){
  if(row.country!=="GR")continue;
  const existing=offersByProduct.get(row.source_product_id)||[];
  existing.push(row);offersByProduct.set(row.source_product_id,existing);
}
const limit=arg("--limit")===null?100:Number(arg("--limit"));
const result=rankComparableReviewQueue({products,offersByProduct,approvedGroups:approved,limit});
const manifest=JSON.parse(await readFile(join(resolve(input),"manifest.json"),"utf8"));
const report={...result,snapshotDate:manifest.snapshot_date,snapshotChecksum:manifest.snapshot_sha256};
await mkdir(dirname(resolve(out)),{recursive:true});
await writeFile(resolve(out),JSON.stringify(report,null,2)+"\n","utf8");
// Report only non-identifying aggregate numbers in logs. SKU/brand details
// remain inside the explicitly chosen output file for editorial inspection.
console.log(JSON.stringify({snapshotDate:report.snapshotDate,...report.summary,reviewQueueFile:resolve(out)}));
