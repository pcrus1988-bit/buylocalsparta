import { createHash, randomBytes } from "node:crypto";
import {
  PostgresUnitOfWork,
  defaultCustomerRetentionSnapshot,
  type PrivacyRequest,
  type PrivacyRequestType,
  type SessionPrincipal,
  type SqlRow
} from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { assertAdminPermission, recordAdminAudit, recordAdminPersonalDataAccess } from "./admin-runtime";
import { adminUpdateCustomerProfile, CUSTOMER_PROFILE_LOCALES, type CustomerProfileLocale } from "./admin-customer-profile";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { sendTransactionalEmail } from "./transactional-email";

export type AdminPrivacyOperationalRequest = Readonly<{
  id: string;
  referenceNumber: string;
  userId: string;
  customerName: string;
  customerEmail?: string;
  accountStatus: string;
  type: PrivacyRequestType;
  status: string;
  submittedAt: number;
  targetAt: number;
  processingStartedAt?: number;
  completedAt?: number;
  details: Record<string, unknown>;
  outcome: Record<string, unknown>;
  supportCaseId?: string;
  supportCaseReference?: string;
  supportCaseStatus?: string;
}>;

export type PrivacyCorrectionInput = Readonly<{
  firstName?: string;
  lastName?: string;
  phone?: string;
  preferredLocale?: CustomerProfileLocale;
}>;

const CUSTOMER_IDENTITY_PREDICATE = `
  NOT EXISTS (SELECT 1 FROM platform_user_roles pur WHERE pur.user_id=u.id)
  AND NOT EXISTS (SELECT 1 FROM vendor_users vu WHERE vu.user_id=u.id)`;

function uow() {
  return new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool, { statementTimeoutMs: 20_000, lockTimeoutMs: 5_000 });
}
function text(value: unknown): string { return typeof value === "string" ? value : String(value ?? ""); }
function optionalText(value: unknown): string | undefined { const v = typeof value === "string" ? value.trim() : ""; return v || undefined; }
function epoch(value: unknown): number | undefined { if (!value) return undefined; const n = value instanceof Date ? value.getTime() : new Date(String(value)).getTime(); return Number.isFinite(n) ? n : undefined; }
function record(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") { try { const parsed=JSON.parse(value); return parsed && typeof parsed==="object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}; } catch { return {}; } }
  return {};
}
function id(prefix: string): string { return `${prefix}_${randomBytes(12).toString("hex")}`; }

export async function adminPrivacyOperationalWorkspace(principal: SessionPrincipal) {
  assertAdminPermission(principal, "privacy.read");
  if (!productionDatabaseConfigured()) return { csrfToken: principal.csrfToken, requests: [] as AdminPrivacyOperationalRequest[] };

  const requests = await uow().withTransaction(platformScope(principal.userId), async (tx) => {
    const result = await tx.query<SqlRow>(`
      SELECT
        pr.public_id,
        COALESCE(pr.reference_number,pr.public_id) AS reference_number,
        pr.request_type,
        pr.status,
        pr.details,
        pr.outcome,
        pr.created_at,
        pr.due_at,
        pr.processing_started_at,
        pr.completed_at,
        u.public_id AS user_public_id,
        u.email::text AS customer_email,
        u.status::text AS account_status,
        cp.first_name,
        cp.last_name,
        support.public_id AS support_case_id,
        support.reference_number AS support_case_reference,
        support.status AS support_case_status
      FROM privacy_requests pr
      JOIN users u ON u.id=pr.user_id
      LEFT JOIN customer_profiles cp ON cp.user_id=u.id
      LEFT JOIN LATERAL (
        SELECT sc.public_id,sc.reference_number,sc.status
        FROM customer_support_cases sc
        WHERE sc.customer_user_id=pr.user_id
          AND sc.context_type='privacy'
          AND sc.context_public_id=COALESCE(pr.reference_number,pr.public_id)
        ORDER BY sc.created_at DESC
        LIMIT 1
      ) support ON true
      ORDER BY CASE WHEN pr.status IN ('completed','partially_completed','cancelled') THEN 1 ELSE 0 END,
        pr.due_at ASC,pr.created_at DESC
      LIMIT 250
    `);
    return result.rows.map((row): AdminPrivacyOperationalRequest => {
      const name = [optionalText(row.first_name), optionalText(row.last_name)].filter(Boolean).join(" ");
      return {
        id:text(row.public_id),
        referenceNumber:text(row.reference_number),
        userId:text(row.user_public_id),
        customerName:name || optionalText(row.customer_email) || text(row.user_public_id),
        customerEmail:optionalText(row.customer_email),
        accountStatus:text(row.account_status),
        type:text(row.request_type) as PrivacyRequestType,
        status:text(row.status),
        submittedAt:epoch(row.created_at) ?? 0,
        targetAt:epoch(row.due_at) ?? 0,
        processingStartedAt:epoch(row.processing_started_at),
        completedAt:epoch(row.completed_at),
        details:record(row.details),
        outcome:record(row.outcome),
        supportCaseId:optionalText(row.support_case_id),
        supportCaseReference:optionalText(row.support_case_reference),
        supportCaseStatus:optionalText(row.support_case_status)
      };
    });
  }, { readOnly:true });

  await recordAdminPersonalDataAccess(principal, {
    route:"/admin/privacy",
    resourceType:"privacy_request_queue",
    resourceId:"privacy-queue",
    purpose:"privacy_operations",
    dataClasses:["identity","contact","privacy_request","support_context"],
    recordCount:requests.length,
    accessScope:"bulk"
  });
  return { csrfToken: principal.csrfToken, requests };
}

