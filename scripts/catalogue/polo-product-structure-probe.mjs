import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const OUT = 'data/imports/polo-structure-probe';
await mkdir(OUT, { recursive: true });
const skus = ['902008-2000', '965055-8419', '848073-CL'];
const templates = [
  ['nprokos', (sku) => `https://nprokos.gr/?s=${encodeURIComponent(sku)}&post_type=product`],
  ['tothema', (sku) => `https://www.tothema.gr/en/search?controller=search&s=${encodeURIComponent(sku)}`],
  ['domino', (sku) => `https://dominoshop.gr/?s=${encodeURIComponent(sku)}&post_type=product`],
  ['nakas_q', (sku) => `https://www.nakasbookhouse.gr/el/search?q=${encodeURIComponent(sku)}`],
  ['nakas_text', (sku) => `https://www.nakasbookhouse.gr/el/search/?text=${encodeURIComponent(sku)}`],
  ['markcenter', (sku) => `https://www.markcenter.gr/index.php?route=product/search&search=${encodeURIComponent(sku)}`],
  ['bestprice', (sku) => `https://www.bestprice.gr/search?q=${encodeURIComponent(sku)}`],
  ['find', (sku) => `https://www.find.gr/search?q=${encodeURIComponent(sku)}`]
];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  locale: 'el-GR', timezoneId: 'Europe/Athens', viewport: { width: 1360, height: 900 },
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36'
});
const reports = [];
for (const sku of skus) {
  for (const [source, build] of templates) {
    const page = await context.newPage();
    const url = build(sku);
    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await page.waitForTimeout(800);
      const data = await page.evaluate((targetSku) => {
        const norm = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
        const body = norm(document.body?.innerText || '');
        const links = [...document.querySelectorAll('a')].map((a) => ({ href: a.href, text: norm(a.textContent) }))
          .filter((x) => x.href.includes(targetSku) || x.text.includes(targetSku)).slice(0, 30);
        const forms = [...document.querySelectorAll('form')].map((form) => ({
          action: form.action, method: form.method,
          inputs: [...form.querySelectorAll('input')].map((i) => ({name:i.name,type:i.type,placeholder:i.placeholder,value:i.value})).slice(0,20)
        })).filter((f) => /search|αναζ/i.test(`${f.action} ${JSON.stringify(f.inputs)}`)).slice(0,10);
        return { title: document.title, bodyPreview: body.slice(0, 3500), links, forms, containsSku: body.includes(targetSku) || links.length > 0 };
      }, sku);
      reports.push({ sku, source, requestedUrl: url, status: response?.status() ?? null, finalUrl: page.url(), ...data });
    } catch (error) {
      reports.push({ sku, source, requestedUrl: url, error: String(error?.message || error) });
    } finally {
      await page.close();
    }
  }
}
await context.close();
await browser.close();
await writeFile(`${OUT}/retailer-search-report.json`, JSON.stringify(reports, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(reports.map((r) => ({
  sku:r.sku, source:r.source, status:r.status, finalUrl:r.finalUrl, containsSku:r.containsSku,
  links:r.links?.slice(0,5), forms:r.forms?.slice(0,3), bodyPreview:r.bodyPreview?.slice(0,800), error:r.error
})), null, 2));
