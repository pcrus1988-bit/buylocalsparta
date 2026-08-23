import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

const SOURCE = 'https://www.polo.gr';
const OUT = 'data/imports/polo';
const MAX_LISTING_PAGES = 60;
const PRODUCT_CONCURRENCY = 4;
const GTIN_CONCURRENCY = 5;
const PAGE_TIMEOUT = 60000;
const crawledAt = new Date().toISOString();
const researchedDate = crawledAt.slice(0, 10);

const canonicalHeaders = [
  'supplier_code','gtin','brand','model','title','description','image_url','source_url',
  'category','price','currency','stock','variant','specifications','compatibility'
];
const richHeaders = [
  'source','source_product_id','source_slug','family_key','family_title','variant_code','variant_label','color','size',
  'capacity_l','dimensions_text','height_cm','width_cm','depth_cm','weight_g','compartment_count','front_compartment_count',
  'laptop_size_in','cabin_size','waterproof_cover','usb_port','hidden_pocket','bottle_pocket','breathable_back','ergonomic_straps',
  'reflective_details','sbs_zippers','detachable_trolley','isothermal_compartment','organizer','feature_keys','attributes_json',
  'category_paths','tag_names','msrp','msrp_minor','selling_price','selling_price_minor','regular_price','regular_price_minor',
  'sale_price','sale_price_minor','price_kind','tax_inclusive','stock_status','purchasable','on_sale','sibling_variant_urls',
  'image_urls','image_count','gtin_status','gtin_evidence_kind','gtin_evidence_url','gtin_evidence_sources','description_quality',
  'data_quality_flags','last_researched_date','crawled_at','source_payload_sha256'
];
const headers = [...canonicalHeaders, ...richHeaders];

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
const boolText = (v) => v === true ? 'true' : v === false ? 'false' : '';
const csvCell = (v) => {
  let s = v === null || v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v);
  s = s.replace(/\r?\n/g, ' ');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows, cols = headers) => [cols.join(','), ...rows.map(r => cols.map(c => csvCell(r[c])).join(','))].join('\n') + '\n';