async function currentRequest(principal: SessionPrincipal, requestId: string): Promise<PrivacyRequest> {
  const runtime=getProductionPostgresRuntime();
  const scope=platformScope(principal.userId);
  const all=await runtime.persistence.customerPrivacy.privacyRequestsForPlatform({scope});
  const found=all.find((item)=>item.id===requestId);
  if(!found) throw new Error("Privacy request not found");
  return found;
}

async function saveRequest(principal: SessionPrincipal, request: PrivacyRequest) {
  await getProductionPostgresRuntime().persistence.customerPrivacy.savePrivacyRequest({ scope:platformScope(principal.userId), request });
}

function correctionFromDetails(details: Readonly<Record<string, unknown>> | undefined): PrivacyCorrectionInput {
  const raw=record(details?.correction);
  const preferredLocale=typeof raw.preferredLocale==="string" && CUSTOMER_PROFILE_LOCALES.includes(raw.preferredLocale as CustomerProfileLocale)
    ? raw.preferredLocale as CustomerProfileLocale : undefined;
  return {
    firstName:typeof raw.firstName==="string" ? raw.firstName : undefined,
    lastName:typeof raw.lastName==="string" ? raw.lastName : undefined,
    phone:typeof raw.phone==="string" ? raw.phone : undefined,
    preferredLocale
  };
}

async function customerProfileForCorrection(principal: SessionPrincipal, userId: string) {
  return uow().withTransaction(platformScope(principal.userId), async(tx)=>{
    const result=await tx.query<SqlRow>(`SELECT u.phone,u.preferred_locale,cp.first_name,cp.last_name
      FROM users u LEFT JOIN customer_profiles cp ON cp.user_id=u.id
      WHERE u.public_id=$1 AND ${CUSTOMER_IDENTITY_PREDICATE} LIMIT 1`,[userId]);
    if(!result.rowCount) throw new Error("Customer not found or not customer-manageable");
    const row=result.rows[0];
    return {
      firstName:optionalText(row.first_name),
      lastName:optionalText(row.last_name),
      phone:optionalText(row.phone),
      preferredLocale:(optionalText(row.preferred_locale)==="en" ? "en" : "el") as CustomerProfileLocale
    };
  },{readOnly:true});
}

