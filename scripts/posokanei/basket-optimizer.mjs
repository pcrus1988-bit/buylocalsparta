/**
 * KONTA MOY × PosoKanei — isolated, offline, non-transactional basket optimizer.
 * All supermarket observations are source snapshots, NOT actual shop stock or offers to buy.
 *
 * Exactly one dated GR price snapshot. Comparable substitutions need approved group membership.
 * Group demand is a required amount in the group's base unit (kg/l/piece), fulfilled
 * using one homogeneous SKU per line and rounding UP to whole packages.
 *
 * Costs use integer EUR cents. No incomplete basket is advertised as having a total.
 */
import { packageQuantity } from './comparison-engine.mjs';

const MAX_LINES = 60;
const MAX_RETAILERS = 24;
const MAX_STORES = 5;
const identifier = x => typeof x === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(x);
const amount = x => typeof x === 'number' && Number.isFinite(x) && x > 0 && x <= 10000;
const toEuros = cents => cents == null ? null : Number((cents / 100).toFixed(2));
const compareIds = (a,b) => a.localeCompare(b,'en');
const rank = (a,b) => a.totalCents - b.totalCents ||
  compareIds(a.retailerId,b.retailerId) ||
  compareIds(a.sourceProductId,b.sourceProductId);

function basketLineOptions(line, productById, groupById, priceByProduct, snapshotDate) {
  let requested = [], basis = null, requestedBaseQuantity = null, requiredPackages = null;
  if(line.kind === 'exact') {
    if(!identifier(line.sourceProductId) || !Number.isSafeInteger(line.packageCount) || line.packageCount < 1 || line.packageCount > 100) {
      throw new Error('Exact lines require sourceProductId and packageCount (1–100)');
    }
    requested = [line.sourceProductId];
    requiredPackages = line.packageCount;
  } else if(line.kind === 'group') {
    const group = groupById.get(line.groupId);
    if(!group || group.status !== 'approved' || !['kg','l','piece'].includes(group.basis) ||
      !Array.isArray(group.memberIds) || group.memberIds.length === 0 ||
      group.memberIds.some(id => !identifier(id)) || new Set(group.memberIds).size !== group.memberIds.length) {
      throw new Error('Only explicit approved and valid comparison groups are eligible');
    }
    if(!amount(line.requiredBaseQuantity) || line.requiredBaseQuantity > 100 || !identifier(line.groupId)) {
      throw new Error('Group lines require a base-unit quantity (0–100)');
    }
    basis = group.basis;
    requestedBaseQuantity = line.requiredBaseQuantity;
    requested = group.memberIds;
    if(line.lockedProductId != null) {
      if(!requested.includes(line.lockedProductId)) throw new Error('Locked alternative is not in the approved group');
      requested = [line.lockedProductId];
    }
  } else throw new Error('Unsupported basket line kind');

  if(line.lockedRetailerId != null && !identifier(line.lockedRetailerId)) {
    throw new Error('Invalid lockedRetailerId');
  }
  const options = [];
  let hasProduct = false, hasCompatiblePack = false;
  for(const id of requested) {
    const product = productById.get(id);
    if(!product) continue;
    hasProduct = true;
    let count = requiredPackages;
    let suppliedBaseQuantity = null;
    if(line.kind === 'group') {
      const unit = packageQuantity(product);
      if(!unit || unit.unit !== basis) continue;
      hasCompatiblePack = true;
      count = Math.ceil((requestedBaseQuantity - 1e-10) / unit.amount);
      if(!Number.isSafeInteger(count) || count <= 0 || count > 1000) continue;
      suppliedBaseQuantity = Number((count * unit.amount).toFixed(6));
      if(suppliedBaseQuantity + 1e-8 < requestedBaseQuantity) continue;
    } else {
      hasCompatiblePack = true;
    }
    for(const observation of priceByProduct.get(id) ?? []) {
      if(line.lockedRetailerId != null && observation.retailer_id !== line.lockedRetailerId) continue;
      const cents = Math.round(observation.price_eur * 100);
      if(!Number.isSafeInteger(cents) || cents < 1) continue;
      const totalCents = cents * count;
      if(!Number.isSafeInteger(totalCents)) continue;
      options.push({
        lineId:line.id, kind:line.kind, sourceProductId:id,
        productName:product.name, brand:product.brand ?? null,
        retailerId:observation.retailer_id,
        retailerName:observation.retailer_name || observation.retailer_id,
        packages:count, pricePerPackageEur:toEuros(cents),
        lineTotalEur:toEuros(totalCents), totalCents,
        basis, requestedBaseQuantity, suppliedBaseQuantity,
        sourcePriceUpdatedAt:observation.source_price_updated_at || null,
        snapshotDate
      });
    }
  }
  options.sort(rank);
  return {id:line.id,kind:line.kind,sourceProductId:line.sourceProductId??null,groupId:line.groupId??null,
    options,missingReason: options.length ? null : !hasProduct ? 'product_not_in_snapshot' :
      !hasCompatiblePack ? 'unit_or_pack_not_comparable' : 'no_valid_price_at_allowed_retailers'};
}

