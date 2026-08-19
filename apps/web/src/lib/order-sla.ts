import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { SessionPrincipal } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

type Stage = "acceptance" | "preparation";
type State = "open" | "breached" | "escalated" | "resolved";
type Json = Record<string, unknown>;
type Policy = {
  agreementUuid?: string; agreementId?: string; agreementCode?: string; agreementVersion?: number;
  policyUuid?: string; policyId?: string; acceptanceMinutes: number; preparationMinutes: number;
  warningPercent: number; emailReminderPercent: number; escalationGraceMinutes: number; timezone: string;
  source: "agreement_policy" | "agreement_fallback" | "platform_fallback"; sourceText: Json;
};
type CaseView = {
  id: string; orderId: string; fulfilmentId: string; vendorId?: string; vendorName?: string;
  stage: Stage; state: State; fulfilmentStatus: string; openedAt: string; dueAt: string; escalationAt: string;
  breachedAt?: string; escalatedAt?: string; resolvedAt?: string; agreementCode?: string; agreementVersion?: number; policy: Json;
};
type NotificationView = { id: string; eventType: string; title: string; body: string; payload: Json; createdAt: string; readAt?: string };

const FALLBACK = Object.freeze({
  acceptanceMinutes: 120, preparationMinutes: 240, warningPercent: 50, emailReminderPercent: 80,
  escalationGraceMinutes: 60, timezone: "Europe/Athens"
});
const date = (v: unknown) => v instanceof Date ? v : new Date(String(v));
const iso = (v: unknown) => v ? date(v).toISOString() : undefined;
const int = (v: unknown, fallback: number) => Number.isSafeInteger(Number(v)) ? Number(v) : fallback;
const vendorId = (p: SessionPrincipal) => {
  if (!p.vendorId || !p.roles.some((r) => r.startsWith("vendor_"))) throw new Error("VENDOR_AUTH_REQUIRED");
  return p.vendorId;
};

async function policyForVendor(client: PoolClient, vendorUuid: string, now: number): Promise<Policy> {
  const rows = (await client.query(`
    SELECT a.id::text agreement_uuid,a.public_id agreement_id,a.agreement_code,a.agreement_version,a.commercial_terms_snapshot,
           p.id::text policy_uuid,p.public_id policy_id,p.acceptance_minutes,p.preparation_minutes,p.warning_percent,
           p.email_reminder_percent,p.escalation_grace_minutes,p.timezone,p.source_text_snapshot
    FROM vendor_commercial_agreements a
    LEFT JOIN vendor_order_sla_policies p ON p.agreement_id=a.id AND p.enabled=true
    WHERE a.vendor_id=$1 AND a.status='active' AND a.starts_at <= $2 AND (a.ends_at IS NULL OR a.ends_at > $2)
    ORDER BY a.activated_at DESC NULLS LAST,a.starts_at DESC,a.created_at DESC LIMIT 1
  `, [vendorUuid, new Date(now)])).rows as Json[];
  if (!rows.length) return { ...FALLBACK, source: "platform_fallback", sourceText: {} };
  const r = rows[0];
  const terms = (r.commercial_terms_snapshot ?? {}) as Json;
  const sourceText = (r.source_text_snapshot ?? {
    orderAcceptanceSla: terms.orderAcceptanceSla ?? null, fulfilmentSla: terms.fulfilmentSla ?? null, supportSla: terms.supportSla ?? null
  }) as Json;
  const base = {
    agreementUuid: String(r.agreement_uuid), agreementId: String(r.agreement_id), agreementCode: String(r.agreement_code),
    agreementVersion: Number(r.agreement_version), sourceText
  };
  if (!r.policy_uuid) return { ...FALLBACK, ...base, source: "agreement_fallback" };
  return {
    ...base, policyUuid: String(r.policy_uuid), policyId: String(r.policy_id),
    acceptanceMinutes: int(r.acceptance_minutes, FALLBACK.acceptanceMinutes),
    preparationMinutes: int(r.preparation_minutes, FALLBACK.preparationMinutes),
    warningPercent: int(r.warning_percent, FALLBACK.warningPercent),
    emailReminderPercent: int(r.email_reminder_percent, FALLBACK.emailReminderPercent),
    escalationGraceMinutes: int(r.escalation_grace_minutes, FALLBACK.escalationGraceMinutes),
    timezone: typeof r.timezone === "string" ? r.timezone : FALLBACK.timezone, source: "agreement_policy"
  };
}

