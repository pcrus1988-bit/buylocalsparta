/**
 * Price-aware cross-brand candidate discovery for ANY catalogue product.
 *
 * No small fixed list of food families: use all published SKUs, but match only
 * when meaningful normalized product-name tokens, detailed category and
 * physical unit agree. Variants (fat %, organic, sugar-free, fragrance, size,
 * etc.) remain in the signature and are not silently treated as equivalent.
 *
 * This is a *suggestion*, never an automatic basket substitution.
 * Prices are dated supermarket-chain references, not branch availability.
 */

const normalize = value => String(value||"").normalize("NFD")
  .replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("el-GR")
  .replace(/[’‘´΄']/g," ").replace(/[–—−]/g,"-")
  .replace(/\s+/g," ").trim();

const generic = new Set([
  "συσκευασια","συσκευασιας","συσκ","pack","πακετο","τεμαχιο","τεμαχια",
  "περιεχομενο","καθαρο","βαρος","net","weight","product",
  "το","η","ο","οι","τα","με","σε","και","απο","του","της","των"
]);

export function referenceQuantity(p) {
  const n=p?.unit_quantity;
  const unit=normalize(p?.unit);
  if(typeof n!=="number"||!Number.isFinite(n)||n<=0)return null;
  if(unit==="kg"||unit==="κιλο"||unit==="κιλα")return {unit:"kg",amount:n};
  if(unit==="g"||unit==="gr"||unit==="γρ"||unit==="γραμμαρια")return {unit:"kg",amount:n/1000};
  if(unit==="l"||unit==="lt"||unit==="λιτρα")return {unit:"l",amount:n};
  if(unit==="ml"||unit==="μλ")return {unit:"l",amount:n/1000};
  if(unit==="piece"||unit==="pcs"||unit==="τεμ")return {unit:"piece",amount:n};
  return null;
}

export function productFamily(p) {
  const category=normalize(p?.category);
  if(!category||typeof p?.name!=="string")return null;
  let name=normalize(p.name);
  const brand=normalize(p.brand);
  // Remove the explicit *whole brand phrase*; never infer brands from similar
  // words in titles. Protect word boundaries by padding with spaces.
  if(brand)name=(" "+name+" ").replaceAll(" "+brand+" "," ").trim();
  // Discard only physical pack volumes, not fat percentages, numeric formats,
  // formulas, fragrances, ages, coffee strengths or other distinguishing traits.
  name=name.replace(/(?:^|[^\p{L}\p{N}])\d+(?:[.,]\d+)?\s*(?:kg|gr|g|ml|lt|l|γρ|γραμ|γραμμαρια|κιλ|λιτρα|μλ)(?=$|[^\p{L}])/gu," ");
  const tokens=name.replace(/[^\p{L}\p{N}%]+/gu," ").split(/\s+/)
    .filter(x=>x.length>0&&!generic.has(x));
  if(!tokens.length)return null;
  // One strong product term is valid within a detailed category; prevent very
  // short or generic-only labels from producing broad category substitutions.
  if(tokens.length===1&&tokens[0].length<5)return null;
  return category+"|"+tokens.sort().join(" ");
}

const validPrice = n => typeof n==="number"&&Number.isFinite(n)&&n>0&&n<=100000;
const euros = cents => Number((cents/100).toFixed(2));

/**
 * With 10k products, indexing once per loaded snapshot makes every basket
 * line a lookup rather than another full catalogue scan.
 */
export function createBrandIndex(products) {
  const byFamily=new Map();
  for(const p of products) {
    const f=productFamily(p),q=referenceQuantity(p);
    if(!f||!q||!p.brand||!normalize(p.brand))continue;
    const key=f+"|"+q.unit;
    const group=byFamily.get(key)||[];
    group.push(p);
    byFamily.set(key,group);
  }
  return byFamily;
}

const sourceIndexes=new WeakMap();
function productIndex(products){
  let index=sourceIndexes.get(products);
  if(!index){index=new Map(products.map(p=>[p.source_product_id,p]));sourceIndexes.set(products,index);}
  return index;
}

export function findBrandAlternatives({
  sourceId,packages=1,products,offersByProduct,excludedRetailerIds=[],
  brandIndex=createBrandIndex(products),approvedGroups=[],maxResults=5
}) {
  if(!Number.isSafeInteger(packages)||packages<1||packages>100)
    throw new Error("packages must be an integer 1–100");
  const source=productIndex(products).get(sourceId);
  if(!source)return {reason:"not_found",basis:null,sourceAmount:null,alternatives:[],candidates:[]};
  const quantity=referenceQuantity(source);
  if(!quantity)return {reason:"unknown_quantity",basis:null,sourceAmount:null,alternatives:[],candidates:[]};
  const base={basis:quantity.unit,sourceAmount:quantity.amount,alternatives:[],candidates:[]};
  const family=productFamily(source);
  if(!source.brand)return {...base,reason:"no_comparable_brands"};
  const forbidden=new Set(excludedRetailerIds);
  const bestOffer=id=>(offersByProduct.get(id)||[])
    .filter(o=>!forbidden.has(o.retailer_id)&&validPrice(o.price_eur))
    .sort((a,b)=>a.price_eur-b.price_eur||a.retailer_id.localeCompare(b.retailer_id))[0];
  const original=bestOffer(sourceId);
  if(!original)return {...base,reason:"no_source_price"};
  const sourceCents=Math.round(original.price_eur*100)*packages;
  if(!Number.isSafeInteger(sourceCents)||sourceCents<=0)return {...base,reason:"no_source_price"};
  const demand=quantity.amount*packages;
  // Approved groups can contain equivalent product labels with different
  // wording; those explicitly-reviewed members MUST be considered even when
  // the loose title-token family fails to match.
  const approvedForSource=new Set(approvedGroups
    .filter(g=>g?.status==="approved"&&Array.isArray(g.memberIds)&&g.memberIds.includes(sourceId))
    .flatMap(g=>g.memberIds));
  const candidatesById=new Map();
  if(family)for(const p of brandIndex.get(family+"|"+quantity.unit)||[])
    candidatesById.set(p.source_product_id,p);
  for(const id of approvedForSource){
    const reviewed=productIndex(products).get(id);
    if(reviewed)candidatesById.set(id,reviewed);
  }
  const pool=[...candidatesById.values()];
  if(!pool.length)return {...base,reason:"no_comparable_brands"};
  const byBrand=new Map();
  for(const candidate of pool) {
    if(candidate.source_product_id===sourceId||normalize(candidate.brand)===normalize(source.brand))continue;
    const size=referenceQuantity(candidate);
    if(!size||size.unit!==quantity.unit)continue;
    const count=Math.ceil(demand/size.amount-1e-9);
    if(!Number.isSafeInteger(count)||count<1||count>100)continue;
    const offer=bestOffer(candidate.source_product_id);
    if(!offer)continue;
    const cents=count*Math.round(offer.price_eur*100);
    if(cents>=sourceCents||!Number.isSafeInteger(cents))continue;
    const entry={
      id:candidate.source_product_id,name:candidate.name,brand:candidate.brand,
      packageQuantity:size.amount,unit:size.unit,packageCount:count,
      priceEur:euros(Math.round(offer.price_eur*100)),
      unitPriceEur:Number((offer.price_eur/size.amount).toFixed(2)),
      retailerId:offer.retailer_id,retailerName:offer.retailer_name||offer.retailer_id,
      originalTotalEur:euros(sourceCents),candidateTotalEur:euros(cents),
      savingsEur:euros(sourceCents-cents),
      savingPercent:Math.round(100*(sourceCents-cents)/sourceCents),
      confidence:approvedForSource.has(candidate.source_product_id)?"reviewed_equivalent":"unverified_match"
    };
    const brandKey=normalize(candidate.brand)+"|"+entry.confidence;
    const prior=byBrand.get(brandKey);
    if(!prior||entry.candidateTotalEur<prior.candidateTotalEur||
       (entry.candidateTotalEur===prior.candidateTotalEur&&entry.id<prior.id))
      byBrand.set(brandKey,entry);
  }
  const ranked=[...byBrand.values()].sort((a,b)=>
    a.candidateTotalEur-b.candidateTotalEur||b.savingsEur-a.savingsEur||
    a.name.localeCompare(b.name,"el"));
  const alternatives=ranked.filter(x=>x.confidence==="reviewed_equivalent").slice(0,maxResults);
  // Unverified candidates are shown only as information, without any
  // substitution CTA or guaranteed-savings claim in the UI.
  const candidates=ranked.filter(x=>x.confidence==="unverified_match").slice(0,maxResults);
  return {...base,originalTotalEur:euros(sourceCents),sourcePackages:packages,
    alternatives,candidates,reason:alternatives.length?"cheaper_found":
      candidates.length?"unreviewed_candidates":
      pool.length>1?"no_cheaper_brand":"no_comparable_brands"};
}
