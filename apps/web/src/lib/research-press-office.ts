import type { SessionPrincipal } from "@buy-local-sparta/core";
import { assertAdminPermission, recordAdminAudit } from "./admin-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { sendAdminMail } from "./admin-mail-runtime";
import { validateCustomMailHtml } from "./admin-mail-template";
import { pressHtmlFragment } from "./research-press-template";
import { combinePressContacts, contactsFromLanguages, parsePressCsv, validatePressEmail,
  MAX_PRESS_CSV_BYTES, type PressCsvContact, type PressLanguage } from "./research-press-csv";

const MAX_RECIPIENTS = 500;
const BATCH_SIZE = 8;
const MAX_ATTACHMENT = 3 * 1024 * 1024;
const FROM = "research@kontamou.site";
const ADDRESSES = /^[A-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+$/i;

export type PressRelease = {
  id: string;
  title: string;
  subject: string;
  body_html: string;
  subject_en: string | null;
  body_html_en: string | null;
  recipient_languages: Record<string,PressLanguage>;
  from_address: string;
  recipients: string[];
  attachment_name: string | null;
  attachment_type: string | null;
  attachment_bytes: Uint8Array | null;
  attachment_name_en: string | null;
  attachment_type_en: string | null;
  attachment_bytes_en: Uint8Array | null;
  status: "draft" | "prepared" | "sending" | "completed";
  created_at: string | Date;
  updated_at: string | Date;
  prepared_at: string | Date | null;
  completed_at: string | Date | null;
};
export type PressDelivery = {
  recipient: string;
  language: PressLanguage;
  status: "pending" | "sending" | "sent" | "failed" | "suppressed";
  error_message: string | null;
  sent_at: string | Date | null;
};
export type PressList = { id: string; name: string; recipients: string[]; recipient_languages: Record<string,PressLanguage> };

export function parsePressRecipients(value: string): string[] {
  const raw = value.split(/[;,\n]+/).map((entry) => entry.trim().toLowerCase()).filter(Boolean);
  const unique = [...new Set(raw)];
  if (unique.length > MAX_RECIPIENTS) throw new Error("Maximum 500 addresses per press release or list.");
  for (const address of unique) {
    if (address.length > 254 || !ADDRESSES.test(address) || /[\r\n\x00-\x1f\x7f]/.test(address)) {
      throw new Error("Invalid recipient email address: " + address.slice(0, 100));
    }
  }
  return unique;
}

function pool() {
  return getProductionPostgresRuntime().sqlPool;
}

export async function pressWorkspace(principal: SessionPrincipal, selectedId?: string) {
  assertAdminPermission(principal, "research.publish.manage");
  const db = pool();
  const [releases, lists] = await Promise.all([
    db.query<Omit<PressRelease, "attachment_bytes"> & { recipient_count: number }>(
      `SELECT id,title,subject,body_html,from_address,recipients,attachment_name,attachment_type,status,
       created_at,updated_at,prepared_at,completed_at,cardinality(recipients)::int AS recipient_count
       FROM public.research_press_releases ORDER BY updated_at DESC LIMIT 40`
    ),
    db.query<PressList>("SELECT id,name,recipients,recipient_languages FROM public.research_press_lists ORDER BY name LIMIT 100")
  ]);
  const current = selectedId
    ? await db.query<PressRelease>(
        "SELECT * FROM public.research_press_releases WHERE id=$1 LIMIT 1", [selectedId]
      )
    : undefined;
  const deliveries = selectedId
    ? await db.query<PressDelivery>(
        "SELECT recipient,language,status,error_message,sent_at FROM public.research_press_deliveries WHERE release_id=$1 ORDER BY recipient LIMIT 500",
        [selectedId]
      )
    : undefined;
  return {
    releases: releases.rows,
    lists: lists.rows,
    current: current?.rows[0] ?? null,
    deliveries: deliveries?.rows ?? []
  };
}

function pressTitle(value: string, label: string): string {
  const clean = value.replace(/[\r\n\x00-\x1f\x7f]+/g, " ").trim();
  if (!clean || clean.length > 240) throw new Error(label + " must have 1–240 characters.");
  return clean;
}

async function attachmentInput(file?: File, clear?: boolean) {
  if (clear) return { name: null, type: null, bytes: null };
  if (!file || !file.size) return undefined;
  if (file.size > MAX_ATTACHMENT) throw new Error("Attachment must be no larger than 3 MB.");
  const name = file.name.replace(/[\\\/\r\n\x00-\x1f]+/g, "_").slice(0, 180);
  const extension = name.toLowerCase().split(".").pop();
  const allowed: Record<string, string> = {
    pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  };
  if (!extension || !allowed[extension]) throw new Error("Only PDF, DOCX, PNG and JPEG attachments are allowed.");
  return { name, type: allowed[extension], bytes: Buffer.from(await file.arrayBuffer()) };
}

async function readPressCsvFile(file?: File): Promise<PressCsvContact[] | undefined> {
  if (!file || !file.size) return undefined;
  if (!file.name.toLowerCase().endsWith(".csv")) throw new Error("Upload a .csv file.");
  if (file.size > MAX_PRESS_CSV_BYTES) throw new Error("CSV must be 1 MB or smaller.");
  let decoded: string;
  try { decoded = new TextDecoder("utf-8", {fatal:true}).decode(await file.arrayBuffer()); }
  catch { throw new Error("CSV must be UTF-8 encoded."); }
  return parsePressCsv(decoded).contacts;
}

function recipientColumns(contacts: readonly PressCsvContact[]) {
  const recipients = contacts.map(c=>c.email);
  const recipientLanguages: Record<string,PressLanguage> = Object.create(null);
  for(const contact of contacts) recipientLanguages[contact.email]=contact.language;
  return {recipients,recipientLanguages};
}

async function selectedContacts(listId?: string): Promise<PressCsvContact[] | undefined> {
  if(!listId) return undefined;
  const list = (await pool().query<PressList>(
    "SELECT id,name,recipients,recipient_languages FROM public.research_press_lists WHERE id=$1 LIMIT 1",
    [listId]
  )).rows[0];
  if(!list) throw new Error("Selected distribution list was not found.");
  return contactsFromLanguages(list.recipients,list.recipient_languages);
}

export async function savePressRelease(principal: SessionPrincipal, input: {
  id?: string; title: string; subject: string; bodyHtml: string;
  subjectEn?: string; bodyHtmlEn?: string;
  file?: File; fileEn?: File; clearAttachment?: boolean; clearAttachmentEn?: boolean;
  recipientCsv?: File; selectedListId?: string; importMode?: "replace"|"append";
}): Promise<string> {
  assertAdminPermission(principal, "research.publish.manage");
  const title=pressTitle(input.title,"Title");
  const subject=pressTitle(input.subject,"Greek subject");
  const body=validateCustomMailHtml(input.bodyHtml);
  const subjectEn=input.subjectEn?.trim() ? pressTitle(input.subjectEn,"English subject") : null;
  const bodyEn=input.bodyHtmlEn?.trim() ? validateCustomMailHtml(input.bodyHtmlEn) : null;
  const [attachment,attachmentEn,importedCsv,fromList] = await Promise.all([
    attachmentInput(input.file,input.clearAttachment),
    attachmentInput(input.fileEn,input.clearAttachmentEn),
    readPressCsvFile(input.recipientCsv),selectedContacts(input.selectedListId)
  ]);
  if(importedCsv && fromList) throw new Error("Choose either a CSV upload or an existing distribution list, not both.");
  const db=pool();
  const current=input.id
    ? (await db.query<PressRelease>("SELECT * FROM public.research_press_releases WHERE id=$1 AND status='draft' LIMIT 1",[input.id])).rows[0]
    : undefined;
  if(input.id && !current)throw new Error("Only drafts can be edited.");
  const existing = current ? contactsFromLanguages(current.recipients,current.recipient_languages) : [];
  const incoming = importedCsv ?? fromList;
  const contacts=incoming
    ? combinePressContacts(existing,incoming,input.importMode==="append"?"append":"replace")
    : existing;
  const {recipients,recipientLanguages}=recipientColumns(contacts);
  const common=[title,subject,body,subjectEn,bodyEn,recipients,JSON.stringify(recipientLanguages),
    Boolean(attachment),attachment?.name??null,attachment?.type??null,attachment?.bytes??null,
    Boolean(attachmentEn),attachmentEn?.name??null,attachmentEn?.type??null,attachmentEn?.bytes??null];
  if(input.id) {
    const updated=await db.query<{id:string}>(`UPDATE public.research_press_releases SET
        title=$2, subject=$3, body_html=$4, subject_en=$5, body_html_en=$6,
        recipients=$7::text[], recipient_languages=$8::jsonb,
        attachment_name=CASE WHEN $9::boolean THEN $10 ELSE attachment_name END,
        attachment_type=CASE WHEN $9::boolean THEN $11 ELSE attachment_type END,
        attachment_bytes=CASE WHEN $9::boolean THEN $12 ELSE attachment_bytes END,
        attachment_name_en=CASE WHEN $13::boolean THEN $14 ELSE attachment_name_en END,
        attachment_type_en=CASE WHEN $13::boolean THEN $15 ELSE attachment_type_en END,
        attachment_bytes_en=CASE WHEN $13::boolean THEN $16 ELSE attachment_bytes_en END,
        updated_at=now()
       WHERE id=$1 AND status='draft' RETURNING id`,[input.id,...common]);
    if(!updated.rows[0])throw new Error("This release was prepared while being edited. Create a new draft.");
    return updated.rows[0].id;
  }
  const inserted=await db.query<{id:string}>(`INSERT INTO public.research_press_releases
    (title,subject,body_html,subject_en,body_html_en,recipients,recipient_languages,
     attachment_name,attachment_type,attachment_bytes,attachment_name_en,attachment_type_en,attachment_bytes_en,
     from_address,created_by)
    VALUES ($1,$2,$3,$4,$5,$6::text[],$7::jsonb,$8,$9,$10,$11,$12,$13,$14,$15)
    RETURNING id`,[
    title,subject,body,subjectEn,bodyEn,recipients,JSON.stringify(recipientLanguages),
    attachment?.name??null,attachment?.type??null,attachment?.bytes??null,
    attachmentEn?.name??null,attachmentEn?.type??null,attachmentEn?.bytes??null,
    FROM,principal.userId
  ]);
  return inserted.rows[0].id;
}

export async function savePressList(principal: SessionPrincipal, name: string, csv: File): Promise<string> {
  assertAdminPermission(principal, "research.publish.manage");
  const safeName=name.replace(/[\r\n\x00-\x1f\x7f]/g," ").trim();
  if(!safeName || safeName.length>120) throw new Error("List name must have 1–120 characters.");
  const contacts=await readPressCsvFile(csv);
  if(!contacts?.length)throw new Error("Upload a CSV with at least one contact.");
  const {recipients,recipientLanguages}=recipientColumns(contacts);
  const created=await pool().query<{id:string}>(`INSERT INTO public.research_press_lists
     (name,recipients,recipient_languages,created_by) VALUES ($1,$2::text[],$3::jsonb,$4)
     ON CONFLICT(name) DO UPDATE SET
       recipients=EXCLUDED.recipients,recipient_languages=EXCLUDED.recipient_languages,updated_at=now()
     RETURNING id`,[safeName,recipients,JSON.stringify(recipientLanguages),principal.userId]);
  return created.rows[0].id;
}

export async function suppressPressRecipient(principal: SessionPrincipal, email: string, reason: string): Promise<void> {
  assertAdminPermission(principal, "research.publish.manage");
  const recipient = parsePressRecipients(email);
  if (recipient.length !== 1) throw new Error("Supply one address to suppress.");
  await pool().query(
    `INSERT INTO public.research_press_suppressions(recipient,reason) VALUES ($1,$2)
     ON CONFLICT(recipient) DO UPDATE SET reason=EXCLUDED.reason`,
    [recipient[0],reason.trim().slice(0,180) || "opt_out"]
  );
  await pool().query(
    `UPDATE public.research_press_deliveries SET status='suppressed',updated_at=now()
     WHERE recipient=$1 AND status='pending'`, [recipient[0]]
  );
}

export async function preparePressRelease(principal: SessionPrincipal, id: string): Promise<number> {
  assertAdminPermission(principal, "research.publish.manage");
  const db = pool();
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<PressRelease>(
      "SELECT * FROM public.research_press_releases WHERE id=$1 FOR UPDATE", [id]
    );
    const release = result.rows[0];
    if (!release || release.status !== "draft") throw new Error("Only a saved draft can be prepared.");
    if (!release.recipients.length) throw new Error("Add recipients before preparing the campaign.");
    validateCustomMailHtml(release.body_html);
    await client.query(
      `INSERT INTO public.research_press_deliveries(release_id,recipient,status)
       SELECT $1,recipient,
         CASE WHEN EXISTS(SELECT 1 FROM public.research_press_suppressions s WHERE s.recipient=recipient)
           THEN 'suppressed' ELSE 'pending' END
       FROM unnest($2::text[]) AS recipient
       ON CONFLICT(release_id,recipient) DO NOTHING`,
      [id,release.recipients]
    );
    await client.query(
      "UPDATE public.research_press_releases SET status='prepared',prepared_at=now(),updated_at=now() WHERE id=$1",
      [id]
    );
    await client.query("COMMIT");
    return release.recipients.length;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function asAttachment(row: PressRelease): File[] {
  if (!row.attachment_name || !row.attachment_bytes) return [];
  const bytes = new Uint8Array(row.attachment_bytes);
  return [new File([bytes], row.attachment_name, { type: row.attachment_type || "application/octet-stream" })];
}

export async function sendPressTest(principal: SessionPrincipal, id: string, target: string): Promise<string> {
  assertAdminPermission(principal, "research.publish.manage");
  const addresses = parsePressRecipients(target);
  if (addresses.length !== 1) throw new Error("Provide exactly one test recipient.");
  const row = (await pool().query<PressRelease>(
    "SELECT * FROM public.research_press_releases WHERE id=$1 LIMIT 1", [id]
  )).rows[0];
  if (!row) throw new Error("Save a press release before sending a test.");
  const sent = await sendAdminMail(principal, {
    from: FROM, to: addresses[0], subject: "[TEST] " + row.subject,
    text: "", html: pressHtmlFragment(row.body_html), format: "html", attachments: asAttachment(row)
  });
  await recordAdminAudit(principal,"research.press.test","research_press_release",id,"One-recipient press release preview",{
    mailId:sent.publicId,recipientCount:1
  });
  return sent.publicId;
}

/** A held "sending" status is deliberate: never auto-retry ambiguous SES acceptance. */
export async function dispatchPressBatch(principal: SessionPrincipal, id: string): Promise<{
  attempted: number; sent: number; failed: number; remaining: number;
}> {
  assertAdminPermission(principal, "research.publish.manage");
  if (process.env.BLS_PRESS_SENDING_ENABLED !== "true") {
    throw new Error("Press delivery is disabled until BLS_PRESS_SENDING_ENABLED=true is configured after SES approval.");
  }
  const db = pool();
  const result = await db.query<PressRelease>(
    "SELECT * FROM public.research_press_releases WHERE id=$1 AND status IN ('prepared','sending') LIMIT 1", [id]
  );
  const release = result.rows[0];
  if (!release) throw new Error("Prepare a draft and confirm recipients before dispatch.");
  // Claim only pending recipients and never requeue rows with a previous attempt.
  await db.query(
    `UPDATE public.research_press_deliveries d SET status='suppressed',updated_at=now()
     WHERE release_id=$1 AND status='pending'
       AND EXISTS(SELECT 1 FROM public.research_press_suppressions s WHERE s.recipient=d.recipient)`,
    [id]
  );
  const claimed = await db.query<{ recipient: string }>(
    `WITH next AS (
       SELECT recipient FROM public.research_press_deliveries
       WHERE release_id=$1 AND status='pending'
       ORDER BY recipient FOR UPDATE SKIP LOCKED LIMIT $2
     )
     UPDATE public.research_press_deliveries d
       SET status='sending',updated_at=now()
     FROM next WHERE d.release_id=$1 AND d.recipient=next.recipient RETURNING d.recipient`,
    [id,BATCH_SIZE]
  );
  await db.query(
    "UPDATE public.research_press_releases SET status='sending',updated_at=now() WHERE id=$1 AND status='prepared'",
    [id]
  );
  let sent = 0;
  let failed = 0;
  for (const item of claimed.rows) {
    // Recheck opt-outs even after the initial batch claim.
    const optOut = await db.query(
      "SELECT 1 FROM public.research_press_suppressions WHERE recipient=$1 LIMIT 1", [item.recipient]
    );
    if (optOut.rowCount) {
      await db.query(
        "UPDATE public.research_press_deliveries SET status='suppressed',updated_at=now() WHERE release_id=$1 AND recipient=$2",
        [id,item.recipient]
      );
      continue;
    }
    try {
      const res = await sendAdminMail(principal, {
        from: FROM,to: item.recipient,subject: release.subject,text:"",
        html:pressHtmlFragment(release.body_html),format:"html",attachments:asAttachment(release)
      });
      await db.query(
        `UPDATE public.research_press_deliveries
         SET status='sent',admin_mail_id=$3,ses_message_id=$4,sent_at=now(),updated_at=now()
         WHERE release_id=$1 AND recipient=$2`,
        [id,item.recipient,res.publicId,res.providerMessageId]
      );
      sent += 1;
    } catch (error) {
      await db.query(
        `UPDATE public.research_press_deliveries
           SET status='failed',error_message=$3,updated_at=now()
         WHERE release_id=$1 AND recipient=$2`,
        [id,item.recipient,(error instanceof Error?error.message:String(error)).slice(0,800)]
      ).catch(() => undefined);
      failed += 1;
    }
  }
  const remainingResult = await db.query<{ remaining: number; held: number }>(
    `SELECT count(*) FILTER(WHERE status='pending')::int AS remaining,
            count(*) FILTER(WHERE status='sending')::int AS held
     FROM public.research_press_deliveries WHERE release_id=$1`, [id]
  );
  const remaining = remainingResult.rows[0]?.remaining ?? 0;
  const held = remainingResult.rows[0]?.held ?? 0;
  if (remaining===0 && held===0) {
    await db.query(
      "UPDATE public.research_press_releases SET status='completed',completed_at=now(),updated_at=now() WHERE id=$1",
      [id]
    );
  }
  await recordAdminAudit(principal,"research.press.batch","research_press_release",id,"Explicit press dispatch",{
    attempted:claimed.rows.length,sent,failed,remaining,held
  }).catch((error)=>console.error("Press dispatch audit failure",error));
  return { attempted:claimed.rows.length,sent,failed,remaining };
}