function validGtin(candidate) {
  const digits = String(candidate ?? '').replace(/\D/g, '');
  if (![8, 12, 13, 14].includes(digits.length)) return false;
  const body = digits.slice(0, -1).split('').reverse().map(Number);
  const sum = body.reduce((acc, digit, i) => acc + digit * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === Number(digits.at(-1));
}

function firstValidGtin(values) {
  for (const raw of values) {
    const matches = String(raw ?? '').match(/\b\d{8,14}\b/g) ?? [];
    for (const candidate of matches) if (validGtin(candidate)) return candidate;
  }
  return '';
}

function familyParts(sku, title) {
  const code = normalize(sku);
  if (code.includes('-')) {
    const parts = code.split('-').filter(Boolean);
    return { familyKey: parts.slice(0, -1).join('-'), variantCode: parts.at(-1) ?? '' };
  }
  return { familyKey: code || lower(title).replace(/[^a-z0-9α-ω]+/g, '-').replace(/^-|-$/g, '').slice(0, 80), variantCode: '' };
}

function featureFlags(text) {
  const t = lower(text);
  const has = (...needles) => needles.some(n => t.includes(lower(n)));
  const compartmentCount = numberOrNull(t.match(/(\d+)\s+(?:κεντρικ(?:η|ες)|main)\s+(?:θηκ|compartment)/i)?.[1]);
  const frontCompartmentCount = numberOrNull(t.match(/(\d+)\s+(?:μπροστιν(?:η|ες)|front)\s+(?:θηκ|compartment)/i)?.[1]);
  const laptop = numberOrNull(t.match(/(?:laptop|φορητ(?:ο|ου))[^0-9]{0,25}(\d{1,2}(?:[.,]\d)?)\s*(?:''|\"|inch|ιντ)/i)?.[1]);
  const flags = {
    compartment_count: compartmentCount,
    front_compartment_count: frontCompartmentCount,
    laptop_size_in: laptop,
    cabin_size: has('καμπίνας', 'cabin size', 'cabin luggage'),
    waterproof_cover: has('αδιάβροχο κάλυμμα', 'waterproof cover', 'rain cover'),
    usb_port: has('usb'),
    hidden_pocket: has('κρυφή θήκη', 'hidden pocket'),
    bottle_pocket: has('θήκη παγουριού', 'bottle case', 'bottle pocket'),
    breathable_back: has('breathable back', 'αεριζόμενη', 'διαπνέουσα πλάτη', 'διαπνεον σύστημα πλάτης'),
    ergonomic_straps: has('ergonomic straps', 'εργονομικ', 'ανατομικοι ιμαντες', 'ανατομικοί ιμάντες'),
    reflective_details: has('reflected parts', 'reflective', 'ανακλαστικ'),
    sbs_zippers: has('sbs zippers', 'sbs'),
    detachable_trolley: has('αποσπώμενη βάση τρόλεϊ', 'αποσπωμενη βαση τρολεϊ', 'detachable trolley'),
    isothermal_compartment: has('ισοθερμ', 'isothermal', 'foil'),
    organizer: has('organizer', 'οργανωτ')
  };
  return flags;
}

function featureKeys(flags) {
  return Object.entries(flags)
    .filter(([key, value]) => !key.endsWith('_count') && key !== 'laptop_size_in' && value === true)
    .map(([key]) => key);
}

function conciseDescription(row) {
  const parts = [`${row.title} της POLO`];
  if (row.capacity_l) parts.push(`χωρητικότητας ${row.capacity_l} L`);
  if (row.height_cm && row.width_cm && row.depth_cm) parts.push(`με διαστάσεις ${row.height_cm}×${row.width_cm}×${row.depth_cm} cm`);
  if (row.weight_g) parts.push(`και βάρος ${row.weight_g} g`);
  const features = [];
  const add = (condition, label) => { if (condition) features.push(label); };
  add(row.detachable_trolley === 'true', 'αποσπώμενο μηχανισμό τρόλεϊ');
  add(row.breathable_back === 'true', 'αεριζόμενη/ανατομική πλάτη');
  add(row.ergonomic_straps === 'true', 'εργονομικούς ιμάντες');
  add(row.waterproof_cover === 'true', 'κάλυμμα βροχής');
  add(row.reflective_details === 'true', 'ανακλαστικές λεπτομέρειες');
  add(row.bottle_pocket === 'true', 'θήκη παγουριού');
  add(row.usb_port === 'true', 'θύρα USB');
  add(row.laptop_size_in, `θήκη laptop έως ${row.laptop_size_in}″`);
  if (features.length) parts.push(`με ${features.slice(0, 5).join(', ')}`);
  let out = parts.join(', ').replace(/, με /, ' με ');
  if (!/[.!?]$/.test(out)) out += '.';
  if (row.supplier_code) out += ` Κωδικός POLO: ${row.supplier_code}.`;
  return out;
}

async function safeGoto(page, url, attempts = 3) {
  let last;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });
      await page.waitForTimeout(350);
      return response;
    } catch (error) {
      last = error;
      await page.waitForTimeout(500 * i * i);
    }
  }
  throw last;
}

