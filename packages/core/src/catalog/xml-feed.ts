export type VendorXmlFieldMapping = Readonly<{
  externalId?: string;
  vendorSku?: string;
  title?: string;
  description?: string;
  brand?: string;
  model?: string;
  mpn?: string;
  gtin?: string;
  price?: string;
  currency?: string;
  stock?: string;
  availability?: string;
  categoryCode?: string;
  sourceCategory?: string;
  imageUrl?: string;
  additionalImageUrl?: string;
  productUrl?: string;
  itemGroupId?: string;
  size?: string;
  color?: string;
  condition?: string;
}>;

export type VendorXmlRecord = Readonly<{ index: number; fields: Readonly<Record<string, string>> }>;
export type VendorXmlDocument = Readonly<{
  itemTag: string;
  records: readonly VendorXmlRecord[];
  fields: readonly string[];
  suggestedMapping: VendorXmlFieldMapping;
}>;

const ITEM_NAMES = ["product", "item", "entry", "offer", "article"] as const;
const FIELD_ALIASES: Readonly<Record<keyof VendorXmlFieldMapping, readonly string[]>> = {
  externalId: ["g:id", "id", "product_id", "productid", "sku", "code", "reference"],
  vendorSku: ["sku", "vendor_sku", "g:id", "id", "product_id", "code", "reference"],
  title: ["g:title", "title", "name", "product_name", "productname"],
  description: ["g:description", "description", "short_description", "shortdescription", "summary"],
  brand: ["g:brand", "brand", "manufacturer", "make"],
  model: ["model", "product_model", "productmodel"],
  mpn: ["g:mpn", "mpn", "manufacturer_part_number", "part_number"],
  gtin: ["g:gtin", "gtin", "ean", "ean13", "barcode", "isbn"],
  price: ["g:sale_price", "sale_price", "g:price", "price", "retail_price", "selling_price"],
  currency: ["currency", "currency_code", "price@currency", "g:price@currency", "sale_price@currency", "g:sale_price@currency"],
  stock: ["stock_on_hand", "stock", "quantity", "qty", "inventory", "inventory_quantity"],
  availability: ["g:availability", "availability", "stock_status", "status"],
  categoryCode: ["category_code", "kontamou_category_code"],
  sourceCategory: ["g:product_type", "product_type", "category", "category_name", "google_product_category", "g:google_product_category"],
  imageUrl: ["g:image_link", "image_link", "image_url", "image", "main_image"],
  additionalImageUrl: ["g:additional_image_link", "additional_image_link", "additional_images", "gallery_image", "gallery_images"],
  productUrl: ["g:link", "link", "product_url", "url"],
  itemGroupId: ["g:item_group_id", "item_group_id", "group_id", "parent_sku", "parent_id"],
  size: ["g:size", "size", "product_size", "variant_size"],
  color: ["g:color", "color", "colour", "product_color", "variant_color"],
  condition: ["g:condition", "condition"]
};

export function parseVendorProductXml(xml: string): VendorXmlDocument {
  const source = xml.replace(/^\uFEFF/, "");
  if (!source.trim()) throw new Error("XML content is empty");
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(source)) throw new Error("XML DTD and ENTITY declarations are not allowed");

  const itemTag = detectItemTag(source);
  if (!itemTag) throw new Error("Could not find repeating product elements such as <product> or <item>");
  const records = scanRecords(source, itemTag);
  if (!records.length) throw new Error(`No <${itemTag}> product records were found`);
  const fieldSet = new Set<string>();
  for (const record of records) for (const key of Object.keys(record.fields)) fieldSet.add(key);
  const fields = [...fieldSet].sort((a, b) => a.localeCompare(b));
  return { itemTag, records, fields, suggestedMapping: suggestVendorXmlFieldMapping(fields) };
}

export function suggestVendorXmlFieldMapping(fields: readonly string[]): VendorXmlFieldMapping {
  const actual = new Map(fields.map((field) => [normalizeKey(field), field]));
  const mapping: Partial<Record<keyof VendorXmlFieldMapping, string>> = {};
  for (const [target, aliases] of Object.entries(FIELD_ALIASES) as [keyof VendorXmlFieldMapping, readonly string[]][]) {
    for (const alias of aliases) {
      const direct = actual.get(normalizeKey(alias));
      if (direct) { mapping[target] = direct; break; }
      const suffix = fields.find((field) => normalizeKey(field).endsWith(`.${normalizeKey(alias)}`));
      if (suffix) { mapping[target] = suffix; break; }
    }
  }
  return mapping;
}

export function xmlFieldValue(record: VendorXmlRecord, field: string | undefined): string | undefined {
  if (!field) return undefined;
  const direct = record.fields[field];
  if (direct != null && direct !== "") return direct;
  const normalized = normalizeKey(field);
  const found = Object.entries(record.fields).find(([key]) => normalizeKey(key) === normalized);
  return found?.[1] || undefined;
}

