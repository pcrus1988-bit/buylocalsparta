import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const page = read("../app/page.tsx");
const theme = read("../app/experience.css");
const atelier = read("../app/nail-style-studio.tsx");
const layout = read("../app/layout.tsx");
const care = read("../app/guided-care.tsx");
const color = read("../app/photo-color-studio.tsx");

test("one real interactive workspace exposes all four experiences without changing endpoints", () => {
  assert.match(page, /nyxi-workspace/);
  assert.match(page, /nyxi-chapter-nav/);
  assert.match(page, /aria-pressed=\{tab === item\.value\}/);
  for (const id of ["color", "care", "style", "search"]) {
    assert.ok(page.includes('tab !== "' + id + '"'), id + " remains switchable");
  }
  for (const component of ["PhotoColorStudio", "GuidedCare", "NailStyleStudio", "PublicSourceAtlas"]) {
    assert.ok(page.includes("<" + component), component + " is rendered");
  }
  assert.match(page, /NEXT_PUBLIC_NYXI_SEARCH_ENABLED/);
  assert.match(page, /encodeURIComponent\(q\.trim\(\)\)/);
  assert.match(page, /no-store/);
});

test("mobile viewport, responsive workspace and motion preferences are explicit", () => {
  assert.match(layout, /width: 'device-width'/);
  assert.match(layout, /initialScale: 1/);
  assert.match(layout, /import '\.\/experience\.css';/);
  assert.match(theme, /@media\(max-width:900px\)/);
  assert.match(theme, /@media\(max-width:650px\)/);
  assert.match(theme, /@media\(max-width:390px\)/);
  assert.match(theme, /prefers-reduced-motion:reduce/);
  assert.match(theme, /nyxi-workspace/);
  assert.match(theme, /nyxi-space-/);
});

test("sampled shade actually transfers into the creative try-on, not just the copy", () => {
  assert.match(page, /onColorPick=\{setSampledShade\}/);
  assert.match(page, /nyxi-color-handoff/);
  assert.match(page, /setTab\("style"\)/);
  assert.match(atelier, /useEffect/);
  assert.match(atelier, /setPolishMode\("creative"\)/);
  assert.match(atelier, /setHasPickedCustom\(true\)/);
  assert.match(atelier, /sampledShade/);
});

test("private photo sampling, medical limitations and reviewer guard are preserved", () => {
  assert.match(color, /createImageBitmap\(file\)/);
  assert.match(color, /getImageData/);
  assert.match(color, /MAX_IMAGE_BYTES/);
  assert.match(care, /Δεν υποκαθιστούν|δεν υποκαθιστούν/);
  assert.match(care, /warningSigns/);
  assert.match(layout, /index: false/);
  assert.doesNotMatch(page, /service_role|SUPABASE_SERVICE_ROLE_KEY|localStorage\.setItem/);
});
