import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("dropship publication never requires a product translation", async () => {
  const files = [
    new URL("../src/lib/symphonya-auto-publication-runtime.ts", import.meta.url),
    new URL("../src/lib/nova-auto-publication-runtime.ts", import.meta.url),
    new URL("../src/lib/zendrop-auto-publication-runtime.ts", import.meta.url)
  ];
  for (const url of files) {
    const source = await readFile(url, "utf8");
    assert.doesNotMatch(
      source,
      /EXISTS\s*\([\s\S]{0,400}product_translations[\s\S]{0,400}(?:locale|title)/i,
      `${url.pathname} must not use localization as a publication prerequisite`
    );
  }
});

test("Zendrop explicitly publishes with source-language fallback", async () => {
  const source = await readFile(
    new URL("../src/lib/zendrop-auto-publication-runtime.ts", import.meta.url),
    "utf8"
  );
  assert.match(source, /localizationRequiredForPublication',false/);
  assert.match(source, /sourceLanguageFallbackAllowed',true/);
});
