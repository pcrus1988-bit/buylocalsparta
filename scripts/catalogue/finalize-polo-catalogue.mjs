import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const OUT = 'data/imports/polo';
const CONCURRENCY = 4;
const PAGE_TIMEOUT = 60_000;
const normalize = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const sha256 = (v) => createHash('sha256').update(String(v)).digest('hex');
const csvCell = (v) => {
  let s = v === null || v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v);
  s = s.replace(/\r?\n/g, ' ');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows, headers) => [headers.join(','), ...rows.map((row) => headers.map((h) => csvCell(row[h])).join(','))].join('\n') + '\n';

// These are only used as exact title-suffix fallbacks after structured/visible
// product-page evidence has been exhausted. They are never inferred fuzzily.
const KNOWN_EXTERNAL_BRANDS = [
  'LAKEN', 'SALEWA', 'DEUTER', 'PETZL', 'LEATHERMAN', 'VICTORINOX',
  'CAMELBAK', 'NITE IZE', 'PRIMUS', 'COLEMAN', 'EDELRID', 'LOWA',
  'BUFF', 'SIGG', 'THERMOS'
];

async function safeGoto(page, url, attempts = 3) {
  let last;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });
      await page.waitForTimeout(300);
      return response;
    } catch (error) {
      last = error;
      await page.waitForTimeout(500 * i * i);
    }
  }
  throw last;
}

function cleanBrand(value) {
  const v = normalize(value).replace(/^brand\s*:?\s*/i, '').replace(/^μάρκα\s*:?\s*/i, '').replace(/^κατασκευαστής\s*:?\s*/i, '');
  if (!v || v.length > 80 || /^(n\/a|none|null|undefined|-|product)$/i.test(v)) return '';
  return v;
}

function titleSuffixBrand(title) {
  const upperTitle = normalize(title).toLocaleUpperCase('en-US');
  return KNOWN_EXTERNAL_BRANDS.find((brand) => upperTitle.endsWith(` ${brand}`) || upperTitle === brand) ?? '';
}

function brandEvaluator() {
  const norm = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
  const jsonLdTexts = [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent || '').filter(Boolean);
  const candidates = [];
  const add = (value, kind) => {
    if (typeof value === 'string' && value.trim()) candidates.push({ value: norm(value), kind });
    else if (value && typeof value === 'object') {
      const name = value.name || value.legalName || value['@id'] || '';
      if (typeof name === 'string' && name.trim()) candidates.push({ value: norm(name), kind });
    }
  };
  const walk = (value) => {
    if (!value) return;
    if (Array.isArray(value)) return value.forEach(walk);
    if (typeof value !== 'object') return;
    const type = value['@type'];
    const types = Array.isArray(type) ? type : [type];
    if (types.some((t) => /Product/i.test(String(t)))) {
      add(value.brand, 'json_ld_brand');
      add(value.manufacturer, 'json_ld_manufacturer');
    }
    if (value['@graph']) walk(value['@graph']);
    for (const child of Object.values(value)) if (child && typeof child === 'object') walk(child);
  };
  for (const raw of jsonLdTexts) {
    try { walk(JSON.parse(raw)); } catch {}
  }

  for (const row of document.querySelectorAll('.woocommerce-product-attributes-item, tr')) {
    const label = norm(row.querySelector('.woocommerce-product-attributes-item__label, th')?.textContent || '');
    const value = norm(row.querySelector('.woocommerce-product-attributes-item__value, td')?.textContent || '');
    if (/^(brand|manufacturer|μάρκα|κατασκευαστής|εταιρεία)\b/i.test(label) && value) candidates.push({ value, kind: 'product_attribute' });
  }

  const selectors = [
    '[itemprop="brand"]', '.pwb-single-product-brands', '.product_brand',
    '[class*="product-brand"]', '[class*="product_brand"]',
    'a[href*="/product-brand/"]', 'a[href*="/brand/"]'
  ];
  for (const selector of selectors) {
    for (const el of document.querySelectorAll(selector)) {
      const value = norm(el.getAttribute?.('content') || el.textContent || '');
      if (value) candidates.push({ value, kind: `dom:${selector}` });
    }
  }

  return {
    candidates,
    title: norm(document.querySelector('h1')?.textContent || document.title),
    canonical: document.querySelector('link[rel="canonical"]')?.href || location.href
  };
}

