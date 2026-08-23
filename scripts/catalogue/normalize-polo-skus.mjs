import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';

const OUT = 'data/imports/polo';
const TIMEOUT = 60_000;
const normalize = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const validSku = (v) => /^\d[A-Z0-9]*-[A-Z0-9/]+$/i.test(normalize(v));
const csvCell = (v) => {
  let s = v === null || v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v);
  s = s.replace(/\r?\n/g, ' ');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows, headers) => [headers.join(','), ...rows.map((r) => headers.map((h) => csvCell(r[h])).join(','))].join('\n') + '\n';

function parts(sku) {
  const p = normalize(sku).split('-').filter(Boolean);
  return { family: p.length > 1 ? p.slice(0, -1).join('-') : normalize(sku), variant: p.length > 1 ? p.at(-1) : '' };
}
function parseImageUrls(row) {
  const out = [row.image_url];
  const raw = row.image_urls;
  if (Array.isArray(raw)) out.push(...raw);
  else if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) out.push(...parsed);
      else out.push(raw);
    } catch { out.push(raw); }
  }
  return [...new Set(out.map(normalize).filter(Boolean))];
}
function recoverFromFirstPartyEvidence(row, allRows) {
  // POLO's own media filenames use the supplier code as a prefix. This is
  // stronger than reconstructing the code from a retailer or fuzzy title.
  for (const url of parseImageUrls(row)) {
    if (!/^https?:\/\/(?:www\.)?polo\.gr\//i.test(url)) continue;
    let filename = '';
    try { filename = decodeURIComponent(new URL(url).pathname.split('/').pop() || ''); } catch {}
    const matches = [
      filename.match(/(?:^|[^0-9A-Z])(\d{6}-[A-Z])(?=[-_.])/i)?.[1],
      filename.match(/(?:^|[^0-9A-Z])(\d{6}-\d{2,5})(?=[-_.])/i)?.[1],
      filename.match(/(?:^|[^0-9A-Z])(\d[A-Z0-9]{4,}-[A-Z0-9/]+)(?=[_.])/i)?.[1]
    ].filter(Boolean);
    const candidate = matches.find(validSku);
    if (candidate) return { sku: candidate.toUpperCase(), evidence: `official_polo_media:${url}` };
  }

  // Secondary first-party fallback: corroborate a valid sibling family with
  // the variant suffix embedded in this POLO product URL.
  const title = normalize(row.title).toLocaleLowerCase('el-GR');
  const siblings = allRows.filter((r) => r !== row && validSku(r.supplier_code) && normalize(r.title).toLocaleLowerCase('el-GR') === title);
  const families = [...new Set(siblings.map((r) => parts(r.supplier_code).family).filter(Boolean))];
  const slug = (() => { try { return new URL(row.source_url).pathname.replace(/\/$/, '').split('/').pop() || ''; } catch { return ''; } })();
  const suffix = slug.match(/-laken-([a-z0-9/]+)$/i)?.[1] || '';
  if (families.length === 1 && suffix) {
    const candidate = `${families[0]}-${suffix.toUpperCase()}`;
    if (validSku(candidate)) return { sku: candidate, evidence: `official_polo_sibling_family_and_slug:${row.source_url}` };
  }
  return null;
}
function applyRecoveredSku(row, recovered, evidenceKind) {
  const old = row.supplier_code;
  const { family, variant } = parts(recovered);
  row.supplier_code = recovered;
  row.model = recovered;
  row.variant = variant || row.variant;
  row.family_key = family;
  row.variant_code = variant;
  if (!row.variant_label || row.variant_label === old.split('-').at(-1) || row.variant_label === 'publish') row.variant_label = variant;
  const flags = new Set(String(row.data_quality_flags || '').split('|').filter(Boolean));
  flags.delete('store_api_exact_sku_missing');
  flags.delete('malformed_supplier_code');
  flags.add('supplier_code_recovered_from_official_evidence');
  row.data_quality_flags = [...flags].join('|');
  row.supplier_code_recovery_evidence = evidenceKind;
  console.log(`[polo] recovered supplier code ${old} -> ${recovered} (${evidenceKind})`);
}
function rebuildFamilies(rows) {
  const uniq = (a) => [...new Set(a.filter(Boolean))];
  const groups = new Map();
  for (const r of rows) groups.set(r.family_key, [...(groups.get(r.family_key) || []), r]);
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
      image_count: members.reduce((s, x) => s + Number(x.image_count || 0), 0),
      source_urls: members.map((x) => x.source_url).filter(Boolean).join('|')
    };
  });
}

async function main() {
  const rows = (await readFile(`${OUT}/polo-master.jsonl`, 'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const existingHeaders = (await readFile(`${OUT}/polo-master.csv`, 'utf8')).split(/\r?\n/, 1)[0].split(',');
  const headers = [...existingHeaders, ...(!existingHeaders.includes('supplier_code_recovery_evidence') ? ['supplier_code_recovery_evidence'] : [])];
  const bad = rows.filter((r) => !validSku(r.supplier_code));
  if (!bad.length) {
    console.log('[polo] SKU normalization: no malformed supplier codes');
    return;
  }

  const unresolved = [];
  for (const row of bad) {
    const local = recoverFromFirstPartyEvidence(row, rows);
    if (local) applyRecoveredSku(row, local.sku, local.evidence);
    else unresolved.push(row);
  }

  if (unresolved.length) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ locale: 'el-GR', timezoneId: 'Europe/Athens' });
    try {
      for (const row of unresolved) {
        const page = await context.newPage();
        try {
          await page.goto(row.source_url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
          await page.waitForTimeout(300);
          let sku = normalize(await page.locator('.sku').first().textContent().catch(() => ''));
          if (!validSku(sku)) {
            const body = normalize(await page.locator('body').innerText().catch(() => ''));
            sku = body.match(/\b(\d[A-Z0-9]{4,}-[A-Z0-9/]+)\b/i)?.[1] || '';
          }
          if (!validSku(sku)) throw new Error(`Could not recover SKU for ${row.source_url}`);
          applyRecoveredSku(row, sku.toUpperCase(), `official_polo_product_page:${row.source_url}`);
        } finally { await page.close(); }
      }
    } finally { await context.close(); await browser.close(); }
  }

  const stillBad = rows.filter((r) => !validSku(r.supplier_code));
  if (stillBad.length) throw new Error(`Malformed POLO supplier codes remain: ${stillBad.map((r) => r.supplier_code).join(', ')}`);

  const families = rebuildFamilies(rows);
  const familyHeaders = ['family_key','family_title','brands','variant_count','variant_codes','variant_labels','colors','sizes','supplier_codes','gtins','min_msrp','max_msrp','image_count','source_urls'];
  await writeFile(`${OUT}/polo-master.csv`, toCsv(rows, headers), 'utf8');
  await writeFile(`${OUT}/polo-master.jsonl`, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  await writeFile(`${OUT}/polo-families.csv`, toCsv(families, familyHeaders), 'utf8');
}

main().catch((error) => { console.error('[polo] SKU normalization failed', error); process.exitCode = 1; });
