#!/usr/bin/env node
/**
 * Evidence-only analysis of unreviewed cross-brand families.
 * Report aggregate counts and a tiny public catalogue title sample by category.
 * No products are approved by this command.
 */
import {readFile} from "node:fs/promises";
import {join,resolve} from "node:path";
import {createBrandIndex,referenceQuantity} from "./brand-alternatives.mjs";
import {buildApprovedReferenceGroups} from "./reviewed-groups.mjs";
import {deriveAutoCommodityGroups} from "./auto-commodity-groups.mjs";
import {deriveAutoPackagedTypeGroups} from "./auto-packaged-type-groups.mjs";
import {deriveAutoEggGroups} from "./auto-egg-groups.mjs";
import {deriveAutoTeaSachetGroups} from "./auto-tea-sachet-groups.mjs";
const [dir,reviewedFile]=process.argv.slice(2);
if(!dir||!reviewedFile)throw Error("Usage: analyze-unapproved-categories.mjs IMPORT_DIR REVIEWED_JSON");
const readJsonl=async n=>(await readFile(join(resolve(dir),n),"utf8")).split("\n").filter(Boolean).map(JSON.parse);
const products=await readJsonl("reference-products.jsonl");
const manual=buildApprovedReferenceGroups(products,JSON.parse(await readFile(resolve(reviewedFile),"utf8")));
const auto=deriveAutoCommodityGroups(products,manual);
const expanded=deriveAutoPackagedTypeGroups(products,[...manual,...auto]);
const eggs=deriveAutoEggGroups(products,[...manual,...auto,...expanded]);
const tea=deriveAutoTeaSachetGroups(products,[...manual,...auto,...expanded,...eggs]);
const approved=new Set([...manual,...auto,...expanded,...eggs,...tea].flatMap(g=>g.memberIds));
const grouped=new Map();
for(const [family,members] of createBrandIndex(products)){
 const nonApproved=members.filter(p=>!approved.has(p.source_product_id));
 if(nonApproved.length<2||new Set(nonApproved.map(p=>p.brand?.trim().toLowerCase())).size<2)continue;
 const cat=nonApproved[0].category||"unknown";
 const unit=referenceQuantity(nonApproved[0])?.unit||"unknown";
 const key=cat+"|"+unit;
 const obj=grouped.get(key)||{category:cat,unit,families:0,products:0,examples:[]};
 obj.families++;
 obj.products+=nonApproved.length;
 if(obj.examples.length<2)obj.examples.push({family,items:nonApproved.slice(0,4).map(p=>p.name)});
 grouped.set(key,obj);
}
const categories=[...grouped.values()].sort((a,b)=>b.products-a.products||b.families-a.families);
console.log(JSON.stringify({
 snapshotProducts:products.length,manualGroups:manual.length,autoGroups:auto.length,expandedGroups:expanded.length,expandedMembers:expanded.reduce((n,g)=>n+g.memberIds.length,0),eggGroups:eggs.length,eggMembers:eggs.reduce((n,g)=>n+g.memberIds.length,0),
 teaSachetGroups:tea.length,teaSachetMembers:tea.reduce((n,g)=>n+g.memberIds.length,0),
 totalCrossBrandUnapprovedGroups:categories.reduce((n,x)=>n+x.families,0),
 totalCrossBrandUnapprovedMembers:categories.reduce((n,x)=>n+x.products,0),
 categoryCount:categories.length,
 categories:(process.argv.includes("--examples")?categories.slice(0,85):categories.slice(0,60).map(({category,unit,families,products})=>({category,unit,families,products})))
},null,2));
