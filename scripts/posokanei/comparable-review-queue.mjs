/**
 * Human-review queue for comparable supermarket products.
 *
 * Ranked name/type/quantity similarities are NOT approved equivalences.
 * This module never edits the reviewed-group registry, emits replacement
 * recommendations, or makes any assertion of identical ingredients.
 */
import {createBrandIndex,referenceQuantity} from "./brand-alternatives.mjs";

const validPrice=n=>typeof n==="number"&&Number.isFinite(n)&&n>0&&n<=100000;
const amountToCents=n=>Math.round(n*100);
const normalize=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("el-GR").trim();

export function approvedMemberIds(reviewed) {
  const groups=Array.isArray(reviewed)?reviewed:
    Array.isArray(reviewed?.groups)?reviewed.groups:
    Array.isArray(reviewed?.approvedGroups)?reviewed.approvedGroups:[];
  const ids=new Set();
  for(const group of groups){
    if(group?.status!=="approved")continue;
    const members=Array.isArray(group.members)?group.members:
      Array.isArray(group.memberIds)?group.memberIds:[];
    for(const member of members){
      const id=typeof member==="string"?member:member?.id;
      if(typeof id==="string"&&id.length)ids.add(id);
    }
  }
  return ids;
}

export function rankComparableReviewQueue({
  products,offersByProduct,approvedGroups=[],limit=100,minBrands=2
}) {
  if(!Array.isArray(products)||!(offersByProduct instanceof Map))
    throw Error("Expected products and price-offer index");
  if(!Number.isSafeInteger(limit)||limit<1||limit>1000)
    throw Error("limit must be 1–1000");
  if(!Number.isSafeInteger(minBrands)||minBrands<2||minBrands>100)
    throw Error("minBrands must be 2–100");
  const approved=approvedMemberIds(approvedGroups);
  const families=createBrandIndex(products),groups=[];
  let familyCount=0,withPrice=0,unreviewedProductCount=0;
  for(const [key,sourceMembers] of families){
    const entries=[];
    for(const p of sourceMembers){
      const q=referenceQuantity(p);
      if(!q||!Number.isFinite(q.amount)||q.amount<=0)continue;
      const eligible=(offersByProduct.get(p.source_product_id)||[])
        .filter(o=>validPrice(o.price_eur)&&typeof o.retailer_id==="string"&&o.retailer_id.length);
      if(!eligible.length)continue;
      eligible.sort((a,b)=>a.price_eur-b.price_eur||a.retailer_id.localeCompare(b.retailer_id));
      const best=eligible[0];
      entries.push({
        id:p.source_product_id,name:p.name,brand:p.brand,category:p.category,
        unit:p.unit,unitQuantity:p.unit_quantity,
        basis:q.unit,baseQuantity:q.amount,
        retailerId:best.retailer_id,retailerName:best.retailer_name||best.retailer_id,
        minimumPackPriceCents:amountToCents(best.price_eur),
        reviewed:approved.has(p.source_product_id)
      });
    }
    if(entries.length<minBrands)continue;
    withPrice++;
    const differentBrands=new Set(entries.map(p=>normalize(p.brand)));
    if(differentBrands.size<minBrands)continue;
    familyCount++;
    const pending=entries.filter(p=>!p.reviewed);
    if(!pending.length)continue;
    unreviewedProductCount+=pending.length;
    // Compare the SAME source quantity with whole packs rather than assuming
    // a low price per kg means a lower checkout total.
    let best=null;
    for(const source of entries){
      for(const candidate of entries){
        if(source.id===candidate.id||normalize(source.brand)===normalize(candidate.brand))continue;
        const packageCount=Math.ceil(source.baseQuantity/candidate.baseQuantity-1e-9);
        if(!Number.isSafeInteger(packageCount)||packageCount<1||packageCount>100)continue;
        const candidateCents=packageCount*candidate.minimumPackPriceCents;
        const savingCents=source.minimumPackPriceCents-candidateCents;
        if(savingCents<=0)continue;
        const percent=savingCents/source.minimumPackPriceCents;
        if(!best||savingCents>best.potentialSavingsCents||
          (savingCents===best.potentialSavingsCents&&percent>best.potentialSavingShare))
          best={
            originalId:source.id,candidateId:candidate.id,
            originalQuantity:source.baseQuantity,requiredCandidatePacks:packageCount,
            sourcePriceCents:source.minimumPackPriceCents,candidateTotalCents:candidateCents,
            potentialSavingsCents:savingCents,potentialSavingShare:percent
          };
      }
    }
    if(!best)continue; // Queue only pairs with a verifiable price difference.
    entries.sort((a,b)=>a.brand.localeCompare(b.brand,"el")||a.name.localeCompare(b.name,"el"));
    groups.push({
      familyKey:key,
      detailedCategory:entries[0].category,basis:entries[0].basis,
      brandCount:differentBrands.size,productCount:entries.length,
      pendingCount:pending.length,reviewedCount:entries.length-pending.length,
      potentialSavingEur:Number((best.potentialSavingsCents/100).toFixed(2)),
      potentialSavingPercent:Math.round(best.potentialSavingShare*100),
      comparisonEvidence:best,
      requiresHumanApproval:true,
      warning:"Similarity and chain-price observations only; verify composition, type, origin, allergens, intended use, source identity and pack units.",
      members:entries
    });
  }
  groups.sort((a,b)=>b.potentialSavingEur-a.potentialSavingEur||
    b.pendingCount-a.pendingCount||
    a.familyKey.localeCompare(b.familyKey,"el"));
  return {
    schema_version:1,kind:"unverified_comparable_review_queue",
    generatedFrom:"published_reference_snapshot",
    autoApproval:false,
    summary:{indexedFamilies:families.size,pricedFamilies:withPrice,
      multiBrandPricedFamilies:familyCount,
      groupsWithCheaperUnreviewedCandidates:groups.length,
      unreviewedProductMemberships:unreviewedProductCount,
      returnedGroups:Math.min(groups.length,limit)},
    groups:groups.slice(0,limit)
  };
}