async function ensureCase(client: PoolClient, input: {
  orderUuid: string; fulfilmentUuid: string; vendorUuid: string; stage: Stage; openedAt: Date; status: string; now: number;
}) {
  const policy = await policyForVendor(client, input.vendorUuid, input.now);
  const target = input.stage === "acceptance" ? policy.acceptanceMinutes : policy.preparationMinutes;
  const due = new Date(input.openedAt.getTime() + target * 60_000);
  const escalation = new Date(due.getTime() + policy.escalationGraceMinutes * 60_000);
  const snapshot = {
    source: policy.source, agreementId: policy.agreementId ?? null, agreementCode: policy.agreementCode ?? null,
    agreementVersion: policy.agreementVersion ?? null, policyId: policy.policyId ?? null,
    acceptanceMinutes: policy.acceptanceMinutes, preparationMinutes: policy.preparationMinutes,
    warningPercent: policy.warningPercent, emailReminderPercent: policy.emailReminderPercent,
    escalationGraceMinutes: policy.escalationGraceMinutes, timezone: policy.timezone, sourceText: policy.sourceText
  };
  const inserted = await client.query(`
    INSERT INTO fulfilment_sla_cases(
      id,public_id,order_id,fulfilment_order_id,vendor_id,stage,state,opened_at,due_at,escalation_at,
      agreement_id,sla_policy_id,policy_snapshot,baseline_status,last_status_seen_at,updated_at
    ) VALUES($1,$2,$3,$4,$5,$6,'open',$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$14)
    ON CONFLICT (fulfilment_order_id,stage) WHERE state<>'resolved' DO NOTHING RETURNING id
  `, [randomUUID(), `sla_${randomUUID().replaceAll("-", "")}`, input.orderUuid, input.fulfilmentUuid, input.vendorUuid,
    input.stage, input.openedAt, due, escalation, policy.agreementUuid ?? null, policy.policyUuid ?? null,
    JSON.stringify(snapshot), input.status, new Date(input.now)]);
  return Boolean(inserted.rowCount);
}

const waiting = (stage: Stage, status: string) =>
  stage === "acceptance" ? status === "awaiting_acceptance" : ["accepted", "picking", "packed"].includes(status);
const stageText = (stage: Stage) => stage === "acceptance" ? "αποδοχή παραγγελίας" : "προετοιμασία παραγγελίας";

async function notify(client: PoolClient, input: {
  vendorUuid?: string; channel: "in_app" | "email"; eventType: string; key: string; title: string; body: string; payload: Json; now: number;
}) {
  const inserted = await client.query(`
    INSERT INTO notifications(id,public_id,user_id,vendor_id,channel,purpose,event_type,template_version,locale,title,body,payload,status,dedupe_key,sent_at,created_at)
    VALUES($1,$2,NULL,$3,$4,'transactional',$5,'order-sla-v1','el',$6,$7,$8::jsonb,$9,$10,$11,$12)
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING RETURNING id
  `, [randomUUID(), `notification_${randomUUID().replaceAll("-", "")}`, input.vendorUuid ?? null, input.channel, input.eventType,
    input.title, input.body, JSON.stringify(input.payload), input.channel === "in_app" ? "sent" : "queued", input.key,
    input.channel === "in_app" ? new Date(input.now) : null, new Date(input.now)]);
  return Boolean(inserted.rowCount);
}

