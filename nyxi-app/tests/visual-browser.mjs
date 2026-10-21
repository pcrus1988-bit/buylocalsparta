import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const port = 3107;
const base = "http://127.0.0.1:" + port;
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port), "-H", "127.0.0.1"], {
  cwd: process.cwd(), env: { ...process.env, NODE_ENV: "production" }, stdio: ["ignore", "pipe", "pipe"]
});
let logs = "";
server.stdout.on("data", data => logs += String(data).slice(-10000));
server.stderr.on("data", data => logs += String(data).slice(-10000));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const ready = async () => {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw Error("NYXI server exited: " + logs);
    try { if ((await fetch(base)).status === 200) return; } catch {}
    await sleep(1000);
  }
  throw Error("NYXI server timeout: " + logs);
};

let browser;
try {
  await ready();
  await mkdir("visual-evidence", { recursive: true });
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  for (const viewport of [{ name: "mobile-390", width: 390, height: 844 }, { name: "mobile-320", width: 320, height: 700 }, { name: "desktop-1440", width: 1440, height: 900 }]) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1, isMobile: viewport.width < 500, hasTouch: viewport.width < 500 });
    const page = await context.newPage();
    await page.goto(base, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.locator(".nyxi-chapter-nav button").first().waitFor({ state: "visible" });
    await page.locator(".nyxi-rebuild").waitFor({ state: "visible" });
    await page.screenshot({ path: "visual-evidence/" + viewport.name + "-homepage.png", fullPage: true, animations: "disabled" });
    const measure = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      navItems: document.querySelectorAll(".nyxi-chapter-nav button").length,
      heroHeight: Math.round(document.querySelector(".nyxi-theatre")?.getBoundingClientRect().height || 0)
    }));
    console.log(JSON.stringify({ viewport: viewport.name, ...measure }));
    assert.equal(measure.navItems, 4, "All studio chapters must render");
    assert.ok(measure.scrollWidth <= measure.width + 2, "Horizontal overflow on " + viewport.name);
    assert.ok(measure.heroHeight >= 400, "Editorial hero missing");
    const palette = page.locator(".nyxi-palette-choice").nth(3);
    await palette.click();
    assert.equal(await palette.getAttribute("aria-pressed"), "true");
    await page.getByText("IRIS HAZE").waitFor({ state: "visible" });
    await page.screenshot({ path: "visual-evidence/" + viewport.name + "-live-color.png", animations: "disabled" });
    await page.getByRole("button", { name: /Δοκίμασε αυτή την απόχρωση στο Atelier/ }).click();
    await page.locator("#style-title").waitFor({ state: "visible" });
    await page.waitForFunction(() => getComputedStyle(document.querySelector(".nail-polish")).backgroundColor === "rgb(153, 134, 192)");
    console.log(JSON.stringify({ viewport: viewport.name, interaction: "palette changes real nail try-on color", shade: "IRIS HAZE" }));

    await page.locator(".nyxi-chapter-nav button").nth(1).click();
    await page.locator("#journey-title").waitFor({ state: "visible" });
    const firstAnswer = page.locator(".concern-option").first();
    await firstAnswer.click();
    assert.equal(await firstAnswer.getAttribute("aria-pressed"), "true");
    await page.getByRole("button", { name: /Συνέχεια/ }).first().click();
    await page.getByText("Πότε το παρατηρείς περισσότερο;").waitFor({ state: "visible" });
    await page.screenshot({ path: "visual-evidence/" + viewport.name + "-care.png", animations: "disabled" });
    await page.locator(".nyxi-chapter-nav button").nth(2).click();
    await page.locator("#style-title").waitFor({ state: "visible" });
    await page.locator(".manicure-preview").waitFor({ state: "visible" });
    await page.screenshot({ path: "visual-evidence/" + viewport.name + "-atelier.png", animations: "disabled" });
    await context.close();
  }
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
