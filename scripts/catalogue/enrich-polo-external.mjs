import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const OUT = 'data/imports/polo';
const CONCURRENCY = 5;
const TIMEOUT = 45_000;
const researchedAt = new Date().toISOString();
const normalize = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const lower = (v) => normalize(v).toLocaleLowerCase('el-GR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const sha256 = (v) => createHash('sha256').update(String(v)).digest('hex');
const uniq = (values) => [...new Set(values.filter(Boolean))];
const csvCell = (v) => {
  let s = v === null || v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v);
  s = s.replace(/\r?\n/g, ' ');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows, headers) => [headers.join(','), ...rows.map((r) => headers.map((h) => csvCell(r[h])).join(','))].join('\n') + '\n';

function validGtin(candidate) {
  const digits = String(candidate ?? '').replace(/\D/g, '');
  if (![8, 12, 13, 14].includes(digits.length)) return false;
  const body = digits.slice(0, -1).split('').reverse().map(Number);
  const sum = body.reduce((acc, digit, i) => acc + digit * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === Number(digits.at(-1));
}
function gtinFromJsonLd(html) {
  const results = [];
  for (const match of String(html).matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(match[1]);
      const walk = (value, path = []) => {
        if (Array.isArray(value)) return value.forEach((x, i) => walk(x, [...path, String(i)]));
        if (!value || typeof value !== 'object') return;
        for (const [key, child] of Object.entries(value)) {
          if (/^(gtin|gtin8|gtin12|gtin13|gtin14|ean|ean13|barcode|upc)$/i.test(key)) {
            const digits = String(child ?? '').replace(/\D/g, '');
            if (validGtin(digits)) results.push({ gtin: digits, kind: 'json_ld', path: [...path, key].join('.') });
          }
          if (child && typeof child === 'object') walk(child, [...path, key]);
        }
      };
      walk(parsed);
    } catch {}
  }
  return results;
}
function explicitHtmlGtins(html) {
  const text = String(html);
  const out = [];
  const patterns = [
    /(?:GTIN(?:-?13)?|EAN(?:-?13)?|ISBN-Barcode|Barcode|Bar\s*Code|Κωδικός\s*EAN)\s*[:#-]?\s*(\d{8,14})/gi,
    /["'](?:gtin13|gtin|ean13|ean|barcode)["']\s*[:=]\s*["']?(\d{8,14})/gi
  ];
  for (const re of patterns) for (const m of text.matchAll(re)) if (validGtin(m[1])) out.push({ gtin: m[1], kind: 'explicit_html' });
  return out;
}
function productImageGtins(html) {
  // BestPrice frequently exposes the canonical EAN in product-image alt/metadata.
  const out = [];
  for (const m of String(html).matchAll(/<img\b[^>]*(?:alt|title)=["'][^"']*\[(\d{8,14})\][^"']*["'][^>]*>/gi)) {
    if (validGtin(m[1])) out.push({ gtin: m[1], kind: 'product_image_metadata' });
  }
  return out;
}
function chooseGtin(evidence) {
  const by = new Map();
  for (const item of evidence) by.set(item.gtin, [...(by.get(item.gtin) || []), item]);
  if (by.size === 1) {
    const [gtin, items] = [...by.entries()][0];
    return { gtin, status: 'verified_exact_sku', items };
  }
  if (by.size > 1) return { gtin: '', status: 'conflict', conflicts: [...by.keys()] };
  return { gtin: '', status: 'missing' };
}

const COLOR_RULES = [
  ['Μαύρο', /\b(μαυρ\w*|black)\b/i], ['Μπλε', /\b(μπλε|blue|navy)\b/i], ['Κόκκινο', /\b(κοκκιν\w*|red)\b/i],
  ['Ροζ', /\b(ροζ|pink)\b/i], ['Λιλά', /\b(λιλα|lilac)\b/i], ['Μωβ', /\b(μωβ|μοβ|purple|violet)\b/i],
  ['Πράσινο', /\b(πρασιν\w*|green)\b/i], ['Χακί', /\b(χακι|khaki)\b/i], ['Γκρι', /\b(γκρι|grey|gray)\b/i],
  ['Μπεζ', /\b(μπεζ|beige)\b/i], ['Λευκό', /\b(λευκ\w*|white)\b/i], ['Πορτοκαλί', /\b(πορτοκαλι|orange)\b/i],
  ['Κίτρινο', /\b(κιτριν\w*|yellow)\b/i], ['Καφέ', /\b(καφε|brown)\b/i], ['Τιρκουάζ', /\b(τιρκουαζ|turquoise|aqua)\b/i],
  ['Πολύχρωμο', /\b(πολυχρωμ\w*|multicolou?r(?:ed)?)\b/i], ['Διάφανο', /\b(διαφαν\w*|clear|transparent)\b/i]
];
function colorFromText(text) {
  const normalized = lower(text);
  for (const [label, re] of COLOR_RULES) if (re.test(normalized)) return label;
  return '';
}
function cleanExternalTitle(title, sku) {
  return normalize(title).replace(new RegExp(`\\s*[-–|]?\\s*${sku.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i'), '').trim();
}
function designFromTitle(externalTitle, poloTitle, sku) {
  const ext = cleanExternalTitle(externalTitle, sku);
  if (!ext) return '';
  const baseTokens = new Set(lower(poloTitle).split(/\s+/).filter((x) => x.length > 2));
  const colorWords = new Set(COLOR_RULES.flatMap(([label]) => lower(label).split(/\s+/)));
  const tokens = ext.split(/\s+/).filter(Boolean);
  const candidates = tokens.filter((token) => {
    const n = lower(token).replace(/[^a-z0-9α-ω-]/g, '');
    if (!n || n.length < 3 || baseTokens.has(n) || colorWords.has(n)) return false;
    if (/^(polo|bag|backpack|school|scholiki|sxoliki|tsanta|trolley|sakidio|platis|dimotikou|gymnasiou|lykeiou|με|apospomen|μηχανισμ|base|free)$/i.test(n)) return false;
    return /^[A-Za-z][A-Za-z0-9-]{2,}$/.test(token.replace(/[(),]/g, ''));
  });
  // Product series/design names on POLO retailer pages are normally short English tokens.
  return uniq(candidates).slice(0, 3).join(' ');
}

async function goto(page, url, attempts = 2) {
  let last;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
      await page.waitForTimeout(250);
      return response;
    } catch (error) { last = error; await page.waitForTimeout(500 * (i + 1)); }
  }
  throw last;
}
async function parseCurrent(page, sku) {
  return page.evaluate((targetSku) => {
    const norm = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
    const body = norm(document.body?.innerText || '');
    const h1 = norm(document.querySelector('h1')?.textContent || '');
    const html = document.documentElement?.outerHTML || '';
    const anchors = [...document.querySelectorAll('a[href]')].map((a) => ({ href: a.href, text: norm(a.textContent) }));
    const exactLinks = anchors.filter((a) => a.text.includes(targetSku) || a.href.toLowerCase().includes(targetSku.toLowerCase()));
    return { url: location.href, title: h1 || document.title, body, html, exactLinks };
  }, sku);
}

async function bestPrice(page, row) {
  const searchUrl = `https://www.bestprice.gr/search?q=${encodeURIComponent(row.supplier_code)}`;
  try {
    await goto(page, searchUrl);
    let data = await parseCurrent(page, row.supplier_code);
    if (!data.body.includes(row.supplier_code) && !data.url.includes(row.supplier_code)) return null;
    if (!/\/item\//.test(data.url)) {
      const candidates = data.exactLinks.filter((x) => /bestprice\.gr\/item\//.test(x.href));
      if (!candidates.length) return { source: 'bestprice', searchUrl, matched: true, noProductPage: true, title: data.title };
      await goto(page, candidates[0].href);
      data = await parseCurrent(page, row.supplier_code);
    }
    if (!data.body.includes(row.supplier_code) && !data.url.includes(row.supplier_code)) return null;
    const gtinEvidence = [...gtinFromJsonLd(data.html), ...explicitHtmlGtins(data.html), ...productImageGtins(data.html)];
    return {
      source: 'bestprice', searchUrl, productUrl: data.url, matched: true, title: data.title,
      color: colorFromText(data.title), design: designFromTitle(data.title, row.title, row.supplier_code), gtinEvidence
    };
  } catch (error) { return { source: 'bestprice', searchUrl, error: String(error?.message || error) }; }
}
async function nprokos(page, row) {
  const searchUrl = `https://nprokos.gr/?s=${encodeURIComponent(row.supplier_code)}&post_type=product`;
  try {
    await goto(page, searchUrl);
    let data = await parseCurrent(page, row.supplier_code);
    if (!data.body.includes(row.supplier_code) || /δεν βρέθηκε κανένα προϊόν|τίποτα δεν ταιριάζει/i.test(data.body)) return null;
    if (!/\/product\//.test(data.url)) {
      const candidates = data.exactLinks.filter((x) => /nprokos\.gr\/(?:product|shop)\//.test(x.href));
      if (candidates.length) { await goto(page, candidates[0].href); data = await parseCurrent(page, row.supplier_code); }
    }
    const gtinEvidence = [...gtinFromJsonLd(data.html), ...explicitHtmlGtins(data.html), ...productImageGtins(data.html)];
    const colorMatch = data.body.match(/(?:Χρώμα|Διαθέσιμα χρώματα)\s*:?\s*([Α-ΩA-ZΆ-ώa-z]+)\b/i)?.[1] || '';
    return {
      source: 'nprokos', searchUrl, productUrl: data.url, matched: true, title: data.title,
      color: colorFromText(colorMatch) || colorFromText(data.title), design: designFromTitle(data.title, row.title, row.supplier_code), gtinEvidence
    };
  } catch (error) { return { source: 'nprokos', searchUrl, error: String(error?.message || error) }; }
}
async function domino(page, row) {
  const searchUrl = `https://dominoshop.gr/?s=${encodeURIComponent(row.supplier_code)}&post_type=product`;
  try {
    await goto(page, searchUrl);
    const data = await parseCurrent(page, row.supplier_code);
    if (!data.body.includes(row.supplier_code)) return null;
    const gtinEvidence = [...gtinFromJsonLd(data.html), ...explicitHtmlGtins(data.html), ...productImageGtins(data.html)];
    const colorMatch = data.body.match(/Χρώμα\s*:?\s*([Α-ΩA-ZΆ-ώa-z]+)\b/i)?.[1] || '';
    return {
      source: 'domino', searchUrl, productUrl: data.url, matched: true, title: data.title,
      color: colorFromText(colorMatch) || colorFromText(data.title), design: designFromTitle(data.title, row.title, row.supplier_code), gtinEvidence
    };
  } catch (error) { return { source: 'domino', searchUrl, error: String(error?.message || error) }; }
}

async function enrichOne(context, row, index, total) {
  const page = await context.newPage();
  const evidence = [];
  try {
    const bp = await bestPrice(page, row); if (bp) evidence.push(bp);
    const bpGtin = chooseGtin(bp?.gtinEvidence || []);
    const needsMoreGtin = !row.gtin && !bpGtin.gtin;
    const needsMoreLabel = !bp?.design || !bp?.color;
    if (needsMoreGtin || needsMoreLabel) {
      const np = await nprokos(page, row); if (np) evidence.push(np);
    }
    const allGtinEvidence = evidence.flatMap((x) => (x.gtinEvidence || []).map((g) => ({ ...g, source: x.source, url: x.productUrl || x.searchUrl })));
    let chosen = chooseGtin(allGtinEvidence);
    if (!row.gtin && !chosen.gtin && (chosen.status === 'missing' || chosen.status === 'conflict')) {
      const dm = await domino(page, row); if (dm) evidence.push(dm);
      const combined = evidence.flatMap((x) => (x.gtinEvidence || []).map((g) => ({ ...g, source: x.source, url: x.productUrl || x.searchUrl })));
      chosen = chooseGtin(combined);
    }

    const flags = new Set(String(row.data_quality_flags || '').split('|').filter(Boolean));
    if (!row.gtin) {
      if (chosen.gtin) {
        row.gtin = chosen.gtin;
        row.gtin_status = 'externally_verified_exact_sku';
        row.gtin_evidence_kind = uniq(chosen.items.map((x) => x.kind)).join('|');
        row.gtin_evidence_url = chosen.items[0]?.url || '';
        row.gtin_evidence_sources = uniq(chosen.items.map((x) => `${x.source}:${x.url}`)).join('|');
        flags.delete('gtin_pending_external'); flags.delete('missing_gtin');
      } else if (chosen.status === 'conflict') {
        row.gtin_status = 'external_conflict_review';
        row.gtin_evidence_sources = chosen.conflicts.join('|');
        flags.add('gtin_external_conflict');
      }
    }

    const designEvidence = evidence.filter((x) => x.design).map((x) => ({ value: x.design, source: x.source, url: x.productUrl || x.searchUrl }));
    const designValues = uniq(designEvidence.map((x) => lower(x.value)));
    if (designValues.length === 1) {
      row.variant_label = designEvidence[0].value;
      row.variant_label_status = designEvidence.length > 1 ? 'externally_confirmed_multi_source' : 'externally_verified_exact_sku';
      row.variant_label_evidence_url = designEvidence[0].url;
      flags.delete('variant_label_pending_external');
    } else if (designValues.length > 1) {
      row.variant_label_status = 'external_conflict_review'; flags.add('variant_label_external_conflict');
    }

    const colorEvidence = evidence.filter((x) => x.color).map((x) => ({ value: x.color, source: x.source, url: x.productUrl || x.searchUrl }));
    const colorValues = uniq(colorEvidence.map((x) => lower(x.value)));
    if (colorValues.length === 1) {
      row.color = colorEvidence[0].value;
      row.color_status = colorEvidence.length > 1 ? 'externally_confirmed_multi_source' : 'externally_verified_exact_sku';
      row.color_evidence_url = colorEvidence[0].url;
      flags.delete('color_pending_external');
    } else if (colorValues.length > 1) {
      row.color_status = 'external_conflict_review'; flags.add('color_external_conflict');
    }

    row.external_evidence_json = JSON.stringify(evidence.map((x) => ({
      source: x.source, url: x.productUrl || x.searchUrl, title: x.title || '', color: x.color || '', design: x.design || '',
      gtins: uniq((x.gtinEvidence || []).map((g) => g.gtin)), error: x.error || ''
    })));
    row.external_researched_at = researchedAt;
    row.data_quality_flags = [...flags].join('|');
    row.source_payload_sha256 = sha256(JSON.stringify({ prior: row.source_payload_sha256, gtin: row.gtin, color: row.color, variant: row.variant_label, evidence: row.external_evidence_json }));
  } finally { await page.close(); }
  if ((index + 1) % 25 === 0 || index + 1 === total) console.log(`[polo] external enrichment ${index + 1}/${total}`);
  return row;
}
async function mapConcurrent(items, limit, fn) {
  const out = new Array(items.length); let cursor = 0;
  async function worker() { while (true) { const i = cursor++; if (i >= items.length) return; out[i] = await fn(items[i], i, items.length); } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker)); return out;
}
function buildFamilies(rows) {
  const groups = new Map(); for (const row of rows) groups.set(row.family_key, [...(groups.get(row.family_key) || []), row]);
  return [...groups.entries()].map(([family_key, members]) => {
    const prices = members.map((x) => Number(x.msrp)).filter(Number.isFinite);
    return {
      family_key, family_title: members[0]?.title || '', brands: uniq(members.map((x) => x.brand)).join('|'), variant_count: members.length,
      variant_codes: members.map((x) => x.variant_code).filter(Boolean).join('|'), variant_labels: uniq(members.map((x) => x.variant_label).filter(Boolean)).join('|'),
      colors: uniq(members.map((x) => x.color).filter(Boolean)).join('|'), sizes: uniq(members.map((x) => x.size).filter(Boolean)).join('|'),
      supplier_codes: members.map((x) => x.supplier_code).filter(Boolean).join('|'), gtins: members.map((x) => x.gtin).filter(Boolean).join('|'),
      min_msrp: prices.length ? Math.min(...prices).toFixed(2) : '', max_msrp: prices.length ? Math.max(...prices).toFixed(2) : '',
      image_count: members.reduce((sum, x) => sum + Number(x.image_count || 0), 0), source_urls: members.map((x) => x.source_url).filter(Boolean).join('|')
    };
  });
}

async function main() {
  let rows = (await readFile(`${OUT}/polo-master.jsonl`, 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  const existingHeaders = (await readFile(`${OUT}/polo-master.csv`, 'utf8')).split(/\r?\n/, 1)[0].split(',');
  const extra = ['variant_label_evidence_url','color_evidence_url','external_evidence_json','external_researched_at'];
  const headers = [...existingHeaders, ...extra.filter((x) => !existingHeaders.includes(x))];
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: 'el-GR', timezoneId: 'Europe/Athens', viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36'
  });
  try { rows = await mapConcurrent(rows, CONCURRENCY, (row, i, total) => enrichOne(context, row, i, total)); }
  finally { await context.close(); await browser.close(); }

  const families = buildFamilies(rows);
  const familyHeaders = ['family_key','family_title','brands','variant_count','variant_codes','variant_labels','colors','sizes','supplier_codes','gtins','min_msrp','max_msrp','image_count','source_urls'];
  const missing = rows.filter((r) => !r.gtin);
  const quality = rows.filter((r) => r.data_quality_flags);
  const summary = JSON.parse(await readFile(`${OUT}/polo-crawl-summary.json`, 'utf8'));
  summary.externalEnrichment = {
    completedAt: researchedAt,
    policy: 'Exact supplier SKU must be present on the external result/product page. GTIN must be checksum-valid and explicitly exposed in structured/labelled product metadata. Multiple differing valid GTINs are quarantined as conflicts.',
    sources: ['BestPrice exact-SKU search/product', 'NProkos exact-SKU search/product', 'Domino exact-SKU fallback'],
    withGtin: rows.filter((r) => r.gtin).length,
    missingGtin: missing.length,
    withColor: rows.filter((r) => r.color).length,
    withHumanVariantLabel: rows.filter((r) => r.variant_label && r.variant_label !== r.variant_code).length,
    gtinConflicts: rows.filter((r) => r.gtin_status === 'external_conflict_review').length,
    colorConflicts: rows.filter((r) => r.color_status === 'external_conflict_review').length,
    variantLabelConflicts: rows.filter((r) => r.variant_label_status === 'external_conflict_review').length
  };
  summary.withGtin = summary.externalEnrichment.withGtin;
  summary.missingGtin = missing.length;
  summary.withColor = summary.externalEnrichment.withColor;
  summary.withVariantLabel = rows.filter((r) => r.variant_label).length;
  summary.qualityReviewRows = quality.length;
  await writeFile(`${OUT}/polo-master.csv`, toCsv(rows, headers), 'utf8');
  await writeFile(`${OUT}/polo-master.jsonl`, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  await writeFile(`${OUT}/polo-families.csv`, toCsv(families, familyHeaders), 'utf8');
  await writeFile(`${OUT}/polo-gtin-missing.csv`, toCsv(missing, headers), 'utf8');
  await writeFile(`${OUT}/polo-quality-review.csv`, toCsv(quality, headers), 'utf8');
  await writeFile(`${OUT}/polo-crawl-summary.json`, JSON.stringify(summary, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify(summary.externalEnrichment, null, 2));
}
main().catch((error) => { console.error('[polo] external enrichment failed', error); process.exitCode = 1; });
