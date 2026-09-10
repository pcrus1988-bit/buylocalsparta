import { test, expect } from "@playwright/test";

const STATIC_ROUTE_MATRIX = [
  "/", "/shop", "/shops", "/shops/map", "/advice", "/ask-local", "/cart", "/checkout",
  "/login", "/register", "/forgot-password", "/reset-password", "/verify-email", "/confirm-email-change",
  "/how-it-works", "/fairness", "/delivery-pickup", "/payments-security", "/returns-refunds",
  "/privacy", "/cookies", "/privacy-controls", "/accessibility", "/about", "/help", "/join",
  "/join/requirements", "/choose-location", "/sitemap",
  "/account", "/account/appointments", "/account/ask-local", "/account/notifications", "/account/orders",
  "/account/privacy", "/account/profile", "/account/saved", "/account/security", "/account/support",
  "/vendor", "/vendor/login", "/vendor/catalog", "/vendor/orders", "/vendor/notifications", "/vendor/advice",
  "/vendor/analytics", "/vendor/daily-access", "/vendor/finance", "/vendor/pickup/scan", "/vendor/reports",
  "/vendor/returns", "/vendor/shipping", "/vendor/storefront", "/vendor/trust", "/daily",
  "/admin", "/admin/platform", "/admin/work", "/admin/maintenance", "/admin/operations", "/admin/notifications",
  "/admin/analytics", "/admin/reports", "/admin/search", "/admin/vendors", "/admin/applications", "/admin/activation",
  "/admin/research-vendors", "/admin/prospects", "/admin/partners", "/admin/partners/pipeline", "/admin/customers",
  "/admin/customers/support", "/admin/orders", "/admin/shipping", "/admin/recalls", "/admin/reviews",
  "/admin/catalogue-intake", "/admin/catalogue-intake/import", "/admin/categories", "/admin/matching", "/admin/fairness",
  "/admin/finance", "/admin/finance/agreements", "/admin/finance/agreements/sla", "/admin/finance/mydata",
  "/admin/finance/mydata/products", "/admin/finance/vendor-billing", "/admin/tax", "/admin/content", "/admin/hero",
  "/admin/email-lab", "/admin/seo", "/admin/seo/crawl", "/admin/seo/issues", "/admin/seo/pages", "/admin/seo/reports",
  "/admin/seo/schema", "/admin/seo/search-console", "/admin/seo/search-console/index-coverage", "/admin/seo/sitemaps",
  "/admin/privacy", "/admin/accessibility", "/admin/trust", "/admin/ask-local"
];

async function dismissPrivacyBanner(page) {
  const banner = page.locator("aside.privacy-consent-banner");
  if (!(await banner.isVisible().catch(() => false))) return;
  const reject = banner.getByRole("button", { name: "Απόρριψη προαιρετικών" });
  if (await reject.isVisible().catch(() => false)) {
    await reject.click();
    await expect(banner).toBeHidden();
  }
}

async function visibleHomepageLink(page, href) {
  let link = page.locator(`a[href="${href}"]:visible`).first();
  if (await link.count()) return link;

  const menuToggle = page.getByRole("button", { name: /Άνοιγμα μενού|Κλείσιμο μενού/ });
  if (await menuToggle.isVisible().catch(() => false)) {
    await menuToggle.click();
    await expect(menuToggle).toHaveAttribute("aria-expanded", "true");
    link = page.locator(`a[href="${href}"]:visible`).first();
  }
  return link;
}

async function showLegacyHomepageHero(page) {
  const input = page.locator("#home-search");
  if (await input.isVisible().catch(() => false)) return input;

  const legacyHeroTab = page.locator('button[role="tab"][aria-label^="Banner 2 από"]').first();
  await expect(legacyHeroTab, "managed hero should expose a control for the search hero").toBeVisible();
  await legacyHeroTab.click();
  await expect(input).toBeVisible();
  return input;
}

async function openSpartaHomepage(page) {
  await page.goto("/choose-location");
  await page.evaluate(() => {
    document.cookie = "km_locality=sparti; Path=/; SameSite=Lax";
  });
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await dismissPrivacyBanner(page);
}

test("all fixed public/private route entry points avoid server errors", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "route inventory only needs one HTTP pass");
  const failures = [];
  for (const route of STATIC_ROUTE_MATRIX) {
    const response = await request.get(route, { failOnStatusCode: false });
    if (response.status() >= 500) failures.push(`${route} -> ${response.status()}`);
  }
  expect(failures, `5xx route failures:\n${failures.join("\n")}`).toEqual([]);
});

