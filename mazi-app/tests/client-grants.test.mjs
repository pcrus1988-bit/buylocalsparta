import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

// Static migration contract. Live role/column privileges are verified separately
// against Supabase after deployment; this test prevents accidental regression.
const source = readFileSync(new URL("../sql/012_lock_down_client_role_grants.sql", import.meta.url), "utf8");
const sql = source.split("\n").filter(line => !/^\s*--/.test(line)).join("\n");
const tables = [
  "administrators", "application_followups", "audit_events", "cycle_results",
  "cycles", "fund_ledger", "members", "membership_applications",
  "proposal_results", "proposals", "vote_conflicts", "vote_invalidations", "votes"
];

test("all MAZI tables revoke browser Data API privileges", () => {
  const match = sql.match(/revoke\s+all\s+privileges\s+on\s+table\s+([\s\S]*?)\s+from\s+anon\s*,\s*authenticated\s*;/i);
  assert.ok(match, "an explicit comprehensive revoke is required");
  const actual = match[1].split(",").map(v => v.trim()).sort();
  const expected = tables.map(name => `public.mazi_${name}`).sort();
  assert.deepEqual(actual, expected);
});

test("the sole remaining client grant exposes only founding-cycle public status", () => {
  const grants = [...sql.matchAll(/\bgrant\s+([^;]+);/gi)]
    .map(match => match[1].replace(/\s+/g, " ").trim().toLowerCase());
  assert.deepEqual(grants, ["select on table public.mazi_cycles to anon"]);
});

test("role-grant hardening does not write data or broaden service access", () => {
  assert.doesNotMatch(sql, /\b(insert\s+into|delete\s+from|update\s+public\.|truncate\s+table)\b/i);
  assert.doesNotMatch(sql, /\bfinance_activated\s*=\s*true\b/i);
  assert.doesNotMatch(sql, /\b(?:revoke|grant)[^;]*\bservice_role\b/i);
});
