import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const requestService = read("apps/web/src/lib/ask-local-service.ts");
const clarificationService = read("apps/web/src/lib/ask-local-clarification-service.ts");
const client = read("apps/web/src/components/AskLocalClarificationClient.tsx");
const parent = read("apps/web/src/components/AskLocalClient.tsx");
const route = read("apps/web/src/app/api/account/ask-local/clarifications/route.ts");
const css = read("apps/web/src/app/ask-local-clarifications.css");
const failures: string[] = [];

for (const contract of [
  "clarificationCount?: number",
  "Array.isArray(metadata.clarificationMessages) ? metadata.clarificationMessages.length : 0",
  "clarificationCount: 0"
]) if (!requestService.includes(contract)) failures.push(`Ask Local request projection is missing clarification-history contract: ${contract}`);

for (const contract of [
  "const maxMessages = 40",
  "clarificationCount: messages.length",
  "status: \"needs_info\"",
  "status: \"awaiting_vendor\"",
  "u.public_id=$2"
]) if (!clarificationService.includes(contract)) failures.push(`Clarification service is missing bounded/owned history contract: ${contract}`);

const memoryCountWrites = clarificationService.match(/clarificationCount: messages\.length/g)?.length ?? 0;
if (memoryCountWrites < 2) failures.push("Preview-memory clarification count must update after both vendor question and customer reply.");

for (const contract of [
  "const [expanded, setExpanded] = useState(status === \"needs_info\")",
  "if (!expanded) return",
  "Προβολή διευκρινίσεων",
  "clarificationCount <= 0",
  "setExpanded(true)",
  "Απόκρυψη",
  "setMessages(payload.messages ?? [])",
  "onRequestsChanged(payload.requests)"
]) if (!client.includes(contract)) failures.push(`Clarification client is missing lazy-history contract: ${contract}`);

if (client.includes("useEffect(() => {\n    let cancelled = false")) failures.push("Clarification history must not eagerly fetch before the lazy expansion gate.");

for (const contract of [
  "request.status === \"needs_info\" || (request.clarificationCount ?? 0) > 0",
  "clarificationCount={request.clarificationCount ?? 0}",
  "AskLocalClarificationClient"
]) if (!parent.includes(contract)) failures.push(`Ask Local request card is missing persistent clarification-history wiring: ${contract}`);

for (const contract of [
  "getAccountSession()",
  "askLocalClarificationMessages(principal, requestId)",
  "cache: \"no-store\""
]) {
  const source = contract === "cache: \"no-store\"" ? client : route;
  if (!source.includes(contract)) failures.push(`Clarification history access is missing authenticated/no-store contract: ${contract}`);
}

for (const contract of [
  ".ask-local-clarification-toggle",
  ".ask-local-clarification-close",
  "focus-visible",
  "@media(max-width:620px)"
]) if (!css.includes(contract)) failures.push(`Clarification history styling is missing accessibility/mobile contract: ${contract}`);

if (failures.length) {
  console.error("Ask Local clarification history checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Ask Local clarification history checks passed: bounded request-scoped history survives reply transitions, stays lazy outside active clarification, and preserves preview-memory parity.");
