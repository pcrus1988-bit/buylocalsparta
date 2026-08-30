import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [search, investigation, customer] = await Promise.all([
  read("apps/web/src/lib/admin-assistant/global-search.ts"),
  read("apps/web/src/lib/admin-assistant/investigation.ts"),
  read("apps/web/src/lib/admin-assistant/customer-intelligence.ts")
]);

assert.match(search, /relatedCustomerId\?: string/);
assert.match(search, /kind: "support"/);
assert.match(search, /relatedCustomerId: item\.customerId/);
assert.match(search, /href: `\/admin\/customers\/\$\{encodeURIComponent\(item\.customerId\)\}`/);

assert.match(investigation, /rows\.length !== 1/);
assert.match(investigation, /row\.kind === "customer"/);
assert.match(investigation, /row\.kind === "support" && relatedCustomerId/);
assert.match(investigation, /getCustomerOperationalIntelligence/);
assert.match(investigation, /customerId: relatedCustomerId/);
assert.match(investigation, /availableAssistantTools/);
assert.match(investigation, /candidates\.slice\(0, 3\)/);

// Customer follow-up remains privacy-minimized: the support match only hands over customer id.
assert.doesNotMatch(search, /support.*(?:note|messageBody|emailBody|address)/i);
assert.doesNotMatch(customer, /addresses:/);
assert.doesNotMatch(customer, /phone:/);
assert.doesNotMatch(customer, /email:/);
assert.doesNotMatch(customer, /note:/);

console.log("Admin Assistant search chaining verifier passed.");
