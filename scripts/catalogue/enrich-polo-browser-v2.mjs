import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const SOURCE = 'https://www.polo.gr';
const OUT = 'data/imports/polo';
const BATCH_SIZE = 4;
const PAGE_TIMEOUT = 60_000;
const crawledAt = new Date().toISOString();

const normalize = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const lower = (v) => normalize(v).toLocaleLowerCase('el-GR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const sha256 = (v) => createHash('sha256').update(String(v)).digest('hex');
const numberOrNull = (v) => {
  if (v === null || v === undefined || v === '') return null;
  let s = String(v).trim().replace(/\s/g, '');
  if (/^\d{1,3}(?:\.\d{3})*,\d+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d+,\d+$/.test(s)) s = s.replace(',', '.');
  s = s.replace(/[^0-9.-]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const euro = (n) => Number.isFinite(n) ? n.toFixed(2) : '';
const csvCell = (v) => {
  let s = v === null || v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v);
  s = s.replace(/\r?\n/g, ' ');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows, headers) => [headers.join(','), ...rows.map((r) => headers.map((h) => csvCell(r[h])).join(','))].join('\n') + '\n';
const uniq = (values) => [...new Set(values.filter(Boolean))];
const boolText = (v) => v === true ? 'true' : v === false ? 'false' : '';

function cleanSku(value) {
  return normalize(value).replace(/-(?:O\/S|OS|ONE\s*SIZE)$/i, '');
}
function apiSize(baseSku, apiSku) {
  const raw = normalize(apiSku);
  if (!raw.toUpperCase().startsWith(`${baseSku.toUpperCase()}-`)) return '';
  const suffix = raw.slice(baseSku.length + 1);
  if (/^(?:O\/S|OS|ONE\s*SIZE|XS|S|M|L|XL|XXL|XXXL|S\/M|M\/L|L\/XL|\d{2,3})$/i.test(suffix)) return suffix;
  return '';
}
function validGtin(candidate) {
  const digits = String(candidate ?? '').replace(/\D/g, '');
  if (![8, 12, 13, 14].includes(digits.length)) return false;
  const body = digits.slice(0, -1).split('').reverse().map(Number);
  const sum = body.reduce((acc, digit, i) => acc + digit * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === Number(digits.at(-1));
}
function textFlags(technicalText, featureIcons) {
  const t = lower(`${technicalText} ${featureIcons.join(' ')}`);
  const has = (...needles) => needles.some((needle) => t.includes(lower(needle)));
  const main = numberOrNull(t.match(/(\d+)\s+(?:κεντρικ(?:η|ες)|main)\s+(?:θηκ|compartment)/i)?.[1]);
  const front = numberOrNull(t.match(/(\d+)\s+(?:μπροστιν(?:η|ες)|front)\s+(?:θηκ|compartment|pocket)/i)?.[1]);
  const laptop = numberOrNull(t.match(/(?:laptop|φορητ)[^0-9]{0,40}(\d{1,2}(?:[.,]\d)?)\s*(?:''|\"|inch|ιντ)/i)?.[1]);
  return {
    compartment_count: main,
    front_compartment_count: front,
    laptop_size_in: laptop,
    cabin_size: has('καμπινας', 'cabin size', 'cabin luggage'),
    waterproof_cover: has('αδιαβροχο καλυμμα', 'waterproof cover', 'rain cover'),
    usb_port: has('usb'),
    hidden_pocket: has('κρυφη θηκη', 'hidden pocket'),
    bottle_pocket: has('θηκη παγουριου', 'bottle case', 'bottle pocket'),
    breathable_back: has('breathable back', 'αεριζομεν', 'διαπνεουσα πλατη', 'διαπνεον'),
    ergonomic_straps: has('ergonomic straps', 'εργονομικ', 'ανατομικοι ιμαντες', 'ανατομικους ιμαντες'),
    reflective_details: has('reflected parts', 'reflective', 'ανακλαστικ', 'αντανακλαστικ'),
    sbs_zippers: has('sbs zippers', 'sbs'),
    detachable_trolley: has('αποσπωμενη βαση τρολεϊ', 'αποσπωμενο μηχανισμο τρολεϊ', 'detachable trolley'),
    isothermal_compartment: has('ισοθερμ', 'isothermal', 'foil'),
    organizer: has('organizer', 'οργανωτ'),
    zip_lock: has('zip lock', 'λουκετο', 'κλειδωμα'),
    chest_whistle: has('chest whistle', 'σφυριχτρ'),
    rfid: has('rfid'),
    bpa_free: has('χωρις bpa', 'bpa free'),
    leakproof: has('στεγανο', 'leakproof', 'leak proof')
  };
}
function parseDimensions(dimensionsText) {
  const t = normalize(dimensionsText);
  const capacity = numberOrNull(t.match(/(?:Χωρητικότητα|Capacity)\s*:?\s*([0-9]+(?:[.,][0-9]+)?)/i)?.[1]);
  const ymd = t.match(/(?:Υ\.?|H\.?)\s*([0-9]+(?:[.,][0-9]+)?)\s*cm\s*[│|x×.,;]?\s*(?:Μ\.?|L\.?)\s*([0-9]+(?:[.,][0-9]+)?)\s*cm\s*[│|x×.,;]?\s*(?:Π\.?|W\.?)\s*([0-9]+(?:[.,][0-9]+)?)\s*cm/i);
  const generic = t.match(/([0-9]+(?:[.,][0-9]+)?)\s*[x×]\s*([0-9]+(?:[.,][0-9]+)?)\s*[x×]\s*([0-9]+(?:[.,][0-9]+)?)\s*cm/i);
  const height = numberOrNull(ymd?.[1] ?? t.match(/(?:Ύψος|Υψος|Height)\s*:?\s*([0-9]+(?:[.,][0-9]+)?)/i)?.[1] ?? generic?.[1]);
  const width = numberOrNull(ymd?.[2] ?? generic?.[2]);
  const depth = numberOrNull(ymd?.[3] ?? generic?.[3]);
  const diameter = numberOrNull(t.match(/(?:Διάμετρος|Διαμετρος|Diameter)\s*:?\s*([0-9]+(?:[.,][0-9]+)?)/i)?.[1]);
  const weightMatch = t.match(/(?:Βάρος|Weight)\s*:?\s*([0-9]+(?:[.,][0-9]+)?)\s*(kg|gr|g)?/i);
  let weight = numberOrNull(weightMatch?.[1]);
  if (weight && /kg/i.test(weightMatch?.[2] ?? '')) weight *= 1000;
  let dimensions = '';
  if (height && width && depth) dimensions = `${height} x ${width} x ${depth} cm`;
  else if (diameter && height) dimensions = `Ø ${diameter} x H ${height} cm`;
  return { capacity, height, width, depth, diameter, weight, dimensions };
}
function cleanHtmlText(value) {
  return normalize(String(value ?? '').replace(/<br\s*\/?>/gi, ' | ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&'));
}
function chooseApiProduct(items, row) {
  const exact = items.filter((item) => cleanSku(item.sku) === row.supplier_code);
  if (!exact.length) return null;
  return exact.find((item) => normalize(item.permalink).replace(/\/$/, '') === normalize(row.source_url).replace(/\/$/, ''))
    ?? exact.find((item) => !String(item.permalink || '').includes('/en/'))
    ?? exact[0];
}
function deriveBrand(row) {
  const title = normalize(row.title).toUpperCase();
  if (/\bLAKEN\s*$/.test(title)) return { brand: 'LAKEN', status: 'title_verified', evidence: 'official_title_suffix' };
  if (/\bPOLO(?:\.GR)?\s*$/.test(title)) return { brand: 'POLO', status: 'title_verified', evidence: 'official_title_suffix' };
  return { brand: 'POLO', status: 'source_owner_default_reviewable', evidence: 'polo_catalogue_default' };
}
function makeDescription(row, shortDescription, technicalText) {
  const lead = shortDescription && shortDescription.length <= 320 ? shortDescription : `${row.title} της ${row.brand}.`;
  const facts = [];
  if (row.capacity_l) facts.push(`Χωρητικότητα ${row.capacity_l} L`);
  if (row.dimensions_text) facts.push(`διαστάσεις ${row.dimensions_text}`);
  if (row.weight_g) facts.push(`βάρος ${row.weight_g} g`);
  if (row.compartment_count) facts.push(`${row.compartment_count} κεντρικές θήκες`);
  if (row.laptop_size_in) facts.push(`θήκη laptop έως ${row.laptop_size_in}″`);
  const features = [];
  const add = (field, label) => { if (row[field] === 'true') features.push(label); };
  add('waterproof_cover', 'αδιάβροχο κάλυμμα');
  add('breathable_back', 'αεριζόμενη/ανατομική πλάτη');
  add('ergonomic_straps', 'εργονομικοί ιμάντες');
  add('reflective_details', 'ανακλαστικές λεπτομέρειες');
  add('sbs_zippers', 'φερμουάρ SBS');
  add('bottle_pocket', 'θήκη παγουριού');
  add('usb_port', 'θύρα USB');
  add('detachable_trolley', 'αποσπώμενη βάση τρόλεϊ');
  let out = lead.replace(/[.!?]?$/, '.');
  if (facts.length) out += ` ${facts.join(', ')}.`;
  if (features.length) out += ` Χαρακτηριστικά: ${features.slice(0, 7).join(', ')}.`;
  if (row.supplier_code) out += ` Κωδικός προϊόντος: ${row.supplier_code}.`;
  return normalize(out);
}

async function fetchBatch(page, entries) {
  return page.evaluate(async ({ entries, source }) => {
    const norm = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
    const parseHtml = (html, sourceUrl) => {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const root = doc.querySelector('div.product') || doc.querySelector('main') || doc.body;
      const text = (selector) => norm(root?.querySelector(selector)?.textContent || '');
      const title = text('h1');
      const pageSku = text('.sku');
      const shortDescription = text('.woocommerce-product-details__short-description');
      const dimensionsText = text('#tab-dimensions_tab');
      const technicalText = text('#tab-technical_details_tab');
      const featureIcons = [...root.querySelectorAll('.characteristics img[alt]')].map((img) => norm(img.alt)).filter(Boolean);
      const gallery = [
        ...root.querySelectorAll('#wpgs-gallery a.wcgs-slider-lightbox[href]'),
        ...root.querySelectorAll('#wpgs-gallery img[data-image]')
      ].map((el) => el.href || el.getAttribute('data-image') || '').filter(Boolean);
      const colorSection = [...root.querySelectorAll('.polo-related-col, section')].find((el) => /Άλλα Χρώματα|Other Colours|Other Colors/i.test(el.textContent || ''));
      const siblings = colorSection ? [...colorSection.querySelectorAll('a.woocommerce-LoopProduct-link[href]')].map((a) => a.href).filter(Boolean) : [];
      const categories = [...root.querySelectorAll('.posted_in a')].map((a) => norm(a.textContent)).filter(Boolean);
      const plt = norm(root.querySelector('.price.noeshop')?.textContent || '');
      return { title, pageSku, shortDescription, dimensionsText, technicalText, featureIcons, gallery, siblings, categories, plt, sourceUrl };
    };
    const out = [];
    for (const entry of entries) {
      try {
        const [htmlResponse, apiResponse] = await Promise.all([
          fetch(entry.source_url, { credentials: 'include', headers: { accept: 'text/html' } }),
          fetch(`${source}/wp-json/wc/store/v1/products?search=${encodeURIComponent(entry.supplier_code)}&per_page=20`, { credentials: 'include', headers: { accept: 'application/json' } })
        ]);
        const [html, apiText] = await Promise.all([htmlResponse.text(), apiResponse.text()]);
        let api = [];
        try { api = JSON.parse(apiText); } catch {}
        out.push({ key: entry.supplier_code, htmlStatus: htmlResponse.status, apiStatus: apiResponse.status, page: parseHtml(html, entry.source_url), api });
      } catch (error) {
        out.push({ key: entry.supplier_code, error: String(error) });
      }
    }
    return out;
  }, { entries, source: SOURCE });
}

function enrichRow(row, evidence) {
  const flags = new Set(String(row.data_quality_flags || '').split('|').filter(Boolean));
  flags.delete('missing_images');
  flags.delete('missing_price');
  flags.delete('brand_defaulted_to_source_owner');
  const api = chooseApiProduct(Array.isArray(evidence?.api) ? evidence.api : [], row);
  const page = evidence?.page || {};
  if (page.title) row.title = page.title;

  const brand = deriveBrand(row);
  row.brand = brand.brand;
  row.brand_status = brand.status;
  row.brand_evidence_kind = brand.evidence;
  if (brand.status.includes('reviewable')) flags.add('brand_defaulted_to_source_owner');

  if (api) {
    row.source_product_id = String(api.id ?? row.source_product_id ?? '');
    row.source_slug = api.slug || row.source_slug || '';
    row.source_size_code = apiSize(row.supplier_code, api.sku);
    if (row.source_size_code) row.size = row.source_size_code;
    const images = uniq((api.images || []).map((img) => img?.src));
    if (images.length) {
      row.image_url = images[0];
      row.image_urls = images.join('|');
      row.image_count = String(images.length);
    }
    const prices = api.prices || {};
    const minor = Number(prices.currency_minor_unit ?? 2);
    const regularMinor = Number(prices.regular_price ?? prices.price);
    if (Number.isFinite(regularMinor)) {
      const regular = regularMinor / (10 ** minor);
      row.msrp = euro(regular);
      row.msrp_minor = String(Math.round(regular * 100));
      row.regular_price = euro(regular);
      row.regular_price_minor = String(Math.round(regular * 100));
      row.price = euro(regular);
      row.price_kind = 'msrp';
      row.currency = prices.currency_code || 'EUR';
    }
    row.stock = api.is_in_stock === true ? 'instock' : api.is_in_stock === false ? 'outofstock' : row.stock;
    row.stock_status = row.stock;
    row.purchasable = boolText(api.is_purchasable);
    row.on_sale = boolText(api.on_sale);
    if (Array.isArray(api.categories) && api.categories.length) row.category_paths = api.categories.map((x) => x.name).filter(Boolean).join('|');
    if (Array.isArray(api.tags)) row.tag_names = api.tags.map((x) => x.name).filter(Boolean).join('|');
    row.source_short_description = cleanHtmlText(api.short_description || page.shortDescription || '');
  } else {
    flags.add('store_api_exact_sku_missing');
    row.source_short_description = normalize(page.shortDescription || '');
  }

  const cleanGallery = uniq(page.gallery || []);
  if (!row.image_url && cleanGallery.length) row.image_url = cleanGallery[0];
  if ((!row.image_urls || !row.image_count) && cleanGallery.length) {
    row.image_urls = cleanGallery.join('|');
    row.image_count = String(cleanGallery.length);
  }
  if (!row.image_url) flags.add('missing_images');

  row.dimensions_source_text = normalize(page.dimensionsText || '');
  row.technical_details_text = normalize(page.technicalText || '');
  row.feature_icon_keys = uniq(page.featureIcons || []).join('|');
  row.sibling_variant_urls = uniq(page.siblings || []).join('|');
  if (page.categories?.length) row.category = page.categories.at(-1) || row.category;

  const dims = parseDimensions(row.dimensions_source_text);
  if (dims.capacity !== null) row.capacity_l = String(dims.capacity);
  if (dims.height !== null) row.height_cm = String(dims.height);
  if (dims.width !== null) row.width_cm = String(dims.width);
  if (dims.depth !== null) row.depth_cm = String(dims.depth);
  if (dims.diameter !== null) row.diameter_cm = String(dims.diameter);
  if (dims.weight !== null) row.weight_g = String(dims.weight);
  if (dims.dimensions) row.dimensions_text = dims.dimensions;

  const feature = textFlags(row.technical_details_text, page.featureIcons || []);
  for (const [key, value] of Object.entries(feature)) {
    if (typeof value === 'boolean') row[key] = boolText(value);
    else if (value !== null && value !== undefined) row[key] = String(value);
  }
  row.feature_keys = Object.entries(feature).filter(([,v]) => v === true).map(([k]) => k).join('|');

  row.variant_label = row.variant_code || '';
  row.variant_label_status = row.variant_code ? 'source_variant_code_pending_human_label' : '';
  if (!row.color) row.color_status = row.variant_code ? 'pending_external_exact_sku' : 'not_applicable_or_unknown';

  row.specifications = JSON.stringify({
    dimensions: row.dimensions_text || null,
    dimensions_source_text: row.dimensions_source_text || null,
    diameter_cm: row.diameter_cm || null,
    capacity_l: row.capacity_l || null,
    weight_g: row.weight_g || null,
    technical_details_text: row.technical_details_text || null,
    feature_icon_keys: page.featureIcons || [],
    feature_keys: row.feature_keys ? row.feature_keys.split('|') : [],
    compartment_count: row.compartment_count || null,
    front_compartment_count: row.front_compartment_count || null,
    laptop_size_in: row.laptop_size_in || null,
    source_size_code: row.source_size_code || null
  });
  row.attributes_json = JSON.stringify({
    sourceShortDescription: row.source_short_description || null,
    dimensionsText: row.dimensions_source_text || null,
    technicalDetailsText: row.technical_details_text || null,
    featureIcons: page.featureIcons || [],
    apiSku: api?.sku || null,
    apiProductId: api?.id || null,
    apiCategories: api?.categories || [],
    apiTags: api?.tags || []
  });

  row.description = makeDescription(row, row.source_short_description, row.technical_details_text);
  row.description_quality = row.technical_details_text ? 'official_specs_normalized_detailed' : row.source_short_description ? 'official_short_description_normalized' : 'generated_basic';
  if (!row.gtin || !validGtin(row.gtin)) flags.add('gtin_pending_external'); else flags.delete('gtin_pending_external');
  row.data_quality_flags = [...flags].join('|');
  row.crawled_at = crawledAt;
  row.source_payload_sha256 = sha256(JSON.stringify({
    sku: row.supplier_code, title: row.title, brand: row.brand, price: row.price,
    images: row.image_urls, dimensions: row.dimensions_source_text,
    technical: row.technical_details_text, featureIcons: row.feature_icon_keys,
    shortDescription: row.source_short_description, apiId: row.source_product_id
  }));
  return row;
}

function buildFamilies(rows) {
  const groups = new Map();
  for (const row of rows) groups.set(row.family_key, [...(groups.get(row.family_key) || []), row]);
  return [...groups.entries()].map(([family_key, members]) => {
    const prices = members.map((x) => Number(x.msrp)).filter(Number.isFinite);
    return {
      family_key,
      family_title: members[0]?.title || '',
      brands: uniq(members.map((x) => x.brand)).join('|'),
      variant_count: members.length,
      variant_codes: members.map((x) => x.variant_code).filter(Boolean).join('|'),
      variant_labels: uniq(members.map((x) => x.variant_label).filter(Boolean)).join('|'),
      colors: uniq(members.map((x) => x.color).filter(Boolean)).join('|'),
      sizes: uniq(members.map((x) => x.size).filter(Boolean)).join('|'),
      supplier_codes: members.map((x) => x.supplier_code).filter(Boolean).join('|'),
      gtins: members.map((x) => x.gtin).filter(Boolean).join('|'),
      min_msrp: prices.length ? Math.min(...prices).toFixed(2) : '',
      max_msrp: prices.length ? Math.max(...prices).toFixed(2) : '',
      image_count: members.reduce((sum, x) => sum + Number(x.image_count || 0), 0),
      source_urls: members.map((x) => x.source_url).filter(Boolean).join('|')
    };
  });
}

async function main() {
  const rows = (await readFile(`${OUT}/polo-master.jsonl`, 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  if (!rows.length) throw new Error('POLO master JSONL is empty');
  const existingHeaders = (await readFile(`${OUT}/polo-master.csv`, 'utf8')).split(/\r?\n/, 1)[0].split(',');
  const extraHeaders = [
    'brand_status','brand_evidence_kind','source_size_code','diameter_cm','source_short_description',
    'dimensions_source_text','technical_details_text','feature_icon_keys','variant_label_status','color_status',
    'zip_lock','chest_whistle','rfid','bpa_free','leakproof'
  ];
  const headers = [...existingHeaders, ...extraHeaders.filter((h) => !existingHeaders.includes(h))];

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: 'el-GR', timezoneId: 'Europe/Athens', viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  await page.goto(`${SOURCE}/shop/`, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });
  await page.waitForTimeout(800);

  const evidenceBySku = new Map();
  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    const batch = rows.slice(start, start + BATCH_SIZE).map((r) => ({ supplier_code: r.supplier_code, source_url: r.source_url }));
    const evidence = await fetchBatch(page, batch);
    for (const item of evidence) evidenceBySku.set(item.key, item);
    if ((start + batch.length) % 40 === 0 || start + batch.length === rows.length) console.log(`[polo] authoritative enrichment ${start + batch.length}/${rows.length}`);
    await page.waitForTimeout(120);
  }
  await page.close();
  await context.close();
  await browser.close();

  const enriched = rows.map((row) => enrichRow(row, evidenceBySku.get(row.supplier_code)));
  const families = buildFamilies(enriched);
  const familyHeaders = ['family_key','family_title','brands','variant_count','variant_codes','variant_labels','colors','sizes','supplier_codes','gtins','min_msrp','max_msrp','image_count','source_urls'];
  const missingGtin = enriched.filter((r) => !r.gtin);
  const quality = enriched.filter((r) => r.data_quality_flags);
  const summary = JSON.parse(await readFile(`${OUT}/polo-crawl-summary.json`, 'utf8'));
  const count = (predicate) => enriched.filter(predicate).length;
  summary.enrichmentV2 = {
    completedAt: crawledAt,
    method: 'Browser-origin same-site fetch of rendered POLO product HTML plus Woo Store API exact-SKU records',
    exactStoreApiRows: count((r) => !String(r.data_quality_flags).includes('store_api_exact_sku_missing')),
    withOfficialShortDescription: count((r) => r.source_short_description),
    withTechnicalDetails: count((r) => r.technical_details_text),
    withDimensionsSourceText: count((r) => r.dimensions_source_text),
    withFeatureIcons: count((r) => r.feature_icon_keys),
    withSourceSizeCode: count((r) => r.source_size_code),
    withDiameter: count((r) => r.diameter_cm),
    LAKEN: count((r) => r.brand === 'LAKEN'),
    POLO: count((r) => r.brand === 'POLO')
  };
  summary.withImages = count((r) => r.image_url);
  summary.totalImages = enriched.reduce((sum, r) => sum + Number(r.image_count || 0), 0);
  summary.withMsrp = count((r) => r.msrp);
  summary.withCapacity = count((r) => r.capacity_l);
  summary.withDimensions = count((r) => r.dimensions_text);
  summary.withWeight = count((r) => r.weight_g);
  summary.withColor = count((r) => r.color);
  summary.withVariantLabel = count((r) => r.variant_label);
  summary.withTechnicalDetails = count((r) => r.technical_details_text);
  summary.qualityReviewRows = quality.length;
  summary.missingGtin = missingGtin.length;
  summary.policies.media = 'Variant-specific source images are taken from the exact POLO Woo Store API product or the product gallery only; related/recommendation images are excluded.';
  summary.policies.details = 'Hidden dimensions and technical-specification tab text is parsed through browser-origin product HTML, then projected into structured fields and specifications JSON.';
  summary.policies.brand = 'LAKEN is assigned only when explicitly named by POLO in the official product title; remaining catalogue rows use POLO as a reviewable source-owner default until a stronger brand field is exposed.';
  summary.policies.colors = 'Variant codes and POLO other-colour relationships are retained. Human-readable color/design labels remain pending exact-SKU external verification rather than being guessed.';

  await writeFile(`${OUT}/polo-master.csv`, toCsv(enriched, headers), 'utf8');
  await writeFile(`${OUT}/polo-master.jsonl`, enriched.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  await writeFile(`${OUT}/polo-families.csv`, toCsv(families, familyHeaders), 'utf8');
  await writeFile(`${OUT}/polo-gtin-missing.csv`, toCsv(missingGtin, headers), 'utf8');
  await writeFile(`${OUT}/polo-quality-review.csv`, toCsv(quality, headers), 'utf8');
  await writeFile(`${OUT}/polo-crawl-summary.json`, JSON.stringify(summary, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify(summary.enrichmentV2, null, 2));
}

main().catch((error) => {
  console.error('[polo] enrichment v2 failed', error);
  process.exitCode = 1;
});
