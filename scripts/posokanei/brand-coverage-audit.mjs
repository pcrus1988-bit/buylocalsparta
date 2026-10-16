#!/usr/bin/env node
/**
 * Catalogue-wide public-reference audit: exercise all SKUs with a dated price
 * and report aggregate coverage only. Never prints product names or SKUs.
 */
import {readFile} from "node:fs/promises";
import {join,resolve} from "node:path";
import {
  createBrandIndex,findBrandAlternatives,productFamily,referenceQuantity
} from "./brand-alternatives.mjs";
import {buildApprovedReferenceGroups} from "./reviewed-groups.mjs";

const dir=process.argv[2];
if(!dir){console.error("Usage: node brand-coverage-audit.mjs IMPORT_DIR");process.exit(2);}
const readJsonl=async name=>(await readFile(join(resolve(dir),name),"utf8"))
  .split("\n").filter(Boolean).map(line=>JSON.parse(line));
const [products,prices]=await Promise.all([
  readJsonl("reference-products.jsonl"),readJsonl("reference-prices.jsonl")
]);
// The importer archives raw products and prices, NOT human review approvals.
// A caller auditing a published artifact may pass its reviewed-group JSON as
// an explicit second argument. Without that proof, approved coverage is unknown
// rather than misleadingly reported as zero.
const reviewedFile=process.argv[3];
const published=reviewedFile?JSON.parse(await readFile(resolve(reviewedFile),"utf8")):null;
const approvedGroups=published===null?null:
  published?.schema_version===1&&Array.isArray(published.groups)?
    buildApprovedReferenceGroups(products,published):
    Array.isArray(published)?published:published?.approvedGroups;
if(approvedGroups!==null && (!Array.isArray(approvedGroups)||
    approvedGroups.some(g=>g?.status!=="approved"||!Array.isArray(g.memberIds))))
  throw new Error("Expected a validated set of human-approved groups");
if(published?.groups?.length && !approvedGroups?.length)
  throw new Error("All approved product groups drifted or became unavailable");
const requestedApprovedCount=published?.groups?.filter(g=>g?.status==="approved").length??0;
if(requestedApprovedCount>0&&approvedGroups?.length!==requestedApprovedCount)
  throw new Error(`Approved source-SKU drift: validated ${approvedGroups?.length??0} of ${requestedApprovedCount} pinned groups. Refuse publication until review.`);

const offers=new Map();
for(const observation of prices){
  if(observation.country!=="GR"||observation.price_eur<=0)continue;
  const list=offers.get(observation.source_product_id)||[];
  list.push(observation);
  offers.set(observation.source_product_id,list);
}
const index=createBrandIndex(products);
const count={
  products:products.length,pricedProducts:0,productsWithKnownSize:0,
  productsWithBrandAndFamily:0,productsWithOtherBrandInFamily:0,
  approvedCoverageAudited:approvedGroups!==null,
  publishedApprovedGroups:approvedGroups?.length??null,
  publishedApprovedMembers:approvedGroups?.reduce((n,g)=>n+g.memberIds.length,0)??null,
  productsWithCheaperApprovedBrand:approvedGroups===null?null:0,
  approvedOffers:approvedGroups===null?null:0,
  productsWithCheaperUnreviewedCandidate:0,unreviewedOffers:0,
  unknownQuantity:0
};
for(const product of products){
  if(!offers.has(product.source_product_id))continue;
  count.pricedProducts++;
  const size=referenceQuantity(product);
  if(!size){count.unknownQuantity++;continue;}
  count.productsWithKnownSize++;
  const family=productFamily(product);
  if(!family||!product.brand)continue;
  count.productsWithBrandAndFamily++;
  const group=index.get(family+"|"+size.unit)||[];
  if(!group.some(p=>p.source_product_id!==product.source_product_id&&p.brand!==product.brand))continue;
  count.productsWithOtherBrandInFamily++;
  const res=findBrandAlternatives({
    sourceId:product.source_product_id,products,offersByProduct:offers,brandIndex:index,
    approvedGroups:approvedGroups||[]
  });
  if(approvedGroups!==null && res.alternatives.length) {
    count.productsWithCheaperApprovedBrand++;
    count.approvedOffers+=res.alternatives.length;
  }
  if(res.candidates.length) {
    count.productsWithCheaperUnreviewedCandidate++;
    count.unreviewedOffers+=res.candidates.length;
  }
}
if(count.products<1||count.pricedProducts<1)throw Error("No valid public reference products");
console.log(JSON.stringify({brandComparisonAudit:count},null,2));
