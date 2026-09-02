import {
  extractStorefrontAttributeQuery,
  resolveStorefrontAttributeIntents,
  type StorefrontAttributeIntent
} from "../apps/web/src/lib/storefront-attribute-query.ts";
import { inferStorefrontTaxonomyIntent } from "../apps/web/src/lib/storefront-taxonomy.ts";

const failures: string[] = [];

function expectExtract(
  query: string,
  leaf: string | undefined,
  expectedText: string,
  expected: Readonly<Record<string, string>>
) {
  const result = extractStorefrontAttributeQuery(query, leaf);
  if (result.text.toLocaleLowerCase("el") !== expectedText.toLocaleLowerCase("el")) {
    failures.push(`"${query}" residual text must be "${expectedText}", received "${result.text}"`);
  }
  const values = Object.fromEntries(result.intents.map((intent) => [intent.key, intent.value]));
  for (const [key, value] of Object.entries(expected)) {
    if (values[key] !== value) failures.push(`"${query}" must infer ${key}=${value}, received ${values[key] ?? "none"}`);
  }
  for (const key of Object.keys(values)) {
    if (!(key in expected)) failures.push(`"${query}" inferred unexpected ${key}=${values[key]}`);
  }
  return result.intents;
}

expectExtract("E27 LED lamp 10W", "lighting", "lamp", { socket: "E27", led: "LED", wattage: "10 W" });
expectExtract("lamp 3000K dimmable", "lighting", "lamp", { color_temperature: "3000 K", dimmable: "true" });
expectExtract("Bosch drill 18V 1500rpm", "drills", "Bosch drill", { voltage: "18 V", rpm: "1500 rpm" });
expectExtract("750W impact drill", "drills", "drill", { wattage: "750 W", impact: "true" });
expectExtract("Samsung smartphone 256GB 8GB RAM 5G dual sim", "smartphones", "Samsung smartphone", {
  storage: "256 GB",
  ram: "8 GB",
  "5g": "5G",
  dual_sim: "Dual SIM"
});
expectExtract("smartphone 6.7 inch", "smartphones", "smartphone", { screen_size: "6.7 in" });
expectExtract("55 inch 4K smart TV", "televisions", "TV", { screen_size: "55 in", resolution: "4K", smart_tv: "Smart TV" });
expectExtract("OLED 65\" television", "televisions", "television", { panel_technology: "OLED", screen_size: "65 in" });
expectExtract("ANC bluetooth headphones", "headphones", "headphones", { anc: "ANC", connection: "Bluetooth" });
expectExtract("laser duplex printer", "printers", "printer", { print_technology: "Laser", duplex: "true" });
expectExtract("205/55 R16 91V winter tyres", "tyres", "tyres", { tyre_size: "205/55 R16", load_index: "91", speed_rating: "V", season: "Winter" });
expectExtract("100ml perfume", "fragrance", "perfume", { volume: "100 ml" });

const tvTaxonomyIntent = inferStorefrontTaxonomyIntent("55 inch 4K smart TV");
if (tvTaxonomyIntent?.category.slug !== "technology" || tvTaxonomyIntent.leaf?.key !== "televisions") {
  failures.push(`Full TV query must reach technology/televisions before attribute extraction, received ${tvTaxonomyIntent?.category.slug ?? "none"}/${tvTaxonomyIntent?.leaf?.key ?? "none"}`);
} else {
  const tvEndToEnd = extractStorefrontAttributeQuery("55 inch 4K smart TV", tvTaxonomyIntent.leaf.key);
  const tvEndToEndValues = Object.fromEntries(tvEndToEnd.intents.map((intent) => [intent.key, intent.value]));
  if (tvEndToEnd.text !== "TV" || tvEndToEndValues.screen_size !== "55 in" || tvEndToEndValues.resolution !== "4K" || tvEndToEndValues.smart_tv !== "Smart TV") {
    failures.push("Full TV query must preserve TV residual text and extract size/resolution/smart attributes end to end");
  }
}
const pluralTvIntent = inferStorefrontTaxonomyIntent("65 inch TVs");
if (pluralTvIntent?.category.slug !== "technology" || pluralTvIntent.leaf?.key !== "televisions") failures.push("Plural TVs query must share the technology/televisions taxonomy handoff");

const ambiguousPhone = extractStorefrontAttributeQuery("8GB 128GB smartphone", "smartphones");
if (ambiguousPhone.intents.some((intent) => intent.key === "storage" || intent.key === "ram")) {
  failures.push("Multiple unlabeled smartphone memory capacities must remain ambiguous");
}
const unlabeledLaptop = extractStorefrontAttributeQuery("16GB laptop", "laptops");
if (unlabeledLaptop.intents.some((intent) => intent.key === "storage" || intent.key === "ram")) {
  failures.push("Unlabeled laptop memory must not be guessed as RAM or storage");
}
const noLeaf = extractStorefrontAttributeQuery("18V 750W", undefined);
if (noLeaf.intents.length || noLeaf.text !== "18V 750W") failures.push("Attribute extraction must be disabled without a known product leaf");
const bareNumber = extractStorefrontAttributeQuery("55 TV", "televisions");
if (bareNumber.intents.some((intent) => intent.key === "screen_size")) failures.push("Bare TV numbers without an inch unit must not become screen-size filters");

const drillIntents = extractStorefrontAttributeQuery("Bosch drill 18V", "drills").intents;
const drillResolved = resolveStorefrontAttributeIntents(drillIntents, [
  { key: "voltage", options: [{ value: "12 V", label: "12 V" }, { value: "18V", label: "18 V" }] }
]);
if (drillResolved.voltage !== "18V") failures.push(`18 V query intent must resolve formatting-equivalent live option, received ${drillResolved.voltage ?? "none"}`);

const tvIntents = extractStorefrontAttributeQuery("55 inch smart TV", "televisions").intents;
const tvResolved = resolveStorefrontAttributeIntents(tvIntents, [
  { key: "screen_size", options: [{ value: "55″", label: "55 inches" }, { value: "65″", label: "65 inches" }] },
  { key: "smart_tv", options: [{ value: "true", label: "Ναι" }, { value: "false", label: "Όχι" }] }
]);
if (tvResolved.screen_size !== "55″") failures.push(`55 inch intent must resolve live typographic inch option, received ${tvResolved.screen_size ?? "none"}`);
if (tvResolved.smart_tv !== "true") failures.push(`Smart TV intent must resolve a live truthy option, received ${tvResolved.smart_tv ?? "none"}`);

const explicitWins = resolveStorefrontAttributeIntents(drillIntents, [
  { key: "voltage", options: [{ value: "18 V", label: "18 V" }] }
], { voltage: "12 V" });
if (explicitWins.voltage) failures.push("Explicit structured filter must suppress inferred value for the same key");

const tiedIntent: StorefrontAttributeIntent = { key: "connection", value: "Wireless", source: "wireless" };
const tied = resolveStorefrontAttributeIntents([tiedIntent], [
  { key: "connection", options: [{ value: "Wireless RF", label: "Wireless RF" }, { value: "Wireless Bluetooth", label: "Wireless Bluetooth" }] }
]);
if (tied.connection) failures.push("Natural attribute intent must not hard-filter when multiple live values tie");

if (failures.length) {
  console.error("Natural attribute intent checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Natural attribute intent checks passed: leaf-scoped extraction, end-to-end taxonomy handoff, ambiguity guards, unit normalization, live-option resolution and explicit-filter precedence verified.");
