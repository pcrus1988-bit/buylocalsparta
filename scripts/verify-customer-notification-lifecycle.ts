import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const runtime = read("apps/web/src/lib/customer-state-runtime.ts");
const readRoute = read("apps/web/src/app/api/account/notifications/[id]/read/route.ts");
const archiveRoute = read("apps/web/src/app/api/account/notifications/[id]/archive/route.ts");
const readAllRoute = read("apps/web/src/app/api/account/notifications/read-all/route.ts");
const client = read("apps/web/src/components/AccountNotificationsClient.tsx");
const styles = read("apps/web/src/app/customer-notification-lifecycle.css");
const layout = read("apps/web/src/app/layout.tsx");
const postgresNotifications = read("packages/core/src/persistence/postgres-notifications.ts");
const coreNotifications = read("packages/core/src/notifications/service.ts");
const failures: string[] = [];

for (const contract of [
  "export async function markCustomerNotificationRead",
  "export async function archiveCustomerNotification",
  "getAccountRuntime().notifications.markRead",
  "getAccountRuntime().notifications.archive",
  "n.public_id=$1",
  "u.public_id=$2",
  "n.channel='in_app'",
  "n.archived_at IS NULL",
  "archiveForUser"
]) if (!runtime.includes(contract)) failures.push(`Customer notification runtime is missing lifecycle/ownership contract: ${contract}`);

if (!runtime.includes("SET read_at=COALESCE(n.read_at,$3)")) failures.push("Single-read must be idempotent and preserve the original read timestamp.");
if (!runtime.includes("if (result.rowCount !== 1)")) failures.push("Single-read must reject missing/non-owned notifications.");

for (const [name, source, mutation] of [
  ["single read", readRoute, "markCustomerNotificationRead"],
  ["archive", archiveRoute, "archiveCustomerNotification"],
  ["read all", readAllRoute, "markAllCustomerNotificationsRead"]
] as const) {
  if (!source.includes("requireAccountSession(request, true)")) failures.push(`${name} route must require authenticated CSRF-protected account session.`);
  if (!source.includes("userId: principal.userId")) failures.push(`${name} route must derive customer identity from the session.`);
  if (!source.includes(mutation)) failures.push(`${name} route must call ${mutation}.`);
}

for (const contract of [
  "type Filter = \"all\" | \"unread\" | \"orders\" | \"advice\" | \"returns\" | \"account\" | \"saved\"",
  "customer-notification-filters",
  "customer-notification-actions",
  "aria-label=\"Φίλτρα ειδοποιήσεων\"",
  "aria-pressed={filter === item.key}",
  "Λογαριασμός & υποστήριξη",
  "encodeURIComponent(item.id)",
  "/api/account/notifications/${encodeURIComponent(item.id)}/${action}",
  "x-csrf-token",
  "Αναγνωσμένο",
  "Αρχειοθέτηση",
  "current.filter((candidate) => candidate.id !== item.id)",
  "readAt: candidate.readAt ?? now",
  "visible.length"
]) if (!client.includes(contract)) failures.push(`Notification center is missing lifecycle/filter contract: ${contract}`);

if (client.includes("hero-actions")) failures.push("Notification lifecycle controls must not reuse generic hero action styling.");
if (!client.includes("if (filter === \"unread\") return !item.readAt")) failures.push("Unread filter must derive from persisted/local read state.");
if (!client.includes("/^(counteroffer|ask_local)\\./")) failures.push("Ask Local filter must handle direct Ask Local event prefixes even when legacy grouping is 'other'.");
if (!client.includes("/^(account|security|auth|privacy|customer_support)\\./")) failures.push("Account filter must include security/privacy/support event prefixes.");

for (const contract of [
  ".customer-notification-filters button",
  ".customer-notification-filters button.is-active",
  ".customer-notification-actions",
  ":focus-visible",
  "min-height:44px",
  "@media(max-width:760px)",
  "@media(max-width:480px)"
]) if (!styles.includes(contract)) failures.push(`Notification lifecycle styling is missing responsive/accessibility contract: ${contract}`);
if (!layout.includes('import "./customer-notification-lifecycle.css";')) failures.push("Root layout must load customer notification lifecycle styles.");

for (const contract of [
  "async archiveForUser",
  "archived_at=$3,read_at=COALESCE(read_at,$3)",
  "public_id=$1 AND user_id=$2",
  "channel='in_app'"
]) if (!postgresNotifications.includes(contract)) failures.push(`PostgreSQL archive repository is missing ownership/read contract: ${contract}`);
for (const contract of [
  "markRead(input:",
  "notification.userId === input.userId",
  "archive(input:",
  "item.userId !== input.userId",
  "item.readAt ??= input.now"
]) if (!coreNotifications.includes(contract)) failures.push(`Preview notification lifecycle is missing ownership/read contract: ${contract}`);

if (failures.length) {
  console.error("Customer notification lifecycle checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Customer notification lifecycle checks passed: individual read/archive are CSRF-protected and customer-scoped, archive marks read, filters are contextual, responsive controls are touch/keyboard friendly, and client state updates immediately.");
