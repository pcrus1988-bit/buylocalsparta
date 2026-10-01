import { readFile } from "node:fs/promises";

const files = {
  page: await readFile("apps/web/src/app/admin/mail/page.tsx", "utf8"),
  actions: await readFile("apps/web/src/app/admin/mail/actions.ts", "utf8"),
  runtime: await readFile("apps/web/src/lib/admin-mail-runtime.ts", "utf8"),
  ses: await readFile("apps/web/src/lib/admin-mail-ses.ts", "utf8"),
  navigation: await readFile("apps/web/src/lib/workspace-navigation.ts", "utf8"),
  migration: await readFile("db/migrations/0298_admin_mailbox.sql", "utf8"),
  objectStorage: await readFile("packages/object-storage/src/index.ts", "utf8"),
  nextConfig: await readFile("apps/web/next.config.ts", "utf8"),
  selection: await readFile("apps/web/src/app/admin/mail/AdminMailPageSelection.tsx", "utf8"),
  css: await readFile("apps/web/src/app/admin-mail.css", "utf8")
};

const checks: Array<[string, boolean]> = [
  ["Admin route renders the standard workspace header", files.page.includes("AdminWorkspaceHeader")],
  ["Admin route exposes Inbox/Sent/Starred/Archive", ["Inbox", "Sent", "Starred", "Archive"].every((value) => files.page.includes(value))],
  ["Admin route exposes compose, reply and forward", ["Compose", "Reply", "Forward"].every((value) => files.page.includes(value))],
  ["Admin route exposes filter and sort controls", ["name=\"read\"", "name=\"direction\"", "name=\"status\"", "name=\"attachments\"", "name=\"sort\""].every((value) => files.page.includes(value))],
  ["Dynamic Admin Mail SQL uses positional bind placeholders", files.runtime.includes("m.status=${params.length}") && files.runtime.includes("LIMIT ${limitParam}")],
  ["Admin Mail pagination uses count plus bound LIMIT/OFFSET", files.runtime.includes("SELECT count(*)::int AS total") && files.runtime.includes("LIMIT ${limitParam}") && files.runtime.includes("OFFSET ${offsetParam}")],
  ["Admin Mail exposes 10/20/50/100 page sizes", files.page.includes("([10, 20, 50, 100] as const)") && files.runtime.includes("10 | 20 | 50 | 100")],
  ["Admin Mail can select all messages on the current page", files.selection.includes("Select page") && files.selection.includes("data-admin-mail-select") && files.page.includes("AdminMailPageSelection")],
  ["Admin Mail preview list scrolls independently", files.css.includes(".admin-mail-list{min-height:0;overflow-y:auto") && files.css.includes(".admin-mail-list-pane{min-height:0;overflow:hidden")],
  ["Bulk mail actions are visible individual controls", ["value=\"read\">Read", "value=\"unread\">Unread", "value=\"archive\">Archive", "value=\"trash\">Delete"].every((value) => files.page.includes(value))],
  ["Mailbox filters live in a full-width command bar", files.page.includes("admin-mail-commandbar") && files.page.indexOf("admin-mail-commandbar") < files.page.indexOf("admin-mail-shell")],
  ["Admin route exposes checkbox bulk actions", files.page.includes("admin-mail-bulk-form") && files.page.includes('name="messageIds"') && files.actions.includes("bulkMailAction")],
  ["Admin route exposes Trash and delete/restore actions", files.page.includes('label: "Trash"') && files.actions.includes("toggleDeleteMailAction") && files.runtime.includes("deleteAdminMail")],
  ["Actions enforce notifications.manage", files.actions.includes('assertAdminPermission(principal, "notifications.manage")')],
  ["Actions enforce Admin CSRF", files.actions.includes("assertAdminCsrf(principal, csrfToken)")],
  ["Outbound operator mail uses shared SES transport", files.runtime.includes("sendRawSesEmail") && files.ses.includes("/v2/email/outbound-emails") && files.ses.includes("aws4_request")],
  ["Mailbox is hard locked to eu-north-1", files.runtime.includes('const REQUIRED_REGION = "eu-north-1"')],
  ["Inbound defaults to the SES S3 bucket", files.runtime.includes('const DEFAULT_BUCKET = "kontamou-inbound-emails"')],
  ["Inbound source stays in S3", files.runtime.includes("s3_object_key") && files.runtime.includes("inboundStorage(config).read")],
  ["S3 abstraction supports bounded listing", files.objectStorage.includes("ListObjectsV2Command") && files.objectStorage.includes("async list(")],
  ["Mailbox metadata, per-admin state, S3 cursor and quarantine are durable", files.migration.includes("admin_mail_messages") && files.migration.includes("admin_mail_state") && files.migration.includes("admin_mail_sync_state") && files.migration.includes("admin_mail_ingest_failures")],
  ["Per-admin state inserts never write NULL into NOT NULL booleans", files.runtime.includes("COALESCE($3::boolean,false)") && files.runtime.includes("COALESCE($4::boolean,false)")],
  ["Per-admin state supports soft delete without deleting S3 source", files.runtime.includes("deleted_at") && files.runtime.includes("s.deleted_at IS NOT NULL") && files.migration.includes("admin_mail_state")],
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
