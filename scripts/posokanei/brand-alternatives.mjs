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
  .replace(/[’‘´΄']/g,"").replace(/[–—−]/g,"-")
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


/**
 * Curated, one-to-one product-type spellings. These are wording equivalences,
 * not recipe/variant equivalences: e.g. passata is NOT diced tomato, and
 * full-fat milk is NOT light or lactose-free milk.
 */
const canonicalTypes=[
  ["tomato","ντοματα","ντοματες","τοματα","τοματες","tomato","tomatoes"],
  ["diced","κονκασε","ψιλοκομμενη","ψιλοκομμενες","ψιλοκομμενο","ψιλοκομμενα","diced","chopped"],
  ["milk","γαλα","γαλακτος","milk"],
  ["yogurt","γιαουρτι","γιαουρτια","γιαουρτης","yogurt","yoghurt"],
  ["cheese","τυρι","τυρια","τυρου","cheese"],
  ["rice","ρυζι","ρυζιου","rice"],
  ["lentils","φακες","φακη","lentils"],
  ["chickpeas","ρεβιθια","ρεβιθι","chickpeas"],
  ["beans","φασολια","φασολι","beans"],
  ["spaghetti","σπαγγετι","σπαγγετ","spaghetti","spagetti"],
  ["penne","πεννες","πεννε","penne"],
  ["pasta","ζυμαρικα","μακαρονια","pasta"],
  ["oliveoil","ελαιολαδο","ελαιολαδου","oliveoil"],
  ["sugar","ζαχαρη","ζαχαρης","sugar"],
  ["flour","αλευρι","αλευρου","flour"],
  ["salt","αλατι","αλατιου","salt"],
  ["water","νερο","νερου","water"],
  ["juice","χυμος","χυμοι","χυμου","juice"],
  ["coffee","καφες","καφε","καφεδες","coffee"],
  ["instant","στιγμιαιος","στιγμιαιου","instant"],
  ["biscuits","μπισκοτα","μπισκοτο","biscuits","biscuit"],
  ["chocolate","σοκολατα","σοκολατες","chocolate"],
  ["shampoo","σαμπουαν","shampoo"],
  ["detergent","απορρυπαντικο","απορρυπαντικα","detergent"],
  ["softener","μαλακτικο","μαλακτικα","softener"],
  ["diapers","πανες","πανα","diapers"],
  ["soap","σαπουνι","σαπουνια","soap"],
  ["toothpaste","οδοντοκρεμα","toothpaste"]
];
const typeAliases=new Map(canonicalTypes.flatMap(([type,...words])=>words.map(w=>[w,type])));

// Reviewed aliases for a source-declared brand and its actual package marking.
// Never infer aliases from partial textual similarity or store names.
const declaredBrandAliases=new Map([
  ["αβ βασιλοπουλος",["αβ"]],
  ["every day",["everyday"]],
  ["w5 lidl",["w5"]],
  ["my planet",["planet"]],
  ["coffee way",["coffeeway"]],
  ["mr grand",["mrgrand"]],
  ["3 αλφα",["3α","3αλφα"]],
  ["ευ ελαιολαδο",["ευ"]],
  ["νουνου",["nounou","noynoy"]]
]);
function reliableBrand(value){
  const text=normalize(value).replace(/[^\p{L}\p{N}]+/gu," ").trim();
  return !!text && !/^(?:διαφορα|ean\b|unknown\b|unbranded\b|χωρις brand\b|χωρις μαρκα\b|αγνωστ)/u.test(text);
}

function greekToLatin(value) {
  const pairs={ου:"ou",αι:"e",ει:"i",οι:"i",υι:"i",μπ:"b",ντ:"d",γκ:"g",γγ:"ng"};
  const one={α:"a",β:"v",γ:"g",δ:"d",ε:"e",ζ:"z",η:"i",θ:"th",ι:"i",κ:"k",
    λ:"l",μ:"m",ν:"n",ξ:"x",ο:"o",π:"p",ρ:"r",σ:"s",ς:"s",τ:"t",υ:"y",
    φ:"f",χ:"ch",ψ:"ps",ω:"o"};
  const source=normalize(value);
  return source.replace(/ου|αι|ει|οι|υι|μπ|ντ|γκ|γγ|[α-ω]/g,ch=>pairs[ch]||one[ch]||ch);
}
function words(value) {
  return normalize(value).replace(/[^\p{L}\p{N}%]+/gu," ").trim().split(/\s+/).filter(Boolean);
}
function withoutExplicitBrand(tokens,brand) {
  const exact=words(brand);
  if(!exact.length)return tokens;
  const aliases=declaredBrandAliases.get(words(brand).join(" "))||[];
  const alternatives=[exact,...aliases.map(words)];
  // A source title may Romanize its explicitly declared Greek brand. Only
  // strip a WHOLE brand phrase; do not strip similar product words.
  if(/[α-ω]/.test(normalize(brand))) {
    const roman=words(greekToLatin(brand));
    if(roman.join(" ")!==exact.join(" "))alternatives.push(roman);
  }
  const output=[...tokens];
  for(const phrase of alternatives){
    for(let pos=0;pos<=output.length-phrase.length;){
      if(phrase.every((word,i)=>word===output[pos+i]))output.splice(pos,phrase.length);
      else pos++;
    }
  }
  return output;
}
export function productFamily(p) {
  const category=normalize(p?.category).replace(/[^\p{L}\p{N}]+/gu," ").trim();
  if(!category||typeof p?.name!=="string")return null;
  let name=normalize(p.name);
  // Discard only physical package volume/weight. Fat %, age, strength,
  // dosage, chemical variants, number of ply, etc. must still match.
  name=name.replace(/(?:^|[^\p{L}\p{N}])\d+(?:[.,]\d+)?\s*(?:kg|gr|g|ml|lt|l|γρ|γραμ|γραμμαρια|κιλ|λιτρα|μλ)(?=$|[^\p{L}])/gu," ");
  // Piece-count markings are *pack sizes*, not formulation/size attributes.
  // Only remove a count corroborated by the published package quantity;
  // retain egg weight classes, roll ply, diaper size, color/shade numbers.
  const q=referenceQuantity(p);
  if(q?.unit==="piece"&&Number.isSafeInteger(q.amount)&&q.amount>0){
    const count=new RegExp("(?:^|[^\\p{L}\\p{N}])"+q.amount+
      "\\s*(?:τεμ(?:αχια)?|τμχ|pcs?|pieces?|ρολα|rolls?)(?=$|[^\\p{L}\\p{N}])","gu");
    name=name.replace(count," ");
  }

  const tokens=withoutExplicitBrand(words(name),p.brand)
    .filter(token=>!generic.has(token))
    .map(token=>typeAliases.get(token)||token);
  if(!tokens.length)return null;
  if(tokens.length===1&&tokens[0].length<5)return null;
  // Keep repeated terms and all remaining modifiers, preventing spurious
  // family collapse across "χωρις ζαχαρη", "zero", "light", etc.
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
    if(!f||!q||!reliableBrand(p.brand))continue;
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
  brandIndex=createBrandIndex(products),maxResults=5
}) {
  if(!Number.isSafeInteger(packages)||packages<1||packages>100)
    throw new Error("packages must be an integer 1–100");
  const source=productIndex(products).get(sourceId);
  if(!source)return {reason:"not_found",basis:null,sourceAmount:null,alternatives:[]};
  const quantity=referenceQuantity(source);
  if(!quantity)return {reason:"unknown_quantity",basis:null,sourceAmount:null,alternatives:[]};
  const base={basis:quantity.unit,sourceAmount:quantity.amount,alternatives:[]};
  const family=productFamily(source);
  if(!family||!reliableBrand(source.brand))return {...base,reason:"no_comparable_brands"};
  const forbidden=new Set(excludedRetailerIds);
  const bestOffer=id=>(offersByProduct.get(id)||[])
    .filter(o=>!forbidden.has(o.retailer_id)&&validPrice(o.price_eur))
    .sort((a,b)=>a.price_eur-b.price_eur||a.retailer_id.localeCompare(b.retailer_id))[0];
  const original=bestOffer(sourceId);
  if(!original)return {...base,reason:"no_source_price"};
  const sourceCents=Math.round(original.price_eur*100)*packages;
  if(!Number.isSafeInteger(sourceCents)||sourceCents<=0)return {...base,reason:"no_source_price"};
  const demand=quantity.amount*packages;
  const pool=brandIndex.get(family+"|"+quantity.unit)||[];
  const byBrand=new Map();
  for(const candidate of pool) {
    if(candidate.source_product_id===sourceId||!reliableBrand(candidate.brand)||normalize(candidate.brand)===normalize(source.brand))continue;
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
      confidence:"matched_details"
    };
    const brandKey=normalize(candidate.brand);
    const prior=byBrand.get(brandKey);
    if(!prior||entry.candidateTotalEur<prior.candidateTotalEur||
       (entry.candidateTotalEur===prior.candidateTotalEur&&entry.id<prior.id))
      byBrand.set(brandKey,entry);
  }
  const alternatives=[...byBrand.values()].sort((a,b)=>
    a.candidateTotalEur-b.candidateTotalEur||b.savingsEur-a.savingsEur||
    a.name.localeCompare(b.name,"el")).slice(0,maxResults);
  return {...base,originalTotalEur:euros(sourceCents),sourcePackages:packages,
    alternatives,reason:alternatives.length?"cheaper_found":
      pool.length>1?"no_cheaper_brand":"no_comparable_brands"};
}