export function parseXmlMoneyMinor(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const stripped = value.trim()
    .replace(/^\s*[€$£¥]\s*/, "")
    .replace(/\s*(?:[A-Z]{3}|[€$£¥])\s*$/i, "")
    .trim();
  const normalized = normalizeDecimal(stripped);
  if (!/^\d+(?:\.\d{1,4})?$/.test(normalized)) return undefined;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000) return undefined;
  return Math.round(amount * 100);
}

export function parseXmlStock(value: string | undefined, availability?: string): number | undefined {
  if (value != null && value.trim() !== "") {
    const normalized = value.trim().replace(/\s+/g, "");
    if (!/^\d+$/.test(normalized)) return undefined;
    const stock = Number(normalized);
    return Number.isSafeInteger(stock) && stock >= 0 && stock <= 1_000_000 ? stock : undefined;
  }
  if (!availability) return undefined;
  const state = availability.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["in_stock", "instock", "available", "yes", "true", "1"].includes(state)) return 1;
  if (["out_of_stock", "outofstock", "unavailable", "no", "false", "0", "sold_out"].includes(state)) return 0;
  return undefined;
}

export function parseXmlCurrency(value: string | undefined, priceValue?: string): string {
  const explicit = value?.trim().toUpperCase();
  const symbolCurrency = (input: string): string | undefined => {
    if (input.includes("€")) return "EUR";
    if (input.includes("$")) return "USD";
    if (input.includes("£")) return "GBP";
    if (input.includes("¥")) return "JPY";
    return undefined;
  };

  if (explicit) {
    return symbolCurrency(explicit) ?? (/^[A-Z]{3}$/.test(explicit) ? explicit : "UNKNOWN");
  }

  const price = priceValue?.trim() ?? "";
  const code = price.match(/(?:^|\s)([A-Z]{3})(?:\s|$)/i)?.[1]?.toUpperCase();
  if (code) return code;
  const symbol = symbolCurrency(price);
  if (symbol) return symbol;

  // A bare amount is interpreted as EUR for Greek vendor feeds. If a currency
  // marker is actually present, never silently coerce it to EUR.
  return /[A-Za-z¥$£€]/.test(price) ? "UNKNOWN" : "EUR";
}

function detectItemTag(xml: string): string | undefined {
  const counts = new Map<string, number>();
  for (const name of ITEM_NAMES) counts.set(name, 0);
  let cursor = 0;
  while (cursor < xml.length) {
    const start = xml.indexOf("<", cursor);
    if (start < 0) break;
    if (xml.startsWith("<!--", start)) { const end = xml.indexOf("-->", start + 4); cursor = end < 0 ? xml.length : end + 3; continue; }
    if (xml.startsWith("<![CDATA[", start)) { const end = xml.indexOf("]]>", start + 9); cursor = end < 0 ? xml.length : end + 3; continue; }
    const end = findTagEnd(xml, start + 1);
    if (end < 0) break;
    const body = xml.slice(start + 1, end).trim();
    if (body && !body.startsWith("/") && !body.startsWith("?") && !body.startsWith("!")) {
      const rawName = body.match(/^([^\s/>]+)/)?.[1] ?? "";
      const local = localName(rawName);
      if (counts.has(local)) counts.set(local, (counts.get(local) ?? 0) + 1);
    }
    cursor = end + 1;
  }
  const ranked = ITEM_NAMES.map((name) => ({ name, count: counts.get(name) ?? 0 })).filter((row) => row.count > 0);
  ranked.sort((a, b) => b.count - a.count || ITEM_NAMES.indexOf(a.name) - ITEM_NAMES.indexOf(b.name));
  return ranked[0]?.name;
}

