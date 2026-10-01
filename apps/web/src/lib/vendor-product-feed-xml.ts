import { createHash } from "node:crypto";

export const VENDOR_FEED_MAX_BYTES = 25 * 1024 * 1024;
export const VENDOR_FEED_MAX_PRODUCTS = 50_000;

export const VENDOR_FEED_FIELDS = [
  "id","title","description","price","currency","stock","availability","brand","category",
  "image","additional_image","gtin","mpn","link","size","color"
] as const;

export type VendorFeedField = typeof VENDOR_FEED_FIELDS[number];
export type VendorFeedMapping = Partial<Record<VendorFeedField,string>>;
export type VendorFeedFormat =
  | "google_merchant" | "woocommerce" | "shopify" | "prestashop" | "magento"
  | "skroutz" | "bestprice" | "kontamou" | "custom";

export type VendorFeedIssue = Readonly<{ field?: VendorFeedField; message: string; code: string }>;

export type VendorFeedNormalizedItem = Readonly<{
  externalProductId: string;
  vendorSku?: string;
  title: string;
  description?: string;
  priceMinor?: number;
  currency: string;
  stockQuantity?: number;
  availability?: string;
  brand?: string;
  categoryPath?: string;
  imageUrl?: string;
  additionalImageUrls: readonly string[];
  gtin?: string;
  mpn?: string;
  productUrl?: string;
  size?: string;
  color?: string;
  sourceHash: string;
  state: "ready" | "warning" | "error" | "excluded";
  issues: readonly VendorFeedIssue[];
}>;

export type VendorFeedAnalysis = Readonly<{
  detectedFormat: VendorFeedFormat;
  recordTag: string;
  sourceHash: string;
  fields: readonly string[];
  mapping: VendorFeedMapping;
  productCount: number;
  readyCount: number;
  warningCount: number;
  errorCount: number;
  excludedCount: number;
  items: readonly VendorFeedNormalizedItem[];
}>;

type XmlRecord = Record<string,string[]>;

const ALIASES: Record<VendorFeedField,readonly string[]> = {
  id:["variant_sku","variant_id","id","product_id","productid","sku","code","item_group_id"],
  title:["title","name","product_name","productname"],
  description:["description","short_description","long_description","body_html","body"],
  price:["price","sale_price","selling_price","retail_price","final_price"],
  currency:["currency","currency_code","price_currency"],
  stock:["quantity","stock","stock_quantity","qty","inventory_quantity"],
  availability:["availability","available","stock_status","instock"],
  brand:["brand","manufacturer","vendor","make"],
  category:["product_type","category","category_path","categories","google_product_category"],
  image:["image_link","image","image_url","main_image","picture","imageurl"],
  additional_image:["additional_image_link","additional_image","additional_images","images"],
  gtin:["gtin","ean","ean13","barcode","upc","isbn"],
  mpn:["mpn","manufacturer_part_number","manufacturer_code","model","model_number"],
  link:["link","url","product_url","deeplink"],
  size:["size","sizes","option_size"],
  color:["color","colour","option_color","option_colour"]
};

export function analyzeVendorProductXml(xml: string, requestedMapping: VendorFeedMapping = {}): VendorFeedAnalysis {
  const bytes = Buffer.byteLength(xml,"utf8");
  if (!xml.trim()) throw new Error("XML content is empty");
  if (bytes > VENDOR_FEED_MAX_BYTES) throw new Error(`XML feed exceeds the ${Math.round(VENDOR_FEED_MAX_BYTES / 1024 / 1024)} MB upload limit`);
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("XML DTD/entity declarations are not accepted");

  const sourceHash=createHash("sha256").update(xml).digest("hex");
  const format=detectFormat(xml);
  const recordTag=detectRecordTag(xml,format);
  const rawRecords=extractRecords(xml,recordTag);
  if (!rawRecords.length) throw new Error("No product records were found in the XML feed");
  if (rawRecords.length > VENDOR_FEED_MAX_PRODUCTS) throw new Error(`XML feed contains more than ${VENDOR_FEED_MAX_PRODUCTS.toLocaleString("en-US")} products`);

  const fields=[...new Set(rawRecords.flatMap((record)=>Object.keys(record)))].sort();
  const suggested=suggestMapping(fields,format);
  const mapping={...suggested,...cleanMapping(requestedMapping,fields)};
  const seen=new Set<string>();
  const items=rawRecords.map((record,index)=>normalizeRecord(record,mapping,index,seen));

  return {
    detectedFormat:format,
    recordTag,
    sourceHash,
    fields,
    mapping,
    productCount:items.length,
    readyCount:items.filter((item)=>item.state==="ready").length,
    warningCount:items.filter((item)=>item.state==="warning").length,
    errorCount:items.filter((item)=>item.state==="error").length,
    excludedCount:items.filter((item)=>item.state==="excluded").length,
    items
  };
}

