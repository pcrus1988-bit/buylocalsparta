import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../db/migrations/0099_supabase_data_api_privilege_hardening.sql", import.meta.url), "utf8");
const failures: string[] = [];

const requiredContracts = [
  "REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon, authenticated, service_role",
  "REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated, service_role",
  "REVOKE USAGE ON SCHEMA public FROM PUBLIC, anon, authenticated, service_role",
  "GRANT USAGE ON SCHEMA public TO bls_app_runtime, bls_platform_runtime",
  "REVOKE USAGE ON SCHEMA bls_private FROM anon, authenticated, service_role",
  "REVOKE EXECUTE ON FUNCTION public.run_fiscal_reconciliation_cron()",
  "FROM PUBLIC, anon, authenticated, service_role, bls_app_runtime, bls_platform_runtime",
  "REVOKE EXECUTE ON FUNCTION public.st_estimatedextent(text, text)",
  "REVOKE EXECUTE ON FUNCTION public.st_estimatedextent(text, text, text)",
  "REVOKE EXECUTE ON FUNCTION public.st_estimatedextent(text, text, text, boolean)",
  "ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public",
  "REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role",
  "ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA bls_private"
];

for (const contract of requiredContracts) {
  if (!migration.includes(contract)) failures.push(`Missing hardening contract: ${contract}`);
}

if (!migration.includes("GRANT EXECUTE ON FUNCTION %I.%I(%s) TO bls_app_runtime, bls_platform_runtime")) {
  failures.push("Trusted PostgreSQL runtime roles must retain explicit helper-function execution where intended");
}

for (const protectedHelper of ["next_public_reference", "resolve_marketplace_public_reference"]) {
  if (!migration.includes(protectedHelper)) failures.push(`Postgres-only helper exception is missing: ${protectedHelper}`);
}

for (const forbidden of [
  /GRANT\s+[^;]*\bTO\s+anon\b/i,
  /GRANT\s+[^;]*\bTO\s+authenticated\b/i,
  /GRANT\s+[^;]*\bTO\s+service_role\b/i,
  /UPDATE\s+customer_profiles\b/i,
  /DELETE\s+FROM\s+customer_profiles\b/i
]) {
  if (forbidden.test(migration)) failures.push(`Migration contains forbidden widening/data mutation pattern: ${forbidden}`);
}

if (failures.length) {
  console.error("Supabase privilege hardening checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Supabase privilege hardening checks passed: Data API roles are denied public/bls_private schema access, privileged RPCs are closed, trusted server roles remain explicit, and no customer data is rewritten.");
