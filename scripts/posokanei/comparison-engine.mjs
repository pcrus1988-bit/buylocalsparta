/** KONTA MOY × PosoKanei: research-only supermarket reference comparison.
 * Does not expose marketplace offers, checkout, stock, or store-level availability.
 * Cross-brand alternatives require reviewed group membership; never infer from titles alone.
 */
const unitFactors = Object.freeze({
  kg:['kg',1],g:['kg',.001],gr:['kg',.001],
  l:['l',1],L:['l',1],ml:['l',.001],
  piece:['piece',1],pcs:['piece',1],pc:['piece',1]
});
const safeId = value => typeof value === 'string' && /^[\w-]{1,100}$/.test(value);
const validPrice = value => typeof value === 'number' && Number.isFinite(value) && value>0 && value<=100000;
const round = (value,digits=4) => Math.round((value+Number.EPSILON)*10**digits)/10**digits;

export function packageQuantity(product) {
  const unit = unitFactors[product?.unit];
  const quantity = product?.unit_quantity;
  if (!unit || typeof quantity!=='number' || !Number.isFinite(quantity) || quantity<=0) return null;
  return {unit:unit[0],amount:quantity*unit[1]};
}

/** Sort actual offers by shelf price for ONE exact product, never by unit price. */
export function exactProductOffers(sourceProductId,observations,{snapshotDate,country='GR',retailerIds}={}) {
  if (!safeId(sourceProductId) || !/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate??'')) {
    throw new Error('Explicit product and snapshot date required');
  }
  const allowed = retailerIds==null ? null : new Set(retailerIds);
  const seen = new Set(), offers=[];
  for (const row of observations) {
    if(row.source_product_id!==sourceProductId || row.snapshot_date!==snapshotDate || row.country!==country) continue;
    if(allowed && !allowed.has(row.retailer_id)) continue;
    if(!safeId(row.retailer_id)) continue;
    if(seen.has(row.retailer_id)) throw new Error('Duplicate retailer '+row.retailer_id+' for '+sourceProductId);
    seen.add(row.retailer_id);
    if(!validPrice(row.price_eur)) continue;
    offers.push({
      retailerId:row.retailer_id,
      retailerName:row.retailer_name||row.retailer_id,
      priceEur:row.price_eur,
      normalizedUnitPriceEur:validPrice(row.normalized_unit_price_eur)?row.normalized_unit_price_eur:null,
      observedAt:row.source_price_updated_at||null,
      discount:row.is_discount===true,
      sourceProductId
    });
  }
  offers.sort((a,b)=>a.priceEur-b.priceEur||a.retailerName.localeCompare(b.retailerName,'el')||a.retailerId.localeCompare(b.retailerId));
  const cheapest=offers[0]??null;
  return {
    sourceProductId,snapshotDate,country,
    offers:offers.map(o=>({...o,isCheapest:Boolean(cheapest && Math.abs(o.priceEur-cheapest.priceEur)<0.000001)})),
    cheapest:cheapest?{...cheapest,isCheapest:true}:null,
    maximumObservedPriceEur:offers.length?offers[offers.length-1].priceEur:null,
    potentialSavingsEur:offers.length>1?round(offers[offers.length-1].priceEur-cheapest.priceEur,2):0
  };
}

/** Only a human-reviewed, opt-in equivalence group can rank alternatives. */
export function compareApprovedAlternatives({approvedGroup,products,observations,snapshotDate,country='GR',retailerIds,ranking='unit'}) {
  if(approvedGroup?.status!=='approved' || !safeId(approvedGroup?.id) ||
    !['kg','l','piece'].includes(approvedGroup?.basis) || !Array.isArray(approvedGroup?.memberIds)) {
    throw new Error('Only explicit, approved equivalence groups may be compared');
  }
  if(!['unit','package'].includes(ranking)) throw new Error('Unsupported comparison ranking');
  const ids=new Set(approvedGroup.memberIds);
  if(ids.size!==approvedGroup.memberIds.length||[...ids].some(id=>!safeId(id))) throw new Error('Invalid or duplicate group member');
  const refs=new Map(products.filter(p=>ids.has(p.source_product_id)).map(p=>[p.source_product_id,p]));
  const alternatives=[],unavailable=[];
  for(const id of ids) {
    const product=refs.get(id);
    if(!product){unavailable.push({sourceProductId:id,reason:'product_metadata_missing'});continue;}
    const exact=exactProductOffers(id,observations,{snapshotDate,country,retailerIds});
    if(!exact.cheapest){unavailable.push({sourceProductId:id,name:product.name,reason:'no_current_retailer_price'});continue;}
    const quantity=packageQuantity(product);
    const sameUnit=quantity?.unit===approvedGroup.basis;
    alternatives.push({
      sourceProductId:id,name:product.name,brand:product.brand||null,
      // Never display source imagery without explicit media reuse authorization.
      sourceImageUrl:product.image_source_url||null,
      unit:product.unit||null,unitQuantity:product.unit_quantity??null,
      comparableUnit:sameUnit?approvedGroup.basis:null,
      packageQuantityInBaseUnit:sameUnit?quantity.amount:null,
      bestPackagePriceEur:exact.cheapest.priceEur,
      bestUnitPriceEur:sameUnit?round(exact.cheapest.priceEur/quantity.amount):null,
      cheapestRetailer:exact.cheapest,
      retailerOffers:exact.offers,
      validForUnitRanking:sameUnit,snapshotDate
    });
  }
  alternatives.sort((a,b)=>{
    if(ranking==='unit') {
      const av=a.bestUnitPriceEur??Infinity,bv=b.bestUnitPriceEur??Infinity;
      if(av!==bv) return av-bv;
    }
    return a.bestPackagePriceEur-b.bestPackagePriceEur||a.name.localeCompare(b.name,'el')||a.sourceProductId.localeCompare(b.sourceProductId);
  });
  const eligible=ranking==='unit'?alternatives.filter(p=>p.validForUnitRanking):alternatives;
  return {
    groupId:approvedGroup.id,basis:approvedGroup.basis,ranking,
    recommended:eligible[0]??null,alternatives,unavailable,
    unitRankingAvailable:eligible.length>0,
    limitation:'Reference only: not inventory, checkout, delivery, or a location-specific price guarantee'
  };
}
