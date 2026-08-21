import { readFileSync } from "node:fs";
import { ADMIN_WORKSPACE_NAVIGATION } from "../apps/web/src/lib/workspace-navigation.ts";

const root = process.cwd();
const failures: string[] = [];
const expected = new Map([
  ["/admin", "overview"],
  ["/admin/work", "operations"],
  ["/admin/partners", "partners"],
  ["/admin/matching", "catalog"],
  ["/admin/customers", "customers"],
  ["/admin/trust", "trust"],
  ["/admin/finance", "finance"],
  ["/admin/content", "content"],
  ["/admin/analytics", "analytics"],
  ["/admin/platform", "platform"]
]);

if (ADMIN_WORKSPACE_NAVIGATION.length !== expected.size) failures.push(`Expected ${expected.size} Admin domains, found ${ADMIN_WORKSPACE_NAVIGATION.length}`);
for (const group of ADMIN_WORKSPACE_NAVIGATION) {
  const wanted = group.href ? expected.get(group.href) : undefined;
  if (!wanted) failures.push(`Unexpected Admin domain landing route ${group.href ?? "missing"}`);
  else if (group.icon !== wanted) failures.push(`${group.href} must use semantic icon ${wanted}, found ${group.icon ?? "missing"}`);
}
if (new Set(ADMIN_WORKSPACE_NAVIGATION.map((group) => group.icon)).size !== ADMIN_WORKSPACE_NAVIGATION.length) failures.push("Admin domains must use unique semantic icon tokens");

const renderer = readFileSync(`${root}/apps/web/src/components/AdminDomainNavigation.tsx`, "utf8");
for (const requirement of ["AdminNavIcon", '<AdminNavIcon name={group.icon ?? "overview"} />']) if (!renderer.includes(requirement)) failures.push(`AdminDomainNavigation is missing ${requirement}`);
if (renderer.includes('{group.icon ?? group.links[0]?.icon ?? "·"}')) failures.push("Admin sidebar must not render raw Unicode group icons");

const icons = readFileSync(`${root}/apps/web/src/components/AdminNavIcon.tsx`, "utf8");
for (const icon of expected.values()) if (!icons.includes(`case "${icon}"`)) failures.push(`AdminNavIcon is missing ${icon}`);
for (const requirement of ["<svg", 'stroke="currentColor"', 'aria-hidden']) if (!icons.includes(requirement)) failures.push(`AdminNavIcon is missing ${requirement}`);

const css = readFileSync(`${root}/apps/web/src/app/admin-nav-icons.css`, "utf8");
for (const requirement of [".admin-domain-icon svg", "prefers-reduced-motion"]) if (!css.includes(requirement)) failures.push(`Admin icon styles are missing ${requirement}`);
const layout = readFileSync(`${root}/apps/web/src/app/layout.tsx`, "utf8");
if (!layout.includes('import "./admin-nav-icons.css"')) failures.push("Shared layout must load admin-nav-icons.css");

if (failures.length) {
  console.error("Admin domain icon checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Admin domain icon checks passed: ten semantic SVG domain icons, one stable renderer and reduced-motion styling verified.");