async function discover(context) {
  const page = await context.newPage();
  const found = new Map();
  const listingPages = [];
  try {
    for (let n = 1; n <= MAX_LISTING_PAGES; n += 1) {
      const url = n === 1 ? `${SOURCE}/shop/` : `${SOURCE}/shop/page/${n}/`;
      let response;
      try { response = await safeGoto(page, url); }
      catch (error) {
        listingPages.push({ page: n, url, error: String(error?.message ?? error) });
        if (n > 1) break;
        throw error;
      }
      const data = await page.evaluate(() => {
        const anchors = [...document.querySelectorAll('a.woocommerce-LoopProduct-link.woocommerce-loop-product__link')];
        const cards = anchors.map((a) => {
          const root = a.closest('.product') ?? a.parentElement?.parentElement ?? a.parentElement;
          const cls = typeof root?.className === 'string' ? root.className : '';
          const sku = cls.match(/(?:^|\s)([0-9A-Z]{5,}-[0-9A-Z]{2,})-(?=\s|product|$)/i)?.[1]
            ?? cls.match(/(?:^|\s)([0-9A-Z]{5,}-[0-9A-Z]{2,})(?=\s)/i)?.[1]
            ?? '';
          const postId = cls.match(/\bpost-(\d+)\b/i)?.[1] ?? '';
          const categories = [...cls.matchAll(/\bproduct_cat-([^\s]+)/g)].map(m => m[1]);
          const tags = [...cls.matchAll(/\bproduct_tag-([^\s]+)/g)].map(m => m[1]);
          const img = root?.querySelector('img');
          return {
            href: a.href.split('#')[0],
            title: (a.textContent ?? '').replace(/\s+/g, ' ').trim(),
            sku,
            postId,
            stock: /\boutofstock\b/.test(cls) ? 'outofstock' : /\binstock\b/.test(cls) ? 'instock' : '',
            categories,
            tags,
            cardImage: img?.currentSrc || img?.getAttribute('data-src') || img?.src || '',
            cardImageAlt: img?.alt || ''
          };
        }).filter(x => x.href && x.title);
        const next = document.querySelector('a.next.page-numbers, a.next, link[rel="next"]')?.href ?? '';
        return { cards, next, title: document.title };
      });
      let added = 0;
      for (const card of data.cards) {
        const key = card.sku || card.href;
        if (!found.has(key)) { found.set(key, { ...card, listingPage: n }); added += 1; }
      }
      listingPages.push({ page: n, url: page.url(), status: response?.status() ?? null, title: data.title, cards: data.cards.length, added, total: found.size, next: data.next });
      console.log(`[polo] listing ${n}: ${data.cards.length} cards, ${added} new, ${found.size} total`);
      if (!data.cards.length || (n > 1 && added === 0) || !data.next) break;
    }
  } finally {
    await page.close();
  }
  if (!found.size) throw new Error('No POLO product cards were discovered in rendered catalogue pages');
  return { products: [...found.values()], listingPages };
}

