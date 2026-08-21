import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const adminRoot = join(root, "apps/web/src/app/admin");
const failures: string[] = [];
const dynamicPages: string[] = [];

function walk(directory: string) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (name === "page.tsx") {
      const rel = relative(root, path).replaceAll("\\", "/");
      if (rel.split("/").some((segment) => segment.startsWith("[") && segment.endsWith("]"))) dynamicPages.push(rel);
    }
  }
}

walk(adminRoot);

const expected = [
  "apps/web/src/app/admin/customers/[customerId]/page.tsx",
  "apps/web/src/app/admin/orders/[id]/page.tsx",
  "apps/web/src/app/admin/partners/[id]/page.tsx"
] as const;

for (const page of expected) if (!dynamicPages.includes(page)) failures.push(`Missing expected Admin record route ${page}`);
for (const page of dynamicPages) {
  const source = readFileSync(join(root, page), "utf8");
  if (!source.includes("AdminWorkspaceHeader")) failures.push(`${page} must use the shared Admin workspace header`);
  if (!source.includes("entityLabel=")) failures.push(`${page} must provide entityLabel for the global Admin breadcrumb`);
}

const orderPath = "apps/web/src/app/admin/orders/[id]/page.tsx";
const order = readFileSync(join(root, orderPath), "utf8");
for (const requirement of ['marketplaceReferenceMap("order"', "entityLabel={reference}", "Technical ID", "Internal metadata", "Order number"]) {
  if (!order.includes(requirement)) failures.push(`${orderPath} is missing ${requirement}`);
}

const partnerPath = "apps/web/src/app/admin/partners/[id]/page.tsx";
const partner = readFileSync(join(root, partnerPath), "utf8");
for (const requirement of ["entityLabel={shop.tradingName}", "<h1>{shop.tradingName}</h1>", "Partner ID"]) {
  if (!partner.includes(requirement)) failures.push(`${partnerPath} is missing ${requirement}`);
}

const customerPath = "apps/web/src/app/admin/customers/[customerId]/page.tsx";
const customer = readFileSync(join(root, customerPath), "utf8");
for (const requirement of ["entityLabel={customerName(customer)}", "<h1>{customerName(customer)}</h1>"]) {
  if (!customer.includes(requirement)) failures.push(`${customerPath} is missing ${requirement}`);
}

const customerRuntimePath = "apps/web/src/lib/admin-customer-management.ts";
if (!existsSync(join(root, customerRuntimePath))) failures.push(`Missing ${customerRuntimePath}`);
else {
  const runtime = readFileSync(join(root, customerRuntimePath), "utf8");
  if (!runtime.includes("id: stringValue(row.public_id)")) failures.push("Customer 360 must expose the public customer ID as its record ID");
}

if (failures.length) {
  console.error("Admin record identity checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`Admin record identity checks passed: ${dynamicPages.length} dynamic Admin record pages use shared entity-aware breadcrumbs and public/operator-friendly identities.`);
