import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const SOURCE = "https://www.polo.gr";
const OUTPUT_DIR = "data/imports/polo";
const CONCURRENCY = 4;
const MAX_LISTING_PAGES = 100;
const TIMEOUT_MS = 30_000;
const RETRIES = 3;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";
const crawledAt = new Date().toISOString();
const researchedDate = crawledAt.slice(0, 10);

const canonicalHeaders = ["supplier_code","gtin","brand","model","title","description","image_url","source_url","category","price","currency","stock","variant","specifications","compatibility"];
const richHeaders = ["source","source_product_id","source_slug","family_key","family_title","variant_code","color","size","capacity_l","dimensions_text","height_cm","width_cm","depth_cm","weight_g","feature_list","technical_specs_text","attributes_json","category_paths","msrp","msrp_minor","selling_price","selling_price_minor","regular_price","regular_price_minor","sale_price","sale_price_minor","price_kind","tax_inclusive","stock_status","purchasable","on_sale","sibling_color_urls","image_urls","image_count","gtin_status","gtin_evidence_kind","gtin_evidence_url","description_quality","data_quality_flags","last_researched_date","crawled_at","source_payload_sha256"];
const allHeaders = [...canonicalHeaders, ...richHeaders];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const text = (value) => typeof value === "string" ? value.trim() : "";
const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const semantic = (value) => normalize(value).toLocaleLowerCase("el-GR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9α-ω]+/g, " ").trim();
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const array = (value) => Array.isArray(value) ? value : [];

function decodeHtml(value) {
  return String(value ?? "")
    .replace(/&nbsp;|&#160;/gi," ").replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'")
    .replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)));
}
function stripHtml(value) {
  return normalize(decodeHtml(String(value ?? "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ")
    .replace(/<(?:br|\/p|\/li|\/tr|\/div|\/h\d)>/gi," | ").replace(/<[^>]+>/g," ")))
    .replace(/\s*\|\s*\|+/g," | ").replace(/^\|\s*|\s*\|$/g,"").trim();
}
function attrValue(tag, name) {
  const match = String(tag).match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`,"i"));
  return decodeHtml(match?.[1] ?? "");
}
function absoluteUrl(value) {
  try { return new URL(decodeHtml(value), SOURCE).toString().replace(/#.*$/g,""); } catch { return ""; }
}
function euro(value) {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value); return Number.isFinite(n) ? n.toFixed(2) : "";
}
function decimal(value) {
  if (value === null || value === undefined || value === "") return null;
  let raw = String(value).trim().replace(/\s/g,"");
  if (/^\d{1,3}(?:\.\d{3})*,\d+$/.test(raw)) raw = raw.replace(/\./g,"").replace(",",".");
  else if (/^\d+,\d+$/.test(raw)) raw = raw.replace(",",".");
  raw = raw.replace(/[^0-9.-]/g,"");
  const n = Number(raw); return Number.isFinite(n) ? n : null;
}
function csvCell(value) {
  let raw = value === null || value === undefined ? "" : typeof value === "string" ? value : JSON.stringify(value);
  raw = raw.replace(/\r?\n/g," ");
  return /[",\n\r]/.test(raw) ? `"${raw.replace(/"/g,'""')}"` : raw;
}
function csv(rows, headers=allHeaders) { return [headers.join(","), ...rows.map((row)=>headers.map((h)=>csvCell(row[h])).join(","))].join("\n")+"\n"; }

async function fetchPage(url, { allow404=false }={}) {
  let last;
  for (let attempt=1; attempt<=RETRIES; attempt+=1) {
    const controller = new AbortController();
    const timer = setTimeout(()=>controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, { redirect:"follow", signal:controller.signal, headers:{
        "user-agent":UA, "accept":"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "accept-language":"el-GR,el;q=0.9,en-US;q=0.7,en;q=0.6", "cache-control":"no-cache", "pragma":"no-cache", "referer":`${SOURCE}/`
      }});
      const body = await response.text();
      clearTimeout(timer);
      if (response.ok || (allow404 && response.status===404)) return {status:response.status,url:response.url,body};
      last = new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
      if (![408,425,429,500,502,503,504].includes(response.status)) throw last;
    } catch(error) { clearTimeout(timer); last=error; }
    await sleep(500*attempt*attempt);
  }
  throw last ?? new Error(`Request failed: ${url}`);
}

