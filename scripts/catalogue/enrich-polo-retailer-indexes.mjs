import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';

const OUT='data/imports/polo';
const normalize=(v)=>String(v??'').replace(/\s+/g,' ').trim();
const fold=(v)=>normalize(v).toLocaleLowerCase('el-GR').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const uniq=(a)=>[...new Set(a.filter(Boolean))];
const csvCell=(v)=>{ let s=v==null?'':typeof v==='string'?v:JSON.stringify(v); s=s.replace(/\r?\n/g,' '); return /[",\n\r]/.test(s)?`"${s.replace(/"/g,'""')}"`:s; };
const toCsv=(rows,headers)=>[headers.join(','),...rows.map(r=>headers.map(h=>csvCell(r[h])).join(','))].join('\n')+'\n';
function validGtin(candidate){ const d=String(candidate??'').replace(/\D/g,''); if(![8,12,13,14].includes(d.length))return false; const body=d.slice(0,-1).split('').reverse().map(Number); const sum=body.reduce((a,x,i)=>a+x*(i%2===0?3:1),0); return (10-(sum%10))%10===Number(d.at(-1)); }
function aliases(sku){ const out=[sku]; const m=sku.match(/^(\d{6})-([A-Z0-9/]+)$/i); if(m) out.push(`${m[1][0]}-${m[1].slice(1,3)}-${m[1].slice(3)}-${m[2]}`); return uniq(out.map((x)=>fold(x))); }
const COLOR_STEMS=[['Μαύρο',['μαυρ','black']],['Μπλε',['μπλε','blue','navy']],['Κόκκινο',['κοκκιν','red']],['Ροζ',['ροζ','pink']],['Λιλά',['λιλα','lilac']],['Μωβ',['μωβ','μοβ','purple','violet','βιολετ']],['Πράσινο',['πρασιν','green','mint']],['Χακί',['χακι','khaki','olive']],['Γκρι',['γκρι','grey','gray','ανθρακι','charcoal']],['Μπεζ',['μπεζ','beige']],['Λευκό',['λευκ','white']],['Πορτοκαλί',['πορτοκαλ','orange']],['Κίτρινο',['κιτριν','yellow','lemon']],['Καφέ',['καφε','brown']],['Τιρκουάζ',['τιρκουαζ','turquoise','aqua','cyan']],['Πετρόλ',['πετρολ','petrol']],['Μπορντό',['μπορντο','burgundy']],['Φούξια',['φουξ','fuchsia']],['Πολύχρωμο',['πολυχρωμ','multicolor','multicolour']],['Διάφανο',['διαφαν','clear','transparent']]];
function colorsFromText(text){ const t=fold(text); return COLOR_STEMS.filter(([,ss])=>ss.some(s=>t.includes(fold(s)))).map(([l])=>l); }
function makeIndex(rows){ const index=[]; for(const r of rows) for(const a of aliases(r.supplier_code)) index.push({alias:a,row:r}); index.sort((a,b)=>b.alias.length-a.alias.length); return index; }
function parsePage(body,index,source,url){ const rawLines=String(body||'').split(/\r?\n/).map(normalize).filter(Boolean); const folded=rawLines.map(fold); const hits=[];
  for(let i=0;i<rawLines.length;i++){
    const lineFold=folded[i]; const match=index.find((x)=>lineFold.includes(x.alias)); if(!match) continue;
    const around=rawLines.slice(Math.max(0,i-3),Math.min(rawLines.length,i+5));
    const gtins=uniq(around.flatMap((line)=>line.match(/\b\d{8,14}\b/g)||[]).filter(validGtin));
    const barcodeLine=around.find((line)=>/barcode/i.test(line)); const barcode=barcodeLine?.match(/\b\d{8,14}\b/)?.[0] || gtins[0] || '';
    const priceLine=around.find((line)=>/\d+[.,]\d{2}\s*€/.test(line)); const price=priceLine?.match(/(\d+[.,]\d{2})\s*€/)?.[1]?.replace(',','.') || '';
    hits.push({sku:match.row.supplier_code,source,url,title:rawLines[i],gtin:validGtin(barcode)?barcode:'',color:colorsFromText(rawLines[i]).join(' / '),sellingPrice:price});
  }
  return hits;
}
async function crawlIndex(page,rows){ const index=makeIndex(rows); const evidence=[]; const seenBodies=new Set();
  const sources=[
    {name:'gnosi-polo', max:24, url:(n)=>`https://www.gnosi.eu/el/TagOption/01312D01.aspx?000003F7=&000007D0=01312D01&pagesize=128&sortby=code&splitter_products_offset=${n*128}`},
    {name:'lichnari-polo', max:12, url:(n)=>`https://www.lichnaribooks.gr/el/filterSearch?orderby=5&pagenumber=${n+1}&pagesize=64&q=POLO&viewmode=list`}
  ];
  for(const src of sources){ let empty=0; for(let n=0;n<src.max;n++){
      const url=src.url(n); const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000}); await page.waitForTimeout(250);
      const body=await page.locator('body').innerText().catch(()=> ''); const sig=fold(body).slice(0,4000);
      if(!body || seenBodies.has(`${src.name}:${sig}`)){ console.log(`[polo] ${src.name} stopped at page ${n+1} (empty/repeated)`); break; }
      seenBodies.add(`${src.name}:${sig}`); const hits=parsePage(body,index,src.name,url); evidence.push(...hits);
      console.log(`[polo] ${src.name} page ${n+1}: ${hits.length} exact SKU index hits`);
      if(!hits.length) empty++; else empty=0; if(empty>=3) break;
      if(response && response.status()>=400) break;
    }}
  return evidence;
}
function buildFamilies(rows){ const groups=new Map(); for(const r of rows)groups.set(r.family_key,[...(groups.get(r.family_key)||[]),r]); return [...groups.entries()].map(([family_key,members])=>{ const prices=members.map(x=>Number(x.msrp)).filter(Number.isFinite); return {family_key,family_title:members[0]?.title||'',brands:uniq(members.map(x=>x.brand)).join('|'),variant_count:members.length,variant_codes:members.map(x=>x.variant_code).filter(Boolean).join('|'),variant_labels:uniq(members.map(x=>x.variant_label).filter(Boolean)).join('|'),colors:uniq(members.map(x=>x.color).filter(Boolean)).join('|'),sizes:uniq(members.map(x=>x.size).filter(Boolean)).join('|'),supplier_codes:members.map(x=>x.supplier_code).filter(Boolean).join('|'),gtins:members.map(x=>x.gtin).filter(Boolean).join('|'),min_msrp:prices.length?Math.min(...prices).toFixed(2):'',max_msrp:prices.length?Math.max(...prices).toFixed(2):'',image_count:members.reduce((s,x)=>s+Number(x.image_count||0),0),source_urls:members.map(x=>x.source_url).filter(Boolean).join('|')}; }); }
async function main(){ let rows=(await readFile(`${OUT}/polo-master.jsonl`,'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse); const existingHeaders=(await readFile(`${OUT}/polo-master.csv`,'utf8')).split(/\r?\n/,1)[0].split(','); const extras=['retailer_index_evidence_json','retailer_index_researched_at','selling_price_evidence_url']; const headers=[...existingHeaders,...extras.filter(x=>!existingHeaders.includes(x))];
  const browser=await chromium.launch({headless:true}); const context=await browser.newContext({locale:'el-GR',timezoneId:'Europe/Athens',userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36'}); const page=await context.newPage(); let evidence; try{evidence=await crawlIndex(page,rows);} finally{await page.close();await context.close();await browser.close();}
  const bySku=new Map(); for(const e of evidence)bySku.set(e.sku,[...(bySku.get(e.sku)||[]),e]); let gtinAdded=0,colorAdded=0,priceAdded=0,conflicts=0;
  for(const row of rows){ const ev=bySku.get(row.supplier_code)||[]; if(!ev.length)continue; const gtins=uniq(ev.map(e=>e.gtin).filter(validGtin)); const flags=new Set(String(row.data_quality_flags||'').split('|').filter(Boolean));
    if(!row.gtin && gtins.length===1){ row.gtin=gtins[0]; row.gtin_status='retailer_index_exact_sku_verified'; row.gtin_evidence_kind='retailer_catalogue_index_exact_sku'; const src=ev.find(e=>e.gtin===row.gtin); row.gtin_evidence_url=src?.url||''; row.gtin_evidence_sources=uniq(ev.filter(e=>e.gtin===row.gtin).map(e=>`${e.source}:${e.url}`)).join('|'); flags.delete('gtin_pending_external'); flags.delete('missing_gtin'); gtinAdded++; }
    else if(gtins.length>1 || (row.gtin && gtins.length && !gtins.includes(row.gtin))){ flags.add('retailer_index_gtin_conflict'); conflicts++; }
    if(!row.color){ const preferred=ev.find(e=>e.source==='gnosi-polo'&&e.color)||ev.find(e=>e.color); if(preferred){row.color=preferred.color;row.color_status='retailer_index_exact_sku';row.color_evidence_url=preferred.url;colorAdded++;}}
    if(!row.msrp && !row.selling_price){ const p=ev.find(e=>e.sellingPrice); if(p){row.selling_price=p.sellingPrice;row.selling_price_minor=String(Math.round(Number(p.sellingPrice)*100));row.selling_price_evidence_url=p.url; if(!row.price){row.price=p.sellingPrice;row.price_kind='external_selling_price_exact_sku';} priceAdded++;}}
    row.retailer_index_evidence_json=JSON.stringify(ev); row.retailer_index_researched_at=new Date().toISOString(); row.data_quality_flags=[...flags].join('|');
  }
  const gtinGroups=new Map(); for(const r of rows)if(r.gtin)gtinGroups.set(r.gtin,[...(gtinGroups.get(r.gtin)||[]),r]); for(const [g,ms] of gtinGroups){if(ms.length>1){for(const r of ms){r.gtin='';r.gtin_status='duplicate_gtin_quarantined';const f=new Set(String(r.data_quality_flags||'').split('|').filter(Boolean));f.add('duplicate_gtin_conflict');f.add('gtin_pending_external');r.data_quality_flags=[...f].join('|');}console.log(`[polo] quarantined duplicate after retailer indexes ${g}: ${ms.map(x=>x.supplier_code).join(',')}`);}}
  const summary=JSON.parse(await readFile(`${OUT}/polo-crawl-summary.json`,'utf8')); const missing=rows.filter(r=>!r.gtin),quality=rows.filter(r=>r.data_quality_flags),families=buildFamilies(rows); const familyHeaders=['family_key','family_title','brands','variant_count','variant_codes','variant_labels','colors','sizes','supplier_codes','gtins','min_msrp','max_msrp','image_count','source_urls'];
  summary.retailerIndexEnrichment={completedAt:new Date().toISOString(),sources:['Gnosi POLO catalogue index','Lichnari POLO catalogue index'],exactSkuEvidenceRows:bySku.size,gtinAdded,colorAdded,priceAdded,conflicts}; summary.withGtin=rows.filter(r=>r.gtin).length; summary.missingGtin=missing.length; summary.withColor=rows.filter(r=>r.color).length; summary.withMsrp=rows.filter(r=>r.msrp).length; summary.qualityReviewRows=quality.length; const c=new Map();for(const r of rows)if(r.gtin)c.set(r.gtin,(c.get(r.gtin)||0)+1);summary.duplicateGtin=[...c.entries()].filter(([,n])=>n>1).map(([g])=>g);summary.invalidGtin=rows.filter(r=>r.gtin&&!validGtin(r.gtin)).map(r=>r.gtin);
  await Promise.all([writeFile(`${OUT}/polo-master.csv`,toCsv(rows,headers),'utf8'),writeFile(`${OUT}/polo-master.jsonl`,rows.map(r=>JSON.stringify(r)).join('\n')+'\n','utf8'),writeFile(`${OUT}/polo-families.csv`,toCsv(families,familyHeaders),'utf8'),writeFile(`${OUT}/polo-gtin-missing.csv`,toCsv(missing,headers),'utf8'),writeFile(`${OUT}/polo-quality-review.csv`,toCsv(quality,headers),'utf8'),writeFile(`${OUT}/polo-crawl-summary.json`,JSON.stringify(summary,null,2)+'\n','utf8')]); console.log(JSON.stringify(summary.retailerIndexEnrichment,null,2)); }
main().catch(e=>{console.error('[polo] retailer index enrichment failed',e);process.exitCode=1;});
