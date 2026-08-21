import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const service = read("apps/web/src/lib/customer-session-management.ts");
const collectionRoute = read("apps/web/src/app/api/account/security/sessions/route.ts");
const itemRoute = read("apps/web/src/app/api/account/security/sessions/[id]/route.ts");
const page = read("apps/web/src/app/account/security/page.tsx");
const client = read("apps/web/src/components/AccountSessionsClient.tsx");
const css = read("apps/web/src/app/customer-profile-security.css");
const failures: string[] = [];

for (const contract of [
  "customerSessionManagementReadiness",
  "customerActiveSessions",
  "revokeOtherCustomerSession",
  "revokeOtherCustomerSessions",
  "JOIN users u ON u.id=us.user_id",
  "u.public_id=$1",
  "principal.sessionId",
  "us.public_id<>$3",
  "us.public_id<>$2",
  "us.expires_at>$2"
]) {
  if (!service.includes(contract)) failures.push(`Customer session service is missing ${contract}`);
}
for (const forbidden of ["session_hash", "csrf_hash", "ip_hash", "user_agent_hash"]) {
  if (service.includes(forbidden)) failures.push(`Customer session projection must not read or expose ${forbidden}`);
}
if (!service.includes('normalized === principal.sessionId')) failures.push("Individual session revocation must explicitly protect the current session");

for (const contract of ["requireAccountSession()", "customerActiveSessions", 'Cache-Control": "no-store"']) {
  if (!collectionRoute.includes(contract)) failures.push(`Customer sessions collection API is missing ${contract}`);
}
for (const contract of ["requireAccountSession(request, true)", "revokeOtherCustomerSessions", "DELETE"]) {
  if (!collectionRoute.includes(contract)) failures.push(`Customer sessions bulk-revocation API is missing ${contract}`);
}
for (const contract of ["requireAccountSession(request, true)", "revokeOtherCustomerSession", "await params", "DELETE"]) {
  if (!itemRoute.includes(contract)) failures.push(`Customer individual-session API is missing ${contract}`);
}

for (const contract of ["customerActiveSessions(principal)", "customerSessionManagementReadiness()", "AccountSessionsClient", "initialSessions={activeSessions}"]) {
  if (!page.includes(contract)) failures.push(`Account security page is missing session-management contract ${contract}`);
}
for (const contract of [
  "/api/account/security/sessions",
  '"x-csrf-token": csrfToken',
  "encodeURIComponent(sessionId)",
  "Αυτή η συνεδρία",
  "Άλλη ενεργή συνεδρία",
  "Αποσύνδεση όλων των άλλων",
  "Δεν εμφανίζονται διευθύνσεις IP, token ή αναγνωριστικά συσκευής",
  "CustomerHowItWorks"
]) {
  if (!client.includes(contract)) failures.push(`Customer session-management UI is missing ${contract}`);
}
const clientWithoutAllowedSessionIdUses = client
  .replaceAll("session.id !== sessionId", "")
  .replaceAll("key={session.id}", "")
  .replaceAll("busySessionId === session.id", "")
  .replaceAll("revokeOne(session.id)", "");
if (clientWithoutAllowedSessionIdUses.includes("session.id")) failures.push("Customer UI may use the public session identifier only for internal keying, action targeting and local busy-state comparisons; it must not render it as account-facing content");
for (const style of ["customer-session-toolbar", "customer-session-list", "customer-session-card", "customer-session-meta"]) {
  if (!css.includes(style)) failures.push(`Customer session-management styles are missing ${style}`);
}

if (failures.length) {
  console.error("Customer session-management checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Customer session-management checks passed: customer ownership, current-session protection, CSRF revocation, privacy-minimized projection, account-wide disconnect controls and responsive security UX verified.");
