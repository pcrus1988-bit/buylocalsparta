import vm from "node:vm";
import { adminPage, customerPage, joinPage, vendorPage } from "../dev/ui.ts";

const pages = {
  customer: customerPage(),
  vendor: vendorPage(),
  admin: adminPage(),
  join: joinPage()
};

for (const [name, html] of Object.entries(pages)) {
  const matches = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
  if (matches.length === 0) throw new Error(`${name} page contains no executable script`);
  for (const [index, match] of matches.entries()) {
    try {
      new vm.Script(match[1], { filename: `${name}-inline-${index + 1}.js` });
    } catch (error) {
      throw new Error(`${name} inline script ${index + 1} is invalid: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

console.log(`Inline UI syntax OK: ${Object.keys(pages).length} development pages verified.`);
