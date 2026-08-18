import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const failures: string[] = [];

const liveAdapter = read("packages/postgres-runtime/src/admin-operations-live.ts");
const runtimeFactory = read("packages/postgres-runtime/src/index.ts");
const fairnessPage = read("apps/web/src/app/admin/fairness/page.tsx");

for (const legacyColumn of ["e.sticky", "e.selected_offer_id", "e.market_id", "e.deficits_snapshot"]) {
  if (liveAdapter.includes(legacyColumn)) failures.push(`Live fairness adapter must not depend on removed legacy assignment column ${legacyColumn}`);
}

if (!liveAdapter.includes("PostgresUnitOfWork") || !liveAdapter.includes("platformScope(principal.userId)")) {
  failures.push("Live fairness adapter must preserve the governed PostgreSQL unit-of-work and platform RLS scope");
}
if (!liveAdapter.includes("fairness_rotation_state") || !liveAdapter.includes("fairness_appeals") || !liveAdapter.includes("fairness_anomalies")) {
  failures.push("Live fairness adapter must retain rotation, appeal and anomaly read models");
}
if (!liveAdapter.includes("recentAssignments: []")) {
  failures.push("Legacy assignment projection must stay disabled until a JSON-snapshot DTO replaces the removed sticky/offer schema");
}
if (!runtimeFactory.includes('import { PostgresAdminOperationsLiveService } from "./admin-operations-live.ts"') || !runtimeFactory.includes("new PostgresAdminOperationsLiveService")) {
  failures.push("Production PostgreSQL runtime must instantiate the live-schema admin operations adapter");
}
if (fairnessPage.includes("recentAssignments") || fairnessPage.includes("anomalies")) {
  failures.push("Admin Fairness UI must not silently depend on the intentionally retired legacy assignment projection");
}

if (failures.length) {
  console.error("Fairness live-schema checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Fairness live-schema checks passed: governed rotation/appeal/anomaly reads use the production runtime without legacy assignment columns.");
