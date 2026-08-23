import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const OUT = "data/imports/polo-browser-probe";
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  locale: "el-GR",
  timezoneId: "Europe/Athens",
  viewport: { width: 1440, height: 1200 },
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36"
});
const page = await context.newPage();

try {
  const response = await page.goto("https://www.polo.gr/shop/", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(6000);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(2500);

  const result = await page.evaluate(() => {
    const productLinks = [...document.querySelectorAll('a[href*="/product/"]')]
      .map((a) => a.href.split("#")[0])
      .filter((href, index, all) => all.indexOf(href) === index);
    const bodyText = document.body?.innerText?.replace(/\s+/g, " ").trim() ?? "";
    const nextLinks = [...document.querySelectorAll('a')]
      .filter((a) => /next|επόμεν|επομεν/i.test(`${a.rel} ${a.className} ${a.textContent}`))
      .map((a) => a.href);
    return {
      title: document.title,
      url: location.href,
      productLinks: productLinks.slice(0, 50),
      productLinkCount: productLinks.length,
      nextLinks: [...new Set(nextLinks)].slice(0, 10),
      bodyPreview: bodyText.slice(0, 1000),
      htmlBytes: document.documentElement?.outerHTML?.length ?? 0
    };
  });

  const report = {
    checkedAt: new Date().toISOString(),
    responseStatus: response?.status() ?? null,
    responseUrl: response?.url() ?? null,
    ...result
  };
  await writeFile(`${OUT}/probe.json`, JSON.stringify(report, null, 2) + "\n", "utf8");
  await page.screenshot({ path: `${OUT}/shop.png`, fullPage: true });
  console.log(JSON.stringify(report, null, 2));
  if (!report.productLinkCount) process.exitCode = 2;
} finally {
  await browser.close();
}
