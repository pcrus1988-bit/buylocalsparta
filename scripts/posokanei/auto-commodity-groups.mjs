/**
 * Strict opt-in automatic *commodity-type* approval, not ingredient equivalence.
 * Only shelf-stable, source-described single-commodity grocery categories may
 * qualify. All other catalogue families remain informative, unverified matches.
 *
 * Groups are re-derived from the current verified snapshot, never persisted as
 * manual approvals. Every member has a corroborated pack quantity, trusted
 * declared brand, identical normalized product-family signature, and the exact
 * same detailed category. Existing manually-reviewed groups have priority.
 */
import {createHash} from "node:crypto";
import {createBrandIndex,productFamily,referenceQuantity} from "./brand-alternatives.mjs";

const normalize=x=>String(x||"").normalize("NFD")
  .replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("el-GR")
  .replace(/[’‘´΄']/g,"").replace(/[^\p{L}\p{N}]+/gu," ").trim();
const validId=id=>typeof id==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(id);
const restricted=/\b(?:bio|organic|vegan|gluten|glutenfree|free|zero|light|diet|protein|instant|ready|cooked|precooked|mix|special|kids|infant)\b|(?:βιολογ|χωρις|αλλεργ|γλουτεν|υποαλλεργ|χωρις|ετοιμ|μαγειρεμ|βρασμεν|κονσερβ|μιγμα|παιδικ|πρωτεϊν|εμπλουτισμ|μειωμεν|επεξεργασμ|σαλατα|μεριδ|εξτρα)/u;

// Narrow positive list: ordinary dry staples with meaningful detailed variants.
// No dairy, oils, meats, produce, detergents, baby food, cosmetics or medicines.
const eligibleCategory=category=>
  /^(?:λευκη ζαχαρη|καστανη ζαχαρη|φακες|φασολια|ρεβιθια|ρυζι [\p{L} ]{3,45})$/u.test(category);
const requiredTitleType=(category,title)=>{
  if(category.includes("ζαχαρη"))return /(?:ζαχαρ|sugar)/u.test(title);
  if(category.startsWith("ρυζι "))return /(?:ρυζι|rice)/u.test(title);
  if(category==="φακες")return /(?:φακ|lentil)/u.test(title);
  if(category==="φασολια")return /(?:φασολ|bean)/u.test(title);
  if(category==="ρεβιθια")return /(?:ρεβιθ|chickpea)/u.test(title);
  return false;
};

function labelledMassKg(name){
  const plain=String(name||"").normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("el-GR");
  const matches=[...plain.matchAll(/(?:^|[^\p{L}\p{N}])(\d+(?:[.,]\d+)?)\s*(kg|kgr|κιλο|κιλα|g|gr|γρ|γραμμαρια)(?=$|[^\p{L}])/gu)];
  if(matches.length!==1)return null;
  const n=Number(matches[0][1].replace(",","."));
  return Number.isFinite(n)&&n>0?n*(["kg","kgr","κιλο","κιλα"].includes(matches[0][2])?1:.001):null;
}

function eligibleProduct(p){
  const category=normalize(p?.category);
  if(!eligibleCategory(category)||!validId(p?.source_product_id))return false;
  const title=normalize(p?.name);
  if(!title||!requiredTitleType(category,title)||restricted.test(title))return false;
  const size=referenceQuantity(p);
  if(!size||size.unit!=="kg"||size.amount<.05||size.amount>20)return false;
  const fromLabel=labelledMassKg(p.name);
  if(fromLabel===null||Math.abs(size.amount-fromLabel)>1e-6)return false;
  const family=productFamily(p);
  // An undifferentiated product type (e.g. merely "beans") is insufficient.
  if(!family||family.split("|")[1]?.split(" ").filter(Boolean).length<2)return false;
  return true;
}

/**
 * Returns approved-type groups compatible with the existing read-only
 * PosoKanei group contract. Approval provenance is explicit for the UI.
 * No group is created if evidence is missing, variants differ, or there is
 * overlap with an individual manually reviewed SKU.
 */
export function deriveAutoCommodityGroups(products,reviewedGroups=[]){
  if(!Array.isArray(products)||!Array.isArray(reviewedGroups))return [];
  const protectedIds=new Set();
  for(const group of reviewedGroups){
    if(group?.status==="approved"&&Array.isArray(group.memberIds))
      for(const id of group.memberIds)protectedIds.add(id);
  }
  // Duplicate source IDs invalidate automated approval of that ID entirely.
  const seen=new Set(),duplicates=new Set();
  for(const p of products){
    if(seen.has(p?.source_product_id))duplicates.add(p?.source_product_id);
    seen.add(p?.source_product_id);
  }
  const generated=[];
  const index=createBrandIndex(products);
  for(const [familyKey,items] of index){
    if(!familyKey.endsWith("|kg"))continue;
    const source=items.filter(p=>!protectedIds.has(p.source_product_id)&&
      !duplicates.has(p.source_product_id)&&eligibleProduct(p));
    if(source.length<2||source.length>80)continue;
    // Do not approve a partly eligible family: a lone contradictory label in
    // the group means the typed family evidence needs editorial inspection.
    if(items.some(p=>!protectedIds.has(p.source_product_id)&&
      !duplicates.has(p.source_product_id)&&!eligibleProduct(p)))continue;
    const categories=new Set(source.map(p=>normalize(p.category)));
    const brands=new Set(source.map(p=>normalize(p.brand)));
    if(categories.size!==1||brands.size<2||brands.has(""))continue;
    const category=source[0].category;
    const id="auto-"+createHash("sha256").update(familyKey).digest("hex").slice(0,24);
    generated.push({
      id,status:"approved",approvalMethod:"automatic_commodity",
      label:category+" · "+familyKey.split("|")[1].slice(0,44),
      basis:"kg",memberIds:source.map(p=>p.source_product_id).sort()
    });
  }
  return generated.sort((a,b)=>a.id.localeCompare(b.id));
}
