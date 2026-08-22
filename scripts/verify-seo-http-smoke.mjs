import { spawn } from "node:child_process";

const host = "127.0.0.1";
const port = Number(process.env.SEO_HTTP_SMOKE_PORT ?? "3117");
const origin = `http://${host}:${port}`;
const failures = [];
const useProcessGroup = process.platform !== "win32";
const googlebotHeaders = {
  "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
};
let serverOutput = "";

function recordOutput(chunk) {
  serverOutput += chunk.toString();
  if (serverOutput.length > 20_000) serverOutput = serverOutput.slice(-20_000);
}

function fail(message) {
  failures.push(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(path, init = {}) {
  return fetch(`${origin}${path}`, {
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
    ...init,
    headers: {
      "user-agent": "KONTA-MOU-SEO-CI-Smoke/1.0",
      ...(init.headers ?? {})
    }
  });
}

function canonicalHref(html) {
  const relFirst = html.match(/<link\b[^>]*\brel=["']canonical["'][^>]*\bhref=["']([^"']+)["'][^>]*>/i);
  if (relFirst) return relFirst[1];
  const hrefFirst = html.match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\brel=["']canonical["'][^>]*>/i);
  return hrefFirst?.[1];
}

function robotsMeta(html) {
  const nameFirst = html.match(/<meta\b[^>]*\bname=["']robots["'][^>]*\bcontent=["']([^"']+)["'][^>]*>/i);
  if (nameFirst) return nameFirst[1].toLowerCase();
  const contentFirst = html.match(/<meta\b[^>]*\bcontent=["']([^"']+)["'][^>]*\bname=["']robots["'][^>]*>/i);
  return contentFirst?.[1].toLowerCase();
}

function sitemapLocations(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((match) => match[1].trim()).filter(Boolean);
}

function assertPrivateHeaders(response, label) {
  const robots = response.headers.get("x-robots-tag")?.toLowerCase() ?? "";
  const cache = response.headers.get("cache-control")?.toLowerCase() ?? "";
  assert(robots.includes("noindex"), `${label} must return X-Robots-Tag noindex`);
  assert(robots.includes("nofollow"), `${label} must return X-Robots-Tag nofollow`);
  assert(robots.includes("noarchive"), `${label} must return X-Robots-Tag noarchive`);
  assert(cache.includes("private"), `${label} must return private cache control`);
  assert(cache.includes("no-store"), `${label} must return no-store cache control`);
}

const server = spawn(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["--workspace", "@buy-local-sparta/web", "run", "start", "--", "-H", host, "-p", String(port)],
  {
    detached: useProcessGroup,
    env: {
      ...process.env,
      APP_URL: origin,
      ENABLE_INTERNAL_RESEARCH_DIAGNOSTICS: "false",
      BLS_GOOGLE_SEARCH_CONSOLE_ENABLED: "false"
    },
    stdio: ["ignore", "pipe", "pipe"]
  }
);
server.stdout.on("data", recordOutput);
server.stderr.on("data", recordOutput);

function signalServer(signal) {
  if (server.exitCode !== null) return;
  try {
    if (useProcessGroup && server.pid) process.kill(-server.pid, signal);
    else server.kill(signal);
  } catch {
    // The process may already have exited between the state check and the signal.
  }
}

async function stopServer() {
  if (server.exitCode === null) {
    signalServer("SIGTERM");
    await Promise.race([
      new Promise((resolve) => server.once("exit", resolve)),
      sleep(4_000)
    ]);
  }
  if (server.exitCode === null) {
    signalServer("SIGKILL");
    await Promise.race([
      new Promise((resolve) => server.once("exit", resolve)),
      sleep(2_000)
    ]);
  }
  server.stdout.destroy();
  server.stderr.destroy();
}

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Next.js server exited before becoming ready (${server.exitCode}).`);
    try {
      const response = await request("/robots.txt");
      if (response.status < 500) return;
    } catch {
      // Keep polling until the built application is accepting requests.
    }
    await sleep(500);
  }
  throw new Error("Built Next.js application did not become ready for SEO HTTP smoke testing.");
}

async function run() {
  await waitForServer();

  const robotsResponse = await request("/robots.txt");
  const robots = await robotsResponse.text();
  assert(robotsResponse.status === 200, `robots.txt returned ${robotsResponse.status}, expected 200`);
  assert(/Allow:\s*\/api\/media\//i.test(robots), "robots.txt must allow governed public media");
  assert(/Disallow:\s*\/api\//i.test(robots), "robots.txt must disallow the internal API namespace");
  assert(!/Disallow:\s*\/admin(?:\/|\s|$)/i.test(robots), "robots.txt must not hide admin HTML from explicit noindex processing");
  assert(!/Disallow:\s*\/account(?:\/|\s|$)/i.test(robots), "robots.txt must not hide account HTML from explicit noindex processing");

  const sitemapResponse = await request("/sitemap.xml");
  const sitemap = await sitemapResponse.text();
  assert(sitemapResponse.status === 200, `sitemap.xml returned ${sitemapResponse.status}, expected 200`);
  assert(/<urlset\b/i.test(sitemap), "sitemap.xml must return a URL set");
  for (const forbidden of ["/admin/", "/account/", "/checkout/", "/api/", "/vendor/finance"]) {
    assert(!sitemap.includes(forbidden), `sitemap.xml must not contain private/internal path ${forbidden}`);
  }

  const homeResponse = await request("/");
  const home = await homeResponse.text();
  assert(homeResponse.status === 200, `Homepage returned ${homeResponse.status}, expected 200`);
  assert(!(homeResponse.headers.get("x-robots-tag") ?? "").toLowerCase().includes("noindex"), "Homepage must not receive a private noindex response header");
  const homeCanonical = canonicalHref(home);
  assert(Boolean(homeCanonical), "Homepage must render a canonical link");
  if (homeCanonical) {
    const canonical = new URL(homeCanonical, origin);
    assert(canonical.pathname === "/" && !canonical.search && !canonical.hash, `Homepage canonical must target /, received ${canonical.toString()}`);
  }

  const crawlerHomeResponse = await request("/", { headers: googlebotHeaders });
  const crawlerHome = await crawlerHomeResponse.text();
  assert(crawlerHomeResponse.status === 200, `Googlebot homepage rendering returned ${crawlerHomeResponse.status}, expected 200`);
  assert(!(crawlerHomeResponse.headers.get("x-robots-tag") ?? "").toLowerCase().includes("noindex"), "Googlebot homepage rendering must remain indexable");
  const crawlerHomeCanonical = canonicalHref(crawlerHome);
  assert(Boolean(crawlerHomeCanonical), "Googlebot homepage rendering must retain the governed canonical link");

  const filteredShopResponse = await request("/shop?q=seo-ci-smoke");
  const filteredShop = await filteredShopResponse.text();
  assert(filteredShopResponse.status === 200, `Filtered shop returned ${filteredShopResponse.status}, expected 200`);
  const filteredRobots = robotsMeta(filteredShop) ?? "";
  assert(filteredRobots.includes("noindex"), "Filtered shop must render meta robots noindex");
  assert(filteredRobots.includes("follow"), "Filtered shop must render meta robots follow");
  const filteredCanonical = canonicalHref(filteredShop);
  assert(Boolean(filteredCanonical), "Filtered shop must render a canonical link");
  if (filteredCanonical) {
    const canonical = new URL(filteredCanonical, origin);
    assert(canonical.pathname === "/shop" && !canonical.search && !canonical.hash, `Filtered shop canonical must collapse to /shop, received ${canonical.toString()}`);
  }

  const crawlerShopResponse = await request("/shop", { headers: googlebotHeaders });
  assert(crawlerShopResponse.status === 200, `Googlebot catalogue rendering returned ${crawlerShopResponse.status}, expected 200`);

  const productLocation = sitemapLocations(sitemap).find((location) => {
    try {
      return new URL(location, origin).pathname.startsWith("/product/");
    } catch {
      return false;
    }
  });
  if (productLocation) {
    const productUrl = new URL(productLocation, origin);
    const productPath = `${productUrl.pathname}${productUrl.search}`;
    const crawlerProductResponse = await request(productPath, { headers: googlebotHeaders });
    const crawlerProduct = await crawlerProductResponse.text();
    assert(crawlerProductResponse.status === 200, `Googlebot product rendering returned ${crawlerProductResponse.status}, expected 200 for ${productPath}`);
    assert(!(crawlerProductResponse.headers.get("x-robots-tag") ?? "").toLowerCase().includes("noindex"), `Sitemap-admitted Googlebot product must not receive a noindex response header: ${productPath}`);
    const crawlerProductCanonical = canonicalHref(crawlerProduct);
    assert(Boolean(crawlerProductCanonical), `Googlebot product rendering must retain a canonical link: ${productPath}`);
    assert(crawlerProduct.includes('"@type":"Product"'), `Googlebot product rendering must include Product JSON-LD: ${productPath}`);
    assert(crawlerProduct.includes('"@type":"Offer"'), `Googlebot product rendering must include the real read-only Offer JSON-LD: ${productPath}`);
  }

  const registerResponse = await request("/register");
  assertPrivateHeaders(registerResponse, "/register");

  const adminResponse = await request("/admin/seo");
  assertPrivateHeaders(adminResponse, "/admin/seo");
  assert(adminResponse.status >= 300 && adminResponse.status < 400, `/admin/seo must redirect anonymous traffic, received ${adminResponse.status}`);

  const vendorFinanceResponse = await request("/vendor/finance");
  assertPrivateHeaders(vendorFinanceResponse, "/vendor/finance");

  const diagnosticResponse = await request("/api/internal/research-seed-diagnostic");
  assertPrivateHeaders(diagnosticResponse, "/api/internal/research-seed-diagnostic");
  assert(diagnosticResponse.status !== 200, "Disabled internal research diagnostic must not return 200 to an anonymous request");
}

try {
  await run();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
} finally {
  await stopServer();
}

if (failures.length) {
  console.error("SEO HTTP smoke failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  if (serverOutput.trim()) console.error("\nBuilt-app output (tail):\n" + serverOutput.trim());
  process.exit(1);
}

console.log("SEO HTTP smoke passed: rendered robots/sitemap/canonical/filter/private-route contracts and Googlebot read-only public rendering verified against the built Next.js application.");
