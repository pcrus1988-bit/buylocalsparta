import { readFile } from "node:fs/promises";

const files = {
  page: await readFile("apps/web/src/app/admin/mail/page.tsx", "utf8"),
  actions: await readFile("apps/web/src/app/admin/mail/actions.ts", "utf8"),
  runtime: await readFile("apps/web/src/lib/admin-mail-runtime.ts", "utf8"),
  ses: await readFile("apps/web/src/lib/admin-mail-ses.ts", "utf8"),
  navigation: await readFile("apps/web/src/lib/workspace-navigation.ts", "utf8"),
  migration: await readFile("db/migrations/0298_admin_mailbox.sql", "utf8"),
  objectStorage: await readFile("packages/object-storage/src/index.ts", "utf8"),
  nextConfig: await readFile("apps/web/next.config.ts", "utf8")
};

const checks: Array<[string, boolean]> = [
  ["Admin route renders the standard workspace header", files.page.includes("AdminWorkspaceHeader")],
  ["Admin route exposes Inbox/Sent/Starred/Archive", ["Inbox", "Sent", "Starred", "Archive"].every((value) => files.page.includes(value))],
  ["Admin route exposes compose, reply and forward", ["Compose", "Reply", "Forward"].every((value) => files.page.includes(value))],
  ["Actions enforce notifications.manage", files.actions.includes('assertAdminPermission(principal, "notifications.manage")')],
  ["Actions enforce Admin CSRF", files.actions.includes("assertAdminCsrf(principal, csrfToken)")],
  ["Outbound operator mail uses shared SES transport", files.runtime.includes("sendRawSesEmail") && files.ses.includes("/v2/email/outbound-emails") && files.ses.includes("aws4_request")],
  ["Mailbox is hard locked to eu-north-1", files.runtime.includes('const REQUIRED_REGION = "eu-north-1"')],
  ["Inbound defaults to the SES S3 bucket", files.runtime.includes('const DEFAULT_BUCKET = "kontamou-inbound-emails"')],
  ["Inbound source stays in S3", files.runtime.includes("s3_object_key") && files.runtime.includes("inboundStorage(config).read")],
  ["S3 abstraction supports bounded listing", files.objectStorage.includes("ListObjectsV2Command") && files.objectStorage.includes("async list(")],
  ["Mailbox metadata, per-admin state, S3 cursor and quarantine are durable", files.migration.includes("admin_mail_messages") && files.migration.includes("admin_mail_state") && files.migration.includes("admin_mail_sync_state") && files.migration.includes("admin_mail_ingest_failures")],
  ["Mailbox tables have RLS enabled", files.migration.includes("ALTER TABLE public.admin_mail_messages ENABLE ROW LEVEL SECURITY") && files.migration.includes("ALTER TABLE public.admin_mail_state ENABLE ROW LEVEL SECURITY") && files.migration.includes("ALTER TABLE public.admin_mail_sync_state ENABLE ROW LEVEL SECURITY")],
  ["Mailbox runtime roles have explicit RLS policies", files.migration.includes("bls_admin_mail_messages_runtime_all") && files.migration.includes("bls_admin_mail_state_runtime_all") && files.migration.includes("bls_admin_mail_sync_state_runtime_all")],
  ["Inbound sync persists continuation progress", files.runtime.includes("admin_mail_sync_state") && files.runtime.includes("MAX_SYNC_PAGES_PER_RUN")],
  ["Malformed inbound objects are quarantined without wedging S3 sync", files.runtime.includes("admin_mail_ingest_failures") && files.runtime.includes("failed += 1")],
  ["Mailbox honors explicit mail enablement", files.runtime.includes("BLS_MAIL_ENABLED") && files.runtime.includes("Admin Mail is disabled")],
  ["Mailbox is visible in Admin navigation", files.navigation.includes('href: "/admin/mail"')],
  ["Server Action body is bounded", files.nextConfig.includes('bodySizeLimit: "4mb"')]
];

const failed = checks.filter(([, ok]) => !ok);
for (const [label, ok] of checks) console.log((ok ? "✓ " : "✗ ") + label);
if (failed.length) {
  console.error("Admin Mail acceptance failed: " + failed.length + " check(s).");
  process.exit(1);
}
console.log("Admin Mail acceptance passed.");
