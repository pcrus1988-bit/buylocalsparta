import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(webDir, "../..");
const required = [
  "package.json",
  "packages/core/package.json",
  "packages/postgres-runtime/package.json",
  "packages/viva-payments/package.json"
];

try {
  for (const relative of required) await access(resolve(repoRoot, relative));
} catch {
  throw new Error(
    "Buy Local Sparta web build cannot see the monorepo workspace packages. " +
    "On Vercel set Root Directory to the repository root (leave it blank), not apps/web, " +
    "then use the committed root vercel.json build settings."
  );
}

const root = JSON.parse(await readFile(resolve(repoRoot, "package.json"), "utf8"));
const web = JSON.parse(await readFile(resolve(webDir, "package.json"), "utf8"));
if (root.version !== web.version) throw new Error(`Build version mismatch: root ${root.version} vs web ${web.version}`);
if (!Array.isArray(root.workspaces) || !root.workspaces.includes("apps/*") || !root.workspaces.includes("packages/*")) {
  throw new Error("Monorepo workspace declaration is missing apps/* or packages/*");
}
console.log(`Build context OK: Buy Local Sparta ${root.version} monorepo workspace is visible.`);