async function disableOptionalProcessing(principal: SessionPrincipal, userId: string, options: { restrictAccount?: boolean; clearPersonalisation?: boolean; marketing?: boolean }) {
  return uow().withTransaction(platformScope(principal.userId),async(tx)=>{
    const found=await tx.query<SqlRow>(`SELECT u.id::text AS user_uuid,u.status::text,u.public_id
      FROM users u WHERE u.public_id=$1 AND ${CUSTOMER_IDENTITY_PREDICATE} FOR UPDATE`,[userId]);
    if(!found.rowCount) throw new Error("Customer not found or not customer-manageable");
    const row=found.rows[0];
    if(text(row.status)==="closed") throw new Error("Customer account is already closed");
    const uid=text(row.user_uuid);
    if(options.clearPersonalisation){
      await tx.query("DELETE FROM saved_products WHERE user_id=$1::uuid",[uid]);
      await tx.query("DELETE FROM saved_vendors WHERE user_id=$1::uuid",[uid]);
      await tx.query("DELETE FROM recently_viewed_products WHERE user_id=$1::uuid",[uid]);
      await tx.query("SELECT set_config('app.privacy_erasure','true',true)");
      await tx.query("DELETE FROM saved_product_alert_events WHERE user_id=$1::uuid",[uid]);
      await tx.query("DELETE FROM saved_product_alert_preferences WHERE user_id=$1::uuid",[uid]);
      await tx.query("DELETE FROM saved_search_alert_events WHERE user_id=$1::uuid",[uid]);
      await tx.query("DELETE FROM saved_searches WHERE user_id=$1::uuid",[uid]);
    }
    await tx.query(`INSERT INTO customer_profiles(user_id,marketing_consent,recommendations_enabled,recently_viewed_enabled,personalization_updated_at,created_at,updated_at)
      VALUES($1::uuid,false,false,false,now(),now(),now())
      ON CONFLICT(user_id) DO UPDATE SET
        marketing_consent=CASE WHEN $2 THEN false ELSE customer_profiles.marketing_consent END,
        recommendations_enabled=CASE WHEN $3 THEN false ELSE customer_profiles.recommendations_enabled END,
        recently_viewed_enabled=CASE WHEN $3 THEN false ELSE customer_profiles.recently_viewed_enabled END,
        personalization_updated_at=CASE WHEN $3 THEN now() ELSE customer_profiles.personalization_updated_at END,
        updated_at=now()`,[uid,options.marketing===true,options.clearPersonalisation===true]);
    if(options.restrictAccount){
      await tx.query("UPDATE users SET status='restricted',updated_at=now() WHERE id=$1::uuid",[uid]);
      await tx.query("DELETE FROM user_sessions WHERE user_id=$1::uuid",[uid]);
    }
    return {previousStatus:text(row.status),status:options.restrictAccount?"restricted":text(row.status)};
  },{isolation:"serializable"});
}

export async function executeAdminPrivacyRequest(principal: SessionPrincipal, input: { requestId: string; correction?: PrivacyCorrectionInput }) {
  assertAdminPermission(principal,"privacy.manage");
  if(!productionDatabaseConfigured()) throw new Error("Privacy operations require the production database");
  const now=Date.now();
  const current=await currentRequest(principal,input.requestId);
  if(["completed","partially_completed","cancelled"].includes(current.status)) throw new Error("Privacy request is already terminal");

  let execution: Record<string,unknown>={executedAt:now,requestType:current.type,reportReady:["access","export"].includes(current.type)};

  if(current.type==="correction"){
    const requested={...correctionFromDetails(current.details),...(input.correction??{})};
    if(!requested.firstName && !requested.lastName && !requested.phone && !requested.preferredLocale) throw new Error("No structured correction was supplied. Enter the corrected account values before executing.");
    const existing=await customerProfileForCorrection(principal,current.userId);
    const result=await adminUpdateCustomerProfile(principal,{
      customerId:current.userId,
      firstName:requested.firstName ?? existing.firstName,
      lastName:requested.lastName ?? existing.lastName,
      phone:requested.phone ?? existing.phone,
      preferredLocale:requested.preferredLocale ?? existing.preferredLocale,
      reason:`GDPR correction request ${current.id}`
    });
    execution={...execution,applied:"customer_profile_correction",profile:result.profile};
  } else if(current.type==="deletion"){
    await getProductionPostgresRuntime().persistence.customerPrivacy.eraseNonEssentialPersonalization({scope:platformScope(principal.userId),userId:current.userId,now});
    await disableOptionalProcessing(principal,current.userId,{clearPersonalisation:true,marketing:true});
    execution={...execution,applied:"non_essential_erasure",retainedGovernedRecords:true};
  } else if(current.type==="restriction"){
    const result=await disableOptionalProcessing(principal,current.userId,{restrictAccount:true,clearPersonalisation:true,marketing:true});
    execution={...execution,applied:"processing_restriction",accountStatus:result.status};
  } else if(current.type==="objection"){
    await disableOptionalProcessing(principal,current.userId,{clearPersonalisation:true,marketing:true});
    execution={...execution,applied:"optional_processing_objection"};
  } else if(current.type==="marketing_withdrawal"){
    await disableOptionalProcessing(principal,current.userId,{clearPersonalisation:false,marketing:true});
    execution={...execution,applied:"marketing_withdrawal"};
  } else if(current.type==="account_closure"){
    execution={...execution,applied:"closure_prepared",accountClosurePending:true,retainedGovernedRecords:true};
  } else {
    execution={...execution,applied:current.type==="access"?"access_report_prepared":"portable_export_prepared"};
  }

  const next:PrivacyRequest={
    ...current,
    status:"processing",
    processingStartedAt:current.processingStartedAt??now,
    outcome:{...(current.outcome??{}),automation:execution}
  };
  await saveRequest(principal,next);
  await recordAdminAudit(principal,"privacy.automated_execution","privacy_request",current.id,`Automated GDPR operation: ${current.type}`,execution);
  return {request:next,execution};
}

