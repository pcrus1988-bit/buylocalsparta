import { readFileSync } from "node:fs";

const dailyManifest = readFileSync("apps/web/src/app/daily/manifest.ts", "utf8");
const driverManifest = readFileSync("apps/web/src/app/driver/manifest.ts", "utf8");
const dailyLayout = readFileSync("apps/web/src/app/daily/layout.tsx", "utf8");
const driverLayout = readFileSync("apps/web/src/app/driver/layout.tsx", "utf8");
const install = readFileSync("apps/web/src/components/ScopedPwaInstallClient.tsx", "utf8");
const dailyWorker = readFileSync("apps/web/public/daily-sw.js", "utf8");
const driverWorker = readFileSync("apps/web/public/driver-sw.js", "utf8");
const dailyOffline = readFileSync("apps/web/public/daily-offline.html", "utf8");
const driverOffline = readFileSync("apps/web/public/driver-offline.html", "utf8");

for (const [name, manifest, scope, start] of [
  ["Daily", dailyManifest, "/daily/", "/daily"],
  ["Driver", driverManifest, "/driver/", "/driver"]
] as const) {
  if (!manifest.includes(`scope: "${scope}"`) || !manifest.includes(`start_url: "${start}"`)) {
    throw new Error(`${name} manifest must have its own start URL and scope`);
  }
  if (!manifest.includes('display: "standalone"') || !manifest.includes('src: "/icon.svg"')) {
    throw new Error(`${name} manifest must be installable and carry an app icon`);
  }
}

if (!dailyLayout.includes('manifest: "/daily/manifest.webmanifest"') || !driverLayout.includes('manifest: "/driver/manifest.webmanifest"')) {
  throw new Error("Operator layouts must override the generic marketplace manifest");
}
if (!install.includes("beforeinstallprompt") || !install.includes("appinstalled") || !install.includes("serviceWorker.register")) {
  throw new Error("Shared PWA installer must support browser install lifecycle and scoped worker registration");
}
if (!install.includes("display-mode: standalone") || !install.includes("Προσθήκη στην οθόνη Αφετηρίας")) {
  throw new Error("PWA installer must avoid prompting installed apps and explain iOS installation");
}

for (const [name, worker, offline] of [
  ["Daily", dailyWorker, dailyOffline],
  ["Driver", driverWorker, driverOffline]
] as const) {
  if (!worker.includes('url.pathname.startsWith("/api/")') || !worker.includes('request.mode === "navigate"')) {
    throw new Error(`${name} worker must explicitly separate APIs and navigations from static caching`);
  }
  if (!worker.includes('url.pathname.startsWith("/_next/static/")') || !worker.includes("OFFLINE_URL")) {
    throw new Error(`${name} worker must cache only the static shell and have an offline fallback`);
  }
  if (/cache\.put\([^\n]*(\/api|navigate)/i.test(worker)) {
    throw new Error(`${name} worker must never cache API or authenticated navigation data`);
  }
  if (!offline.toLowerCase().includes("offline") && !offline.includes("σύνδεση")) {
    throw new Error(`${name} offline shell must explain the offline state`);
  }
}

if (!dailyWorker.includes('addEventListener("push"') || !dailyWorker.includes("push-open")) {
  throw new Error("Daily PWA must preserve its existing Web Push and preview bridge behavior");
}
if (driverWorker.includes('addEventListener("push"')) {
  throw new Error("Driver PWA must not pretend to support push before driver push delivery exists");
}

console.log("Vendor + Driver PWA contracts verified");