// Price is the primary objective. Once every line's lowest attainable price is
// fixed, consolidate equally-priced choices onto the fewest supermarket chains.
// This is an exact secondary optimization for selected plans of up to five stores.
function preferredTieRetailers(tieSets, retailerIds) {
  const ids=[...retailerIds].sort(compareIds);
  if(!ids.length)return new Set();
  if(ids.length<=12) {
    const masks=tieSets.map(options=>options.reduce((mask,o)=>{
      const idx=ids.indexOf(o.retailerId);
      return idx<0?mask:(mask|(1<<idx));
    },0));
    let winner=null,winnerCount=Infinity;
    for(let mask=1;mask<(1<<ids.length);mask++){
      let count=0;
      for(let n=mask;n;n&=n-1)count++;
      if(count>=winnerCount)continue;
      if(masks.every(m=>(m&mask)!==0)){winner=mask;winnerCount=count;}
    }
    return new Set(ids.filter((_,i)=>winner!==null&&(winner&(1<<i))!==0));
  }
  // For large unrestricted comparisons, prices remain exactly minimal while
  // the secondary stop consolidation uses deterministic greedy set coverage.
  const remaining=new Set(tieSets.map((_,i)=>i));
  const selected=new Set();
  for(const choices of tieSets)if(choices.length===1)selected.add(choices[0].retailerId);
  for(const i of remaining)if(tieSets[i].some(x=>selected.has(x.retailerId)))remaining.delete(i);
  while(remaining.size){
    let best=null,bestCoverage=-1;
    for(const id of ids){
      const coverage=[...remaining].filter(i=>tieSets[i].some(o=>o.retailerId===id)).length;
      if(coverage>bestCoverage){best=id;bestCoverage=coverage;}
    }
    if(!best||bestCoverage<=0)break;
    selected.add(best);
    for(const i of remaining)if(tieSets[i].some(x=>x.retailerId===best))remaining.delete(i);
  }
  for(const id of [...selected]){
    if(tieSets.every(opts=>opts.some(o=>selected.has(o.retailerId)&&o.retailerId!==id)))selected.delete(id);
  }
  return selected;
}

function candidatePlan(lines, retailerSet) {
  const missing=[],available=[];
  for(const line of lines){
    const eligible=line.options.filter(o=>retailerSet.has(o.retailerId));
    if(!eligible.length){
      missing.push({lineId:line.id,reason:line.missingReason??'not_listed_at_selected_retailers'});
    }else{
      const cheapest=eligible[0].totalCents;
      available.push(eligible.filter(o=>o.totalCents===cheapest));
    }
  }
  const chosenRetailers=preferredTieRetailers(available,retailerSet);
  const choices=[],used=new Map();
  let cents=0;
  for(const options of available){
    const chosen=options.find(o=>chosenRetailers.has(o.retailerId))??options[0];
    choices.push(chosen);
    used.set(chosen.retailerId,chosen.retailerName);
    cents+=chosen.totalCents;
  }
  const complete=missing.length===0;
  return {complete,items:choices,missingItems:missing,
    totalEur:complete?toEuros(cents):null,
    // Expose a subtotal only with an explicit partial-coverage label.
    coveredSubtotalEur:toEuros(cents),
    coveredItemCount:choices.length,storeCount:used.size,
    stores:[...used].sort(([a],[b])=>compareIds(a,b)).map(([id,name])=>({id,name})),
    _cents:complete?cents:null};
}