async function closeCustomerAccountForPrivacy(principal: SessionPrincipal,userId:string,requestId:string){
  return uow().withTransaction(platformScope(principal.userId),async(tx)=>{
    const found=await tx.query<SqlRow>(`SELECT u.id::text AS user_uuid,u.public_id,u.email::text AS email,u.status::text
      FROM users u WHERE u.public_id=$1 AND ${CUSTOMER_IDENTITY_PREDICATE} FOR UPDATE`,[userId]);
    if(!found.rowCount) throw new Error("Customer not found or not customer-manageable");
    const row=found.rows[0];
    if(text(row.status)==="closed") return {email:optionalText(row.email),alreadyClosed:true};
    const uid=text(row.user_uuid); const email=optionalText(row.email);
    if(!email) throw new Error("Customer has no email destination");
    const hash=createHash("sha256").update(`${userId}:${email}`).digest("hex");
    await tx.query("DELETE FROM saved_products WHERE user_id=$1::uuid",[uid]);
    await tx.query("DELETE FROM saved_vendors WHERE user_id=$1::uuid",[uid]);
    await tx.query("DELETE FROM recently_viewed_products WHERE user_id=$1::uuid",[uid]);
    await tx.query("SELECT set_config('app.privacy_erasure','true',true)");
    await tx.query("DELETE FROM saved_product_alert_events WHERE user_id=$1::uuid",[uid]);
    await tx.query("DELETE FROM saved_product_alert_preferences WHERE user_id=$1::uuid",[uid]);
    await tx.query("DELETE FROM saved_search_alert_events WHERE user_id=$1::uuid",[uid]);
    await tx.query("DELETE FROM saved_searches WHERE user_id=$1::uuid",[uid]);
    await tx.query("DELETE FROM notification_preferences WHERE user_id=$1::uuid",[uid]);
    await tx.query("DELETE FROM user_sessions WHERE user_id=$1::uuid",[uid]);
    await tx.query("UPDATE customer_profiles SET first_name=NULL,last_name=NULL,marketing_consent=false,recommendations_enabled=false,recently_viewed_enabled=false,updated_at=now() WHERE user_id=$1::uuid",[uid]);
    await tx.query(`UPDATE users SET email=$2,phone=NULL,password_hash=NULL,status='closed',email_verified_at=NULL,closed_at=now(),anonymized_at=now(),original_email_hash=$3,updated_at=now() WHERE id=$1::uuid`,[uid,`closed+${hash.slice(0,24)}@privacy.invalid`,hash]);
    await tx.query(`INSERT INTO audit_events(actor_role,action,entity_type,entity_id,reason,before_state,after_state,actor_public_id)
      VALUES($1,'privacy.account_closed','customer_user',$2,$3,$4::jsonb,$5::jsonb,$6)`,[principal.roles[0]??"super_admin",userId,`GDPR account closure ${requestId}`,JSON.stringify({status:row.status}),JSON.stringify({status:"closed",anonymized:true}),principal.userId]);
    return {email,alreadyClosed:false};
  },{isolation:"serializable"});
}