function detectFormat(xml:string):VendorFeedFormat {
  const head=xml.slice(0,80_000).toLocaleLowerCase("en");
  if (/<rss\b/.test(head) && /xmlns:g=/.test(head)) return "google_merchant";
  if (/<products?\b/.test(head) && /<product\b/.test(head) && /<(?:\w+:)?(?:currency_code|currency)\b/.test(head) && /<(?:\w+:)?(?:stock|quantity|availability)\b/.test(head)) return "kontamou";
  if (/woocommerce|wc_product|<regular_price\b|<sale_price\b/.test(head)) return "woocommerce";
  if (/shopify|<body_html\b|<inventory_quantity\b/.test(head)) return "shopify";
  if (/prestashop|<id_product\b|<reference\b/.test(head)) return "prestashop";
  if (/magento|<catalog_product\b|<special_price\b/.test(head)) return "magento";
  if (/skroutz|<manufacturer\b/.test(head) && /<instock\b/.test(head)) return "skroutz";
  if (/bestprice|<productid\b/.test(head)) return "bestprice";
  return "custom";
}

function detectRecordTag(xml:string,format:VendorFeedFormat):string {
  if (format==="google_merchant" && /<item(?:\s|>)/i.test(xml)) return "item";
  const candidates=["product","item","entry","offer"];
  let best={tag:"",count:0};
  for (const tag of candidates) {
    const count=(xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>`,"gi"))??[]).length;
    if (count>best.count) best={tag,count};
  }
  if (!best.tag) throw new Error("Could not identify the repeating product element");
  return best.tag;
}

function extractRecords(xml:string,recordTag:string):XmlRecord[] {
  const escaped=escapeRegex(recordTag);
  const pattern=new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}\\s*>`,"gi");
  const result:XmlRecord[]=[];
  for (const match of xml.matchAll(pattern)) {
    const fragment=match[1]??"";
    const variants=[...fragment.matchAll(/<(variant|variation)(?:\\s[^>]*)?>([\\s\\S]*?)<\\/\\1\\s*>/gi)];
    if(!variants.length){
      result.push(parseRecord(fragment));
      continue;
    }

    const parentFragment=fragment
      .replace(/<variants?(?:\\s[^>]*)?>[\\s\\S]*?<\\/variants?\\s*>/gi,"")
      .replace(/<variations?(?:\\s[^>]*)?>[\\s\\S]*?<\\/variations?\\s*>/gi,"")
      .replace(/<(?:variant|variation)(?:\\s[^>]*)?>[\\s\\S]*?<\\/(?:variant|variation)\\s*>/gi,"");
    const parent=parseRecord(parentFragment);
    const parentIdentity=parent.id?.[0]??parent.product_id?.[0]??parent.productid?.[0]??parent.sku?.[0];

    for (const variant of variants) {
      const child=parseRecord(variant[2]??"");
      const childIdentity=child.sku?.[0]??child.id?.[0]??child.variant_id?.[0]??child.code?.[0];
      const merged:XmlRecord={...parent,...child};
      if(parentIdentity&&!merged.item_group_id) merged.item_group_id=[parentIdentity];
      if(childIdentity) merged.variant_sku=[childIdentity];
      else if(parent.id) merged.id=[];
      result.push(merged);
    }
  }
  return result;
}

function parseRecord(fragment:string):XmlRecord {
  const result:XmlRecord={};
  const fieldPattern=/<([A-Za-z_][\w:.-]*)(?:\s[^>]*)?>([\s\S]*?)<\/\1\s*>/g;
  for (const match of fragment.matchAll(fieldPattern)) {
    const rawName=match[1]??"";
    const local=normalizeFieldName(rawName);
    if (!local) continue;
    const value=decodeXmlValue(match[2]??"").trim();
    if (!value) continue;
    (result[local]??=[]).push(value);
  }
  const selfClosing=/<([A-Za-z_][\w:.-]*)(?:\s[^>]*)?\/>/g;
  for (const match of fragment.matchAll(selfClosing)) {
    const local=normalizeFieldName(match[1]??"");
    if (local && !(local in result)) result[local]=[];
  }
  return result;
}

function normalizeFieldName(value:string):string {
  return value.split(":").at(-1)!.trim().toLocaleLowerCase("en").replace(/[^a-z0-9_.-]+/g,"_");
}

function decodeXmlValue(value:string):string {
  const cdata=value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1");
  const text=cdata.replace(/<[^>]+>/g," ");
  return decodeEntities(text).replace(/\s+/g," ").trim();
}

function decodeEntities(value:string):string {
  return value
    .replace(/&#x([0-9a-f]+);/gi,(_,hex)=>safeCodePoint(parseInt(hex,16)))
    .replace(/&#(\d+);/g,(_,decimal)=>safeCodePoint(parseInt(decimal,10)))
    .replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/&quot;/gi,'"')
    .replace(/&apos;/gi,"'").replace(/&amp;/gi,"&");
}

function safeCodePoint(value:number):string {
  try { return Number.isSafeInteger(value) && value>=0 && value<=0x10ffff ? String.fromCodePoint(value) : ""; }
  catch { return ""; }
}

function suggestMapping(fields:readonly string[],format:VendorFeedFormat):VendorFeedMapping {
  const fieldSet=new Set(fields);
  const mapping:VendorFeedMapping={};
  for (const target of VENDOR_FEED_FIELDS) {
    const alias=ALIASES[target].find((candidate)=>fieldSet.has(candidate));
    if (alias) mapping[target]=alias;
  }
  if (format==="google_merchant") {
    if (fieldSet.has("id")) mapping.id="id";
    if (fieldSet.has("image_link")) mapping.image="image_link";
    if (fieldSet.has("additional_image_link")) mapping.additional_image="additional_image_link";
    if (fieldSet.has("product_type")) mapping.category="product_type";
  }
  return mapping;
}

function cleanMapping(mapping:VendorFeedMapping,fields:readonly string[]):VendorFeedMapping {
  const allowed=new Set(fields);
  const result:VendorFeedMapping={};
  for (const field of VENDOR_FEED_FIELDS) {
    const raw=mapping[field]?.trim();
    if (raw && allowed.has(normalizeFieldName(raw))) result[field]=normalizeFieldName(raw);
  }
  return result;
}

function normalizeRecord(record:XmlRecord,mapping:VendorFeedMapping,index:number,seen:Set<string>):VendorFeedNormalizedItem {
  const first=(field:VendorFeedField)=> {
    const key=mapping[field];
    return key ? record[key]?.find(Boolean)?.trim() : undefined;
  };
  const many=(field:VendorFeedField)=> {
    const key=mapping[field];
    return key ? (record[key]??[]).map((value)=>value.trim()).filter(Boolean) : [];
  };

  const issues:VendorFeedIssue[]=[];
  const externalProductId=first("id")??"";
  const title=first("title")??"";
  if (!externalProductId) issues.push({field:"id",code:"missing_id",message:`Product ${index+1}: missing product ID / SKU`});
  if (!title) issues.push({field:"title",code:"missing_title",message:`Product ${index+1}: missing title`});

  let duplicate=false;
  if (externalProductId) {
    duplicate=seen.has(externalProductId);
    if (duplicate) issues.push({field:"id",code:"duplicate_id",message:`Duplicate product ID: ${externalProductId}`});
    else seen.add(externalProductId);
  }

  const rawPrice=first("price");
  const price=parsePrice(rawPrice);
  if (rawPrice && price===undefined) issues.push({field:"price",code:"invalid_price",message:`Invalid price: ${rawPrice}`});
  if (!rawPrice) issues.push({field:"price",code:"missing_price",message:"Price is missing; the item cannot become sellable until a price is supplied"});

  const rawStock=first("stock");
  const availability=normalizeAvailability(first("availability"));
  const stock=parseStock(rawStock,availability);
  if (rawStock && stock===undefined) issues.push({field:"stock",code:"invalid_stock",message:`Invalid stock quantity: ${rawStock}`});
  if (!rawStock && !availability) issues.push({field:"stock",code:"missing_stock",message:"No stock quantity or availability status was supplied"});

  const imageUrl=safeHttpUrl(first("image"));
  if (first("image") && !imageUrl) issues.push({field:"image",code:"invalid_image",message:"Main image URL is invalid"});
  if (!first("image")) issues.push({field:"image",code:"missing_image",message:"Main image is missing"});

  const productUrl=safeHttpUrl(first("link"));
  if (first("link") && !productUrl) issues.push({field:"link",code:"invalid_link",message:"Product URL is invalid"});

  const additional=[...many("additional_image").flatMap(splitLooseList)].map(safeHttpUrl).filter((value):value is string=>Boolean(value)).slice(0,12);
  const gtin=normalizeDigits(first("gtin"));
  const currency=(first("currency") || price?.currency || "EUR").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) issues.push({field:"currency",code:"invalid_currency",message:`Invalid currency: ${currency}`});

  const hardError=issues.some((issue)=>["missing_id","missing_title","invalid_price","invalid_stock","invalid_currency"].includes(issue.code));
  const state=duplicate ? "excluded" : hardError ? "error" : issues.length ? "warning" : "ready";
  const normalizedForHash=JSON.stringify({externalProductId,title,priceMinor:price?.minor,currency,stock,availability,gtin,brand:first("brand"),mpn:first("mpn")});

  return {
    externalProductId,
    vendorSku:externalProductId || undefined,
    title,
    description:first("description"),
    priceMinor:price?.minor,
    currency,
    stockQuantity:stock,
    availability,
    brand:first("brand"),
    categoryPath:first("category"),
    imageUrl,
    additionalImageUrls:additional,
    gtin,
    mpn:first("mpn"),
    productUrl,
    size:first("size"),
    color:first("color"),
    sourceHash:createHash("sha256").update(normalizedForHash).digest("hex"),
    state,
    issues
  };
}

function parsePrice(value:string|undefined):{minor:number;currency?:string}|undefined {
  if (!value) return undefined;
  const normalized=value.trim().replace(/\u00a0/g," ");
  const currency=normalized.match(/\b([A-Z]{3})\b/i)?.[1]?.toUpperCase();
  const numeric=normalized.replace(/[A-Za-z€$£¥]/g,"").trim().replace(/\s/g,"");
  let decimal=numeric;
  if (/,\d{1,2}$/.test(decimal) && !/\.\d{1,2}$/.test(decimal)) decimal=decimal.replace(/\./g,"").replace(",",".");
  else decimal=decimal.replace(/,/g,"");
  if (!/^\d+(?:\.\d{1,4})?$/.test(decimal)) return undefined;
  const amount=Number(decimal);
  const minor=Math.round(amount*100);
  return Number.isSafeInteger(minor) && minor>=0 ? {minor,currency} : undefined;
}

function parseStock(value:string|undefined,availability:string|undefined):number|undefined {
  if (value) {
    const normalized=value.trim().replace(",",".");
    if (!/^\d+(?:\.0+)?$/.test(normalized)) return undefined;
    const amount=Math.floor(Number(normalized));
    return Number.isSafeInteger(amount) && amount>=0 ? amount : undefined;
  }
  return availability==="out_of_stock" ? 0 : undefined;
}

function normalizeAvailability(value:string|undefined):string|undefined {
  if (!value) return undefined;
  const normalized=value.trim().toLocaleLowerCase("en").replace(/[\s-]+/g,"_");
  if (["in_stock","instock","available","yes","true","1"].includes(normalized)) return "in_stock";
  if (["out_of_stock","outofstock","unavailable","no","false","0"].includes(normalized)) return "out_of_stock";
  if (["preorder","pre_order"].includes(normalized)) return "preorder";
  if (["backorder","back_order"].includes(normalized)) return "backorder";
  return normalized.slice(0,40);
}

function normalizeDigits(value:string|undefined):string|undefined {
  const digits=value?.replace(/\D/g,"");
  return digits || undefined;
}

function splitLooseList(value:string):string[] {
  if (!value) return [];
  if (/^https?:\/\//i.test(value) && !/[|;]/.test(value)) return [value];
  return value.split(/[|;]+/).map((part)=>part.trim()).filter(Boolean);
}

function safeHttpUrl(value:string|undefined):string|undefined {
  if (!value) return undefined;
  try {
    const url=new URL(value);
    if (!["http:","https:"].includes(url.protocol)) return undefined;
    url.hash="";
    return url.toString();
  } catch { return undefined; }
}

function escapeRegex(value:string):string {
  return value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
}