async function resolveBrand(context, row, index, total) {
  const page = await context.newPage();
  let evidence = null;
  let fetchFailed = false;
  try {
    await safeGoto(page, row.source_url);
    const data = await page.evaluate(brandEvaluator);
    for (const candidate of data.candidates) {
      const brand = cleanBrand(candidate.value);
      if (!brand) continue;
      // Reject generic site/UI labels and URLs accidentally captured as brands.
      if (/polo\.gr|homepage|home|shop|κατάστημα|προϊόν/i.test(brand) || /^https?:/i.test(brand)) continue;
      evidence = { brand, kind: candidate.kind, value: candidate.value };
      break;
    }
  } catch {
    fetchFailed = true;
  } finally {
    await page.close();
  }

  if (!evidence) {
    const suffix = titleSuffixBrand(row.title);
    if (suffix) evidence = { brand: suffix, kind: 'exact_known_brand_title_suffix', value: suffix };
  }
  if (!evidence) evidence = { brand: 'POLO', kind: 'source_owner_default', value: 'POLO' };

  row.brand = evidence.brand;
  row.brand_evidence_kind = evidence.kind;
  row.brand_evidence_value = evidence.value;
  row.brand_status = evidence.kind === 'source_owner_default' ? 'defaulted_reviewable' : 'page_or_title_verified';

  // Fix the original hard-coded POLO wording for represented brands as well.
  const parts = [`${row.title} της ${row.brand}`];
  if (row.capacity_l) parts.push(`χωρητικότητας ${row.capacity_l} L`);
  if (row.height_cm && row.width_cm && row.depth_cm) parts.push(`με διαστάσεις ${row.height_cm}×${row.width_cm}×${row.depth_cm} cm`);
  if (row.weight_g) parts.push(`και βάρος ${row.weight_g} g`);
  const features = [];
  const addFeature = (condition, label) => { if (condition) features.push(label); };
  addFeature(row.detachable_trolley === 'true', 'αποσπώμενο μηχανισμό τρόλεϊ');
  addFeature(row.breathable_back === 'true', 'αεριζόμενη/ανατομική πλάτη');
  addFeature(row.ergonomic_straps === 'true', 'εργονομικούς ιμάντες');
  addFeature(row.waterproof_cover === 'true', 'κάλυμμα βροχής');
  addFeature(row.reflective_details === 'true', 'ανακλαστικές λεπτομέρειες');
  addFeature(row.bottle_pocket === 'true', 'θήκη παγουριού');
  addFeature(row.usb_port === 'true', 'θύρα USB');
  addFeature(row.laptop_size_in, `θήκη laptop έως ${row.laptop_size_in}″`);
  if (features.length) parts.push(`με ${features.slice(0, 5).join(', ')}`);
  let description = parts.join(', ').replace(/, με /, ' με ');
  if (!/[.!?]$/.test(description)) description += '.';
  if (row.supplier_code) description += ` Κωδικός προϊόντος: ${row.supplier_code}.`;
  row.description = description;
  row.description_quality = row.description.length >= 100 ? 'normalized_detailed' : 'normalized_basic';

  const flags = new Set(String(row.data_quality_flags || '').split('|').filter(Boolean));
  if (row.brand_status === 'defaulted_reviewable') flags.add('brand_defaulted_to_source_owner');
  else flags.delete('brand_defaulted_to_source_owner');
  if (fetchFailed) flags.add('brand_page_fetch_failed');
  row.data_quality_flags = [...flags].join('|');
  row.source_payload_sha256 = sha256(JSON.stringify({
    supplier_code: row.supplier_code,
    source_url: row.source_url,
    brand: row.brand,
    brand_evidence_kind: row.brand_evidence_kind,
    brand_evidence_value: row.brand_evidence_value,
    title: row.title,
    description: row.description,
    prior_payload_hash: row.source_payload_sha256
  }));

  if ((index + 1) % 50 === 0 || index + 1 === total) console.log(`[polo] brand finalization ${index + 1}/${total}`);
  return row;
}