function productPageDataEvaluator(listing) {
  const norm = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
  const body = norm(document.body?.innerText ?? '');
  const title = norm(document.querySelector('h1')?.textContent) || listing.title;
  const skuBody = body.match(/\b([0-9A-Z]{5,}-[0-9A-Z]{2,})\b/)?.[1] ?? '';
  const sku = skuBody || listing.sku;
  const msrpText = body.match(/Π\.?\s*Λ\.?\s*Τ\.?\s*:?\s*€?\s*([0-9]+(?:[.,][0-9]{1,2})?)/i)?.[1] ?? '';
  const capacity = body.match(/Χωρητικότητα\s*:?\s*([0-9]+(?:[.,][0-9]+)?)\s*(?:lt|l\b)/i)?.[1] ?? '';
  const dims = body.match(/Υ\.?\s*([0-9]+(?:[.,][0-9]+)?)\s*cm\s*[│|x×]?\s*Μ\.?\s*([0-9]+(?:[.,][0-9]+)?)\s*cm\s*[│|x×]?\s*Π\.?\s*([0-9]+(?:[.,][0-9]+)?)\s*cm/i);
  const genericDims = body.match(/(?:Διαστάσεις|Dimensions)[^0-9]{0,30}([0-9]+(?:[.,][0-9]+)?)\s*[x×]\s*([0-9]+(?:[.,][0-9]+)?)\s*[x×]\s*([0-9]+(?:[.,][0-9]+)?)\s*cm/i);
  const weight = body.match(/Βάρος\s*:?\s*([0-9]+(?:[.,][0-9]+)?)\s*(gr|g|kg)/i);
  const categoryLinks = [...document.querySelectorAll('.posted_in a, .woocommerce-breadcrumb a')]
    .map(a => norm(a.textContent)).filter(Boolean).filter(x => !/^(home|αρχική)$/i.test(x));
  const attrs = [...document.querySelectorAll('.woocommerce-product-attributes-item')].map(row => ({
    name: norm(row.querySelector('.woocommerce-product-attributes-item__label, th')?.textContent).replace(/:$/, ''),
    value: norm(row.querySelector('.woocommerce-product-attributes-item__value, td')?.textContent)
  })).filter(x => x.name || x.value);
  const attr = (re) => attrs.find(x => re.test(x.name))?.value ?? '';
  const color = attr(/χρώμα|color|colour/i);
  const size = attr(/μέγεθος|size/i);
  const images = [];
  const pushImage = (el) => {
    const url = el?.getAttribute?.('data-large_image') || el?.currentSrc || el?.getAttribute?.('data-src') || el?.src || '';
    if (!url || !/^https?:/i.test(url)) return;
    images.push({ url, alt: norm(el.alt), width: el.naturalWidth || 0, height: el.naturalHeight || 0 });
  };
  document.querySelectorAll('.woocommerce-product-gallery img, .elementor-widget-woocommerce-product-images img, main img').forEach(pushImage);
  const og = document.querySelector('meta[property="og:image"]')?.content || '';
  if (og) images.unshift({ url: og, alt: title, width: 0, height: 0 });
  const siblings = [...document.querySelectorAll('a')]
    .filter(a => /άλλα\s+χρώματα|αλλα\s+χρωματα|other\s+colou?rs/i.test(a.closest('section,div')?.textContent ?? ''))
    .map(a => a.href.split('#')[0]).filter(href => href && href !== location.href);
  const jsonLd = [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => s.textContent || '').filter(Boolean);
  const scripts = [...document.scripts].map(s => s.textContent || '').filter(t => /gtin|ean|barcode|upc|global_unique/i.test(t)).slice(0, 20);
  const descriptionLead = (() => {
    const main = document.querySelector('.summary, .product .summary, main')?.innerText ?? '';
    const clean = norm(main);
    const afterPrice = clean.split(/Π\.?\s*Λ\.?\s*Τ\.?[^\]]*\]?/i)[1] ?? clean;
    return norm(afterPrice.split(/Κατηγορίες\s*:/i)[0]).slice(0, 500);
  })();
  return {
    title, sku, msrpText, capacity,
    height: dims?.[1] ?? genericDims?.[1] ?? '',
    width: dims?.[2] ?? genericDims?.[2] ?? '',
    depth: dims?.[3] ?? genericDims?.[3] ?? '',
    weight: weight?.[1] ?? '', weightUnit: weight?.[2] ?? '',
    body, categoryLinks, attrs, color, size, images, siblings: [...new Set(siblings)], jsonLd, scripts, descriptionLead,
    postId: document.body.className.match(/\bpostid-(\d+)\b/)?.[1] ?? listing.postId ?? '',
    availability: document.querySelector('link[itemprop="availability"]')?.href ?? '',
    canonical: document.querySelector('link[rel="canonical"]')?.href ?? location.href
  };
}

