import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const service = read("apps/web/src/lib/ask-local-service.ts");
const clarification = read("apps/web/src/lib/ask-local-clarification-service.ts");
const client = read("apps/web/src/components/AskLocalClient.tsx");
const accountView = read("apps/web/src/lib/account-view.ts");
const accountBrowserView = read("apps/web/src/lib/customer-account-browser-view.ts");
const failures: string[] = [];
const expect = (condition: boolean, message: string) => { if (!condition) failures.push(message); };

for (const contract of [
  "RETURNING reference_number",
  "const referenceNumber = await uow.withTransaction",
  "request.referenceNumber === referenceNumber",
  "SELECT cr.reference_number,cr.status::text",
  "const referenceNumber = typeof row.reference_number === \"string\" ? row.reference_number.trim() : \"\"",
  "id: referenceNumber, referenceNumber",
  "Ask Local request is missing its public reference number",
  "const referenceNumber = `ASK-${String("
]) expect(service.includes(contract), `Customer Ask Local projection is missing public-reference contract: ${contract}`);

const listProjection = service.match(/export async function customerAskLocalRequests[\s\S]*?async function submitMemory/)?.[0] ?? "";
expect(Boolean(listProjection), "Customer Ask Local list projection could not be inspected");
expect(!listProjection.includes("cr.public_id"), "Customer Ask Local list query must not select the technical counteroffer public_id");
expect(!service.includes("return { id: String(row.public_id)"), "Customer Ask Local view must never expose counteroffer_requests.public_id as its id");
expect(!service.includes("id: requestId, referenceNumber"), "Preview Ask Local view must not expose a technical request id");

const ownedReferencePredicate = "(cr.reference_number=$1 OR cr.public_id=$1) AND u.public_id=$2";
expect(clarification.split(ownedReferencePredicate).length - 1 >= 2, "Customer clarification read/reply must accept public references and legacy IDs only under customer ownership");
expect(clarification.includes("cr.public_id AS request_public_id,cr.reference_number"), "Customer clarification reply must retain the internal request id only for server/vendor operational use");
expect(clarification.includes("JSON.stringify({ requestReference: String(row.reference_number), vendorId: principal.vendorId })"), "Vendor-to-customer clarification notification must use the human Ask Local reference");
expect(!clarification.includes("JSON.stringify({ requestId, vendorId: principal.vendorId })"), "Vendor-to-customer clarification notification must not expose the technical request id");

for (const contract of [
  "key={request.referenceNumber}",
  "requestId={request.referenceNumber}",
  "context=ask_local&id=${encodeURIComponent(request.referenceNumber)}"
]) expect(client.includes(contract), `Customer Ask Local UI is missing human-reference action contract: ${contract}`);
expect(!client.includes("requestId={request.id}"), "Customer clarification UI must not send a generic/internal request id");

expect(accountView.includes("state.notifications.map(customerBrowserNotification)"), "Account dashboard must use the explicit customer notification browser projection");
expect(accountBrowserView.includes('"requestReference"'), "Customer notification payload allowlist must retain public Ask Local references");
expect(!accountBrowserView.includes('"requestId"'), "Customer notification payload allowlist must not expose technical Ask Local request ids");

if (failures.length) {
  console.error("Customer Ask Local public-reference checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Customer Ask Local public-reference checks passed: ASK references drive customer cards and clarification actions, legacy cor IDs resolve only server-side under ownership, and technical request IDs are stripped from customer notification payloads.");
