import { readFile, writeFile } from 'node:fs/promises';

const OUT = 'data/imports/polo';
const normalize = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const fold = (v) => normalize(v).toLocaleLowerCase('el-GR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const uniq = (a) => [...new Set(a.filter(Boolean))];
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
  const sum = body.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === Number(digits.at(-1));
}
function urlPath(url) {
  try { return decodeURIComponent(new URL(url).pathname).toLowerCase(); } catch { return ''; }
}
function exactEvidence(item, sku) {
  const source = normalize(item?.source).toLowerCase();
  const path = urlPath(item?.url || '');
  const title = fold(item?.title || '');
  const target = fold(sku);
  const titleHas = title.includes(target);
  const pathHas = path.includes(target.toLowerCase());
  if (source === 'bestprice') return /\/item\//.test(path) && (pathHas || titleHas);
  if (source === 'nprokos' || source === 'domino') return /\/product\//.test(path) && (pathHas || titleHas);
  return pathHas || titleHas;
}
const COLOR_STEMS = [
  ['Μαύρο',['μαυρ','black']], ['Μπλε',['μπλε','blue','navy','night blue']], ['Κόκκινο',['κοκκιν','red']],
  ['Ροζ',['ροζ','pink']], ['Λιλά',['λιλα','lilac']], ['Μωβ',['μωβ','μοβ','purple','violet','βιολετ']],
  ['Πράσινο',['πρασιν','green','mint']], ['Χακί',['χακι','khaki','olive']], ['Γκρι',['γκρι','grey','gray','ανθρακι','charcoal']],
  ['Μπεζ',['μπεζ','beige']], ['Λευκό',['λευκ','white']], ['Πορτοκαλί',['πορτοκαλ','orange']], ['Κίτρινο',['κιτριν','yellow','lemon']],
  ['Καφέ',['καφε','brown']], ['Τιρκουάζ',['τιρκουαζ','turquoise','aqua','cyan']], ['Πετρόλ',['πετρολ','petrol']],
  ['Μπορντό',['μπορντο','burgundy']], ['Φούξια',['φουξ','fuchsia']], ['Πολύχρωμο',['πολυχρωμ','multicolor','multicolour']],
  ['Διάφανο',['διαφαν','clear','transparent']]
];
function colorsFromText(text) {
  const t = fold(text);
  return COLOR_STEMS.filter(([, stems]) => stems.some((s) => t.includes(fold(s)))).map(([label]) => label);
}
function chooseColor(items) {
  for (const source of ['bestprice','nprokos','domino']) {
    const exact = items.find((x) => normalize(x.source).toLowerCase() === source && x.__exact);
    if (!exact) continue;
    const colors = uniq([...(exact.color ? [exact.color] : []), ...colorsFromText(exact.title)]);
    if (colors.length) return { value: colors.join(' / '), source, url: exact.url };
  }
  return null;
}
const GENERIC_DESIGNS = new Set(['original','backpack','polo','domino','bag','school','double']);
function chooseDesign(items) {
  for (const source of ['bestprice','nprokos','domino']) {
    const exact = items.find((x) => normalize(x.source).toLowerCase() === source && x.__exact && x.design);
    if (!exact) continue;
    const d = normalize(exact.design);
    if (!d || GENERIC_DESIGNS.has(fold(d))) continue;
    return { value: d, source, url: exact.url };
  }
  return null;
}
function buildFamilies(rows) {
  const groups = new Map(); for (const r of rows) groups.set(r.family_key, [...(groups.get(r.family_key) || []), r]);
  return [...groups.entries()].map(([family_key, members]) => {
    const prices = members.map((x) => Number(x.msrp)).filter(Number.isFinite);
    return { family_key, family_title: members[0]?.title || '', brands: uniq(members.map((x) => x.brand)).join('|'), variant_count: members.length,
      variant_codes: members.map((x) => x.variant_code).filter(Boolean).join('|'), variant_labels: uniq(members.map((x) => x.variant_label).filter(Boolean)).join('|'),
      colors: uniq(members.map((x) => x.color).filter(Boolean)).join('|'), sizes: uniq(members.map((x) => x.size).filter(Boolean)).join('|'),
      supplier_codes: members.map((x) => x.supplier_code).filter(Boolean).join('|'), gtins: members.map((x) => x.gtin).filter(Boolean).join('|'),
      min_msrp: prices.length ? Math.min(...prices).toFixed(2) : '', max_msrp: prices.length ? Math.max(...prices).toFixed(2) : '',
      image_count: members.reduce((s, x) => s + Number(x.image_count || 0), 0), source_urls: members.map((x) => x.source_url).filter(Boolean).join('|') };
  });
}
function recomputeFiles(rows, headers, summary) {
  const gtinGroups = new Map();
  for (const r of rows) if (r.gtin) gtinGroups.set(r.gtin, [...(gtinGroups.get(r.gtin) || []), r]);
  for (const [gtin, members] of gtinGroups) {
    if (members.length < 2) continue;
    for (const r of members) {
      r.gtin = '';
      r.gtin_status = 'duplicate_gtin_quarantined';
      const flags = new Set(String(r.data_quality_flags || '').split('|').filter(Boolean));
      flags.add('duplicate_gtin_conflict'); flags.add('gtin_pending_external'); r.data_quality_flags = [...flags].join('|');
    }
    console.log(`[polo] quarantined duplicate GTIN ${gtin} on ${members.map((x) => x.supplier_code).join(', ')}`);
  }
  const invalid = rows.filter((r) => r.gtin && !validGtin(r.gtin));
  for (const r of invalid) { r.gtin=''; r.gtin_status='invalid_gtin_quarantined'; }
  const missing = rows.filter((r) => !r.gtin);
  const quality = rows.filter((r) => r.data_quality_flags);
  const families = buildFamilies(rows);
  const familyHeaders = ['family_key','family_title','brands','variant_count','variant_codes','variant_labels','colors','sizes','supplier_codes','gtins','min_msrp','max_msrp','image_count','source_urls'];
  summary.withGtin = rows.filter((r) => r.gtin).length;
  summary.missingGtin = missing.length;
  summary.withColor = rows.filter((r) => r.color).length;
  summary.withVariantLabel = rows.filter((r) => r.variant_label).length;
  summary.qualityReviewRows = quality.length;
  const c = new Map(); for (const r of rows) if (r.gtin) c.set(r.gtin, (c.get(r.gtin)||0)+1);
  summary.duplicateGtin = [...c.entries()].filter(([,n]) => n>1).map(([gtin]) => gtin);
  summary.invalidGtin = rows.filter((r) => r.gtin && !validGtin(r.gtin)).map((r) => r.gtin);
  return Promise.all([
    writeFile(`${OUT}/polo-master.csv`, toCsv(rows, headers), 'utf8'),
    writeFile(`${OUT}/polo-master.jsonl`, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8'),
    writeFile(`${OUT}/polo-families.csv`, toCsv(families, familyHeaders), 'utf8'),
    writeFile(`${OUT}/polo-gtin-missing.csv`, toCsv(missing, headers), 'utf8'),
    writeFile(`${OUT}/polo-quality-review.csv`, toCsv(quality, headers), 'utf8'),
    writeFile(`${OUT}/polo-crawl-summary.json`, JSON.stringify(summary, null, 2) + '\n', 'utf8')
  ]);
}

async function main() {
  const rows = (await readFile(`${OUT}/polo-master.jsonl`, 'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const headers = (await readFile(`${OUT}/polo-master.csv`, 'utf8')).split(/\r?\n/, 1)[0].split(',');
  const summary = JSON.parse(await readFile(`${OUT}/polo-crawl-summary.json`, 'utf8'));
  let invalidated = 0, colorsImproved = 0, labelsImproved = 0;
  for (const row of rows) {
    let evidence=[]; try { evidence=JSON.parse(row.external_evidence_json || '[]'); } catch {}
    evidence = evidence.map((e) => ({...e, __exact: exactEvidence(e,row.supplier_code)}));
    if (row.gtin_status === 'externally_verified_exact_sku') {
      const exactGtins = uniq(evidence.filter((e) => e.__exact).flatMap((e) => e.gtins || []).filter(validGtin));
      if (!exactGtins.includes(row.gtin)) {
        row.gtin=''; row.gtin_status='invalidated_non_exact_external_match'; row.gtin_evidence_kind=''; row.gtin_evidence_url=''; row.gtin_evidence_sources=''; invalidated++;
      }
    }
    if (!row.gtin) {
      const exactGtins = uniq(evidence.filter((e) => e.__exact).flatMap((e) => e.gtins || []).filter(validGtin));
      if (exactGtins.length === 1) {
        row.gtin=exactGtins[0]; row.gtin_status='externally_verified_exact_sku_reconciled';
        const src=evidence.find((e)=>e.__exact && (e.gtins||[]).includes(row.gtin));
        row.gtin_evidence_url=src?.url||''; row.gtin_evidence_kind='reconciled_exact_product_page'; row.gtin_evidence_sources=src?`${src.source}:${src.url}`:'';
      } else if (exactGtins.length > 1) row.gtin_status='external_conflict_review';
    }
    const color = chooseColor(evidence);
    if (color && color.value !== row.color) { row.color=color.value; row.color_status='reconciled_exact_sku_title'; row.color_evidence_url=color.url; colorsImproved++; }
    const design = chooseDesign(evidence);
    if (design && (!row.variant_label || row.variant_label===row.variant_code || row.variant_label_status==='external_conflict_review')) {
      row.variant_label=design.value; row.variant_label_status='reconciled_preferred_exact_sku_source'; row.variant_label_evidence_url=design.url; labelsImproved++;
    }
    const flags = new Set(String(row.data_quality_flags || '').split('|').filter(Boolean));
    if (row.gtin) { flags.delete('gtin_pending_external'); flags.delete('missing_gtin'); flags.delete('gtin_external_conflict'); }
    else flags.add('gtin_pending_external');
    if (row.color && row.variant_label && row.variant_label!==row.variant_code) flags.delete('variant_color_or_label_unresolved');
    row.data_quality_flags=[...flags].join('|');
    row.external_evidence_json=JSON.stringify(evidence.map(({__exact,...e})=>({...e,exactSkuValidated:__exact})));
  }
  summary.externalReconciliation = { completedAt:new Date().toISOString(), invalidatedNonExactGtins:invalidated, colorsImproved, variantLabelsImproved:labelsImproved,
    policy:'External product evidence is valid only when the exact supplier SKU appears in the product URL path or product title. Query-string-only matches and generic search pages are rejected.' };
  await recomputeFiles(rows, headers, summary);
  console.log(JSON.stringify(summary.externalReconciliation,null,2));
}
main().catch((error)=>{ console.error('[polo] external reconciliation failed',error); process.exitCode=1; });
