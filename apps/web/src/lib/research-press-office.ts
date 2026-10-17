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

/** Deletes only unsent drafts. A prepared or attempted campaign remains immutable for audit. */
export async function deletePressDraft(principal:SessionPrincipal,id:string):Promise<void> {
  assertAdminPermission(principal,"research.publish.manage");
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    throw new Error("Invalid press draft.");
  const deleted=await pool().query<{id:string}>(`
    DELETE FROM public.research_press_releases AS r
    WHERE r.id=$1 AND r.status='draft'
      AND NOT EXISTS (
        SELECT 1 FROM public.research_press_deliveries d WHERE d.release_id=r.id
      )
    RETURNING r.id`,[id]);
  if(!deleted.rows.length)
    throw new Error("Only an unsent draft can be deleted. Prepared or sent campaigns are preserved.");
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

export function pressLanguageContent(row: PressRelease, language: PressLanguage) {
  const subject = language==="el" ? row.subject : row.subject_en?.trim();
  const html = language==="el" ? row.body_html : row.body_html_en?.trim();
  if(!subject || !html) {
    throw new Error(language==="el"
      ? "Greek recipients need Greek subject and HTML content."
      : "English recipients need English subject and HTML content.");
  }
  validateCustomMailHtml(html);
  const name=language==="el" ? row.attachment_name : row.attachment_name_en;
  if ((row.attachment_name || row.attachment_name_en) && !name) {
    throw new Error(language==="el"
      ? "Greek recipients need a Greek attachment because another language has an attachment."
      : "English recipients need an English attachment because another language has an attachment.");
  }
  return {subject,html};
}

export async function preparePressRelease(principal: SessionPrincipal, id: string): Promise<number> {
  assertAdminPermission(principal,"research.publish.manage");
  const db=pool(), client=await db.connect();
  try {
    await client.query("BEGIN");
    const row=(await client.query<PressRelease>(
      "SELECT * FROM public.research_press_releases WHERE id=$1 FOR UPDATE",[id]
    )).rows[0];
    if(!row || row.status!=="draft")throw new Error("Only a saved draft can be prepared.");
    if(!row.recipients.length)throw new Error("Upload or select a language-tagged CSV contact list first.");
    const contacts=contactsFromLanguages(row.recipients,row.recipient_languages);
    for(const language of new Set(contacts.map(c=>c.language)))pressLanguageContent(row,language);
    await client.query(`INSERT INTO public.research_press_deliveries(release_id,recipient,language,status)
       SELECT $1,r.email, r.language,
         CASE WHEN EXISTS(SELECT 1 FROM public.research_press_suppressions s WHERE s.recipient=r.email)
           THEN 'suppressed' ELSE 'pending' END
       FROM jsonb_to_recordset($2::jsonb) AS r(email text, language text)
       ON CONFLICT(release_id,recipient) DO NOTHING`,
      [id,JSON.stringify(contacts.map(({email,language})=>({email,language})))]);
    await client.query("UPDATE public.research_press_releases SET status='prepared',prepared_at=now(),updated_at=now() WHERE id=$1",[id]);
    await client.query("COMMIT");
    return row.recipients.length;
  } catch(error) {
    await client.query("ROLLBACK").catch(()=>undefined);
    throw error;
  } finally { client.release(); }
}

function asAttachment(row:PressRelease,language:PressLanguage):File[] {
  const name=language==="el"?row.attachment_name:row.attachment_name_en;
  const type=language==="el"?row.attachment_type:row.attachment_type_en;
  const bytes=language==="el"?row.attachment_bytes:row.attachment_bytes_en;
  if(!name||!bytes)return [];
  return [new File([new Uint8Array(bytes)],name,{type:type||"application/octet-stream"})];
}

export async function sendPressTest(
  principal:SessionPrincipal,id:string,target:string,language:PressLanguage
):Promise<string>{
  assertAdminPermission(principal,"research.publish.manage");
  const email=validatePressEmail(target);
  if(language!=="el" && language!=="en")throw new Error("Select Greek or English for the test email.");
  const row=(await pool().query<PressRelease>(
    "SELECT * FROM public.research_press_releases WHERE id=$1 LIMIT 1",[id]
  )).rows[0];
  if(!row)throw new Error("Save the draft before testing.");
  const {subject,html}=pressLanguageContent(row,language);
  const sent=await sendAdminMail(principal,{
    from:FROM,to:email,subject:"[TEST · "+language.toUpperCase()+"] "+subject,
    text:"",html:pressHtmlFragment(html,language),locale:language,
    format:"html",attachments:asAttachment(row,language)
  });
  await recordAdminAudit(principal,"research.press.test","research_press_release",id,
    "One-recipient press test", {mailId:sent.publicId,language,recipientCount:1});
  return sent.publicId;
}

/** Each recipient is claimed immediately before attempting SES, never 8 at once.
 * Unknown provider outcomes remain held for manual investigation; no automatic resend. */
export async function dispatchPressBatch(principal:SessionPrincipal,id:string):Promise<{
  attempted:number;sent:number;failed:number;remaining:number;
}>{
  assertAdminPermission(principal,"research.publish.manage");
  if(process.env.BLS_PRESS_SENDING_ENABLED!=="true")
    throw new Error("Live press delivery disabled until SES approval and BLS_PRESS_SENDING_ENABLED=true.");
  const db=pool();
  const release=(await db.query<PressRelease>(
    "SELECT * FROM public.research_press_releases WHERE id=$1 AND status IN ('prepared','sending') LIMIT 1",[id]
  )).rows[0];
  if(!release)throw new Error("Prepare the campaign before sending.");

  await db.query(`UPDATE public.research_press_deliveries d SET status='suppressed',updated_at=now()
     WHERE release_id=$1 AND status='pending'
       AND EXISTS(SELECT 1 FROM public.research_press_suppressions s WHERE s.recipient=d.recipient)`,[id]);
  await db.query("UPDATE public.research_press_releases SET status='sending',updated_at=now() WHERE id=$1 AND status='prepared'",[id]);

  let attempted=0,sent=0,failed=0;
  for(let i=0;i<BATCH_SIZE;i++){
    // Atomic one-row claim; other pending recipients remain safely available if this request crashes.
    const claim=await db.query<{recipient:string;language:PressLanguage}>(`WITH next AS (
      SELECT recipient FROM public.research_press_deliveries
      WHERE release_id=$1 AND status='pending'
      ORDER BY recipient FOR UPDATE SKIP LOCKED LIMIT 1
    )
    UPDATE public.research_press_deliveries d
       SET status='sending',updated_at=now()
    FROM next WHERE d.release_id=$1 AND d.recipient=next.recipient
    RETURNING d.recipient,d.language`,[id]);
    const recipient=claim.rows[0];
    if(!recipient)break;
    attempted++;
    const optOut=await db.query("SELECT 1 FROM public.research_press_suppressions WHERE recipient=$1 LIMIT 1",[recipient.recipient]);
    if(optOut.rowCount){
      await db.query("UPDATE public.research_press_deliveries SET status='suppressed',updated_at=now() WHERE release_id=$1 AND recipient=$2",[id,recipient.recipient]);
      continue;
    }
    let result: Awaited<ReturnType<typeof sendAdminMail>>;
    try {
      const {subject,html}=pressLanguageContent(release,recipient.language);
      result=await sendAdminMail(principal,{
        from:FROM,to:recipient.recipient,subject,text:"",
        html:pressHtmlFragment(html,recipient.language),locale:recipient.language,
        format:"html",attachments:asAttachment(release,recipient.language),
        configurationSetName:process.env.BLS_PRESS_SES_CONFIGURATION_SET?.trim()||undefined,
        emailTags:[{name:"pressCampaign",value:id},{name:"pressLocale",value:recipient.language}]
      });
    }catch(error){
      // Even a timeout may mean SES accepted it. Never mark as retryable automatically.
      failed++;
      await db.query(`UPDATE public.research_press_deliveries
        SET error_message=$3,updated_at=now()
        WHERE release_id=$1 AND recipient=$2 AND status='sending'`,
        [id,recipient.recipient,(error instanceof Error?error.message:String(error)).slice(0,800)]
      ).catch(()=>undefined);
      continue;
    }
    // SES accepted the message; persistence failures may not reclassify the send as failed.
    try {
      await db.query(`UPDATE public.research_press_deliveries
        SET status='sent',admin_mail_id=$3,ses_message_id=$4,sent_at=now(),updated_at=now(),error_message=NULL
        WHERE release_id=$1 AND recipient=$2 AND status='sending'`,
        [id,recipient.recipient,result.publicId,result.providerMessageId]);
      sent++;
    }catch(error){
      console.error("Press ledger update after SES acceptance requires manual reconciliation",{
        releaseId:id,mailId:result.publicId,recipient:recipient.recipient,
        error:error instanceof Error?error.message:String(error)
      });
    }
  }
  const q=(await db.query<{remaining:number;held:number}>(`SELECT
      count(*) FILTER(WHERE status='pending')::int AS remaining,
      count(*) FILTER(WHERE status='sending')::int AS held
    FROM public.research_press_deliveries WHERE release_id=$1`,[id])).rows[0];
  const remaining=q?.remaining??0,held=q?.held??0;
  if(remaining===0&&held===0) await db.query(
    "UPDATE public.research_press_releases SET status='completed',completed_at=now(),updated_at=now() WHERE id=$1",[id]);
  await recordAdminAudit(principal,"research.press.batch","research_press_release",id,"Explicit bilingual press distribution",{
    attempted,sent,failed,remaining,held
  }).catch(error=>console.error("Press dispatch audit failure",error));
  return {attempted,sent,failed,remaining};
}
