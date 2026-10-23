/**
 * Highly constrained cross-brand tea-sachet *product type* comparisons.
 *
 * Source titles must spell out the tea, sachet count and mass of EACH
 * sachet. Different preparations, grams per sachet, unknown total pack mass,
 * health/diet claims and mixed/organic herbal blends cannot be inferred.
 * This does not assert identical composition, ingredients or caffeine levels.
 */
import {createHash} from "node:crypto";
import {referenceQuantity} from "./brand-alternatives.mjs";

const norm=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toLocaleLowerCase("el-GR").replace(/[’‘´΄']/g,"").replace(/\s+/g," ").trim();
const validId=x=>typeof x==="string"&&/^[a-z0-9_-]{1,100}$/i.test(x);
const validBrand=x=>typeof x==="string"&&
  /[\p{L}]/u.test(x)&&
  !/^(?:ean\b|unknown\b|αγνωστ|διαφορ|χωρις\s+(?:μαρκα|brand))/u.test(norm(x));
const titleSpec=new Map([
  ["τσαι",["green_tea",/^πρασινο\s+τσαι\s+(\d{1,2})\s+φακ\.?\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(?:γρ|gr|g)$/u]],
  ["αφεψηματα",["chamomile",/^χαμομηλι\s+(\d{1,2})\s+φακ\.?\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(?:γρ|gr|g)$/u]]
]);

function evidence(p) {
  if(!validId(p?.source_product_id)||!validBrand(p?.brand))return null;
  const category=norm(p?.category), spec=titleSpec.get(category);
  if(!spec)return null;
  const name=norm(p.name), brand=norm(p.brand);
  // Reject a source whose declared brand is not present as a full title
  // prefix; never remove a similarly spelled product attribute.
  if(!name.startsWith(brand+" "))return null;
  const title=name.slice(brand.length).trim();
  const m=title.match(spec[1]);
  if(!m)return null;
  const count=Number(m[1]),eachGr=Number(m[2].replace(",","."));
  const milligrams=Math.round(eachGr*1000),totalKg=count*eachGr/1000;
  if(!Number.isSafeInteger(count)||count<2||count>30||
     !Number.isFinite(eachGr)||eachGr<=0||eachGr>10||
     !Number.isSafeInteger(milligrams)||milligrams<100||
     Math.abs(milligrams/1000-eachGr)>1e-8)return null;
  const observed=referenceQuantity(p);
  if(!observed||observed.unit!=="kg"||
     Math.abs(observed.amount-totalKg)>1e-8)return null;
  return {category,type:spec[0],milligrams,count,brand};
}

// Returns null for unrecognised names, or a VETO key for a title with
// exact type/pack-size syntax but contradictory source reference quantity.
function contradictedFamily(p) {
  const category=norm(p?.category),spec=titleSpec.get(category);
  if(!spec||typeof p?.name!=="string"||typeof p?.brand!=="string")return null;
  const name=norm(p.name),brand=norm(p.brand);
  if(!name.startsWith(brand+" "))return null;
  const m=name.slice(brand.length).trim().match(spec[1]);
  if(!m)return null;
  const count=Number(m[1]),eachGr=Number(m[2].replace(",","."));
  const mg=Math.round(eachGr*1000);
  if(!Number.isSafeInteger(count)||count<2||count>30||
     !Number.isFinite(eachGr)||eachGr<=0||eachGr>10||
     !Number.isSafeInteger(mg)||Math.abs(mg/1000-eachGr)>1e-8)return null;
  return category+"|"+spec[0]+"|"+mg;
}

export function deriveAutoTeaSachetGroups(products,previous=[]) {
  if(!Array.isArray(products)||!Array.isArray(previous))return [];
  const protectedIds=new Set(previous.flatMap(g=>
    g?.status==="approved"&&Array.isArray(g.memberIds)?g.memberIds:[]));
  const seen=new Set(),duplicates=new Set();
  for(const p of products){
    if(seen.has(p?.source_product_id))duplicates.add(p?.source_product_id);
    seen.add(p?.source_product_id);
  }
  const grouped=new Map(),blocked=new Set();
  for(const p of products){
    const key=contradictedFamily(p);
    if(!key)continue;
    if(duplicates.has(p.source_product_id)||(!protectedIds.has(p.source_product_id)&&!evidence(p))){
      blocked.add(key);continue;
    }
    if(protectedIds.has(p.source_product_id))continue;
    const e=evidence(p);
    if(!e)continue;
    const rows=grouped.get(key)||[];
    rows.push({...e,id:p.source_product_id});grouped.set(key,rows);
  }
  const result=[];
  for(const [key,rows] of grouped){
    if(blocked.has(key)||rows.length<2||rows.length>60)continue;
    if(new Set(rows.map(x=>x.brand)).size<2)continue;
    const head=rows[0];
    result.push({
      id:"auto-tea-"+createHash("sha256").update(key).digest("hex").slice(0,24),
      status:"approved",approvalMethod:"automatic_commodity",
      label:(head.type==="green_tea"?"Πράσινο τσάι":"Χαμομήλι")+
        " · "+(head.milligrams/1000)+"g/φακελάκι",
      basis:"kg",memberIds:rows.map(x=>x.id).sort()
    });
  }
  return result.sort((a,b)=>a.id.localeCompare(b.id));
}
