import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const OUT = 'data/imports/polo-structure-probe';
await mkdir(OUT, { recursive: true });
const urls = [
  'https://www.polo.gr/bags/back2school/trolei/el-backpack-trolley-freely-8419/',
  'https://www.polo.gr/bags/back2school/el-back2school-bottles-thermos/el-bottle-hit-cap-g45-0-45l-cl/'
];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  locale: 'el-GR', timezoneId: 'Europe/Athens', viewport: { width: 1440, height: 1100 },
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36'
});
const reports = [];
for (const url of urls) {
  const page = await context.newPage();
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1200);
  const dom = await page.evaluate(() => {
    const norm = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
    const imageData = [...document.querySelectorAll('.woocommerce-product-gallery img, .elementor-widget-woocommerce-product-images img')].map((img) => ({
      src: img.currentSrc || img.src || '',
      dataSrc: img.getAttribute('data-src') || '',
      large: img.getAttribute('data-large_image') || '',
      alt: img.alt || '',
      title: img.title || '',
      cls: img.className || '',
      parent: img.parentElement?.outerHTML?.slice(0, 1200) || ''
    }));
    const jsonLd = [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent || '');
    const productRoot = document.querySelector('div.product, main');
    const html = document.documentElement.outerHTML;
    const needles = ['8419','BUTTERFLY','Butterfly','ean','EAN','gtin','GTIN','global_unique','barcode','520192'];
    const needleHits = Object.fromEntries(needles.map((needle) => {
      const i = html.indexOf(needle);
      return [needle, i >= 0 ? html.slice(Math.max(0, i - 500), Math.min(html.length, i + 1000)) : ''];
    }));
    const attrs = [...document.querySelectorAll('.woocommerce-product-attributes-item, tr')].map((row) => ({
      label: norm(row.querySelector('.woocommerce-product-attributes-item__label, th')?.textContent || ''),
      value: norm(row.querySelector('.woocommerce-product-attributes-item__value, td')?.textContent || '')
    })).filter((x) => x.label || x.value);
    const links = [...document.querySelectorAll('a')].map((a) => ({ href: a.href, text: norm(a.textContent), cls: String(a.className || '') }))
      .filter((x) => /8419|color|colour|χρώ|laken|brand/i.test(`${x.href} ${x.text} ${x.cls}`)).slice(0,100);
    return {
      title: norm(document.querySelector('h1')?.textContent || ''),
      bodyPreview: norm(document.body?.innerText || '').slice(0, 5000),
      images: imageData,
      jsonLd,
      attrs,
      links,
      needleHits,
      productHtml: productRoot?.outerHTML?.slice(0, 50000) || '',
      resources: performance.getEntriesByType('resource').map((r) => r.name).filter((u) => /wc|woo|ajax|product|api|json/i.test(u)).slice(0,100)
    };
  });
  const api = await page.evaluate(async () => {
    const paths = [
      '/wp-json/wc/store/v1/products?search=965055-8419&per_page=10',
      '/?rest_route=/wc/store/v1/products&search=965055-8419&per_page=10'
    ];
    const out = [];
    for (const path of paths) {
      try {
        const r = await fetch(path, { credentials: 'include', headers: { accept: 'application/json' } });
        const text = await r.text();
        out.push({ path, status: r.status, contentType: r.headers.get('content-type'), text: text.slice(0, 30000) });
      } catch (error) { out.push({ path, error: String(error) }); }
    }
    return out;
  });
  reports.push({ url, status: response?.status() ?? null, finalUrl: page.url(), dom, api });
  await page.close();
}
await context.close();
await browser.close();
await writeFile(`${OUT}/report.json`, JSON.stringify(reports, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(reports.map((r) => ({
  url: r.url, status: r.status, title: r.dom.title, imageCount: r.dom.images.length,
  images: r.dom.images.slice(0, 8).map((i) => ({src:i.src,large:i.large,alt:i.alt,title:i.title})),
  attrs: r.dom.attrs.slice(0,20), links: r.dom.links.slice(0,20),
  api: r.api.map((a) => ({path:a.path,status:a.status,contentType:a.contentType,text:a.text?.slice(0,1000)}))
})), null, 2));