test("bare human root uses the location gateway while crawlers retain the Sparta SEO root", async ({ page, request }) => {
  const human = await request.get("/?utm_source=gateway-acceptance", {
    failOnStatusCode: false,
    maxRedirects: 0,
    headers: { "user-agent": "Mozilla/5.0 KONTA-MOU-Gateway-Acceptance" }
  });
  expect(human.status()).toBe(307);
  expect(human.headers().location).toContain("/choose-location?utm_source=gateway-acceptance");
  expect(human.headers()["cache-control"]).toContain("no-store");
  expect(human.headers().vary).toContain("Cookie");
  expect(human.headers().vary).toContain("User-Agent");

  for (const userAgent of [
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "KONTA-MOU-SEO-Monitor/1.0 (+https://kontamou.site)"
  ]) {
    const crawler = await request.get("/", {
      failOnStatusCode: false,
      maxRedirects: 0,
      headers: { "user-agent": userAgent }
    });
    expect(crawler.status(), userAgent).toBe(200);
  }

  await page.goto("/");
  await expect(page).toHaveURL(/\/choose-location(?:[?#].*)?$/);

  await page.evaluate(() => {
    document.cookie = "km_locality=kalamata; Path=/; SameSite=Lax";
  });
  await page.goto("/");
  await expect(page).toHaveURL(/\/choose-location(?:[?#].*)?$/);

  await page.evaluate(() => {
    document.cookie = "km_locality=sparti; Path=/; SameSite=Lax";
  });
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("main")).toBeVisible();
});

test("homepage primary navigation works through real browser clicks", async ({ page }) => {
  await openSpartaHomepage(page);
  await expect(page.locator("main")).toBeVisible();

  for (const href of ["/shop", "/shops", "/advice", "/ask-local", "/cart"]) {
    await openSpartaHomepage(page);
    const link = await visibleHomepageLink(page, href);
    await expect(link, `missing visible homepage link ${href}`).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${href.replaceAll("/", "\\/")}(?:[?#].*)?$`));
  }
});

test("homepage search submits into governed shop search", async ({ page }) => {
  await openSpartaHomepage(page);
  const input = await showLegacyHomepageHero(page);
  await input.fill("Bormann");
  const form = input.locator("xpath=ancestor::form");
  await Promise.all([
    page.waitForURL(/\/shop(?:\?|$)/),
    form.getByRole("button", { name: /Αναζήτηση/ }).click()
  ]);
  expect(new URL(page.url()).searchParams.get("q")).toBe("Bormann");
});

test("map page does not render zero-zero as a public mapped point", async ({ page }) => {
  await page.goto("/shops/map");
  await expect(page.locator("main")).toBeVisible();
  const html = await page.content();
  expect(html).not.toContain('\"latitude\":0,\"longitude\":0');
  expect(html).not.toContain('\"lat\":0,\"lng\":0');
});

test("location permission control can be exercised when mapped vendors exist", async ({ page, context }) => {
  await page.goto("/shops/map");
  const origin = new URL(page.url()).origin;
  await context.grantPermissions(["geolocation"], { origin });
  await context.setGeolocation({ latitude: 37.0738, longitude: 22.4297 });
  const control = page.getByRole("button", { name: /Χρησιμοποίησε τη θέση μου|Use my location/i });
  if (await control.count()) {
    await control.click();
    await expect(page.locator("main")).toBeVisible();
  }
});

test("public utility pages render and expose a real heading", async ({ page }) => {
  for (const route of ["/login", "/register", "/privacy-controls", "/help", "/join/requirements", "/choose-location"]) {
    await page.goto(route);
    await expect(page.locator("h1").first(), `${route} should expose an h1`).toBeVisible();
  }
});

test("location gateway exposes customer-facing lifecycle states without activating unavailable areas", async ({ page, request }) => {
  const crossOriginConsent = await request.post("/api/privacy/consent", {
    failOnStatusCode: false,
    headers: { origin: "https://attacker.invalid" },
    data: { personalisation: false, analytics: false, marketing: false, source: "banner" }
  });
  expect(crossOriginConsent.status()).toBe(403);

  await page.goto("/choose-location");
  await expect(page.getByRole("heading", { name: "Πού είσαι σήμερα;" })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

  const consentBanner = page.locator("aside.privacy-consent-banner");
  await expect(consentBanner).toBeVisible();
  await consentBanner.getByRole("button", { name: "Απόρριψη προαιρετικών" }).click();
  await expect(consentBanner).toBeHidden();

  const search = page.getByRole("searchbox", { name: /Αναζήτηση πόλης, χωριού, περιοχής ή ταχυδρομικού κώδικα/ });
  await search.fill("Καλαμάτα");
  const kalamata = page.getByRole("button", { name: /Καλαμάτα.*Ετοιμάζεται/i }).first();
  await expect(kalamata).toBeVisible();
  await kalamata.click();
  await expect(page.getByRole("button", { name: /Θυμήσου την περιοχή μου/ })).toBeVisible();
  await expect(page).toHaveURL(/\/choose-location(?:[?#].*)?$/);

  await search.fill("Σπάρτη");
  const sparta = page.getByRole("button", { name: /Σπάρτη.*Αγορά διαθέσιμη/i }).first();
  await expect(sparta).toBeVisible();
  await sparta.click();
  await expect(page.getByRole("button", { name: /Μπες στην τοπική αγορά/ })).toBeVisible();
  await expect(page).toHaveURL(/\/choose-location(?:[?#].*)?$/);
});

test("location gateway resolves arbitrary Greek places to nearest hubs without storefront nav obstruction", async ({ page }) => {
  await page.route("**/api/location-search?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        location: { latitude: 37.0738, longitude: 22.4297, label: "Μυστράς, Σπάρτη, Λακωνία" }
      })
    });
  });

  await page.goto("/choose-location");
  await dismissPrivacyBanner(page);
  await expect(page.locator(".customer-mobile-commerce-nav")).toHaveCount(0);

  const search = page.getByRole("searchbox", { name: /Αναζήτηση πόλης, χωριού, περιοχής ή ταχυδρομικού κώδικα/ });
  await search.fill("Μυστράς 23100");
  await page.getByRole("button", { name: "Βρες κοντινότερα" }).click();

  await expect(page.getByText(/Βρέθηκε: Μυστράς, Σπάρτη, Λακωνία/)).toBeVisible();
  await expect(page.getByText(/Εμφανίζονται τα 5 κοντινότερα σημεία/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Σπάρτη.*Αγορά διαθέσιμη/i }).first()).toBeVisible();
});