function productLinks(html) {
  const urls=[];
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)) {
    const url=absoluteUrl(match[1]);
    if (/^https:\/\/www\.polo\.gr\/(?:en\/)?product\/[^/?#]+\/?$/i.test(url)) urls.push(url);
  }
  return [...new Set(urls)];
}
function nextListing(html,currentUrl,page) {
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)) {
    const tag=match[0]; const cls=attrValue(tag,"class"); const rel=attrValue(tag,"rel");
    if (/\bnext\b/i.test(cls) || /\bnext\b/i.test(rel)) {
      const url=absoluteUrl(match[1]); if (url && url!==currentUrl) return url;
    }
  }
  const relLink=html.match(/<link\b[^>]*rel=["']next["'][^>]*href=["']([^"']+)["'][^>]*>/i) ?? html.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']next["'][^>]*>/i);
  if (relLink) return absoluteUrl(relLink[1]);
  const guessed=`${SOURCE}/shop/page/${page+1}/`;
  return page<MAX_LISTING_PAGES ? guessed : "";
}
async function discoverFromStart(start) {
  const products=new Set(); const listingPages=[]; let current=start; let priorNew=0;
  for (let page=1; page<=MAX_LISTING_PAGES && current; page+=1) {
    let fetched;
    try { fetched=await fetchPage(current,{allow404:page===1}); } catch(error) {
      if (page===1) throw error;
      console.log(`[polo] listing stopped at ${current}: ${error.message}`); break;
    }
    const links=productLinks(fetched.body); let added=0;
    for (const url of links) if (!products.has(url)) { products.add(url); added+=1; }
    listingPages.push({page,url:fetched.url,status:fetched.status,links:links.length,newLinks:added});
    console.log(`[polo] listing ${page}: ${links.length} links, ${added} new, ${products.size} total`);
    if (page===1 && products.size<5) return {products:[],listingPages};
    const next=nextListing(fetched.body,fetched.url,page);
    if (!next || next===current || (added===0 && priorNew===0)) break;
    priorNew=added; current=next;
  }
  return {products:[...products],listingPages};
}
async function discoverProducts() {
  const starts=[`${SOURCE}/shop/`,`${SOURCE}/?post_type=product`];
  let best={products:[],listingPages:[]};
  for (const start of starts) {
    try {
      const result=await discoverFromStart(start);
      if (result.products.length>best.products.length) best=result;
      if (result.products.length>=50) return result;
    } catch(error) { console.log(`[polo] discovery start failed ${start}: ${error.message}`); }
  }
  if (!best.products.length) throw new Error("No POLO product URLs could be discovered from public HTML catalogue pages");
  return best;
}

function parseJsonLd(html) {
  const out=[];
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const raw=decodeHtml(match[1]).trim(); if (!raw) continue;
    try { out.push(JSON.parse(raw)); } catch {}
  }
  return out;
}
function findType(values,type) {
  let found=null;
  const visit=(value)=>{
    if (found || !value) return;
    if (Array.isArray(value)) return value.forEach(visit);
    if (typeof value!=="object") return;
    const t=value["@type"];
    if (t===type || (Array.isArray(t)&&t.includes(type))) { found=value; return; }
    if (value["@graph"]) visit(value["@graph"]);
    for (const child of Object.values(value)) if (child && typeof child==="object") visit(child);
  };
  values.forEach(visit); return found;
}
function validGtin(candidate) {
  const digits=String(candidate??"").replace(/\D/g,""); if (![8,12,13,14].includes(digits.length)) return false;
  const body=digits.slice(0,-1).split("").reverse().map(Number); const sum=body.reduce((a,d,i)=>a+d*(i%2===0?3:1),0);
  return (10-(sum%10))%10===Number(digits.at(-1));
}
function gtinCandidates(html,jsonLd) {
  const candidates=[];
  const walk=(value,path=[])=>{
    if (Array.isArray(value)) return value.forEach((entry,i)=>walk(entry,[...path,String(i)]));
    if (!value || typeof value!=="object") return;
    for (const [key,entry] of Object.entries(value)) {
      if (/^(gtin|gtin8|gtin12|gtin13|gtin14|ean|ean8|ean13|barcode|upc|global_unique_id|globaluniqueid)$/i.test(key)) {
        for (const candidate of Array.isArray(entry)?entry:[entry]) { const digits=String(candidate??"").replace(/\D/g,""); if (validGtin(digits)) candidates.push({gtin:digits,kind:"json_ld",path:[...path,key].join(".")}); }
      }
      if (entry&&typeof entry==="object") walk(entry,[...path,key]);
    }
  };
  jsonLd.forEach((value)=>walk(value));
  for (const match of html.matchAll(/(?:["']?(gtin(?:8|12|13|14)?|ean(?:8|13)?|barcode|upc|global_unique_id)["']?)\s*(?:[:=]|&quot;:\s*)&?quot;?\s*["']?(\d{8,14})/gi)) if (validGtin(match[2])) candidates.push({gtin:match[2],kind:"embedded_html",path:match[1]});
  return candidates;
}
function chooseGtin(html,jsonLd) { const list=gtinCandidates(html,jsonLd); return list.find((x)=>x.gtin.length===13)??list[0]??{gtin:"",kind:"",path:""}; }

function meta(html,key,{property=false}={}) {
  const attr=property?"property":"name";
  const a=html.match(new RegExp(`<meta\\b[^>]*${attr}=["']${key.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}["'][^>]*content=["']([^"']*)["'][^>]*>`,`i`));
  const b=html.match(new RegExp(`<meta\\b[^>]*content=["']([^"']*)["'][^>]*${attr}=["']${key.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}["'][^>]*>`,`i`));
  return decodeHtml(a?.[1]??b?.[1]??"");
}
function heading(html) { const m=html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i); return stripHtml(m?.[1]??""); }
function skuFrom(html,productLd) {
  const ld=text(productLd?.sku); if (ld) return ld;
  const plain=stripHtml(html);
  return plain.match(/(?:SKU|Κωδικ(?:ός|ος)|ΚΩΔΙΚ(?:ΟΣ|ΌΣ))\s*:?\s*([A-Z0-9][A-Z0-9._/-]{2,40})/i)?.[1]??"";
}
function descriptionFrom(html,productLd) {
  const ld=stripHtml(productLd?.description); if (ld.length>=30) return ld;
  const short=html.match(/<div\b[^>]*class=["'][^"']*woocommerce-product-details__short-description[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  const shortText=stripHtml(short?.[1]??""); if (shortText.length>=20) return shortText;
  const tab=html.match(/<div\b[^>]*id=["']tab-description["'][^>]*>([\s\S]*?)<\/div>/i); const tabText=stripHtml(tab?.[1]??"");
  return tabText || meta(html,"description");
}
function sectionText(html,start,stop) {
  const plain=stripHtml(html); const i=plain.search(start); if (i<0) return ""; const tail=plain.slice(i); const j=tail.slice(12).search(stop); return normalize(j>=0?tail.slice(0,j+12):tail.slice(0,2400));
}
function tableAttributes(html) {
  const attrs=[];
  for (const match of html.matchAll(/<tr\b[^>]*class=["'][^"']*woocommerce-product-attributes-item[^"']*["'][^>]*>([\s\S]*?)<\/tr>/gi)) {
    const row=match[1]; const label=stripHtml(row.match(/<th\b[^>]*>([\s\S]*?)<\/th>/i)?.[1]??""); const value=stripHtml(row.match(/<td\b[^>]*>([\s\S]*?)<\/td>/i)?.[1]??""); if (label||value) attrs.push({label,value});
  }
  return attrs;
}
function valueFor(attrs,pattern) { return attrs.find((a)=>pattern.test(semantic(a.label)))?.value??""; }
function parseDimensions(value) {
  const out={dimensionsText:"",heightCm:null,widthCm:null,depthCm:null,capacityL:null,weightG:null}; const plain=normalize(value);
  const triple=plain.match(/(?:διαστασ(?:η|εις)|dimensions?)[^0-9]{0,35}(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(?:cm|εκ\.?)/i) || plain.match(/\b(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(?:cm|εκ\.?)/i);
  if (triple) { out.dimensionsText=`${triple[1]} x ${triple[2]} x ${triple[3]} cm`; out.heightCm=decimal(triple[1]); out.widthCm=decimal(triple[2]); out.depthCm=decimal(triple[3]); }
  const cap=plain.match(/(?:χωρητικοτητα|capacity)[^0-9]{0,25}(\d+(?:[.,]\d+)?)\s*(?:l|lt|λιτρ)/i); if (cap) out.capacityL=decimal(cap[1]);
  const g=plain.match(/(?:βαρος|weight)[^0-9]{0,25}(\d+(?:[.,]\d+)?)\s*(?:g|gr|γραμ)/i); if (g) out.weightG=decimal(g[1]);
  const kg=!g&&plain.match(/(?:βαρος|weight)[^0-9]{0,25}(\d+(?:[.,]\d+)?)\s*(?:kg|κιλ)/i); if (kg) out.weightG=Math.round((decimal(kg[1])??0)*1000);
  return out;
}
function visibleMoney(html,labelRegex) { const m=stripHtml(html).match(new RegExp(`${labelRegex}[^0-9]{0,35}([0-9]{1,5}(?:[.,][0-9]{1,2})?)\\s*€`,`i`)); return m?decimal(m[1]):null; }
function offerPrice(productLd) {
  const offers=Array.isArray(productLd?.offers)?productLd.offers[0]:productLd?.offers; const o=object(offers);
  return {price:decimal(o.price??o.lowPrice),currency:text(o.priceCurrency)||"EUR",availability:text(o.availability),url:text(o.url)};
}
function galleryImages(html,productLd) {
  const urls=[]; const add=(v)=>{ if (typeof v==="string") { const u=absoluteUrl(v); if (u) urls.push(u); } else if (v&&typeof v==="object") add(v.url??v.contentUrl); };
  for (const image of Array.isArray(productLd?.image)?productLd.image:[productLd?.image]) add(image);
  const figure=html.match(/<figure\b[^>]*class=["'][^"']*woocommerce-product-gallery__wrapper[^"']*["'][^>]*>([\s\S]*?)<\/figure>/i)?.[1]??"";
  for (const match of figure.matchAll(/(?:data-large_image|data-src|src)=["']([^"']+)["']/gi)) add(match[1]);
  add(meta(html,"og:image",{property:true}));
  return [...new Set(urls)].filter((u)=>/\/wp-content\/uploads\//i.test(u)||u===meta(html,"og:image",{property:true}));
}
function breadcrumbs(jsonLd) {
  const list=findType(jsonLd,"BreadcrumbList");
  return array(list?.itemListElement).map((x)=>typeof x?.item==="object"?text(x.item.name):text(x.name)).filter(Boolean).filter((x)=>!/^home$|^αρχικη$/i.test(semantic(x)));
}
function siblingUrls(html,current) {
  const marker=html.search(/Άλλα\s+Χρώματα|Αλλα\s+Χρωματα|Other\s+Colou?rs/i); if (marker<0) return [];
  const segment=html.slice(marker,marker+60000); const urls=[];
  for (const match of segment.matchAll(/href=["']([^"']+)["']/gi)) { const u=absoluteUrl(match[1]); if (/\/product\//i.test(u)&&u!==current) urls.push(u); }
  return [...new Set(urls)].slice(0,40);
}
function familyParts(sku,title) { if (sku.includes("-")) { const p=sku.split("-").filter(Boolean); return {familyKey:p.slice(0,-1).join("-")||sku,variantCode:p.at(-1)||""}; } return {familyKey:sku||semantic(title).split(" ").slice(0,6).join("-"),variantCode:""}; }
function sourceId(html,url) { return html.match(/\bpostid-(\d+)\b/i)?.[1]??html.match(/data-product_id=["'](\d+)["']/i)?.[1]??sha256(url).slice(0,16); }
function htmlFeatures(description,technical,attrs) { const values=[...attrs.map((a)=>a.value),...`${description}|${technical}`.split(/\s*\|\s*|[.;]\s+/)].map(normalize).filter((x)=>x.length>=4&&x.length<=180); return [...new Set(values)].slice(0,40); }

async function enrich(url,index,total) {
  let body="",status=0,error="";
  try { const r=await fetchPage(url); body=r.body; status=r.status; } catch(e) { error=String(e?.message??e); }
  const jsonLd=body?parseJsonLd(body):[]; const productLd=findType(jsonLd,"Product")??{}; const attrs=body?tableAttributes(body):[];
  const title=text(productLd.name)||heading(body)||meta(body,"og:title",{property:true}).replace(/\s*[|–-].*POLO.*$/i,"");
  const sku=skuFrom(body,productLd); const {familyKey,variantCode}=familyParts(sku,title); const description=descriptionFrom(body,productLd)||title;
  const technical=body?sectionText(body,/Τεχνικ(?:ά|α)\s+Χαρακτηριστικ|Τεχνικ(?:ές|ες)\s+Προδιαγραφ|Technical\s+(?:Specifications|Features)/i,/Άλλα\s+Χρώματα|Δείτε\s+επίσης|Σχετικά\s+προϊόντα|Related\s+Products|SKU\s*:/i):"";
  const dimensionSection=body?sectionText(body,/Διαστάσεις|Διαστασεις|Dimensions/i,/Τεχνικ|Άλλα\s+Χρώματα|Δείτε\s+επίσης|Related/i):"";
  const dimensions=parseDimensions(`${description} | ${technical} | ${dimensionSection} | ${attrs.map((a)=>`${a.label}: ${a.value}`).join(" | ")}`);
  const chosenGtin=chooseGtin(body,jsonLd); const offer=offerPrice(productLd); const plt=body?(visibleMoney(body,"Π\\.?\\s*Λ\\.?\\s*Τ\\.?")??visibleMoney(body,"P\\.?\\s*L\\.?\\s*T\\.?")):null;
  const displayedRegular=body?visibleMoney(body,"(?:Κανονικ(?:ή|η)\\s+Τιμ(?:ή|η)|Regular\\s+Price)"):null; const displayedSale=body?visibleMoney(body,"(?:Τιμ(?:ή|η)\\s+Προσφορ(?:άς|ας)|Sale\\s+Price)"):null;
  const selling=offer.price??displayedSale??plt??displayedRegular; const regular=displayedRegular??plt??selling; const msrp=plt??regular;
  const images=galleryImages(body,productLd); const siblings=siblingUrls(body,url); const crumb=breadcrumbs(jsonLd); const color=valueFor(attrs,/(χρωμα|color|colour)/i)||stripHtml(body).match(/(?:χρωμα|color|colour)\s*:?\s*([^|;]{2,60})/i)?.[1]?.trim()??""; const size=valueFor(attrs,/(μεγεθος|size)/i)||stripHtml(body).match(/(?:μεγεθος|size)\s*:?\s*([^|;]{1,50})/i)?.[1]?.trim()??"";
  const capacityAttr=valueFor(attrs,/(χωρητικοτητα|capacity)/i); if (dimensions.capacityL===null&&capacityAttr) dimensions.capacityL=decimal(capacityAttr);
  const features=htmlFeatures(description,technical,attrs); const flags=[];
  if (!sku) flags.push("supplier_code_missing"); if (!chosenGtin.gtin) flags.push("gtin_missing_primary_source"); if (!description||description===title) flags.push("description_sparse"); if (!images.length) flags.push("images_missing"); if (!technical&&!attrs.length) flags.push("technical_specs_sparse"); if (!color&&siblings.length) flags.push("color_name_unresolved_with_color_siblings"); if (error||!body) flags.push("product_page_fetch_failed");
  const variant={family_key:familyKey,variant_code:variantCode||undefined,color:color||undefined,size:size||undefined,sibling_color_urls:siblings};
  const specs={dimensions:dimensions.dimensionsText||undefined,height_cm:dimensions.heightCm??undefined,width_cm:dimensions.widthCm??undefined,depth_cm:dimensions.depthCm??undefined,capacity_l:dimensions.capacityL??undefined,weight_g:dimensions.weightG??undefined,technical_text:technical||undefined,features,attributes:attrs};
  const availability=offer.availability.toLowerCase(); const stock=/instock/.test(availability)?"instock":/outofstock/.test(availability)?"outofstock":"";
  const row={supplier_code:sku,gtin:chosenGtin.gtin,brand:"POLO",model:sku,title,description,image_url:images[0]??meta(body,"og:image",{property:true}),source_url:url,category:crumb.join(" > "),price:euro(selling),currency:offer.currency||"EUR",stock,variant:JSON.stringify(variant),specifications:JSON.stringify(specs),compatibility:"",source:"polo-gr",source_product_id:sourceId(body,url),source_slug:new URL(url).pathname.split("/").filter(Boolean).at(-1)??"",family_key:familyKey,family_title:title,variant_code:variantCode,color:normalize(color).slice(0,100),size:normalize(size).slice(0,100),capacity_l:dimensions.capacityL??"",dimensions_text:dimensions.dimensionsText||dimensionSection,height_cm:dimensions.heightCm??"",width_cm:dimensions.widthCm??"",depth_cm:dimensions.depthCm??"",weight_g:dimensions.weightG??"",feature_list:features.join(" | "),technical_specs_text:technical,attributes_json:JSON.stringify(attrs),category_paths:crumb.join("|"),msrp:euro(msrp),msrp_minor:msrp===null||msrp===undefined?"":Math.round(msrp*100),selling_price:euro(selling),selling_price_minor:selling===null||selling===undefined?"":Math.round(selling*100),regular_price:euro(regular),regular_price_minor:regular===null||regular===undefined?"":Math.round(regular*100),sale_price:euro(displayedSale),sale_price_minor:displayedSale===null||displayedSale===undefined?"":Math.round(displayedSale*100),price_kind:plt!==null?"POLO_P.L.T._plus_structured_offer":"structured_offer_or_visible_price",tax_inclusive:"true",stock_status:stock,purchasable:String(Boolean(selling)),on_sale:String(displayedSale!==null),sibling_color_urls:siblings.join("|"),image_urls:images.join("|"),image_count:String(images.length),gtin_status:chosenGtin.gtin?"primary_source_verified":"missing_primary_source_enrichment_required",gtin_evidence_kind:chosenGtin.kind,gtin_evidence_url:chosenGtin.gtin?url:"",description_quality:description.length>=100?"supplier_page_detailed":description.length>=30?"supplier_page_basic":"supplier_page_sparse",data_quality_flags:flags.join("|"),last_researched_date:researchedDate,crawled_at:crawledAt,source_payload_sha256:sha256(JSON.stringify({url,status,jsonLd,attrs,title,sku,technical})),_jsonLd:jsonLd,_httpStatus:status,_error:error};
  if ((index+1)%25===0||index+1===total) console.log(`[polo] enriched ${index+1}/${total}`); return row;
}
async function mapConcurrent(items,limit,fn) { const out=new Array(items.length); let cursor=0; async function worker(){ while(true){ const i=cursor++; if(i>=items.length)return; out[i]=await fn(items[i],i,items.length); } } await Promise.all(Array.from({length:Math.min(limit,items.length)},worker)); return out; }
function familySummary(rows) { const m=new Map(); for(const row of rows){const key=row.family_key||row.supplier_code||row.source_product_id;m.set(key,[...(m.get(key)??[]),row]);} return [...m].map(([family_key,members])=>{const prices=members.map((r)=>Number(r.price)).filter(Number.isFinite); return {family_key,family_title:members[0]?.title??"",variant_count:members.length,colors:[...new Set(members.map((r)=>r.color).filter(Boolean))].join("|"),sizes:[...new Set(members.map((r)=>r.size).filter(Boolean))].join("|"),supplier_codes:members.map((r)=>r.supplier_code).filter(Boolean).join("|"),gtins:members.map((r)=>r.gtin).filter(Boolean).join("|"),min_price:prices.length?Math.min(...prices).toFixed(2):"",max_price:prices.length?Math.max(...prices).toFixed(2):"",source_urls:members.map((r)=>r.source_url).join("|")};}); }

async function main(){
  console.log(`[polo] HTML crawl started ${crawledAt}`);
  const robots=await fetchPage(`${SOURCE}/robots.txt`,{allow404:true}).then((r)=>r.body).catch(()=>"");
  const discovered=await discoverProducts(); console.log(`[polo] discovered ${discovered.products.length} public product URLs across ${discovered.listingPages.length} listing pages`);
  const enriched=await mapConcurrent(discovered.products,CONCURRENCY,enrich); const rows=enriched.map(({_jsonLd,_httpStatus,_error,...row})=>row);
  const missingGtin=rows.filter((r)=>!r.gtin); const quality=rows.filter((r)=>r.data_quality_flags); const families=familySummary(rows); const familyHeaders=["family_key","family_title","variant_count","colors","sizes","supplier_codes","gtins","min_price","max_price","source_urls"];
  const structured=enriched.map((row)=>({canonical:Object.fromEntries(canonicalHeaders.map((k)=>[k,row[k]])),rich:Object.fromEntries(richHeaders.map((k)=>[k,row[k]])),jsonLd:row._jsonLd,httpStatus:row._httpStatus,error:row._error||undefined}));
  const summary={source:SOURCE,discovery:"public HTML shop pagination",crawledAt,listingPageCount:discovered.listingPages.length,listingPages:discovered.listingPages,productCount:rows.length,familyCount:families.length,withSupplierCode:rows.filter((r)=>r.supplier_code).length,withGtin:rows.length-missingGtin.length,missingGtin:missingGtin.length,withDescription:rows.filter((r)=>r.description&&r.description!==r.title).length,withImages:rows.filter((r)=>r.image_url).length,totalImages:rows.reduce((s,r)=>s+Number(r.image_count||0),0),withColor:rows.filter((r)=>r.color).length,withSize:rows.filter((r)=>r.size).length,withStructuredSpecs:rows.filter((r)=>r.technical_specs_text||r.attributes_json!=="[]").length,withMsrp:rows.filter((r)=>r.msrp).length,withSellingPrice:rows.filter((r)=>r.selling_price).length,qualityReviewRows:quality.length,canonicalHeaders,richHeaders,gtinPolicy:"Accept only checksum-valid GTIN/EAN/UPC values explicitly present in POLO JSON-LD or embedded product-page data. Missing identifiers are exported for evidence-backed external enrichment; none are guessed.",variantPolicy:"One public POLO product URL/SKU per master row; SKU stem is the family key, while explicit size/color attributes and POLO other-colour sibling URLs are preserved.",pricePolicy:"Canonical price uses structured Product Offer price when available, then visible sale/P.L.T./regular price. MSRP prefers POLO's visible Π.Λ.Τ.",robotsSha256:robots?sha256(robots):null};
  await mkdir(OUTPUT_DIR,{recursive:true}); await writeFile(join(OUTPUT_DIR,"polo-master.csv"),csv(rows),"utf8"); await writeFile(join(OUTPUT_DIR,"polo-master.jsonl"),structured.map(JSON.stringify).join("\n")+"\n","utf8"); await writeFile(join(OUTPUT_DIR,"polo-families.csv"),csv(families,familyHeaders),"utf8"); await writeFile(join(OUTPUT_DIR,"polo-gtin-missing.csv"),csv(missingGtin),"utf8"); await writeFile(join(OUTPUT_DIR,"polo-quality-review.csv"),csv(quality),"utf8"); await writeFile(join(OUTPUT_DIR,"polo-crawl-summary.json"),JSON.stringify(summary,null,2)+"\n","utf8"); await writeFile(join(OUTPUT_DIR,"polo-robots.txt"),robots,"utf8"); console.log(JSON.stringify(summary,null,2));
}
main().catch((error)=>{console.error("[polo] HTML crawl failed",error);process.exitCode=1;});