function defaultResponseText(request: PrivacyRequest): string {
  const intro="Το αίτημά σου για τα προσωπικά δεδομένα εξετάστηκε από την ομάδα ΚΟΝΤΑ ΜΟΥ.";
  switch(request.type){
    case "access": return `${intro}\n\nΈχει ετοιμαστεί η αναφορά πρόσβασης στα δεδομένα σου. Θα τη βρεις στην ενότητα Ιδιωτικότητα & δεδομένα του λογαριασμού σου.`;
    case "export": return `${intro}\n\nΈχει ετοιμαστεί η εξαγωγή δεδομένων σε PDF και δομημένη JSON μορφή. Θα τη βρεις στην ενότητα Ιδιωτικότητα & δεδομένα του λογαριασμού σου.`;
    case "correction": return `${intro}\n\nΗ διόρθωση των στοιχείων λογαριασμού εφαρμόστηκε σύμφωνα με τα στοιχεία του αιτήματος.`;
    case "deletion": return `${intro}\n\nΤα μη απαραίτητα δεδομένα και σήματα προσωποποίησης διαγράφηκαν. Ορισμένα αρχεία συναλλαγών, φορολογικά, ασφάλειας ή επίλυσης διαφορών μπορεί να διατηρούνται όταν υπάρχει νόμιμη υποχρέωση ή αναγκαίος σκοπός.`;
    case "restriction": return `${intro}\n\nΕφαρμόστηκε περιορισμός επεξεργασίας και απενεργοποιήθηκαν οι προαιρετικές λειτουργίες που μπορούν να σταματήσουν άμεσα. Ο λογαριασμός τέθηκε σε restricted state μέχρι νεότερη αξιολόγηση.`;
    case "objection": return `${intro}\n\nΗ εναντίωσή σου εφαρμόστηκε στις προαιρετικές λειτουργίες προσωποποίησης/marketing που μπορούσαν να σταματήσουν άμεσα. Επεξεργασίες που απαιτούνται για σύμβαση ή νομική υποχρέωση δεν επηρεάζονται.`;
    case "marketing_withdrawal": return `${intro}\n\nΗ συγκατάθεση marketing σε επίπεδο λογαριασμού ανακλήθηκε. Οι ρυθμίσεις browser/cookies παραμένουν διαθέσιμες ξεχωριστά.`;
    case "account_closure": return `${intro}\n\nΤο αίτημα κλεισίματος λογαριασμού εγκρίθηκε. Με την αποστολή αυτής της επιβεβαίωσης ο λογαριασμός κλείνει και τα μη απαραίτητα στοιχεία ανωνυμοποιούνται, ενώ όσα αρχεία πρέπει να διατηρηθούν από τον νόμο παραμένουν μόνο για τον αντίστοιχο σκοπό.`;
  }
}

async function supportCaseForRequest(principal:SessionPrincipal,userId:string,requestId:string){
  return uow().withTransaction(platformScope(principal.userId),async(tx)=>{
    const result=await tx.query<SqlRow>(`SELECT sc.id::text AS case_uuid,sc.public_id,sc.reference_number,sc.status
      FROM customer_support_cases sc
      JOIN privacy_requests pr ON pr.user_id=sc.customer_user_id
      WHERE pr.public_id=$1 AND pr.user_id=(SELECT id FROM users WHERE public_id=$2)
        AND sc.context_type='privacy' AND sc.context_public_id=COALESCE(pr.reference_number,pr.public_id)
      ORDER BY sc.created_at DESC LIMIT 1`,[requestId,userId]);
    return result.rowCount ? result.rows[0] : undefined;
  },{readOnly:true});
}

async function recordCustomerVisiblePrivacyReply(principal:SessionPrincipal,request:PrivacyRequest,message:string){
  await uow().withTransaction(platformScope(principal.userId),async(tx)=>{
    const found=await tx.query<SqlRow>(`SELECT sc.id::text AS case_uuid,sc.public_id,sc.status,u.id::text AS customer_uuid
      FROM customer_support_cases sc
      JOIN privacy_requests pr ON pr.user_id=sc.customer_user_id
      JOIN users u ON u.id=pr.user_id
      WHERE pr.public_id=$1 AND sc.context_type='privacy' AND sc.context_public_id=COALESCE(pr.reference_number,pr.public_id)
      ORDER BY sc.created_at DESC LIMIT 1 FOR UPDATE OF sc`,[request.id]);
    if(!found.rowCount) return;
    const row=found.rows[0];
    const actor=await tx.query<SqlRow>("SELECT id::text AS id FROM users WHERE public_id=$1 LIMIT 1",[principal.userId]);
    if(!actor.rowCount) throw new Error("Platform actor not found");
    await tx.query("UPDATE customer_support_cases SET status='resolved',resolved_at=COALESCE(resolved_at,now()),updated_at=now() WHERE id=$1::uuid",[text(row.case_uuid)]);
    await tx.query(`INSERT INTO customer_support_case_events(public_id,case_id,actor_user_id,actor_public_id,event_type,note,before_state,after_state,customer_visible,created_at)
      VALUES($1,$2::uuid,$3::uuid,$4,'note_added',$5,$6::jsonb,$7::jsonb,true,now())`,[
        id("caseevt"),text(row.case_uuid),text(actor.rows[0].id),principal.userId,message,
        JSON.stringify({status:row.status}),JSON.stringify({status:"resolved"})
      ]);
    await tx.query(`INSERT INTO notifications(id,public_id,user_id,channel,purpose,event_type,template_version,locale,title,body,payload,status,dedupe_key,created_at)
      VALUES(gen_random_uuid(),'notification_'||gen_random_uuid()::text,$1::uuid,'in_app','transactional','privacy.request_completed','privacy-v1','el','Ολοκληρώθηκε αίτημα ιδιωτικότητας',$2,$3::jsonb,'queued',$4,now())
      ON CONFLICT(dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`,[
        text(row.customer_uuid),message.slice(0,1000),JSON.stringify({privacyRequestId:request.id}),`privacy-response:${request.id}`
      ]);
  },{isolation:"serializable"});
}