async function mapConcurrent(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      out[index] = await fn(items[index], index, items.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

function buildFamilies(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = row.family_key || row.supplier_code;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()].map(([family_key, members]) => {
    const prices = members.map((x) => Number(x.msrp)).filter(Number.isFinite);
    return {
      family_key,
      family_title: members[0]?.title ?? '',
      brands: [...new Set(members.map((x) => x.brand).filter(Boolean))].join('|'),
      variant_count: members.length,
      variant_codes: members.map((x) => x.variant_code).filter(Boolean).join('|'),
      variant_labels: [...new Set(members.map((x) => x.variant_label).filter(Boolean))].join('|'),
      colors: [...new Set(members.map((x) => x.color).filter(Boolean))].join('|'),
      sizes: [...new Set(members.map((x) => x.size).filter(Boolean))].join('|'),
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
  const jsonl = await readFile(`${OUT}/polo-master.jsonl`, 'utf8');
  let rows = jsonl.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  if (!rows.length) throw new Error('POLO master JSONL is empty');

  const csvHeaderLine = (await readFile(`${OUT}/polo-master.csv`, 'utf8')).split(/\r?\n/, 1)[0];
  const headers = csvHeaderLine.split(',');
  for (const extra of ['brand_status', 'brand_evidence_kind', 'brand_evidence_value']) if (!headers.includes(extra)) headers.push(extra);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: 'el-GR', timezoneId: 'Europe/Athens', viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36'
  });
  try {
    rows = await mapConcurrent(rows, CONCURRENCY, (row, index, total) => resolveBrand(context, row, index, total));
  } finally {
    await context.close();
    await browser.close();
  }

  const familyRows = buildFamilies(rows);
  const familyHeaders = ['family_key','family_title','brands','variant_count','variant_codes','variant_labels','colors','sizes','supplier_codes','gtins','min_msrp','max_msrp','image_count','source_urls'];
  const quality = rows.filter((row) => row.data_quality_flags);
  const missingGtin = rows.filter((row) => !row.gtin);

  const summaryPath = `${OUT}/polo-crawl-summary.json`;
  const summary = JSON.parse(await readFile(summaryPath, 'utf8'));
  const brandCounts = Object.fromEntries([...new Set(rows.map((r) => r.brand).filter(Boolean))].sort().map((brand) => [brand, rows.filter((r) => r.brand === brand).length]));
  summary.brandFinalization = {
    completedAt: new Date().toISOString(),
    brandCounts,
    distinctBrands: Object.keys(brandCounts).length,
    explicitOrTitleVerified: rows.filter((r) => r.brand_status === 'page_or_title_verified').length,
    sourceOwnerDefaulted: rows.filter((r) => r.brand_status === 'defaulted_reviewable').length,
    policy: 'Structured Product.brand/manufacturer or explicit product attribute/brand element is preferred. Exact known-brand title suffix is a fallback. POLO source-owner default remains reviewable rather than silently asserted.'
  };
  summary.qualityReviewRows = quality.length;

  await writeFile(`${OUT}/polo-master.csv`, toCsv(rows, headers), 'utf8');
  await writeFile(`${OUT}/polo-master.jsonl`, rows.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');
  await writeFile(`${OUT}/polo-families.csv`, toCsv(familyRows, familyHeaders), 'utf8');
  await writeFile(`${OUT}/polo-quality-review.csv`, toCsv(quality, headers), 'utf8');
  await writeFile(`${OUT}/polo-gtin-missing.csv`, toCsv(missingGtin, headers), 'utf8');
  await writeFile(summaryPath, JSON.stringify(summary, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify(summary.brandFinalization, null, 2));
}

main().catch((error) => {
  console.error('[polo] finalization failed', error);
  process.exitCode = 1;
});
