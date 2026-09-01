import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [evaluation, phase1, types, shell, service, prompt] = await Promise.all([
  read("apps/web/src/lib/admin-assistant/action-evaluation.ts"),
  read("apps/web/src/lib/admin-assistant/phase1-snapshot.ts"),
  read("apps/web/src/lib/admin-assistant/types.ts"),
  read("apps/web/src/components/AdminAssistantShell.tsx"),
  read("apps/web/src/lib/admin-assistant/service.ts"),
  read("apps/web/src/lib/admin-assistant/prompt.ts")
]);

assert.match(evaluation, /adminOperationsWorkspace/);
assert.match(evaluation, /hasAdminPermission\(principal, "admin\.audit\.read"\)/);
assert.match(evaluation, /entry\.actorId === principal\.userId/);
assert.match(evaluation, /ACTION_WINDOW_MS = 15 \* 60 \* 1_000/);
assert.match(evaluation, /SAFE_STATE_FIELDS/);
for (const field of ["status", "state", "active", "visibility", "verified", "approvalStatus", "transmissionStatus", "paymentStatus", "fulfilmentStatus", "freshnessStatus"]) assert.match(evaluation, new RegExp(`"${field}"`));
assert.match(evaluation, /typeof value === "string" && value\.length <= 80/);
assert.match(evaluation, /!\/\[\\r\\n\]\/\.test\(value\)/);
assert.match(evaluation, /safeStateChanges\(entry\.before, entry\.after\)/);
assert.doesNotMatch(evaluation, /entry\.reason/);
assert.doesNotMatch(evaluation, /JSON\.stringify\(entry\.(?:before|after|reason)/);
assert.match(evaluation, /the assistant will not invent an impact/i);
assert.match(evaluation, /refreshed page still reports/i);
assert.match(evaluation, /admin_action_impact_evaluated/);
assert.match(evaluation, /recordAssistantToolAudit/);
assert.match(evaluation, /toolName: "evaluateAdminActionImpact"/);
assert.match(evaluation, /finance\.settlement_pay/);
assert.match(evaluation, /vendor\\\.application_/);
assert.match(evaluation, /relevantToContext/);
assert.match(evaluation, /actionDomain/);
assert.doesNotMatch(evaluation, /DELETE FROM|UPDATE public\.|INSERT INTO/i);

assert.match(phase1, /evaluateRecentAdminActions/);
assert.match(phase1, /evaluateRecentAdminActions\(principal, snapshot\)/);
assert.match(phase1, /actionEvaluations: \[\]/);
assert.match(types, /AdminAssistantActionStateChange/);
assert.match(types, /AdminAssistantActionEvaluation/);
assert.match(types, /outcome: "confirmed" \| "changed" \| "recorded"/);
assert.match(types, /actionEvaluations\?: readonly AdminAssistantActionEvaluation\[\]/);

assert.match(service, /snapshot\.actionEvaluations\?\.slice\(0, 3\)/);
assert.match(service, /did that work/);
assert.match(service, /Latest Admin action evaluation/);
assert.match(service, /latest\.summary/);
assert.match(service, /latest\.recommendation/);
assert.match(service, /actionEvaluations: input\.snapshot\.actionEvaluations/);
assert.match(prompt, /trusted action-evaluation evidence/i);
assert.match(prompt, /Do not infer success from the action name alone/i);

// Existing shell renders only the server-composed snapshot summary/findings. The
// local completion event may contain a bounded afterState hint, but raw audit
// state changes/evaluations are never rendered directly by the client.
assert.match(shell, /snapshot\.summary/);
assert.match(shell, /snapshot\.findings/);
assert.doesNotMatch(shell, /snapshot\.actionEvaluations|\.stateChanges|audit\.reason/);

console.log("Admin Assistant action evaluation verifier passed.");