async function reminders(client: PoolClient, r: Json, now: number) {
  const snap = (r.policy_snapshot ?? {}) as Json;
  const opened = date(r.opened_at).getTime(), due = date(r.due_at).getTime(), escalation = date(r.escalation_at).getTime();
  const duration = Math.max(1, due - opened);
  const warnAt = opened + Math.round(duration * int(snap.warningPercent, FALLBACK.warningPercent) / 100);
  const emailAt = opened + Math.round(duration * int(snap.emailReminderPercent, FALLBACK.emailReminderPercent) / 100);
  const stage = String(r.stage) as Stage;
  const payload = {
    orderId: String(r.order_id), fulfilmentId: String(r.fulfilment_id), slaCaseId: String(r.case_id),
    vendorId: String(r.vendor_id), stage, dueAt: new Date(due).toISOString(),
    agreementCode: snap.agreementCode ?? null, policySource: snap.source ?? "unknown"
  };
  let count = 0;
  if (stage === "acceptance") count += Number(await notify(client, {
    channel: "in_app", eventType: "admin.order_received", key: `sla:${r.case_id}:admin:new-order`,
    title: "Νέα παραγγελία σε vendor", body: `${r.vendor_name}: ${r.order_id} · αναμονή αποδοχής.`, payload, now
  }));
  if (now >= warnAt) count += Number(await notify(client, {
    vendorUuid: String(r.vendor_uuid), channel: "in_app", eventType: "vendor.sla_warning",
    key: `sla:${r.case_id}:vendor:warning:in_app`, title: "Υπενθύμιση SLA παραγγελίας",
    body: `${r.order_id}: εκκρεμεί ${stageText(stage)}. Προθεσμία ${new Date(due).toLocaleString("el-GR", { timeZone: "Europe/Athens" })}.`,
    payload, now
  }));
  if (now >= emailAt) count += Number(await notify(client, {
    vendorUuid: String(r.vendor_uuid), channel: "email", eventType: "vendor.sla_email_reminder",
    key: `sla:${r.case_id}:vendor:warning:email`, title: `Υπενθύμιση παραγγελίας · ${r.order_id}`,
    body: `Η παραγγελία ${r.order_id} εξακολουθεί να περιμένει ${stageText(stage)}.\n\nΗ προθεσμία λήγει ${new Date(due).toLocaleString("el-GR", { timeZone: "Europe/Athens" })}.\nΆνοιξε το Vendor Workspace και ενημέρωσε την κατάσταση.\n\nKONTA MOY · Buy Local Sparta`,
    payload, now
  }));
  if (now >= due) {
    await client.query(`UPDATE fulfilment_sla_cases SET state=CASE WHEN state='open' THEN 'breached' ELSE state END,breached_at=COALESCE(breached_at,$2),updated_at=$2 WHERE id=$1`, [r.case_uuid, new Date(now)]);
    count += Number(await notify(client, { vendorUuid: String(r.vendor_uuid), channel: "in_app", eventType: "vendor.sla_breached",
      key: `sla:${r.case_id}:vendor:breach:in_app`, title: "Υπέρβαση SLA παραγγελίας",
      body: `${r.order_id}: το SLA για ${stageText(stage)} έχει λήξει. Απαιτείται άμεση ενέργεια.`, payload, now }));
    count += Number(await notify(client, { vendorUuid: String(r.vendor_uuid), channel: "email", eventType: "vendor.sla_breached",
      key: `sla:${r.case_id}:vendor:breach:email`, title: `SLA ληγμένο · ${r.order_id}`,
      body: `Η συμφωνημένη προθεσμία για ${stageText(stage)} της παραγγελίας ${r.order_id} έχει λήξει. Παρακαλούμε ενημερώστε άμεσα την κατάσταση στο Vendor Workspace.`, payload, now }));
    count += Number(await notify(client, { channel: "in_app", eventType: "admin.order_sla_breached",
      key: `sla:${r.case_id}:admin:breach`, title: "Παραγγελία εκτός SLA",
      body: `${r.vendor_name} · ${r.order_id} · ${stageText(stage)}.`, payload, now }));
  }
  if (now >= escalation) {
    await client.query(`UPDATE fulfilment_sla_cases SET state='escalated',breached_at=COALESCE(breached_at,due_at),escalated_at=COALESCE(escalated_at,$2),updated_at=$2 WHERE id=$1 AND state<>'resolved'`, [r.case_uuid, new Date(now)]);
    count += Number(await notify(client, { vendorUuid: String(r.vendor_uuid), channel: "email", eventType: "vendor.sla_escalated",
      key: `sla:${r.case_id}:vendor:escalated:email`, title: `Κλιμάκωση παραγγελίας · ${r.order_id}`,
      body: `Η παραγγελία ${r.order_id} παραμένει χωρίς την απαιτούμενη αλλαγή κατάστασης μετά και το περιθώριο κλιμάκωσης.`, payload, now }));
    count += Number(await notify(client, { channel: "in_app", eventType: "admin.order_sla_escalated",
      key: `sla:${r.case_id}:admin:escalated`, title: "Επείγουσα κλιμάκωση SLA",
      body: `${r.vendor_name} · ${r.order_id}: δεν άλλαξε κατάσταση μετά την προθεσμία και το grace period.`, payload, now }));
  }
  return count;
}

