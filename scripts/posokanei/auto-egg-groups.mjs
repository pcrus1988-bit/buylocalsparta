/**
 * Snapshot-scoped automatic approval for eggs with explicit, verifiable
 * husbandry method, grade and physical package count.
 *
 * It approves only source-described PRODUCT TYPE comparisons, never nutrition,
 * provenance, salmonella safety, expiry date or guaranteed suitability.
 */
import {createHash} from "node:crypto";
import {createBrandIndex,referenceQuantity} from "./brand-alternatives.mjs";

const norm=x=>String(x||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toLocaleLowerCase("el-GR").replace(/[’‘´΄']/g,"").replace(/\s+/g," ").trim();
const idOk=id=>typeof id==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(id);
const nonEgg=/βραστ|μαγειρεμ|παστεριω|σκονομ|υγρο|υγρ|πασχαλι|chocolate|σοκολατ|υποκαταστατ/u;

function eggEvidence(product){
  if(norm(product?.category)!=="αυγα"||!idOk(product?.source_product_id))return null;
  const text=norm(product?.name);
  if(!/(?:^|\s)αυγα(?:\s|$)|\beggs?\b/u.test(text)||nonEgg.test(text))return null;
  const qty=referenceQuantity(product);
  if(qty?.unit!=="piece"||!Number.isSafeInteger(qty.amount)||qty.amount<2||qty.amount>30)return null;

  // The title must say exactly how many eggs. Weight-class grams do NOT
  // represent package quantity. Reject zero or multiple conflicting counts.
  const pieceCounts=[...text.matchAll(/(?:^|[^\p{L}\p{N}])(\d{1,2})\s*(?:τεμ(?:αχια)?|τμχ|pcs?|pieces?)(?=$|[^\p{L}\p{N}])/gu)];
  if(pieceCounts.length!==1||Number(pieceCounts[0][1])!==qty.amount)return null;
  const housing=/(?:αχυρων|barn)/u.test(text)?"barn":
    /(?:ελευθερ.*βοσκ|free range)/u.test(text)?"free_range":
    /(?:βιολογ|organic)/u.test(text)?"organic":
    /(?:κλωβ|cage)/u.test(text)?"cage":null;
  if(!housing)return null;
  // Reconcile EVERY textual and numerical grade signal. Reject contradictory
  // labels rather than allowing the first matching regex to win (e.g.
  // "Medium 63-73g" is not evidence of either a reliable M or L grade).
  // Strip the XL phrase before testing L to avoid "extra large" becoming L.
  const signals=new Set();
  const withoutXL=text.replace(/(?:\bextra[\s-]*large\b|\bx[\s-]*large\b|\bxl\b|πολυ[\s-]*μεγαλ\p{L}*)/gu,()=>{
    signals.add("XL");return " ";
  });
  for(const [grade,pattern] of [
    ["L",/(?:\blarge\b|μεγαλ\p{L}*)/u],
    ["M",/(?:\bmedium\b|μεσαι\p{L}*)/u],
    ["S",/(?:\bsmall\b|μικρ\p{L}*)/u]
  ])if(pattern.test(withoutXL))signals.add(grade);
  for(const [grade,pattern] of [
    ["S",/(?:^|[^\p{L}\p{N}])43\s*[-/]\s*53\s*(?:g|gr|γρ|γραμμαρια)(?=$|[^\p{L}])/u],
    ["M",/(?:^|[^\p{L}\p{N}])53\s*[-/]\s*63\s*(?:g|gr|γρ|γραμμαρια)(?=$|[^\p{L}])/u],
    ["L",/(?:^|[^\p{L}\p{N}])63\s*[-/]\s*73\s*(?:g|gr|γρ|γραμμαρια)(?=$|[^\p{L}])/u],
    ["XL",/(?:^|[^\p{L}\p{N}])73\s*[-/]\s*83\s*(?:g|gr|γρ|γραμμαρια)(?=$|[^\p{L}])/u]
  ])if(pattern.test(text))signals.add(grade);
  if(signals.size!==1)return null;
  const grade=[...signals][0];

  // Repeated or contradictory husbandry classifications also fail closed.
  const allHousing=[/(?:αχυρων|barn)/u,/(?:ελευθερ.*βοσκ|free range)/u,
    /(?:βιολογ|organic)/u,/(?:κλωβ|cage)/u].filter(re=>re.test(text));
  if(allHousing.length>1)return null;

  // Tight category-level key deliberately does not merge different rearing,
  // weight grades or special labels. Title-specific modifier claims must be
  // inspected before automatically accepting new variants.
  if(/ωμεγα|omega|εμπλουτισ|protein|ενισχυμ|διπλοκροκ|δυο κροκ|2 κροκ/u.test(text))return null;
  return {grade,housing,quantity:qty.amount};
}

export function deriveAutoEggGroups(products,priorGroups=[]){
  if(!Array.isArray(products)||!Array.isArray(priorGroups))return [];
  const protectedIds=new Set(priorGroups.flatMap(g=>g?.status==="approved"&&Array.isArray(g.memberIds)?g.memberIds:[]));
  const seen=new Set(),duplicateIds=new Set();
  for(const p of products){
    if(seen.has(p?.source_product_id))duplicateIds.add(p?.source_product_id);
    seen.add(p?.source_product_id);
  }
  const groups=[];
  for(const [familyKey,members] of createBrandIndex(products)){
    if(!familyKey.endsWith("|piece"))continue;
    const unreviewed=members.filter(p=>!protectedIds.has(p.source_product_id)&&!duplicateIds.has(p.source_product_id));
    if(unreviewed.length<2||unreviewed.length>80)continue;
    const evidence=unreviewed.map(eggEvidence);
    // Every single item of a family must corroborate its own pack.
    if(evidence.some(x=>x===null))continue;
    const grades=new Set(evidence.map(x=>x.grade)),housings=new Set(evidence.map(x=>x.housing));
    const brands=new Set(unreviewed.map(p=>norm(p.brand)));
    if(grades.size!==1||housings.size!==1||brands.size<2||brands.has(""))continue;
    groups.push({
      id:"auto-eggs-"+createHash("sha256").update(familyKey).digest("hex").slice(0,24),
      status:"approved",approvalMethod:"automatic_commodity",
      label:"Αυγά "+[...housings][0]+" "+[...grades][0],basis:"piece",
      memberIds:unreviewed.map(p=>p.source_product_id).sort()
    });
  }
  return groups.sort((a,b)=>a.id.localeCompare(b.id));
}
