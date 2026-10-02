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


test("Sport Fit travels back to the shared Studio District", async ({ page }) => {
  await page.goto("/studios");

  const sport = page.locator('nav a[href="/sport-fit-studio"]');
  await expect(sport).toBeVisible();
  await sport.click();
  await expect(page).toHaveURL(/\/sport-fit-studio(?:[?#].*)?$/);

  const exit = page.getByRole("button", { name: "Έξοδος προς τα KONTA MOY Studios" });
  await expect(exit).toBeVisible();
  await exit.click();
  await expect(page).toHaveURL(/\/studios(?:[?#].*)?$/);
  await expect(page.getByRole("heading", { name: /Μπες μέσα/ })).toBeVisible();
});

test("Paint Build exposes its shared WebGL project environment", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/paint-and-build-studio");

  await expect(page.locator("canvas").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: /Τι θέλεις/ })).toBeVisible();
  await expect(page.getByRole("application", { name: "KONTA MOY Paint & Build Studio" })).toBeVisible();
  await expect(page.getByText(/PROJECT ROOM/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Έξοδος από το Studio" })).toBeVisible();
});


test("Style questionnaire enters a WebGL fitting room", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/fitting-room");

  const enter = page.getByRole("button", { name: /Μπες στο fitting room/i });
  await expect(enter).toBeVisible();
  await enter.click();

  await expect(page.getByRole("dialog", { name: "KONTA MOY Fitting Room" })).toBeVisible();
  await expect(page.locator("canvas").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /STUDIOS/i }).first()).toBeVisible();
  await expect(page.getByText(/PRIVATE SHOWROOM|PIECES ON THE RACK/).first()).toBeVisible();
});

test("Active Color Finder Studio renders its shade laboratory", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/color-finder?category=studio-nails&categoryLabel=Nails");

  await expect(page.locator("canvas").first()).toBeVisible();
  await expect(page.getByText(/SHADE LAB/).first()).toBeVisible();
  await expect(page.getByText(/CLOSEST SAMPLES|CATALOGUE LOADING/).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /STUDIOS/i }).first()).toBeVisible();
});
