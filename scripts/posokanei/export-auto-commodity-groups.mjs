#!/usr/bin/env node
/**
 * Produce a short-lived source-snapshot-scoped evidence file for CI testing.
 * Read-only; no mutations of the human-reviewed catalogue are performed.
 */
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {dirname,join,resolve} from "node:path";
import {buildApprovedReferenceGroups} from "./reviewed-groups.mjs";
import {deriveAutoCommodityGroups} from "./auto-commodity-groups.mjs";
import {deriveAutoPackagedTypeGroups} from "./auto-packaged-type-groups.mjs";
import {deriveAutoEggGroups} from "./auto-egg-groups.mjs";
import {deriveAutoTeaSachetGroups} from "./auto-tea-sachet-groups.mjs";

const [input,manualFile,out]=process.argv.slice(2);
if(!input||!manualFile||!out)throw Error("Usage: node export-auto-commodity-groups.mjs IMPORT_DIR APPROVED_REGISTRY OUTPUT_JSON");
const products=(await readFile(join(resolve(input),"reference-products.jsonl"),"utf8"))
  .split("\n").filter(Boolean).map(s=>JSON.parse(s));
const manifest=JSON.parse(await readFile(join(resolve(input),"manifest.json"),"utf8"));
const manual=buildApprovedReferenceGroups(products,JSON.parse(await readFile(resolve(manualFile),"utf8")));
const automatic=deriveAutoCommodityGroups(products,manual);
const packaged=deriveAutoPackagedTypeGroups(products,[...manual,...automatic]);
const eggGroups=deriveAutoEggGroups(products,[...manual,...automatic,...packaged]);
const teaGroups=deriveAutoTeaSachetGroups(products,[...manual,...automatic,...packaged,...eggGroups]);
const report={
  source:"posokanei.gov.gr",snapshotDate:manifest.snapshot_date,
  snapshotChecksum:manifest.snapshot_sha256,
  approvedGroups:[...manual,...automatic,...packaged,...eggGroups,...teaGroups]
};
await mkdir(dirname(resolve(out)),{recursive:true});
await writeFile(resolve(out),JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({
  snapshotDate:report.snapshotDate,manuallyReviewedGroups:manual.length,
  manuallyReviewedMembers:manual.reduce((n,g)=>n+g.memberIds.length,0),
  automaticallyApprovedGroups:automatic.length,
  automaticallyApprovedMembers:automatic.reduce((n,g)=>n+g.memberIds.length,0),
  expandedTypeGroups:packaged.length,
  expandedTypeMembers:packaged.reduce((n,g)=>n+g.memberIds.length,0),
  eggGroups:eggGroups.length,eggMembers:eggGroups.reduce((n,g)=>n+g.memberIds.length,0),
  teaSachetGroups:teaGroups.length,teaSachetMembers:teaGroups.reduce((n,g)=>n+g.memberIds.length,0),
  distinctApprovedMembers:new Set(report.approvedGroups.flatMap(g=>g.memberIds)).size
}));
