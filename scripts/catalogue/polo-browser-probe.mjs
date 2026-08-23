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

  const result = await page.evaluate(() => {
    const anchors = [...document.querySelectorAll("a")].map((a) => ({
      href: a.href?.split("#")[0] ?? "",
      text: a.textContent?.replace(/\s+/g, " ").trim().slice(0, 160) ?? "",
      title: a.getAttribute("title") ?? "",
      cls: typeof a.className === "string" ? a.className.slice(0, 200) : "",
      parentClass: typeof a.parentElement?.className === "string" ? a.parentElement.className.slice(0, 200) : "",
      grandParentClass: typeof a.parentElement?.parentElement?.className === "string" ? a.parentElement.parentElement.className.slice(0, 200) : ""
    })).filter((a) => a.href.startsWith("https://www.polo.gr/") && a.href !== "https://www.polo.gr/");

    const titleAnchors = anchors.filter((a) => /title|product|portfolio|item/i.test(`${a.cls} ${a.parentClass} ${a.grandParentClass}`) || /ΣΑΚΙΔΙΟ|ΚΑΣΕΤΙΝΑ|ΤΣΑΝΤ|ΒΑΛΙΤΣΑ|ΘΕΡΜΟΣ|ΠΑΓΟΥΡΙ|BACKPACK|PENCIL|TROLLEY/i.test(a.text));
    const bodyText = document.body?.innerText?.replace(/\s+/g, " ").trim() ?? "";
    const nextLinks = anchors.filter((a) => /next|επόμεν|επομεν/i.test(`${a.cls} ${a.text}`)).map((a) => a.href);
    return {
      title: document.title,
      url: location.href,
      anchorCount: anchors.length,
      titleAnchors: titleAnchors.slice(0, 180),
      nextLinks: [...new Set(nextLinks)].slice(0, 10),
      bodyPreview: bodyText.slice(0, 1200),
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
  await writeFile(`${OUT}/shop.html`, await page.content(), "utf8");
  await page.screenshot({ path: `${OUT}/shop.png`, fullPage: true });
  console.log(JSON.stringify(report, null, 2));
  if (!report.titleAnchors.length) process.exitCode = 2;
} finally {
  await browser.close();
}
