import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const sql = gunzipSync(readFileSync(`${process.cwd()}/db/seeds/0002_sparta_research_vendors.sql.gz`)).toString("utf8");
const failures: string[] = [];
const expectedSourceHash = "9b1b2da511fff5669b73366b87ba604bd0143e62acc40652c558785e13fec052";

function datasets(tag: string): readonly unknown[][] {
  const expression = new RegExp(`\\$${tag}\\$(\\[[\\s\\S]*?\\])\\$${tag}\\$`, "g");
  return [...sql.matchAll(expression)].map((match) => JSON.parse(match[1]) as unknown[]);
}

function requireContract(contract: string, message: string) {
  if (!sql.includes(contract)) failures.push(message);
}

const categories = datasets("research_categories");
const vendors = datasets("research_vendors");
const locations = datasets("research_locations");
const profiles = datasets("research_profiles");
const checks = datasets("research_checks");

if (!sql.includes(`-- SHA-256: ${expectedSourceHash}`)) failures.push("Research seed source hash is missing or unexpected");
if (categories.length !== 3 || categories.some((dataset) => dataset.length !== 48)) failures.push("Research seed must contain three equivalent 48-category projections");
if (categories.length === 3 && (JSON.stringify(categories[0]) !== JSON.stringify(categories[1]) || JSON.stringify(categories[0]) !== JSON.stringify(categories[2]))) failures.push("Research category projections must remain identical");
if (vendors.length !== 1 || vendors[0].length !== 351) failures.push("Research seed must contain 351 governed vendor candidates");
if (locations.length !== 1 || locations[0].length !== 353) failures.push("Research seed must contain 353 governed locations");
if (profiles.length !== 1 || profiles[0].length !== 351) failures.push("Research seed must contain 351 factual profile stubs");
if (checks.length !== 1 || checks[0].length !== 476) failures.push("Research seed must contain 476 dated evidence records");

for (const [label, records, key] of [
  ["vendor", vendors[0] ?? [], "public_id"],
  ["location", locations[0] ?? [], "public_id"]
] as const) {
  const values = records.map((record) => String((record as Record<string, unknown>)[key] ?? ""));
  if (values.some((value) => !value)) failures.push(`Research ${label} records must retain public IDs`);
  if (new Set(values).size !== values.length) failures.push(`Research ${label} public IDs must remain unique`);
}

requireContract("'invited','supplier_fulfilment_partner'", "Research vendors must remain invited and unclaimed");
requireContract("v.status='invited' AND v.contract_started_at IS NULL", "Seed reruns must not overwrite claimed or contracted vendors");
requireContract("p.id,'draft',NULL,NULL", "Research subscriptions must remain draft");
requireContract("s.public_email,true,NULL,s.is_primary", "Research locations must remain unverified");
requireContract("WHERE target.checked_by IS NULL", "Human-reviewed verification evidence must not be overwritten");
for (const forbidden of ["INSERT INTO vendor_users", "INSERT INTO platform_user_roles", "'active',NULL,NULL,p.sales_fee_bps"]) {
  if (sql.includes(forbidden)) failures.push(`Research seed contains forbidden activation contract: ${forbidden}`);
}

if (failures.length) {
  console.error("Research seed checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Research seed checks passed: 351 vendors, 353 locations, 48 categories and 476 evidence records remain governed and non-activating.");