export async function sendAdminPrivacyResponse(principal:SessionPrincipal,input:{requestId:string;message?:string}){
  assertAdminPermission(principal,"privacy.manage");
  const now=Date.now();
  let current=await currentRequest(principal,input.requestId);
  if(["completed","partially_completed","cancelled"].includes(current.status)) throw new Error("Privacy request is already terminal");
  const automation=record(current.outcome?.automation);
  if(!Object.keys(automation).length) throw new Error("Run the request-specific operation before sending the final response");

  let email:string|undefined;
  const customer=await uow().withTransaction(platformScope(principal.userId),async(tx)=>{
    const result=await tx.query<SqlRow>("SELECT email::text AS email,preferred_locale FROM users WHERE public_id=$1 LIMIT 1",[current.userId]);
    if(!result.rowCount) throw new Error("Customer not found");
    return {email:optionalText(result.rows[0].email),locale:optionalText(result.rows[0].preferred_locale)==="en"?"en" as const:"el" as const};
  },{readOnly:true});
  email=customer.email;
  if(!email) throw new Error("Customer has no email destination");

  const message=input.message?.trim() || defaultResponseText(current);
  if(message.length<10 || message.length>10_000) throw new Error("Customer response must be 10–10,000 characters");

  const delivery=await sendTransactionalEmail({
    to:email,
    subject:`ΚΟΝΤΑ ΜΟΥ · Απάντηση στο αίτημα ιδιωτικότητας ${current.id}`,
    text:message,
    eventType:"privacy.request_response",
    idempotencyKey:`privacy-response:${current.id}`,
    locale:customer.locale,
    payload:{
      privacyRequestId:current.id,
      privacyRequestType:current.type,
      ctaPath:current.type==="account_closure"?"/privacy-controls":"/account/privacy",
      ctaLabel:current.type==="account_closure"?"Πληροφορίες ιδιωτικότητας":"Άνοιγμα Ιδιωτικότητας & δεδομένων"
    }
  });

  if(current.type==="account_closure"){
    await closeCustomerAccountForPrivacy(principal,current.userId,current.id);
  }

  const partial=["deletion","account_closure"].includes(current.type);
  current={
    ...current,
    status:partial?"partially_completed":"completed",
    processingStartedAt:current.processingStartedAt??now,
    completedAt:now,
    completedBy:principal.userId,
    retention:partial?defaultCustomerRetentionSnapshot(now):current.retention,
    outcome:{
      ...(current.outcome??{}),
      response:{sentAt:now,providerMessageId:delivery.providerMessageId,manualAdminConfirmation:true},
      finalStatus:partial?"partially_completed":"completed"
    }
  };
  await saveRequest(principal,current);
  await recordCustomerVisiblePrivacyReply(principal,current,message);
  await recordAdminAudit(principal,"privacy.response_sent","privacy_request",current.id,"Admin manually confirmed and sent GDPR response",{providerMessageId:delivery.providerMessageId,status:current.status});
  return {request:current,providerMessageId:delivery.providerMessageId};
}

export function privacyResponsePreview(request: AdminPrivacyOperationalRequest): string {
  return defaultResponseText({
    id:request.id,userId:request.userId,type:request.type,status:request.status,
    submittedAt:request.submittedAt,targetAt:request.targetAt,details:request.details,retention:[],outcome:request.outcome
  });
}