function chooseImages(images, sku, title) {
  const seen = new Set();
  const scored = [];
  for (const item of images ?? []) {
    const url = normalize(item.url).replace(/-\d+x\d+(?=\.[a-z]{2,5}(?:\?|$))/i, '');
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const hay = lower(`${url} ${item.alt}`);
    if (/logo|icon|loader|facebook|instagram|tiktok|youtube|analytics|payment|visa|mastercard|paypal/.test(hay)) continue;
    let score = 0;
    if (sku && hay.includes(lower(sku))) score += 8;
    const variantCode = sku.split('-').at(-1) ?? '';
    if (variantCode && hay.includes(lower(variantCode))) score += 4;
    if (title && lower(item.alt).includes(lower(title).slice(0, 20))) score += 3;
    if ((item.width ?? 0) >= 500 || (item.height ?? 0) >= 500) score += 2;
    if (/wp-content\/uploads/.test(url)) score += 1;
    scored.push({ url, alt: normalize(item.alt), score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 12);
}

function variantLabelFromImages(images, title, sku) {
  const generic = new Set([lower(title), lower(`${title} ${sku}`), lower(sku)]);
  for (const image of images) {
    const alt = normalize(image.alt);
    if (alt && !generic.has(lower(alt)) && alt.length <= 100 && !/image|polo|logo/i.test(alt)) return alt;
  }
  return '';
}

function parsePrimaryGtin(data) {
  const candidates = [...(data.jsonLd ?? []), ...(data.scripts ?? [])];
  const keyed = [];
  for (const text of candidates) {
    for (const m of String(text).matchAll(/(?:gtin(?:8|12|13|14)?|ean(?:8|13)?|barcode|upc|global_unique_id)[^0-9]{0,30}(\d{8,14})/gi)) keyed.push(m[1]);
  }
  return firstValidGtin(keyed);
}

async function enrichOne(context, listing, index, total) {
  const page = await context.newPage();
  let data;
  let error = '';
  try {
    await safeGoto(page, listing.href);
    data = await page.evaluate(productPageDataEvaluator, listing);
  } catch (e) {
    error = String(e?.message ?? e);
    data = { title: listing.title, sku: listing.sku, body: '', attrs: [], images: listing.cardImage ? [{url: listing.cardImage, alt: listing.cardImageAlt}] : [], categoryLinks: [], siblings: [], jsonLd: [], scripts: [] };
  } finally {
    await page.close();
  }

  const sku = normalize(data.sku || listing.sku);
  const title = normalize(data.title || listing.title);
  const { familyKey, variantCode } = familyParts(sku, title);
  const msrp = numberOrNull(data.msrpText);
  const capacity = numberOrNull(data.capacity);
  const height = numberOrNull(data.height);
  const width = numberOrNull(data.width);
  const depth = numberOrNull(data.depth);
  let weightG = numberOrNull(data.weight);
  if (weightG !== null && /kg/i.test(data.weightUnit ?? '')) weightG *= 1000;
  const flags = featureFlags(`${data.body ?? ''} ${JSON.stringify(data.attrs ?? [])}`);
  const images = chooseImages([...(data.images ?? []), ...(listing.cardImage ? [{url: listing.cardImage, alt: listing.cardImageAlt}] : [])], sku, title);
  const primaryGtin = parsePrimaryGtin(data);
  const categories = [...new Set([...(data.categoryLinks ?? []), ...(listing.categories ?? []).map(x => x.replace(/-/g, ' '))])].filter(Boolean);
  const attrs = Object.fromEntries((data.attrs ?? []).map(x => [normalize(x.name), normalize(x.value)]).filter(([k]) => k));
  const row = {
    supplier_code: sku,
    gtin: primaryGtin,
    brand: 'POLO',
    model: sku,
    title,
    description: '',
    image_url: images[0]?.url ?? listing.cardImage ?? '',
    source_url: data.canonical || listing.href,
    category: categories.join(' > '),
    price: euro(msrp),
    currency: 'EUR',
    stock: listing.stock,
    variant: '',
    specifications: '',
    compatibility: '',
    source: 'polo-gr',
    source_product_id: normalize(data.postId || listing.postId),
    source_slug: new URL(listing.href).pathname.split('/').filter(Boolean).at(-1) ?? '',
    family_key: familyKey,
    family_title: title,
    variant_code: variantCode,
    variant_label: '',
    color: normalize(data.color),
    size: normalize(data.size),
    capacity_l: capacity ?? '',
    dimensions_text: height && width && depth ? `${height} x ${width} x ${depth} cm` : '',
    height_cm: height ?? '', width_cm: width ?? '', depth_cm: depth ?? '', weight_g: weightG ?? '',
    compartment_count: flags.compartment_count ?? '',
    front_compartment_count: flags.front_compartment_count ?? '',
    laptop_size_in: flags.laptop_size_in ?? '',
    cabin_size: boolText(flags.cabin_size), waterproof_cover: boolText(flags.waterproof_cover), usb_port: boolText(flags.usb_port),
    hidden_pocket: boolText(flags.hidden_pocket), bottle_pocket: boolText(flags.bottle_pocket), breathable_back: boolText(flags.breathable_back),
    ergonomic_straps: boolText(flags.ergonomic_straps), reflective_details: boolText(flags.reflective_details), sbs_zippers: boolText(flags.sbs_zippers),
    detachable_trolley: boolText(flags.detachable_trolley), isothermal_compartment: boolText(flags.isothermal_compartment), organizer: boolText(flags.organizer),
    feature_keys: featureKeys(flags).join('|'),
    attributes_json: JSON.stringify(attrs),
    category_paths: (listing.categories ?? []).join('|'),
    tag_names: (listing.tags ?? []).join('|'),
    msrp: euro(msrp), msrp_minor: msrp !== null ? Math.round(msrp * 100) : '',
    selling_price: '', selling_price_minor: '', regular_price: euro(msrp), regular_price_minor: msrp !== null ? Math.round(msrp * 100) : '',
    sale_price: '', sale_price_minor: '',
    price_kind: msrp !== null ? 'POLO_P.L.T._MSRP' : '', tax_inclusive: 'true', stock_status: listing.stock,
    purchasable: msrp !== null ? 'true' : '', on_sale: 'false',
    sibling_variant_urls: (data.siblings ?? []).join('|'),
    image_urls: images.map(x => x.url).join('|'), image_count: String(images.length),
    gtin_status: primaryGtin ? 'primary_source_verified' : 'pending_external_enrichment',
    gtin_evidence_kind: primaryGtin ? 'polo_product_page_structured_identifier' : '',
    gtin_evidence_url: primaryGtin ? listing.href : '', gtin_evidence_sources: primaryGtin ? listing.href : '',
    description_quality: '', data_quality_flags: '', last_researched_date: researchedDate, crawled_at: crawledAt,
    source_payload_sha256: sha256(JSON.stringify({ listing, title, sku, msrp, capacity, height, width, depth, weightG, flags, attrs, categories, imageUrls: images.map(x => x.url) }))
  };
  row.variant_label = variantLabelFromImages(images, title, sku);
  row.variant = JSON.stringify({ family_key: familyKey, variant_code: variantCode || undefined, label: row.variant_label || undefined, color: row.color || undefined, size: row.size || undefined, sibling_urls: data.siblings ?? [] });
  row.specifications = JSON.stringify({ capacity_l: capacity ?? undefined, dimensions_cm: height && width && depth ? { height, width, depth } : undefined, weight_g: weightG ?? undefined, ...Object.fromEntries(Object.entries(flags).filter(([,v]) => v !== false && v !== null)), attributes: attrs });
  row.description = conciseDescription(row);
  row.description_quality = row.description.length >= 100 ? 'normalized_detailed' : 'normalized_basic';
  const q = [];
  if (!sku) q.push('supplier_code_missing');
  if (!primaryGtin) q.push('gtin_pending_external');
  if (!msrp) q.push('msrp_missing');
  if (!images.length) q.push('images_missing');
  if (!row.color && !row.variant_label) q.push('variant_color_or_label_unresolved');
  if (error) q.push('product_page_fetch_failed');
  row.data_quality_flags = q.join('|');
  if ((index + 1) % 25 === 0 || index + 1 === total) console.log(`[polo] product details ${index + 1}/${total}`);
  return row;
}

async function mapConcurrent(items, limit, fn) {
  const result = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      result[i] = await fn(items[i], i, items.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return result;
}

async function externalGtinFor(context, row, index, total) {
  if (row.gtin || !row.supplier_code) return row;
  const page = await context.newPage();
  const searchUrl = `https://www.book-stores.gr/?post_type=product&s=${encodeURIComponent(row.supplier_code)}`;
  try {
    await safeGoto(page, searchUrl, 2);
    let evidence = await page.evaluate((sku) => {
      const body = (document.body?.innerText ?? '').replace(/\s+/g, ' ').trim();
      const ean = body.match(/EAN\s*:\s*(\d{8,14})/i)?.[1] ?? '';
      const exact = body.includes(sku);
      const candidates = [...document.querySelectorAll('a[href*="/shop/"]')]
        .filter(a => (a.textContent ?? '').includes(sku) || (a.closest('li,article,div')?.textContent ?? '').includes(sku))
        .map(a => a.href.split('#')[0]);
      return { ean, exact, url: location.href, candidates: [...new Set(candidates)].slice(0, 5) };
    }, row.supplier_code);
    if (!(evidence.exact && validGtin(evidence.ean)) && evidence.candidates.length) {
      await safeGoto(page, evidence.candidates[0], 2);
      evidence = await page.evaluate((sku) => {
        const body = (document.body?.innerText ?? '').replace(/\s+/g, ' ').trim();
        return { ean: body.match(/EAN\s*:\s*(\d{8,14})/i)?.[1] ?? '', exact: body.includes(sku), url: location.href, candidates: [] };
      }, row.supplier_code);
    }
    if (evidence.exact && validGtin(evidence.ean)) {
      row.gtin = evidence.ean;
      row.gtin_status = 'external_exact_sku_verified';
      row.gtin_evidence_kind = 'external_retailer_exact_sku_ean';
      row.gtin_evidence_url = evidence.url;
      row.gtin_evidence_sources = evidence.url;
      row.data_quality_flags = row.data_quality_flags.split('|').filter(x => x && x !== 'gtin_pending_external').join('|');
    } else {
      row.gtin_status = 'missing_after_external_enrichment';
    }
  } catch {
    row.gtin_status = 'external_enrichment_failed';
  } finally {
    await page.close();
  }
  if ((index + 1) % 50 === 0 || index + 1 === total) console.log(`[polo] GTIN enrichment ${index + 1}/${total}`);
  return row;
}

function families(rows) {
  const groups = new Map();
  for (const row of rows) groups.set(row.family_key || row.supplier_code, [...(groups.get(row.family_key || row.supplier_code) ?? []), row]);
  return [...groups.entries()].map(([family_key, members]) => {
    const prices = members.map(x => Number(x.msrp)).filter(Number.isFinite);
    return {
      family_key,
      family_title: members[0]?.title ?? '',
      variant_count: members.length,
      variant_codes: members.map(x => x.variant_code).filter(Boolean).join('|'),
      variant_labels: [...new Set(members.map(x => x.variant_label).filter(Boolean))].join('|'),
      colors: [...new Set(members.map(x => x.color).filter(Boolean))].join('|'),
      sizes: [...new Set(members.map(x => x.size).filter(Boolean))].join('|'),
      supplier_codes: members.map(x => x.supplier_code).filter(Boolean).join('|'),
      gtins: members.map(x => x.gtin).filter(Boolean).join('|'),
      min_msrp: prices.length ? Math.min(...prices).toFixed(2) : '',
      max_msrp: prices.length ? Math.max(...prices).toFixed(2) : '',
      image_count: members.reduce((sum, x) => sum + Number(x.image_count || 0), 0),
      source_urls: members.map(x => x.source_url).filter(Boolean).join('|')
    };
  });
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: 'el-GR', timezoneId: 'Europe/Athens', viewport: { width: 1440, height: 1100 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36'
  });
  try {
    const discovered = await discover(context);
    await writeFile(`${OUT}/polo-discovery.json`, JSON.stringify(discovered, null, 2) + '\n', 'utf8');
    console.log(`[polo] discovered ${discovered.products.length} product variants`);
    let rows = await mapConcurrent(discovered.products, PRODUCT_CONCURRENCY, (item, i, total) => enrichOne(context, item, i, total));
    const gtinTargets = rows.filter(x => !x.gtin && x.supplier_code);
    console.log(`[polo] primary GTIN missing for ${gtinTargets.length}; starting exact-SKU retailer enrichment`);
    await mapConcurrent(gtinTargets, GTIN_CONCURRENCY, (row, i, total) => externalGtinFor(context, row, i, total));

    rows.sort((a, b) => (a.family_key || '').localeCompare(b.family_key || '') || (a.variant_code || '').localeCompare(b.variant_code || ''));
    const familyRows = families(rows);
    const missingGtin = rows.filter(x => !x.gtin);
    const quality = rows.filter(x => x.data_quality_flags);
    const duplicateSku = [...new Set(rows.map(x => x.supplier_code).filter((sku, i, all) => sku && all.indexOf(sku) !== i))];
    const duplicateGtin = [...new Set(rows.map(x => x.gtin).filter((gtin, i, all) => gtin && all.indexOf(gtin) !== i))];
    const invalidGtin = rows.filter(x => x.gtin && !validGtin(x.gtin)).map(x => x.gtin);
    const summary = {
      source: SOURCE,
      crawledAt,
      discovery: 'Playwright-rendered POLO catalogue pagination',
      listingPagesVisited: discovered.listingPages.length,
      productCount: rows.length,
      familyCount: familyRows.length,
      withSupplierCode: rows.filter(x => x.supplier_code).length,
      withGtin: rows.filter(x => x.gtin).length,
      primarySourceGtins: rows.filter(x => x.gtin_status === 'primary_source_verified').length,
      externallyVerifiedGtins: rows.filter(x => x.gtin_status === 'external_exact_sku_verified').length,
      missingGtin: missingGtin.length,
      withImages: rows.filter(x => x.image_url).length,
      totalImages: rows.reduce((sum, x) => sum + Number(x.image_count || 0), 0),
      withMsrp: rows.filter(x => x.msrp).length,
      withCapacity: rows.filter(x => x.capacity_l !== '').length,
      withDimensions: rows.filter(x => x.dimensions_text).length,
      withWeight: rows.filter(x => x.weight_g !== '').length,
      withColor: rows.filter(x => x.color).length,
      withVariantLabel: rows.filter(x => x.variant_label).length,
      qualityReviewRows: quality.length,
      duplicateSku,
      duplicateGtin,
      invalidGtin,
      canonicalHeaders,
      richHeaders,
      policies: {
        descriptions: 'Normalized factual descriptions generated from POLO product facts; long supplier prose is not copied.',
        variants: 'One POLO sellable catalogue card/SKU per row; SKU prefix groups canonical family and suffix identifies the design/color variant.',
        gtin: 'Checksum-valid GTIN only. POLO structured identifiers are preferred; missing values are enriched only by exact SKU matches that explicitly publish an EAN.',
        pricing: 'POLO Π.Λ.Τ. is stored as MSRP/list retail price. It is also placed in canonical price for import compatibility; selling_price remains blank unless a distinct selling price is present.',
        media: 'Image URLs are preserved as source references; images are not copied into the repository.'
      }
    };

    const familyHeaders = ['family_key','family_title','variant_count','variant_codes','variant_labels','colors','sizes','supplier_codes','gtins','min_msrp','max_msrp','image_count','source_urls'];
    await writeFile(`${OUT}/polo-master.csv`, toCsv(rows), 'utf8');
    await writeFile(`${OUT}/polo-master.jsonl`, rows.map(x => JSON.stringify(x)).join('\n') + '\n', 'utf8');
    await writeFile(`${OUT}/polo-families.csv`, toCsv(familyRows, familyHeaders), 'utf8');
    await writeFile(`${OUT}/polo-gtin-missing.csv`, toCsv(missingGtin), 'utf8');
    await writeFile(`${OUT}/polo-quality-review.csv`, toCsv(quality), 'utf8');
    await writeFile(`${OUT}/polo-crawl-summary.json`, JSON.stringify(summary, null, 2) + '\n', 'utf8');
    console.log(JSON.stringify(summary, null, 2));
    if (duplicateSku.length || duplicateGtin.length || invalidGtin.length) process.exitCode = 3;
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch(error => {
  console.error('[polo] browser crawl failed', error);
  process.exitCode = 1;
});
