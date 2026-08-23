import { test, expect } from "@playwright/test";

const STATIC_ROUTE_MATRIX = [
  "/", "/shop", "/shops", "/shops/map", "/advice", "/ask-local", "/cart", "/checkout",
  "/login", "/register", "/forgot-password", "/reset-password", "/verify-email", "/confirm-email-change",
  "/how-it-works", "/fairness", "/delivery-pickup", "/payments-security", "/returns-refunds",
  "/privacy", "/cookies", "/privacy-controls", "/accessibility", "/about", "/help", "/join",
  "/join/requirements", "/sitemap",
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

test("all fixed public/private route entry points avoid server errors", async ({ request }) => {
  const failures = [];
  for (const route of STATIC_ROUTE_MATRIX) {
    const response = await request.get(route, { failOnStatusCode: false });
    if (response.status() >= 500) failures.push(`${route} -> ${response.status()}`);
  }
  expect(failures, `5xx route failures:\n${failures.join("\n")}`).toEqual([]);
});

test("homepage primary navigation works through real browser clicks", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("main")).toBeVisible();

  for (const href of ["/shop", "/shops", "/advice", "/ask-local", "/cart"]) {
    await page.goto("/");
    const link = page.locator(`a[href="${href}"]`).first();
    await expect(link, `missing homepage link ${href}`).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${href.replaceAll("/", "\\/")}(?:[?#].*)?$`));
  }
});

test("homepage search submits into governed shop search", async ({ page }) => {
  await page.goto("/");
  const input = page.locator('input[name="q"]').first();
  await expect(input).toBeVisible();
  await input.fill("Bormann");
  const form = input.locator("xpath=ancestor::form");
  await Promise.all([page.waitForURL(/\/shop(?:\?|$)/), form.locator('button[type="submit"], input[type="submit"]').first().click()]);
  expect(new URL(page.url()).searchParams.get("q")).toBe("Bormann");
});

test("map page does not render zero-zero as a public mapped point", async ({ page }) => {
  await page.goto("/shops/map");
  await expect(page.locator("main")).toBeVisible();
  const html = await page.content();
  expect(html).not.toContain('"latitude":0,"longitude":0');
  expect(html).not.toContain('"lat":0,"lng":0');
});

test("location permission control can be exercised when mapped vendors exist", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"], { origin: new URL(page.url() || "http://127.0.0.1:3000").origin });
  await context.setGeolocation({ latitude: 37.0738, longitude: 22.4297 });
  await page.goto("/shops/map");
  const control = page.getByRole("button", { name: /Χρησιμοποίησε τη θέση μου|Use my location/i });
  if (await control.count()) {
    await control.click();
    await expect(page.locator("main")).toBeVisible();
  }
});

test("public utility pages render and expose a real heading", async ({ page }) => {
  for (const route of ["/login", "/register", "/privacy-controls", "/help", "/join/requirements"]) {
    await page.goto(route);
    await expect(page.locator("h1").first(), `${route} should expose an h1`).toBeVisible();
  }
});
