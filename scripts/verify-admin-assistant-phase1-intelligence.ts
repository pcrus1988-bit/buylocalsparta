import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [phase1, matching, searchConsole, toolRegistry, investigation, context, pageRegistry] = await Promise.all([
  read("apps/web/src/lib/admin-assistant/phase1-snapshot.ts"),
  read("apps/web/src/lib/admin-assistant/matching-intelligence.ts"),
  read("apps/web/src/lib/admin-assistant/search-console-intelligence.ts"),
  read("apps/web/src/lib/admin-assistant/tool-registry.ts"),
  read("apps/web/src/lib/admin-assistant/investigation.ts"),
  read("apps/web/src/lib/admin-assistant/context.ts"),
  read("apps/web/src/lib/admin-assistant/page-registry.ts")
]);

assert.match(phase1, /productMatchingIntelligence/);
assert.match(phase1, /searchConsoleIntelligence/);
assert.match(phase1, /pageType === "product_matching"/);
assert.match(phase1, /\["seo_overview", "search_console"\]/);

for (const rule of [
  "canonical_conflict",
  "canonical_candidate_ambiguity",
  "canonical_low_confidence_auto_link",
  "product_unlinked_canonical",
  "product_no_canonical_candidate",
  "canonical_link_not_offer_ready"
]) assert.match(matching, new RegExp(rule));
assert.match(matching, /adminMatchingWorkspace/);
assert.match(matching, /AMBIGUITY_DELTA/);
assert.match(matching, /absence of a candidate is not proof/i);
assert.match(matching, /linkage and offer approval are separate governance steps/i);
assert.doesNotMatch(matching, /DELETE FROM|UPDATE public\.|INSERT INTO/i);

for (const rule of [
  "search_console_not_ready",
  "search_console_no_baseline",
  "search_visibility_decline",
  "search_console_high_impression_low_ctr",
  "search_console_near_page_one",
  "search_console_zero_click_demand"
]) assert.match(searchConsole, new RegExp(rule));
assert.match(searchConsole, /getSearchConsoleHistoryWorkspace/);
assert.match(searchConsole, /searchConsoleReadiness/);
assert.match(searchConsole, /privacy-minimized/i);
assert.match(searchConsole, /do not infer causality/i);
assert.doesNotMatch(searchConsole, /DELETE FROM|UPDATE public\.|INSERT INTO/i);

for (const tool of ["getProductMatchingIntelligence", "getSearchConsoleIntelligence"]) assert.match(toolRegistry, new RegExp(tool));
assert.match(toolRegistry, /adminMatchingWorkspace/);
assert.match(toolRegistry, /getSearchConsoleHistoryWorkspace/);
assert.match(toolRegistry, /pageTypes: \["product_matching"\]/);
assert.match(toolRegistry, /pageTypes: \["seo_overview", "search_console"\]/);
assert.match(toolRegistry, /recordAssistantToolAudit/);
assert.match(toolRegistry, /ASSISTANT_TOOL_PERMISSION_REQUIRED/);

assert.match(investigation, /getProductMatchingIntelligence/);
assert.match(investigation, /context\.filters\.submission/);
assert.match(investigation, /getSearchConsoleIntelligence/);
assert.match(investigation, /candidates\.slice\(0, 3\)/);
assert.match(investigation, /availableAssistantTools/);

assert.match(pageRegistry, /product_matching/);
assert.match(pageRegistry, /canonical readiness/i);
assert.match(context, /Find duplicate-risk products/i);
assert.match(context, /Which search queries are opportunities/i);

console.log("Admin Assistant Phase 1 intelligence acceptance verifier passed.");
