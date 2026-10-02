import { test, expect } from "@playwright/test";

test("Studios hub keeps semantic navigation when 3D is disabled", async ({ page }) => {
  await page.goto("/studios");

  await expect(page.getByRole("heading", { name: /Μπες μέσα/ })).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(1);

  for (const destination of [
    "/sport-fit-studio",
    "/paint-and-build-studio",
    "/fitting-room",
    "/color-finder"
  ]) {
    await expect(page.locator(`nav a[href="${destination}"]`)).toHaveCount(1);
  }

  const mode = page.getByRole("button", { name: "Απλή προβολή" });
  await expect(mode).toBeVisible();
  await mode.click();
  await expect(page.getByRole("button", { name: "3D προβολή" })).toBeVisible();

  const sport = page.locator('nav a[href="/sport-fit-studio"]');
  await expect(sport).toBeVisible();
  await sport.click();
  await expect(page).toHaveURL(/\/sport-fit-studio(?:[?#].*)?$/);
});

test("Studios hub remains usable with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/studios");

  await expect(page.getByRole("link", { name: /Paint & Build/ })).toBeVisible();
  await page.getByRole("link", { name: /Paint & Build/ }).click();
  await expect(page).toHaveURL(/\/paint-and-build-studio(?:[?#].*)?$/);
});