export async function runOrderSlaMonitor(now = Date.now()) {
  if (!productionDatabaseConfigured()) return { scanned: 0, createdCases: 0, resolvedCases: 0, notifications: 0 };
  const runtime = getProductionPostgresRuntime();
  const client = await runtime.nativePool.connect();
  let createdCases = 0, resolvedCases = 0, notifications = 0, scanned = 0;
  try {
    await client.query("BEGIN");
    const candidates = (await client.query(`
      SELECT co.id::text order_uuid,fo.id::text fulfilment_uuid,fo.vendor_id::text vendor_uuid,fo.status::text status,
             fo.created_at,co.confirmed_at,fo.accepted_at,fo.updated_at
      FROM fulfilment_orders fo JOIN customer_orders co ON co.id=fo.order_id
      WHERE co.status IN ('confirmed','partially_fulfilled') AND fo.status IN ('awaiting_acceptance','accepted','picking','packed')
      ORDER BY fo.created_at LIMIT 500
    `)).rows as Json[];
    for (const r of candidates) {
      const stage: Stage = r.status === "awaiting_acceptance" ? "acceptance" : "preparation";
      const opened = stage === "acceptance" ? date(r.confirmed_at ?? r.created_at) : date(r.accepted_at ?? r.updated_at);
      if (await ensureCase(client, { orderUuid: String(r.order_uuid), fulfilmentUuid: String(r.fulfilment_uuid),
        vendorUuid: String(r.vendor_uuid), stage, openedAt: opened, status: String(r.status), now })) createdCases++;
    }
    const cases = (await client.query(`
      SELECT c.id::text case_uuid,c.public_id case_id,c.stage,c.state,c.opened_at,c.due_at,c.escalation_at,c.policy_snapshot,
             fo.public_id fulfilment_id,fo.status::text fulfilment_status,fo.vendor_id::text vendor_uuid,
             co.public_id order_id,v.public_id vendor_id,COALESCE(NULLIF(v.trading_name,''),v.legal_name) vendor_name
      FROM fulfilment_sla_cases c JOIN fulfilment_orders fo ON fo.id=c.fulfilment_order_id
      JOIN customer_orders co ON co.id=c.order_id JOIN vendor_businesses v ON v.id=c.vendor_id
      WHERE c.state<>'resolved' ORDER BY c.due_at LIMIT 500 FOR UPDATE OF c
    `)).rows as Json[];
    scanned = cases.length;
    for (const r of cases) {
      const stage = String(r.stage) as Stage, status = String(r.fulfilment_status);
      if (!waiting(stage, status)) {
        await client.query(`UPDATE fulfilment_sla_cases SET state='resolved',resolved_at=$2,resolution=$3,last_status_seen_at=$2,updated_at=$2 WHERE id=$1`,
          [r.case_uuid, new Date(now), `status_changed_to_${status}`]);
        resolvedCases++;
      } else {
        await client.query("UPDATE fulfilment_sla_cases SET last_status_seen_at=$2,updated_at=$2 WHERE id=$1", [r.case_uuid, new Date(now)]);
        notifications += await reminders(client, r, now);
      }
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally { client.release(); }
  try { if (runtime.notifications) await runtime.notifications.runOnce(now, 100); }
  catch (e) { console.error(JSON.stringify({ level: "error", event: "order_sla.notification_drain_failed", message: e instanceof Error ? e.message : String(e) })); }
  return { scanned, createdCases, resolvedCases, notifications };
}

function caseView(r: Json, withVendor = false): CaseView {
  return {
    id: String(r.case_id), orderId: String(r.order_id), fulfilmentId: String(r.fulfilment_id),
    ...(withVendor ? { vendorId: String(r.vendor_id), vendorName: String(r.vendor_name) } : {}),
    stage: String(r.stage) as Stage, state: String(r.state) as State, fulfilmentStatus: String(r.fulfilment_status),
    openedAt: date(r.opened_at).toISOString(), dueAt: date(r.due_at).toISOString(), escalationAt: date(r.escalation_at).toISOString(),
    breachedAt: iso(r.breached_at), escalatedAt: iso(r.escalated_at), resolvedAt: iso(r.resolved_at),
    agreementCode: r.agreement_code ? String(r.agreement_code) : undefined,
    agreementVersion: r.agreement_version == null ? undefined : Number(r.agreement_version),
    policy: (r.policy_snapshot ?? {}) as Json
  };
}
const notificationView = (r: Json): NotificationView => ({
  id: String(r.public_id), eventType: String(r.event_type), title: String(r.title ?? r.event_type), body: String(r.body ?? ""),
  payload: (r.payload ?? {}) as Json, createdAt: date(r.created_at).toISOString(), readAt: iso(r.read_at)
});

export async function adminOrderSlaWorkspace() {
  const db = getProductionPostgresRuntime().nativePool;
  const [caseQ, noteQ, missingQ] = await Promise.all([
    db.query(`SELECT c.public_id case_id,c.stage,c.state,c.opened_at,c.due_at,c.escalation_at,c.breached_at,c.escalated_at,c.resolved_at,c.policy_snapshot,
      co.public_id order_id,fo.public_id fulfilment_id,fo.status::text fulfilment_status,v.public_id vendor_id,
      COALESCE(NULLIF(v.trading_name,''),v.legal_name) vendor_name,a.agreement_code,a.agreement_version
      FROM fulfilment_sla_cases c JOIN customer_orders co ON co.id=c.order_id JOIN fulfilment_orders fo ON fo.id=c.fulfilment_order_id
      JOIN vendor_businesses v ON v.id=c.vendor_id LEFT JOIN vendor_commercial_agreements a ON a.id=c.agreement_id
      ORDER BY CASE c.state WHEN 'escalated' THEN 0 WHEN 'breached' THEN 1 WHEN 'open' THEN 2 ELSE 3 END,c.due_at DESC LIMIT 150`),
    db.query(`SELECT public_id,event_type,title,body,payload,created_at,read_at FROM notifications
      WHERE user_id IS NULL AND vendor_id IS NULL AND event_type LIKE 'admin.order_%' ORDER BY created_at DESC LIMIT 60`),
    db.query(`SELECT COUNT(*)::int count FROM vendor_commercial_agreements a LEFT JOIN vendor_order_sla_policies p ON p.agreement_id=a.id AND p.enabled=true
      WHERE a.status='active' AND p.id IS NULL`)
  ]);
  const cases = (caseQ.rows as Json[]).map((r) => caseView(r, true));
  return {
    metrics: {
      active: cases.filter((x) => x.state === "open").length, breached: cases.filter((x) => x.state === "breached").length,
      escalated: cases.filter((x) => x.state === "escalated").length, agreementsWithoutPolicy: Number(missingQ.rows[0]?.count ?? 0)
    },
    cases, notifications: (noteQ.rows as Json[]).map(notificationView)
  };
}

export async function vendorOrderNotificationWorkspace(principal: SessionPrincipal) {
  const publicVendorId = vendorId(principal), db = getProductionPostgresRuntime().nativePool;
  const vendorQ = await db.query(`SELECT id::text id,COALESCE(NULLIF(trading_name,''),legal_name) name FROM vendor_businesses WHERE public_id=$1 LIMIT 1`, [publicVendorId]);
  if (!vendorQ.rowCount) throw new Error("Vendor profile not found");
  const vendorUuid = String(vendorQ.rows[0].id);
  const [caseQ, noteQ, agreementQ] = await Promise.all([
    db.query(`SELECT c.public_id case_id,c.stage,c.state,c.opened_at,c.due_at,c.escalation_at,c.policy_snapshot,
      co.public_id order_id,fo.public_id fulfilment_id,fo.status::text fulfilment_status
      FROM fulfilment_sla_cases c JOIN customer_orders co ON co.id=c.order_id JOIN fulfilment_orders fo ON fo.id=c.fulfilment_order_id
      WHERE c.vendor_id=$1 ORDER BY c.updated_at DESC LIMIT 80`, [vendorUuid]),
    db.query(`SELECT public_id,event_type,title,body,payload,created_at,read_at FROM notifications WHERE vendor_id=$1 AND channel='in_app'
      AND (event_type LIKE 'vendor.order_%' OR event_type LIKE 'vendor.sla_%') ORDER BY created_at DESC LIMIT 80`, [vendorUuid]),
    db.query(`SELECT a.agreement_code,a.agreement_version,p.public_id policy_id,p.acceptance_minutes,p.preparation_minutes,p.warning_percent,
      p.email_reminder_percent,p.escalation_grace_minutes,p.timezone FROM vendor_commercial_agreements a
      LEFT JOIN vendor_order_sla_policies p ON p.agreement_id=a.id AND p.enabled=true WHERE a.vendor_id=$1 AND a.status='active'
      ORDER BY a.activated_at DESC NULLS LAST,a.starts_at DESC LIMIT 1`, [vendorUuid])
  ]);
  const cases = (caseQ.rows as Json[]).map((r) => caseView(r));
  const a = agreementQ.rows[0] as Json | undefined;
  return {
    vendor: { id: publicVendorId, name: String(vendorQ.rows[0].name) },
    metrics: {
      requiringAction: cases.filter((x) => x.state !== "resolved").length, breached: cases.filter((x) => x.state === "breached").length,
      escalated: cases.filter((x) => x.state === "escalated").length, unread: (noteQ.rows as Json[]).filter((r) => !r.read_at).length
    },
    activeAgreement: a ? {
      agreementCode: String(a.agreement_code), agreementVersion: Number(a.agreement_version), configured: Boolean(a.policy_id),
      acceptanceMinutes: int(a.acceptance_minutes, FALLBACK.acceptanceMinutes), preparationMinutes: int(a.preparation_minutes, FALLBACK.preparationMinutes),
      warningPercent: int(a.warning_percent, FALLBACK.warningPercent), emailReminderPercent: int(a.email_reminder_percent, FALLBACK.emailReminderPercent),
      escalationGraceMinutes: int(a.escalation_grace_minutes, FALLBACK.escalationGraceMinutes),
      timezone: typeof a.timezone === "string" ? a.timezone : FALLBACK.timezone
    } : undefined,
    cases, notifications: (noteQ.rows as Json[]).map(notificationView)
  };
}

export async function adminSlaPolicyWorkspace() {
  const rows = (await getProductionPostgresRuntime().nativePool.query(`
    SELECT a.public_id agreement_id,a.agreement_code,a.agreement_version,a.status::text agreement_status,
      v.public_id vendor_id,COALESCE(NULLIF(v.trading_name,''),v.legal_name) vendor_name,a.commercial_terms_snapshot,
      p.public_id policy_id,p.acceptance_minutes,p.preparation_minutes,p.warning_percent,p.email_reminder_percent,
      p.escalation_grace_minutes,p.timezone,p.updated_at policy_updated_at
    FROM vendor_commercial_agreements a JOIN vendor_businesses v ON v.id=a.vendor_id LEFT JOIN vendor_order_sla_policies p ON p.agreement_id=a.id
    WHERE a.status NOT IN ('terminated','expired','superseded','rejected')
    ORDER BY CASE WHEN a.status='active' THEN 0 ELSE 1 END,lower(COALESCE(NULLIF(v.trading_name,''),v.legal_name)),a.created_at DESC
  `)).rows as Json[];
  return {
    defaults: FALLBACK,
    agreements: rows.map((r) => {
      const terms = (r.commercial_terms_snapshot ?? {}) as Json;
      return {
        agreementId: String(r.agreement_id), agreementCode: String(r.agreement_code), agreementVersion: Number(r.agreement_version),
        agreementStatus: String(r.agreement_status), vendorId: String(r.vendor_id), vendorName: String(r.vendor_name),
        sourceText: {
          orderAcceptanceSla: typeof terms.orderAcceptanceSla === "string" ? terms.orderAcceptanceSla : "",
          fulfilmentSla: typeof terms.fulfilmentSla === "string" ? terms.fulfilmentSla : ""
        },
        configured: Boolean(r.policy_id), policyId: r.policy_id ? String(r.policy_id) : undefined,
        acceptanceMinutes: int(r.acceptance_minutes, FALLBACK.acceptanceMinutes), preparationMinutes: int(r.preparation_minutes, FALLBACK.preparationMinutes),
        warningPercent: int(r.warning_percent, FALLBACK.warningPercent), emailReminderPercent: int(r.email_reminder_percent, FALLBACK.emailReminderPercent),
        escalationGraceMinutes: int(r.escalation_grace_minutes, FALLBACK.escalationGraceMinutes),
        timezone: typeof r.timezone === "string" ? r.timezone : FALLBACK.timezone, updatedAt: iso(r.policy_updated_at)
      };
    })
  };
}

export async function saveAdminSlaPolicy(principal: SessionPrincipal, raw: Json) {
  const agreementId = typeof raw.agreementId === "string" ? raw.agreementId.trim() : "";
  const acceptanceMinutes = int(raw.acceptanceMinutes, -1), preparationMinutes = int(raw.preparationMinutes, -1);
  const warningPercent = int(raw.warningPercent, -1), emailReminderPercent = int(raw.emailReminderPercent, -1);
  const escalationGraceMinutes = int(raw.escalationGraceMinutes, -1);
  if (!agreementId) throw new Error("agreementId is required");
  if (acceptanceMinutes < 5 || acceptanceMinutes > 10080) throw new Error("Acceptance SLA must be between 5 and 10080 minutes");
  if (preparationMinutes < 5 || preparationMinutes > 43200) throw new Error("Preparation SLA must be between 5 and 43200 minutes");
  if (warningPercent < 1 || warningPercent > 95 || emailReminderPercent <= warningPercent || emailReminderPercent > 99) throw new Error("Reminder thresholds are invalid");
  if (escalationGraceMinutes < 0 || escalationGraceMinutes > 10080) throw new Error("Escalation grace is invalid");

  const client = await getProductionPostgresRuntime().nativePool.connect();
  try {
    await client.query("BEGIN");
    const agreementQ = await client.query(`SELECT a.id::text agreement_uuid,a.vendor_id::text vendor_uuid,a.agreement_code,a.status::text status,
      a.commercial_terms_snapshot FROM vendor_commercial_agreements a WHERE a.public_id=$1 OR a.id::text=$1 FOR UPDATE`, [agreementId]);
    if (!agreementQ.rowCount) throw new Error("Agreement not found");
    const a = agreementQ.rows[0] as Json;
    if (["terminated","expired","superseded","rejected"].includes(String(a.status))) throw new Error("SLA policy cannot be attached to a closed agreement");
    const actorQ = await client.query("SELECT id::text id FROM users WHERE public_id=$1 OR id::text=$1 LIMIT 1", [principal.userId]);
    const actor = actorQ.rowCount ? String(actorQ.rows[0].id) : null;
    const terms = (a.commercial_terms_snapshot ?? {}) as Json;
    const sourceText = { orderAcceptanceSla: terms.orderAcceptanceSla ?? null, fulfilmentSla: terms.fulfilmentSla ?? null,
      supportSla: terms.supportSla ?? null, agreementCode: String(a.agreement_code) };
    await client.query(`INSERT INTO vendor_order_sla_policies(
      id,public_id,agreement_id,vendor_id,enabled,acceptance_minutes,preparation_minutes,warning_percent,email_reminder_percent,
      escalation_grace_minutes,timezone,source_text_snapshot,created_by,updated_by,created_at,updated_at)
      VALUES($1,$2,$3,$4,true,$5,$6,$7,$8,$9,'Europe/Athens',$10::jsonb,$11,$11,now(),now())
      ON CONFLICT (agreement_id) DO UPDATE SET vendor_id=EXCLUDED.vendor_id,enabled=true,acceptance_minutes=EXCLUDED.acceptance_minutes,
      preparation_minutes=EXCLUDED.preparation_minutes,warning_percent=EXCLUDED.warning_percent,email_reminder_percent=EXCLUDED.email_reminder_percent,
      escalation_grace_minutes=EXCLUDED.escalation_grace_minutes,timezone=EXCLUDED.timezone,source_text_snapshot=EXCLUDED.source_text_snapshot,
      updated_by=EXCLUDED.updated_by,updated_at=now()`,
      [randomUUID(), `sla_policy_${randomUUID().replaceAll("-", "")}`, a.agreement_uuid, a.vendor_uuid, acceptanceMinutes, preparationMinutes,
        warningPercent, emailReminderPercent, escalationGraceMinutes, JSON.stringify(sourceText), actor]);
    await client.query(`INSERT INTO vendor_agreement_audit_log(agreement_id,vendor_id,action,from_status,to_status,actor_user_id,metadata)
      VALUES($1,$2,'order_sla_policy_saved',$3,$3,$4,$5::jsonb)`,
      [a.agreement_uuid, a.vendor_uuid, String(a.status), actor, JSON.stringify({ acceptanceMinutes, preparationMinutes, warningPercent, emailReminderPercent, escalationGraceMinutes })]);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally { client.release(); }
  return adminSlaPolicyWorkspace();
}