function scanRecords(xml: string, itemLocalName: string): VendorXmlRecord[] {
  const records: VendorXmlRecord[] = [];
  const stack: { raw: string; local: string; text: string; attrs: Record<string, string> }[] = [];
  let current: Record<string, string[]> | undefined;
  let itemDepth = -1;
  let cursor = 0;

  const appendText = (value: string) => {
    if (!stack.length || !value) return;
    stack[stack.length - 1].text += value;
  };

  while (cursor < xml.length) {
    const start = xml.indexOf("<", cursor);
    if (start < 0) { appendText(xml.slice(cursor)); break; }
    appendText(xml.slice(cursor, start));
    if (xml.startsWith("<!--", start)) {
      const end = xml.indexOf("-->", start + 4); if (end < 0) throw new Error("XML comment is not closed"); cursor = end + 3; continue;
    }
    if (xml.startsWith("<![CDATA[", start)) {
      const end = xml.indexOf("]]>", start + 9); if (end < 0) throw new Error("XML CDATA section is not closed"); appendText(xml.slice(start + 9, end)); cursor = end + 3; continue;
    }
    if (xml.startsWith("<?", start)) {
      const end = xml.indexOf("?>", start + 2); if (end < 0) throw new Error("XML processing instruction is not closed"); cursor = end + 2; continue;
    }
    const end = findTagEnd(xml, start + 1);
    if (end < 0) throw new Error("XML tag is not closed");
    const body = xml.slice(start + 1, end).trim();
    cursor = end + 1;
    if (!body) continue;
    if (body.startsWith("!")) throw new Error("Unsupported XML declaration");

    if (body.startsWith("/")) {
      const closeRaw = body.slice(1).trim().split(/\s+/)[0] ?? "";
      const node = stack.pop();
      if (!node || normalizeKey(node.raw) !== normalizeKey(closeRaw)) throw new Error(`Mismatched XML closing tag: ${closeRaw}`);
      if (current && stack.length >= itemDepth) captureNode(current, stack, node, itemDepth);
      if (current && node.local === itemLocalName && stack.length === itemDepth - 1) {
        const flat = Object.fromEntries(Object.entries(current).map(([key, values]) => [key, values.join(" | ")]));
        records.push({ index: records.length + 1, fields: flat });
        current = undefined;
        itemDepth = -1;
      }
      continue;
    }

    const selfClosing = /\/\s*$/.test(body);
    const openBody = selfClosing ? body.replace(/\/\s*$/, "").trim() : body;
    const rawName = openBody.match(/^([^\s/>]+)/)?.[1];
    if (!rawName) throw new Error("Invalid XML opening tag");
    const node = { raw: rawName, local: localName(rawName), text: "", attrs: parseAttributes(openBody.slice(rawName.length)) };
    stack.push(node);
    if (!current && node.local === itemLocalName) { current = {}; itemDepth = stack.length; }
    if (selfClosing) {
      stack.pop();
      if (current && stack.length >= itemDepth - 1) captureNode(current, stack, node, itemDepth);
      if (current && node.local === itemLocalName && stack.length === itemDepth - 1) {
        records.push({ index: records.length + 1, fields: {} }); current = undefined; itemDepth = -1;
      }
    }
  }
  if (stack.length) throw new Error(`XML ended before </${stack[stack.length - 1].raw}>`);
  return records;
}

function captureNode(target: Record<string, string[]>, parents: readonly { raw: string; local: string }[], node: { raw: string; local: string; text: string; attrs: Record<string, string> }, itemDepth: number) {
  const value = decodeXmlText(node.text).trim();
  const relativeParents = parents.slice(itemDepth).map((entry) => entry.raw);
  const rawPath = [...relativeParents, node.raw].join(".");
  const localPath = [...parents.slice(itemDepth).map((entry) => entry.local), node.local].join(".");
  if (value) {
    addField(target, rawPath, value);
    if (localPath !== rawPath) addField(target, localPath, value);
    if (!rawPath.includes(".")) {
      addField(target, node.raw, value);
      if (node.local !== node.raw) addField(target, node.local, value);
    }
  }
  for (const [name, attrValue] of Object.entries(node.attrs)) {
    const decoded = decodeXmlText(attrValue).trim();
    if (!decoded) continue;
    addField(target, `${rawPath}@${name}`, decoded);
    if (localPath !== rawPath) addField(target, `${localPath}@${localName(name)}`, decoded);
  }
}

function addField(target: Record<string, string[]>, key: string, value: string) {
  if (!key || !value) return;
  const list = target[key] ?? (target[key] = []);
  if (!list.includes(value)) list.push(value);
}

function parseAttributes(input: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const pattern = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(input))) attrs[match[1]] = match[2] ?? match[3] ?? "";
  return attrs;
}

function findTagEnd(xml: string, from: number): number {
  let quote = "";
  for (let index = from; index < xml.length; index += 1) {
    const char = xml[index];
    if (quote) { if (char === quote) quote = ""; continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === ">") return index;
  }
  return -1;
}

function localName(raw: string): string { return raw.split(":").at(-1)?.trim().toLowerCase() ?? ""; }
function normalizeKey(value: string): string { return value.trim().toLowerCase().replace(/[\s-]+/g, "_"); }
function decodeXmlText(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (whole, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower === "amp") return "&";
    if (lower === "lt") return "<";
    if (lower === "gt") return ">";
    if (lower === "quot") return '"';
    if (lower === "apos") return "'";
    const codePoint = lower.startsWith("#x") ? Number.parseInt(lower.slice(2), 16) : Number.parseInt(lower.slice(1), 10);
    return Number.isSafeInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : whole;
  });
}
function normalizeDecimal(value: string): string {
  const compact = value.replace(/\s/g, "");
  const comma = compact.lastIndexOf(",");
  const dot = compact.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) return comma > dot ? compact.replace(/\./g, "").replace(",", ".") : compact.replace(/,/g, "");
  if (comma >= 0) return compact.replace(",", ".");
  return compact;
}
