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
  const headers = (await readFile(`${OUT}/polo-master.csv`, 'utf8')).split(/\r?\n/, 1)[0].split(',');
  const bad = rows.filter((r) => !validSku(r.supplier_code));
  if (!bad.length) {
    console.log('[polo] SKU normalization: no malformed supplier codes');
    return;
  }
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: 'el-GR', timezoneId: 'Europe/Athens' });
  try {
    for (const row of bad) {
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
        const old = row.supplier_code;
        const { family, variant } = parts(sku);
        row.supplier_code = sku;
        row.model = sku;
        row.variant = variant || row.variant;
        row.family_key = family;
        row.variant_code = variant;
        if (!row.variant_label || row.variant_label === old.split('-').at(-1)) row.variant_label = variant;
        const flags = new Set(String(row.data_quality_flags || '').split('|').filter(Boolean));
        flags.delete('store_api_exact_sku_missing');
        flags.add('supplier_code_recovered_from_official_page');
        row.data_quality_flags = [...flags].join('|');
        console.log(`[polo] recovered supplier code ${old} -> ${sku}`);
      } finally { await page.close(); }
    }
  } finally { await context.close(); await browser.close(); }

  const families = rebuildFamilies(rows);
  const familyHeaders = ['family_key','family_title','brands','variant_count','variant_codes','variant_labels','colors','sizes','supplier_codes','gtins','min_msrp','max_msrp','image_count','source_urls'];
  await writeFile(`${OUT}/polo-master.csv`, toCsv(rows, headers), 'utf8');
  await writeFile(`${OUT}/polo-master.jsonl`, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  await writeFile(`${OUT}/polo-families.csv`, toCsv(families, familyHeaders), 'utf8');
}

main().catch((error) => { console.error('[polo] SKU normalization failed', error); process.exitCode = 1; });
