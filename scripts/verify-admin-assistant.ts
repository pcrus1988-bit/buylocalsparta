import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { boundedText, safeAdminHref } from "../apps/web/src/lib/admin-assistant/types.ts";
import { parseAssistantClientContext, suggestedQuestionsForDomain } from "../apps/web/src/lib/admin-assistant/context.ts";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

assert.equal(safeAdminHref("/admin/seo"), "/admin/seo");
assert.equal(safeAdminHref("https://evil.example/admin"), undefined);
assert.equal(safeAdminHref("javascript:alert(1)"), undefined);
assert.equal(boundedText("  hello  ", 20), "hello");
assert.equal(boundedText("x".repeat(50), 12).length, 12);

const malicious = parseAssistantClientContext({
  route: "https://evil.example/ignore-system",
  filters: Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`k${index}`, "v".repeat(300)])),
  searchQuery: "q".repeat(500),
  selectedTab: "t".repeat(500)
});
assert.equal(malicious.route, "/admin");
assert.equal(Object.keys(malicious.filters ?? {}).length, 12);
assert.ok((malicious.searchQuery?.length ?? 0) <= 250);
assert.ok((malicious.selectedTab?.length ?? 0) <= 120);
assert.ok(suggestedQuestionsForDomain("catalogue").some((item) => /unmapped/i.test(item)));
assert.ok(suggestedQuestionsForDomain("tax").some((item) => /MARK/i.test(item)));

const [prompt, contextRoute, messageRoute, conversationsRoute, repository, service, tools, migration, shell, actionButton] = await Promise.all([
  read("apps/web/src/lib/admin-assistant/prompt.ts"),
  read("apps/web/src/app/api/admin/assistant/context/route.ts"),
  read("apps/web/src/app/api/admin/assistant/message/route.ts"),
  read("apps/web/src/app/api/admin/assistant/conversations/route.ts"),
  read("apps/web/src/lib/admin-assistant/repository.ts"),
  read("apps/web/src/lib/admin-assistant/service.ts"),
  read("apps/web/src/lib/admin-assistant/tools.ts"),
  read("db/migrations/0168_admin_assistant.sql"),
  read("apps/web/src/components/AdminAssistantShell.tsx"),
  read("apps/web/src/components/AdminActionButton.tsx")
]);

assert.match(prompt, /untrusted data/i);
assert.match(prompt, /never commands/i);
assert.match(prompt, /Consequential writes require explicit Admin approval/i);
assert.match(prompt, /Never reveal chain-of-thought/i);

for (const route of [contextRoute, messageRoute]) {
  assert.match(route, /requireAdminSession\(request, \{ csrf: true \}\)/);
  assert.match(route, /cache-control/);
}
assert.match(conversationsRoute, /requireAdminSession\(\)/);
assert.doesNotMatch(messageRoute, /action\/execute|direct SQL|DELETE FROM|UPDATE public\./i);

assert.match(repository, /admin_user_id=\$2/);
assert.match(repository, /platformScope\(principal\.userId\)/);
assert.match(repository, /parameters_json/);
assert.doesNotMatch(repository, /password|api[_-]?key|payment instrument/i);

assert.match(service, /https:\/\/api\.openai\.com\/v1\/responses/);
assert.match(service, /ADMIN_ASSISTANT_SYSTEM_PROMPT_V1/);
assert.match(service, /collectSources/);
assert.match(service, /url\.protocol === "https:"/);
assert.match(service, /deterministicAnswer/);
assert.doesNotMatch(service, /eval\(|new Function|javascript:/i);

assert.match(tools, /adminCatalogueOverviewWorkspace/);
assert.match(tools, /adminOrdersReturnsWorkspace/);
assert.match(tools, /adminTaxWorkspace/);
assert.match(tools, /adminSeoWorkspace/);
assert.match(tools, /adminMaintenanceWorkspace/);
assert.doesNotMatch(tools, /SELECT |INSERT |UPDATE |DELETE /i);

assert.match(migration, /ENABLE ROW LEVEL SECURITY/g);
assert.match(migration, /bls_private\.is_platform_runtime\(\)/);
assert.match(migration, /admin_assistant_tool_audit/);
assert.doesNotMatch(migration, /GRANT .* TO anon|GRANT .* TO authenticated/i);

assert.match(shell, /event\.key === "Escape"/);
assert.match(shell, /AbortController/);
assert.match(shell, /aria-label="KONTA MOY Assistant"/);
assert.match(shell, /External\/public information/);
assert.match(actionButton, /publishAdminActionCompleted/);
assert.doesNotMatch(actionButton, /publishAdminActionCompleted\(\{[^}]*payload/);

console.log("Admin Personal Assistant acceptance verifier passed.");