function prefer(a,b) {
  if(!a) return b;
  if(!b) return a;
  if(a._cents !== b._cents) return a._cents < b._cents ? a : b;
  if(a.storeCount !== b.storeCount) return a.storeCount < b.storeCount ? a : b;
  const ai = a.stores.map(s=>s.id).join(','),bi=b.stores.map(s=>s.id).join(',');
  return ai <= bi ? a : b;
}
function displayPlan(plan) {
  if(!plan) return null;
  const {_cents,...display}=plan;
  return display;
}

export function optimizeReferenceBasket({
  lines, products, observations, approvedGroups = [], snapshotDate,
  country = 'GR', retailerIds, storeLimit = 5
}) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate??'') || Number.isNaN(Date.parse(snapshotDate))) {
    throw new Error('A valid and explicit snapshotDate is required');
  }
  if(!Array.isArray(lines) || lines.length < 1 || lines.length > MAX_LINES ||
    lines.some(l=>!l || !identifier(l.id)) || new Set(lines.map(l=>l.id)).size!==lines.length) {
    throw new Error('Basket must contain 1–60 uniquely identified lines');
  }
  if(!Array.isArray(products) || !Array.isArray(observations) || !Array.isArray(approvedGroups)) {
    throw new Error('Products, observations and groups must be arrays');
  }
  if(!Number.isSafeInteger(storeLimit) || storeLimit<1 || storeLimit>MAX_STORES) {
    throw new Error('storeLimit must be an integer 1–5');
  }
  if(!/^[A-Z]{2}$/.test(country)) throw new Error('Invalid country');
  if(retailerIds!=null && (!Array.isArray(retailerIds)||retailerIds.some(x=>!identifier(x)))) {
    throw new Error('Invalid retailerIds filter');
  }
  const retailerFilter = retailerIds == null ? null : new Set(retailerIds);
  const productById = new Map();
  for(const p of products) {
    if(!identifier(p?.source_product_id) || (p.snapshot_date && p.snapshot_date!==snapshotDate)) continue;
    if(productById.has(p.source_product_id)) throw new Error('Duplicate product in snapshot');
    productById.set(p.source_product_id,p);
  }
  const groupById = new Map();
  for(const group of approvedGroups) {
    if(!identifier(group?.id) || groupById.has(group.id)) throw new Error('Invalid or duplicate comparison group');
    groupById.set(group.id,group);
  }
  const priceByProduct = new Map(), seen = new Set();
  const retailers = new Map();
  for(const observation of observations) {
    if(observation?.snapshot_date !== snapshotDate || observation.country !== country ||
      !identifier(observation.source_product_id) || !identifier(observation.retailer_id) ||
      (retailerFilter && !retailerFilter.has(observation.retailer_id))) continue;
    const key = observation.source_product_id + '\u0000' + observation.retailer_id;
    if(seen.has(key)) throw new Error('Duplicate retailer/product price in snapshot');
    seen.add(key);
    if(!amount(observation.price_eur) || observation.price_eur>100000) continue;
    retailers.set(observation.retailer_id,observation.retailer_name || observation.retailer_id);
    const existing = priceByProduct.get(observation.source_product_id)??[];
    existing.push(observation);
    priceByProduct.set(observation.source_product_id,existing);
  }
  const definedLines = lines.map(line=>basketLineOptions(line,productById,groupById,priceByProduct,snapshotDate));
  const relevantIds = [...new Set(definedLines.flatMap(l=>l.options.map(o=>o.retailerId)))].sort(compareIds);
  if(relevantIds.length>MAX_RETAILERS) {
    throw new Error('Too many retailers for exhaustive optimization; narrow selection first');
  }
  const missingGlobal = definedLines.filter(l=>!l.options.length).map(l=>({lineId:l.id,reason:l.missingReason}));
  const bestPerLine = definedLines.map(l=>({lineId:l.id,chosen:l.options[0]??null,
    optionsCount:l.options.length,missingReason:l.missingReason}));
  let bestSingle=null,bestDistributed=null,bestAny=null;
  const singleStoreCandidates = [];
  const candidatesByLimit = Array.from({length:storeLimit},()=>null);
  // Enumerate retailer combinations exactly, up to a user-selected number of stores.
  // Each line picks the cheapest permitted product/retailer pair in that combination.
  function scan(combination,start) {
    if(combination.length>0) {
      const plan=candidatePlan(definedLines,new Set(combination));
      if(combination.length===1) {
        singleStoreCandidates.push({retailerId:combination[0],complete:plan.complete,
          missingItems:plan.missingItems,coveredItemCount:plan.coveredItemCount,
          totalEur:plan.totalEur});
      }
      if(plan.complete) {
        for(let n=combination.length;n<=storeLimit;n++) candidatesByLimit[n-1]=prefer(candidatesByLimit[n-1],plan);
        bestDistributed=prefer(bestDistributed,plan);
        if(combination.length===1) bestSingle=prefer(bestSingle,plan);
      }
    }
    if(combination.length===storeLimit) return;
    for(let i=start;i<relevantIds.length;i++) scan([...combination,relevantIds[i]],i+1);
  }
  scan([],0);
  if(missingGlobal.length===0) {
    bestAny=candidatePlan(definedLines,new Set(relevantIds));
    if(!bestAny.complete) bestAny=null;
  }
  const bestTwoStore = storeLimit>=2 ? candidatesByLimit[1] : null;
  const savings = bestSingle && bestAny ? toEuros(Math.max(0,bestSingle._cents-bestAny._cents)):null;
  // This deliberately models the user-described availability-first, one-store
  // heuristic; it is NOT a claim about the official service's source code.
  const coverageFirstCandidate=[...singleStoreCandidates].sort((a,b)=>
    b.coveredItemCount-a.coveredItemCount||compareIds(a.retailerId,b.retailerId))[0]??null;
  const coverageFirstPlan=coverageFirstCandidate
    ?candidatePlan(definedLines,new Set([coverageFirstCandidate.retailerId])):null;
  const coverageFirstSingleStore=coverageFirstCandidate&&coverageFirstPlan?{
    retailerId:coverageFirstCandidate.retailerId,
    retailerName:retailers.get(coverageFirstCandidate.retailerId)||coverageFirstCandidate.retailerId,
    coveredItemCount:coverageFirstPlan.coveredItemCount,totalItemCount:lines.length,
    complete:coverageFirstPlan.complete,missingItems:coverageFirstPlan.missingItems,
    totalEur:coverageFirstPlan.totalEur,
    coveredSubtotalEur:coverageFirstPlan.coveredSubtotalEur
  }:null;
  const savingsVsCoverageFirstSingleStoreEur=
    coverageFirstPlan?.complete&&bestDistributed?.complete
      ?toEuros(Math.max(0,coverageFirstPlan._cents-bestDistributed._cents)):null;
  const savingsVsCoverageFirstSingleStorePercent=
    savingsVsCoverageFirstSingleStoreEur!==null&&coverageFirstPlan._cents>0
      ?Number((100*(coverageFirstPlan._cents-bestDistributed._cents)/coverageFirstPlan._cents).toFixed(1)):null;
  singleStoreCandidates.sort((a,b) => Number(b.complete)-Number(a.complete) ||
    b.coveredItemCount-a.coveredItemCount ||
    (a.totalEur??Infinity)-(b.totalEur??Infinity) ||
    compareIds(a.retailerId,b.retailerId));
  return {
    snapshotDate,country,lineCount:lines.length,retailerCount:relevantIds.length,
    includedRetailerIds:relevantIds,storeLimit,
    allItemsHavePrices:missingGlobal.length===0,
    missingItems:missingGlobal,bestPerLine,
    bestSingleStore:displayPlan(bestSingle),
    bestUpToTwoStores:displayPlan(bestTwoStore),
    cheapestAcrossAnyStores:displayPlan(bestAny),
    cheapestWithinStoreLimit:displayPlan(bestDistributed),
    byStoreLimit:candidatesByLimit.map((plan,index)=>({maxStores:index+1,plan:displayPlan(plan)})),
    singleStoreCandidates,coverageFirstSingleStore,
    savingsVsCoverageFirstSingleStoreEur,savingsVsCoverageFirstSingleStorePercent,
    savingsVsCheapestCompleteSingleStoreEur:savings,
    limitation:'Reference-only supermarket chain snapshots; not branch prices, stock, buyable checkout, delivery or travel-cost totals'
  };
}
