import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const PUBLIC_A11Y_ROUTES = [
  "/",
  "/shop",
  "/shops",
  "/advice",
  "/ask-local",
  "/cart",
  "/checkout",
  "/login",
  "/register",
  "/accessibility",
  "/join"
];

function formatBlockingViolations(violations) {
  return violations
    .map((violation) => {
      const targets = violation.nodes
        .slice(0, 5)
        .map((node) => node.target.join(" "))
        .join(", ");
      return `${violation.id} [${violation.impact ?? "unknown"}]: ${violation.help} (${targets})`;
    })
    .join("\n");
}

for (const route of PUBLIC_A11Y_ROUTES) {
  test(`WCAG automated baseline has no serious/critical violations on ${route}`, async ({ page }, testInfo) => {
    await page.goto(route);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    await testInfo.attach(`axe-${route === "/" ? "home" : route.slice(1).replaceAll("/", "-")}.json`, {
      body: Buffer.from(JSON.stringify(results.violations, null, 2)),
      contentType: "application/json"
    });

    const blocking = results.violations.filter(
      (violation) => violation.impact === "critical" || violation.impact === "serious"
    );

    expect(blocking, formatBlockingViolations(blocking)).toEqual([]);
  });
}

test("skip link is first keyboard stop and moves focus to the page content", async ({ page }) => {
  await page.goto("/");
  const skipLink = page.locator("a.skip-link");
  await expect(skipLink).toHaveAttribute("href", "#main-content");

  await page.keyboard.press("Tab");
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
});

test("accessibility controls manage opening focus, Escape, and focus return", async ({ page }) => {
  await page.goto("/");
  const launcher = page.getByRole("button", { name: "Πληροφορίες, cookies και προσβασιμότητα" });

  await launcher.click();
  const utilityGroup = page.getByRole("group", { name: "Ρυθμίσεις ιστοτόπου" });
  await expect(utilityGroup).toBeVisible();
  await expect(page.getByRole("button", { name: "Ρυθμίσεις cookies" })).toBeFocused();

  await page.getByRole("button", { name: "Προσβασιμότητα" }).click();

  const dialog = page.getByRole("dialog", { name: "Προσβασιμότητα" });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("button", { name: "Κλείσιμο ρυθμίσεων προσβασιμότητας" })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(launcher).toBeFocused();
});

test("single info launcher exposes and persists accessibility personalization tools", async ({ page }) => {
  await page.goto("/");
  const launcher = page.getByRole("button", { name: "Πληροφορίες, cookies και προσβασιμότητα" });
  await expect(page.getByRole("button", { name: "Άνοιγμα εργαλείων προσβασιμότητας" })).toHaveCount(0);

  await launcher.click();
  await page.getByRole("button", { name: "Προσβασιμότητα" }).click();

  const dialog = page.getByRole("dialog", { name: "Προσβασιμότητα" });
  await expect(dialog).toBeVisible();

  const contrast = page.getByRole("button", { name: /^Αντίθεση\+/ });
  const readableFont = page.getByRole("button", { name: /^Ευανάγνωστη γραμματοσειρά/ });
  const hideImages = page.getByRole("button", { name: /^Απόκρυψη εικόνων/ });
  await expect(contrast).toHaveAttribute("aria-pressed", "false");
  await contrast.click();
  await readableFont.click();
  await hideImages.click();

  await expect(page.locator("html")).toHaveAttribute("data-a11y-contrast", "true");
  await expect(page.locator("html")).toHaveAttribute("data-a11y-readable-font", "true");
  await expect(page.locator("html")).toHaveAttribute("data-a11y-hide-images", "true");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-a11y-contrast", "true");
  await expect(page.locator("html")).toHaveAttribute("data-a11y-readable-font", "true");
  await expect(page.locator("html")).toHaveAttribute("data-a11y-hide-images", "true");
});

test("core public pages reflow without document-level horizontal overflow at 320px", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Run reflow once on desktop Chromium.");
  await page.setViewportSize({ width: 320, height: 900 });

  for (const route of ["/", "/shop", "/cart", "/checkout", "/accessibility"]) {
    await page.goto(route);
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    }));
    expect(
      overflow.scrollWidth - overflow.clientWidth,
      `${route} has ${overflow.scrollWidth - overflow.clientWidth}px document-level horizontal overflow`
    ).toBeLessThanOrEqual(1);
  }
});
