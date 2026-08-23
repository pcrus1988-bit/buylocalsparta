import { test, expect } from "@playwright/test";

function desktopOnly(testInfo) {
  test.skip(testInfo.project.name !== "chromium", "cart failure-path coverage only needs one Chromium pass");
}

async function expectUsableCart(page, pageErrors) {
  await expect(page.getByRole("heading", { level: 1, name: "Οι τοπικές επιλογές σου." })).toBeVisible();
  await page.waitForTimeout(600);
  expect(pageErrors, `unhandled browser errors: ${pageErrors.join(" | ")}`).toEqual([]);
}

test("cart hydrates when browser localStorage is unavailable", async ({ page }, testInfo) => {
  desktopOnly(testInfo);
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    for (const method of ["getItem", "setItem", "removeItem"]) {
      Object.defineProperty(Storage.prototype, method, {
        configurable: true,
        value() { throw new DOMException("Storage disabled by browser policy", "SecurityError"); }
      });
    }
  });

  await page.goto("/cart");
  await expectUsableCart(page, pageErrors);
});

test("cart hydrates without unhandled rejection when account cart GET is unavailable", async ({ page }, testInfo) => {
  desktopOnly(testInfo);
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("**/api/account/cart", async (route) => {
    if (route.request().method() === "GET") return route.abort("failed");
    return route.continue();
  });

  await page.goto("/cart");
  await expectUsableCart(page, pageErrors);
});

test("persistent cart PUT failure stays fail-soft after hydration", async ({ page }, testInfo) => {
  desktopOnly(testInfo);
  const pageErrors = [];
  let putAttempts = 0;
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("**/api/account/cart", async (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ persistent: true, csrfToken: "acceptance-csrf", cart: { items: [] } })
      });
    }
    if (route.request().method() === "PUT") {
      putAttempts += 1;
      return route.abort("failed");
    }
    return route.continue();
  });

  await page.goto("/cart");
  await expect(page.getByRole("heading", { level: 1, name: "Οι τοπικές επιλογές σου." })).toBeVisible();
  await expect.poll(() => putAttempts, { timeout: 3_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(250);
  expect(pageErrors, `unhandled browser errors: ${pageErrors.join(" | ")}`).toEqual([]);
});
