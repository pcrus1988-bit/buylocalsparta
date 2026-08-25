import { readFileSync } from "node:fs";

const dailyManifest = readFileSync("apps/web/src/app/daily/manifest.ts", "utf8");
const driverManifest = readFileSync("apps/web/src/app/driver/manifest.ts", "utf8");
const adminManifest = readFileSync("apps/web/src/app/admin/manifest.ts", "utf8");
const dailyLayout = readFileSync("apps/web/src/app/daily/layout.tsx", "utf8");
const driverLayout = readFileSync("apps/web/src/app/driver/layout.tsx", "utf8");
const adminLayout = readFileSync("apps/web/src/app/admin/layout.tsx", "utf8");
const install = readFileSync("apps/web/src/components/ScopedPwaInstallClient.tsx", "utf8");
const vendorHeader = readFileSync("apps/web/src/components/VendorWorkspaceHeader.tsx", "utf8");
const dailyWorker = readFileSync("apps/web/public/daily-sw.js", "utf8");
const driverWorker = readFileSync("apps/web/public/driver-sw.js", "utf8");
const adminWorker = readFileSync("apps/web/public/admin-sw.js", "utf8");
const dailyOffline = readFileSync("apps/web/public/daily-offline.html", "utf8");
const driverOffline = readFileSync("apps/web/public/driver-offline.html", "utf8");
const adminOffline = readFileSync("apps/web/public/admin-offline.html", "utf8");

for (const [name, manifest, scope, start] of [
  ["Daily", dailyManifest, "/daily/", "/daily"],
  ["Driver", driverManifest, "/driver/", "/driver"],
  ["Admin", adminManifest, "/admin/", "/admin"]
] as const) {
  if (!manifest.includes(`scope: "${scope}"`) || !manifest.includes(`start_url: "${start}"`)) {
    throw new Error(`${name} manifest must have its own start URL and scope`);
  }
  if (!manifest.includes('display: "standalone"') || !manifest.includes('src: "/icon.svg"')) {
    throw new Error(`${name} manifest must be installable and carry an app icon`);
  }
}

if (!dailyLayout.includes('manifest: "/daily/manifest.webmanifest"') || !driverLayout.includes('manifest: "/driver/manifest.webmanifest"') || !adminLayout.includes('manifest: "/admin/manifest.webmanifest"')) {
  throw new Error("Operator layouts must override the generic marketplace manifest");
}
if (!install.includes("beforeinstallprompt") || !install.includes("appinstalled") || !install.includes("serviceWorker.register")) {
  throw new Error("Shared PWA installer must support browser install lifecycle and scoped worker registration");
}
if (!install.includes("display-mode: standalone") || !install.includes("Προσθήκη στην οθόνη Αφετηρίας") || !install.includes("Download App")) {
  throw new Error("PWA installer must avoid prompting installed apps and provide prominent install guidance");
}
if (!vendorHeader.includes('/daily?install=1') || !vendorHeader.includes("Download App · KONTA MOY Daily")) {
  throw new Error("Vendor workspace must visibly advertise the installable Daily app");
}

for (const [name, worker, offline] of [
  ["Daily", dailyWorker, dailyOffline],
  ["Driver", driverWorker, driverOffline],
  ["Admin", adminWorker, adminOffline]
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
if (driverWorker.includes('addEventListener("push"') || adminWorker.includes('addEventListener("push"')) {
  throw new Error("Driver/Admin PWAs must not pretend to support push before role-specific push delivery exists");
}

console.log("Vendor Daily + Driver + Admin PWA contracts verified");
