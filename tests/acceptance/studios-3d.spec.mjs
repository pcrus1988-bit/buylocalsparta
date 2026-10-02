import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

  const mode = page.getByRole("button", { name: "Λίστα" });
  await expect(mode).toBeVisible();
  await mode.click();
  await expect(page.getByRole("button", { name: "3D χώρος" })).toBeVisible();

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


test("Universe identity is reserved for Sport Fit", async () => {
  const nonSportStudioFiles = [
    "apps/web/src/components/StudioDistrictScene.tsx",
    "apps/web/src/components/StudioDistrictScene.module.css",
    "apps/web/src/components/StudioExperienceRuntime.tsx",
    "apps/web/src/components/StudioExperienceRuntime.module.css",
    "apps/web/src/components/PaintBuildSpatialScene.tsx",
    "apps/web/src/components/PaintBuildSpatialScene.module.css",
    "apps/web/src/components/StyleShowroomScene.tsx",
    "apps/web/src/components/StyleShowroomScene.module.css",
    "apps/web/src/components/ColorLabScene.tsx",
    "apps/web/src/components/ColorLabScene.module.css"
  ];

  for (const file of nonSportStudioFiles) {
    const source = readFileSync(resolve(process.cwd(), file), "utf8");
    expect(source).not.toMatch(/\buniverse\b/i);
    expect(source).not.toMatch(/\borbit(?:ing)?\b/i);
  }

  const sportSource = readFileSync(
    resolve(process.cwd(), "apps/web/src/components/SportFitImmersiveExperience.tsx"),
    "utf8"
  );
  expect(sportSource).toMatch(/LIVE PRODUCT UNIVERSE/);
});


test("Mobile Studio District uses guided focus navigation and hides commerce dock", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/studios");

  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(page.locator(".customer-mobile-commerce-nav")).toHaveCount(0);

  const enter = page.getByRole("button", { name: "ENTER STUDIO" });
  await expect(enter).toBeVisible();

  const title = page.getByText("Sport & Fit", { exact: true }).last();
  await expect(title).toBeVisible();

  await page.getByRole("button", { name: "Επόμενο Studio" }).click();
  await expect(page.getByText("Paint & Build", { exact: true }).last()).toBeVisible();

  await enter.click();
  await expect(page).toHaveURL(/\/paint-and-build-studio(?:[?#].*)?$/);
});

test("Immersive Studio routes stay free of the global mobile commerce dock", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  for (const route of [
    "/studios",
    "/sport-fit-studio",
    "/paint-and-build-studio",
    "/fitting-room",
    "/color-finder"
  ]) {
    await page.goto(route);
    await expect(page.locator(".customer-mobile-commerce-nav")).toHaveCount(0);
  }
});
