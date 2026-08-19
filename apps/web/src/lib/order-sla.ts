import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { SessionPrincipal } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

type SlaStage = "acceptance" | "preparation";
type SlaState = "open" | "breached" | "escalated" | "resolved";

type OperationalPolicy = Readonly<{
  agreementUuid?: string;
  agreementId?: string;
  agreementCode?: string;
  agreementVersion?: number;
  policyUuid?: string;
  policyId?: string;
  acceptanceMinutes: number;
  preparationMinutes: number;
  warningPercent: number;
  emailReminderPercent: number;
  escalationGraceMinutes: number;
  timezone: string;
  source: "agreement_policy" | "agreement_fallback" | "platform_fallback";
  sourceText: Readonly<Record<string, unknown>>;
}>;

const FALLBACK_POLICY = Object.freeze({
  acceptanceMinutes: 120,
  preparationMinutes: 240,
  warningPercent: 50,
  emailReminderPercent: 80,
  escalationGraceMinutes: 60,
  timezone: "Europe/Athens"
});

const asInt = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
};

const asDate = (value: unknown): Date => value instanceof Date ? value : new Date(String(value));
const iso = (value: unknown): string | undefined => value ? asDate(value).toISOString() : undefined;

function requiredVendorId(principal: SessionPrincipal): string {
  if (!principal.vendorId || !principal.roles.some((role) => role.startsWith("vendor_"))) throw new Error("VENDOR_AUTH_REQUIRED");
  return principal.vendorId;
}

async function actorUuid(client: PoolClient, principal: SessionPrincipal): Promise<string | null> {
  const result = await client.query<{ id: string }>("SELECT id::text AS id FROM users WHERE public_id=$1 OR id::text=$1 LIMIT 1", [principal.userId]);
  return result.rowCount ? result.rows[0].id : null;
}

async function policyForVendor(client: PoolClient, vendorUuid: string, now: number): Promise<OperationalPolicy> {
  const result = await client.query<{
    agreement_uuid: string;
    agreement_id: string;
    agreement_code: string;
    agreement_version: number | string;
    commercial_terms_snapshot: Record<string, unknown> | null;
    policy_uuid: string | null;
    policy_id: string | null;
    acceptance_minutes: number | string | null;
    preparation_minutes: number | string | null;
    warning_percent: number | string | null;
    email_reminder_percent: number | string | null;
    escalation_grace_minutes: number | string | null;
    timezone: string | null;
    source_text_snapshot: Record<string, unknown> | null;
  }>(`
    SELECT a.id::text AS agreement_uuid,a.public_id AS agreement_id,a.agreement_code,a.agreement_version,
           a.commercial_terms_snapshot,
           p.id::text AS policy_uuid,p.public_id AS policy_id,p.acceptance_minutes,p.preparation_minutes,
           p.warning_percent,p.email_reminder_percent,p.escalation_grace_minutes,p.timezone,p.source_text_snapshot
    FROM vendor_commercial_agreements a
    LEFT JOIN vendor_order_sla_policies p ON p.agreement_id=a.id AND p.enabled=true
    WHERE a.vendor_id=$1 AND a.status='active' AND a.starts_at <= $2
      AND (a.ends_at IS NULL OR a.ends_at > $2)
    ORDER BY a.activated_at DESC NULLS LAST,a.starts_at DESC,a.created_at DESC
    LIMIT 1
  `, [vendorUuid, new Date(now)]);

  if (!result.rowCount) return { ...FALLBACK_POLICY, source: "platform_fallback", sourceText: {} };

  const row = result.rows[0];
  const commercial = row.commercial_terms_snapshot ?? {};
  const sourceText = row.source_text_snapshot ?? {
    orderAcceptanceSla: commercial.orderAcceptanceSla ?? null,
    fulfilmentSla: commercial.fulfilmentSla ?? null,
    supportSla: commercial.supportSla ?? null
  };

  if (!row.policy_uuid) {
    return {
      ...FALLBACK_POLICY,
      agreementUuid: row.agreement_uuid,
      agreementId: row.agreement_id,
      agreementCode: row.agreement_code,
      agreementVersion: Number(row.agreement_version),
      source: "agreement_fallback",
      sourceText
    };
  }

  return {
    agreementUuid: row.agreement_uuid,
    agreementId: row.agreement_id,
    agreementCode: row.agreement_code,
    agreementVersion: Number(row.agreement_version),
    policyUuid: row.policy_uuid,
    policyId: row.policy_id ?? undefined,
    acceptanceMinutes: asInt(row.acceptance_minutes, FALLBACK_POLICY.acceptanceMinutes),
    preparationMinutes: asInt(row.preparation_minutes, FALLBACK_POLICY.preparationMinutes),
    warningPercent: asInt(row.warning_percent, FALLBACK_POLICY.warningPercent),
    emailReminderPercent: asInt(row.email_reminder_percent, FALLBACK_POLICY.emailReminderPercent),
    escalationGraceMinutes: asInt(row.escalation_grace_minutes, FALLBACK_POLICY.escalationGraceMinutes),
    timezone: row.timezone || FALLBACK_POLICY.timezone,
    source: "agreement_policy",
    sourceText
  };
}

async function ensureCase(client: PoolClient, input: {
  orderUuid: string;
  fulfilmentUuid: string;
  vendorUuid: string;
  stage: SlaStage;
  openedAt: Date;
  baselineStatus: string;
  now: number;
}): Promise<void> {
  const existing = await client.query("SELECT 1 FROM fulfilment_sla_cases WHERE fulfilment_order_id=$1 AND stage=$2 AND state<>'resolved' LIMIT 1", [input.fulfilmentUuid, input.stage]);
  if (existing.rowCount) return;

  const policy = await policyForVendor(client, input.vendorUuid, input.now);
  const targetMinutes = input.stage === "acceptance" ? policy.acceptanceMinutes : policy.preparationMinutes;
  const dueAt = new Date(input.openedAt.getTime() + targetMinutes * 60_000);
  const escalationAt = new Date(dueAt.getTime() + policy.escalationGraceMinutes * 60_000);
  const snapshot = {
    source: policy.source,
    agreementId: policy.agreementId ?? null,
    agreementCode: policy.agreementCode ?? null,
    agreementVersion: policy.agreementVersion ?? null,
    policyId: policy.policyId ?? null,
    acceptanceMinutes: policy.acceptanceMinutes,
    preparationMinutes: policy.preparationMinutes,
    warningPercent: policy.warningPercent,
    emailReminderPercent: policy.emailReminderPercent,
    escalationGraceMinutes: policy.escalationGraceMinutes,
    timezone: policy.timezone,
    sourceText: policy.sourceText
  };
  await client.query(`
    INSERT INTO fulfilment_sla_cases(
      id,public_id,order_id,fulfilment_order_id,vendor_id,stage,state,opened_at,due_at,escalation_at,
      agreement_id,sla_policy_id,policy_snapshot,baseline_status,last_status_seen_at,updated_at
    )
    SELECT $1,$2,$3,$4,$5,$6,'open',$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$14
    WHERE NOT EXISTS (
      SELECT 1 FROM fulfilment_sla_cases WHERE fulfilment_order_id=$4 AND stage=$6 AND state<>'resolved'
    )
    ON CONFLICT (fulfilment_order_id,stage) WHERE state<>'resolved' DO NOTHING
  `, [
    randomUUID(), `sla_${randomUUID().replaceAll("-", "")}`, input.orderUuid, input.fulfilmentUuid, input.vendorUuid,
    input.stage, input.openedAt, dueAt, escalationAt, policy.agreementUuid ?? null, policy.policyUuid ?? null,
    JSON.stringify(snapshot), input.baselineStatus, new Date(input.now)
  ]);
}

function stageStillWaiting(stage: SlaStage, status: string): boolean {
  if (stage === "acceptance") return status === "awaiting_acceptance";
  return ["accepted", "picking", "packed"].includes(status);
}

async function putNotification(client: PoolClient, input: {
  vendorUuid?: string;
  channel: "in_app" | "email";
  eventType: string;
  dedupeKey: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  now: number;
}): Promise<boolean> {
  const inserted = await client.query(`
    INSERT INTO notifications(
      id,public_id,user_id,vendor_id,channel,purpose,event_type,template_version,locale,
      title,body,payload,status,dedupe_key,sent_at,created_at
    ) VALUES(
      $1,$2,NULL,$3,$4,'transactional',$5,'order-sla-v1','el',$6,$7,$8::jsonb,$9,$10,$11,$12
    )
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
    RETURNING id
  `, [
    randomUUID(), `notification_${randomUUID().replaceAll("-", "")}`, input.vendorUuid ?? null, input.channel,
    input.eventType, input.title, input.body, JSON.stringify(input.payload),
    input.channel === "in_app" ? "sent" : "queued", input.dedupeKey,
    input.channel === "in_app" ? new Date(input.now) : null, new Date(input.now)
  ]);
  return Boolean(inserted.rowCount);
}

function policyNumber(snapshot: Record<string, unknown>, key: string, fallback: number): number {
  return asInt(snapshot[key], fallback);
}

function stageLabel(stage: SlaStage): string {
  return stage === "acceptance" ? "αποδοχή παραγγελίας" : "προετοιμασία παραγγελίας";
}

function minutesLabel(minutes: number): string {
  if (minutes < 60) return `${minutes}′`;
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours} ώρ.` : `${hours.toLocaleString("el-GR", { maximumFractionDigits: 1 })} ώρ.`;
}

async function emitReminderSet(client: PoolClient, row: any, now: number): Promise<number> {
  const snapshot = (row.policy_snapshot ?? {}) as Record<string, unknown>;
  const openedAt = asDate(row.opened_at).getTime();
  const dueAt = asDate(row.due_at).getTime();
  const escalationAt = asDate(row.escalation_at).getTime();
  const duration = Math.max(1, dueAt - openedAt);
  const warningPercent = policyNumber(snapshot, "warningPercent", FALLBACK_POLICY.warningPercent);
  const emailPercent = policyNumber(snapshot, "emailReminderPercent", FALLBACK_POLICY.emailReminderPercent);
  const warningAt = openedAt + Math.round(duration * warningPercent / 100);
  const emailAt = openedAt + Math.round(duration * emailPercent / 100);
  const stage = String(row.stage) as SlaStage;
  const payload = {
    orderId: String(row.order_id),
    fulfilmentId: String(row.fulfilment_id),
    slaCaseId: String(row.case_id),
    vendorId: String(row.vendor_id),
    stage,
    dueAt: new Date(dueAt).toISOString(),
    agreementCode: snapshot.agreementCode ?? null,
    policySource: snapshot.source ?? "unknown"
  };
  let created = 0;

  if (stage === "acceptance") {
    created += Number(await putNotification(client, {
      channel: "in_app",
      eventType: "admin.order_received",
      dedupeKey: `sla:${row.case_id}:admin:new-order`,
      title: "Νέα παραγγελία σε vendor",
      body: `${row.vendor_name}: ${row.order_id} · αναμονή αποδοχής.`,
      payload,
      now
    }));
  }

  if (now >= warningAt) {
    created += Number(await putNotification(client, {
      vendorUuid: String(row.vendor_uuid),
      channel: "in_app",
      eventType: "vendor.sla_warning",
      dedupeKey: `sla:${row.case_id}:vendor:warning:in_app`,
      title: "Υπενθύμιση SLA παραγγελίας",
      body: `${row.order_id}: εκκρεμεί ${stageLabel(stage)}. Προθεσμία ${new Date(dueAt).toLocaleString("el-GR", { timeZone: "Europe/Athens" })}.`,
      payload,
      now
    }));
  }

  if (now >= emailAt) {
    created += Number(await putNotification(client, {
      vendorUuid: String(row.vendor_uuid),
      channel: "email",
      eventType: "vendor.sla_email_reminder",
      dedupeKey: `sla:${row.case_id}:vendor:warning:email`,
      title: `Υπενθύμιση παραγγελίας · ${row.order_id}`,
      body: [
        `Η παραγγελία ${row.order_id} εξακολουθεί να περιμένει ${stageLabel(stage)}.`,
        "",
        `Συμφωνημένο SLA: ${minutesLabel(Math.round(duration / 60_000))}.`,
        `Προθεσμία: ${new Date(dueAt).toLocaleString("el-GR", { timeZone: "Europe/Athens" })}.`,
        "",
        "Άνοιξε το Vendor Workspace και ενημέρωσε την κατάσταση της παραγγελίας.",
        "",
        "KONTA MOY · Buy Local Sparta"
      ].join("\n"),
      payload,
      now
    }));
  }

  if (now >= dueAt) {
    await client.query(`
      UPDATE fulfilment_sla_cases
      SET state=CASE WHEN state='open' THEN 'breached' ELSE state END,
          breached_at=COALESCE(breached_at,$2),updated_at=$2
      WHERE id=$1
    `, [row.case_uuid, new Date(now)]);
    created += Number(await putNotification(client, {
      vendorUuid: String(row.vendor_uuid),
      channel: "in_app",
      eventType: "vendor.sla_breached",
      dedupeKey: `sla:${row.case_id}:vendor:breach:in_app`,
      title: "Υπέρβαση SLA παραγγελίας",
      body: `${row.order_id}: το SLA για ${stageLabel(stage)} έχει λήξει. Απαιτείται άμεση ενέργεια.`,
      payload,
      now
    }));
    created += Number(await putNotification(client, {
      vendorUuid: String(row.vendor_uuid),
      channel: "email",
      eventType: "vendor.sla_breached",
      dedupeKey: `sla:${row.case_id}:vendor:breach:email`,
      title: `SLA ληγμένο · ${row.order_id}`,
      body: `Η συμφωνημένη προθεσμία για ${stageLabel(stage)} της παραγγελίας ${row.order_id} έχει λήξει. Παρακαλούμε ενημερώστε άμεσα την κατάσταση στο Vendor Workspace.`,
      payload,
      now
    }));
    created += Number(await putNotification(client, {
      channel: "in_app",
      eventType: "admin.order_sla_breached",
      dedupeKey: `sla:${row.case_id}:admin:breach`,
      title: "Παραγγελία εκτός SLA",
      body: `${row.vendor_name} · ${row.order_id} · ${stageLabel(stage)}.`,
      payload,
      now
    }));
  }

  if (now >= escalationAt) {
    await client.query(`
      UPDATE fulfilment_sla_cases
      SET state='escalated',breached_at=COALESCE(breached_at,due_at),
          escalated_at=COALESCE(escalated_at,$2),updated_at=$2
      WHERE id=$1 AND state<>'resolved'
    `, [row.case_uuid, new Date(now)]);
    created += Number(await putNotification(client, {
      vendorUuid: String(row.vendor_uuid),
      channel: "email",
      eventType: "vendor.sla_escalated",
      dedupeKey: `sla:${row.case_id}:vendor:escalated:email`,
      title: `Κλιμάκωση παραγγελίας · ${row.order_id}`,
      body: `Η παραγγελία ${row.order_id} παραμένει χωρίς την απαιτούμενη αλλαγή κατάστασης μετά και το περιθώριο κλιμάκωσης. Η υπόθεση έχει εμφανιστεί ως επείγουσα στο Admin Operations.`,
      payload,
      now
    }));
    created += Number(await putNotification(client, {
      channel: "in_app",
      eventType: "admin.order_sla_escalated",
      dedupeKey: `sla:${row.case_id}:admin:escalated`,
      title: "Επείγουσα κλιμάκωση SLA",
      body: `${row.vendor_name} · ${row.order_id}: δεν άλλαξε κατάσταση μετά την προθεσμία και το grace period.`,
      payload,
      now
    }));
  }

  return created;
}

export async function runOrderSlaMonitor(now = Date.now()): Promise<{ scanned: number; createdCases: number; resolvedCases: number; notifications: number }> {
  if (!productionDatabaseConfigured()) return { scanned: 0, createdCases: 0, resolvedCases: 0, notifications: 0 };
  const runtime = getProductionPostgresRuntime();
  const client = await runtime.nativePool.connect();
  let createdCases = 0;
  let resolvedCases = 0;
  let notifications = 0;
  let scanned = 0;
  try {
    await client.query("BEGIN");
    const candidates = await client.query<{
      order_uuid: string;
      fulfilment_uuid: string;
      vendor_uuid: string;
      status: string;
      created_at: Date;
      confirmed_at: Date | null;
      accepted_at: Date | null;
      updated_at: Date;
    }>(`
      SELECT co.id::text AS order_uuid,fo.id::text AS fulfilment_uuid,fo.vendor_id::text AS vendor_uuid,
             fo.status::text AS status,fo.created_at,co.confirmed_at,fo.accepted_at,fo.updated_at
      FROM fulfilment_orders fo
      JOIN customer_orders co ON co.id=fo.order_id
      WHERE co.status IN ('confirmed','partially_fulfilled')
        AND fo.status IN ('awaiting_acceptance','accepted','picking','packed')
      ORDER BY fo.created_at
      LIMIT 500
    `);

    for (const row of candidates.rows) {
      const stage: SlaStage = row.status === "awaiting_acceptance" ? "acceptance" : "preparation";
      const before = await client.query("SELECT 1 FROM fulfilment_sla_cases WHERE fulfilment_order_id=$1 AND stage=$2 AND state<>'resolved' LIMIT 1", [row.fulfilment_uuid, stage]);
      await ensureCase(client, {
        orderUuid: row.order_uuid,
        fulfilmentUuid: row.fulfilment_uuid,
        vendorUuid: row.vendor_uuid,
        stage,
        openedAt: stage === "preparation" ? (row.accepted_at ?? row.updated_at) : (row.confirmed_at ?? row.created_at),
        baselineStatus: row.status,
        now
      });
      if (!before.rowCount) createdCases += 1;
    }

    const cases = await client.query<any>(`
      SELECT c.id::text AS case_uuid,c.public_id AS case_id,c.stage,c.state,c.opened_at,c.due_at,c.escalation_at,c.policy_snapshot,
             fo.public_id AS fulfilment_id,fo.status::text AS fulfilment_status,fo.vendor_id::text AS vendor_uuid,
             co.public_id AS order_id,v.public_id AS vendor_id,COALESCE(NULLIF(v.trading_name,''),v.legal_name) AS vendor_name
      FROM fulfilment_sla_cases c
      JOIN fulfilment_orders fo ON fo.id=c.fulfilment_order_id
      JOIN customer_orders co ON co.id=c.order_id
      JOIN vendor_businesses v ON v.id=c.vendor_id
      WHERE c.state<>'resolved'
      ORDER BY c.due_at
      LIMIT 500
      FOR UPDATE OF c
    `);
    scanned = cases.rows.length;

    for (const row of cases.rows) {
      const stage = String(row.stage) as SlaStage;
      const status = String(row.fulfilment_status);
      if (!stageStillWaiting(stage, status)) {
        await client.query(`
          UPDATE fulfilment_sla_cases
          SET state='resolved',resolved_at=$2,resolution=$3,last_status_seen_at=$2,updated_at=$2
          WHERE id=$1
        `, [row.case_uuid, new Date(now), `status_changed_to_${status}`]);
        resolvedCases += 1;
        continue;
      }
      await client.query("UPDATE fulfilment_sla_cases SET last_status_seen_at=$2,updated_at=$2 WHERE id=$1", [row.case_uuid, new Date(now)]);
      notifications += await emitReminderSet(client, row, now);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  try {
    if (runtime.notifications) await runtime.notifications.runOnce(now, 100);
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "order_sla.notification_drain_failed", message: error instanceof Error ? error.message : String(error) }));
  }
  return { scanned, createdCases, resolvedCases, notifications };
}

export async function adminOrderSlaWorkspace() {
  const db = getProductionPostgresRuntime().nativePool;
  const [caseRows, notificationRows, missingRows] = await Promise.all([
    db.query<any>(`
      SELECT c.public_id AS case_id,c.stage,c.state,c.opened_at,c.due_at,c.escalation_at,c.breached_at,c.escalated_at,c.resolved_at,
             c.policy_snapshot,co.public_id AS order_id,fo.public_id AS fulfilment_id,fo.status::text AS fulfilment_status,
             v.public_id AS vendor_id,COALESCE(NULLIF(v.trading_name,''),v.legal_name) AS vendor_name,
             a.agreement_code,a.agreement_version
      FROM fulfilment_sla_cases c
      JOIN customer_orders co ON co.id=c.order_id
      JOIN fulfilment_orders fo ON fo.id=c.fulfilment_order_id
      JOIN vendor_businesses v ON v.id=c.vendor_id
      LEFT JOIN vendor_commercial_agreements a ON a.id=c.agreement_id
      ORDER BY CASE c.state WHEN 'escalated' THEN 0 WHEN 'breached' THEN 1 WHEN 'open' THEN 2 ELSE 3 END,c.due_at DESC
      LIMIT 150
    `),
    db.query<any>(`
      SELECT public_id,event_type,title,body,payload,created_at,read_at
      FROM notifications
      WHERE user_id IS NULL AND vendor_id IS NULL AND event_type LIKE 'admin.order_%'
      ORDER BY created_at DESC
      LIMIT 60
    `),
    db.query<any>(`
      SELECT COUNT(*)::int AS count
      FROM vendor_commercial_agreements a
      LEFT JOIN vendor_order_sla_policies p ON p.agreement_id=a.id AND p.enabled=true
      WHERE a.status='active' AND p.id IS NULL
    `)
  ]);

  const cases = caseRows.rows.map((row: any) => ({
    id: String(row.case_id),
    orderId: String(row.order_id),
    fulfilmentId: String(row.fulfilment_id),
    vendorId: String(row.vendor_id),
    vendorName: String(row.vendor_name),
    stage: String(row.stage) as SlaStage,
    state: String(row.state) as SlaState,
    fulfilmentStatus: String(row.fulfilment_status),
    openedAt: asDate(row.opened_at).toISOString(),
    dueAt: asDate(row.due_at).toISOString(),
    escalationAt: asDate(row.escalation_at).toISOString(),
    breachedAt: iso(row.breached_at),
    escalatedAt: iso(row.escalated_at),
    resolvedAt: iso(row.resolved_at),
    agreementCode: row.agreement_code ? String(row.agreement_code) : undefined,
    agreementVersion: row.agreement_version == null ? undefined : Number(row.agreement_version),
    policy: (row.policy_snapshot ?? {}) as Record<string, unknown>
  }));
  return {
    metrics: {
      active: cases.filter((item) => item.state === "open").length,
      breached: cases.filter((item) => item.state === "breached").length,
      escalated: cases.filter((item) => item.state === "escalated").length,
      agreementsWithoutPolicy: Number(missingRows.rows[0]?.count ?? 0)
    },
    cases,
    notifications: notificationRows.rows.map((row: any) => ({
      id: String(row.public_id),
      eventType: String(row.event_type),
      title: String(row.title ?? row.event_type),
      body: String(row.body ?? ""),
      payload: (row.payload ?? {}) as Record<string, unknown>,
      createdAt: asDate(row.created_at).toISOString(),
      readAt: iso(row.read_at)
    }))
  };
}

export async function vendorOrderNotificationWorkspace(principal: SessionPrincipal) {
  const vendorId = requiredVendorId(principal);
  const db = getProductionPostgresRuntime().nativePool;
  const vendor = await db.query<{ id: string; name: string }>(`
    SELECT id::text AS id,COALESCE(NULLIF(trading_name,''),legal_name) AS name
    FROM vendor_businesses WHERE public_id=$1 LIMIT 1
  `, [vendorId]);
  if (!vendor.rowCount) throw new Error("Vendor profile not found");
  const vendorUuid = vendor.rows[0].id;
  const [caseRows, notificationRows, agreementRows] = await Promise.all([
    db.query<any>(`
      SELECT c.public_id AS case_id,c.stage,c.state,c.opened_at,c.due_at,c.escalation_at,c.policy_snapshot,
             co.public_id AS order_id,fo.public_id AS fulfilment_id,fo.status::text AS fulfilment_status
      FROM fulfilment_sla_cases c
      JOIN customer_orders co ON co.id=c.order_id
      JOIN fulfilment_orders fo ON fo.id=c.fulfilment_order_id
      WHERE c.vendor_id=$1
      ORDER BY c.updated_at DESC
      LIMIT 80
    `, [vendorUuid]),
    db.query<any>(`
      SELECT public_id,event_type,title,body,payload,created_at,read_at
      FROM notifications
      WHERE vendor_id=$1 AND channel='in_app'
        AND (event_type LIKE 'vendor.order_%' OR event_type LIKE 'vendor.sla_%')
      ORDER BY created_at DESC
      LIMIT 80
    `, [vendorUuid]),
    db.query<any>(`
      SELECT a.agreement_code,a.agreement_version,p.public_id AS policy_id,p.acceptance_minutes,p.preparation_minutes,
             p.warning_percent,p.email_reminder_percent,p.escalation_grace_minutes,p.timezone
      FROM vendor_commercial_agreements a
      LEFT JOIN vendor_order_sla_policies p ON p.agreement_id=a.id AND p.enabled=true
      WHERE a.vendor_id=$1 AND a.status='active'
      ORDER BY a.activated_at DESC NULLS LAST,a.starts_at DESC
      LIMIT 1
    `, [vendorUuid])
  ]);
  const activeAgreement = agreementRows.rows[0];
  const cases = caseRows.rows.map((row: any) => ({
    id: String(row.case_id),
    orderId: String(row.order_id),
    fulfilmentId: String(row.fulfilment_id),
    stage: String(row.stage) as SlaStage,
    state: String(row.state) as SlaState,
    fulfilmentStatus: String(row.fulfilment_status),
    openedAt: asDate(row.opened_at).toISOString(),
    dueAt: asDate(row.due_at).toISOString(),
    escalationAt: asDate(row.escalation_at).toISOString(),
    policy: (row.policy_snapshot ?? {}) as Record<string, unknown>
  }));
  return {
    vendor: { id: vendorId, name: vendor.rows[0].name },
    metrics: {
      requiringAction: cases.filter((item) => item.state !== "resolved").length,
      breached: cases.filter((item) => item.state === "breached").length,
      escalated: cases.filter((item) => item.state === "escalated").length,
      unread: notificationRows.rows.filter((row: any) => !row.read_at).length
    },
    activeAgreement: activeAgreement ? {
      agreementCode: String(activeAgreement.agreement_code),
      agreementVersion: Number(activeAgreement.agreement_version),
      configured: Boolean(activeAgreement.policy_id),
      acceptanceMinutes: activeAgreement.acceptance_minutes == null ? FALLBACK_POLICY.acceptanceMinutes : Number(activeAgreement.acceptance_minutes),
      preparationMinutes: activeAgreement.preparation_minutes == null ? FALLBACK_POLICY.preparationMinutes : Number(activeAgreement.preparation_minutes),
      warningPercent: activeAgreement.warning_percent == null ? FALLBACK_POLICY.warningPercent : Number(activeAgreement.warning_percent),
      emailReminderPercent: activeAgreement.email_reminder_percent == null ? FALLBACK_POLICY.emailReminderPercent : Number(activeAgreement.email_reminder_percent),
      escalationGraceMinutes: activeAgreement.escalation_grace_minutes == null ? FALLBACK_POLICY.escalationGraceMinutes : Number(activeAgreement.escalation_grace_minutes),
      timezone: activeAgreement.timezone ? String(activeAgreement.timezone) : FALLBACK_POLICY.timezone
    } : undefined,
    cases,
    notifications: notificationRows.rows.map((row: any) => ({
      id: String(row.public_id),
      eventType: String(row.event_type),
      title: String(row.title ?? row.event_type),
      body: String(row.body ?? ""),
      payload: (row.payload ?? {}) as Record<string, unknown>,
      createdAt: asDate(row.created_at).toISOString(),
      readAt: iso(row.read_at)
    }))
  };
}

export async function adminSlaPolicyWorkspace() {
  const db = getProductionPostgresRuntime().nativePool;
  const result = await db.query<any>(`
    SELECT a.public_id AS agreement_id,a.agreement_code,a.agreement_version,a.status::text AS agreement_status,
           v.public_id AS vendor_id,COALESCE(NULLIF(v.trading_name,''),v.legal_name) AS vendor_name,
           a.commercial_terms_snapshot,
           p.public_id AS policy_id,p.enabled,p.acceptance_minutes,p.preparation_minutes,p.warning_percent,
           p.email_reminder_percent,p.escalation_grace_minutes,p.timezone,p.updated_at AS policy_updated_at
    FROM vendor_commercial_agreements a
    JOIN vendor_businesses v ON v.id=a.vendor_id
    LEFT JOIN vendor_order_sla_policies p ON p.agreement_id=a.id
    WHERE a.status NOT IN ('terminated','expired','superseded','rejected')
    ORDER BY CASE WHEN a.status='active' THEN 0 ELSE 1 END,lower(COALESCE(NULLIF(v.trading_name,''),v.legal_name)),a.created_at DESC
  `);
  return {
    defaults: FALLBACK_POLICY,
    agreements: result.rows.map((row: any) => {
      const commercial = (row.commercial_terms_snapshot ?? {}) as Record<string, unknown>;
      return {
        agreementId: String(row.agreement_id),
        agreementCode: String(row.agreement_code),
        agreementVersion: Number(row.agreement_version),
        agreementStatus: String(row.agreement_status),
        vendorId: String(row.vendor_id),
        vendorName: String(row.vendor_name),
        sourceText: {
          orderAcceptanceSla: typeof commercial.orderAcceptanceSla === "string" ? commercial.orderAcceptanceSla : "",
          fulfilmentSla: typeof commercial.fulfilmentSla === "string" ? commercial.fulfilmentSla : ""
        },
        configured: Boolean(row.policy_id),
        policyId: row.policy_id ? String(row.policy_id) : undefined,
        acceptanceMinutes: row.acceptance_minutes == null ? FALLBACK_POLICY.acceptanceMinutes : Number(row.acceptance_minutes),
        preparationMinutes: row.preparation_minutes == null ? FALLBACK_POLICY.preparationMinutes : Number(row.preparation_minutes),
        warningPercent: row.warning_percent == null ? FALLBACK_POLICY.warningPercent : Number(row.warning_percent),
        emailReminderPercent: row.email_reminder_percent == null ? FALLBACK_POLICY.emailReminderPercent : Number(row.email_reminder_percent),
        escalationGraceMinutes: row.escalation_grace_minutes == null ? FALLBACK_POLICY.escalationGraceMinutes : Number(row.escalation_grace_minutes),
        timezone: row.timezone ? String(row.timezone) : FALLBACK_POLICY.timezone,
        updatedAt: iso(row.policy_updated_at)
      };
    })
  };
}

export async function saveAdminSlaPolicy(principal: SessionPrincipal, raw: Record<string, unknown>) {
  const agreementId = typeof raw.agreementId === "string" ? raw.agreementId.trim() : "";
  if (!agreementId) throw new Error("agreementId is required");
  const acceptanceMinutes = asInt(raw.acceptanceMinutes, -1);
  const preparationMinutes = asInt(raw.preparationMinutes, -1);
  const warningPercent = asInt(raw.warningPercent, -1);
  const emailReminderPercent = asInt(raw.emailReminderPercent, -1);
  const escalationGraceMinutes = asInt(raw.escalationGraceMinutes, -1);
  if (acceptanceMinutes < 5 || acceptanceMinutes > 10080) throw new Error("Acceptance SLA must be between 5 and 10080 minutes");
  if (preparationMinutes < 5 || preparationMinutes > 43200) throw new Error("Preparation SLA must be between 5 and 43200 minutes");
  if (warningPercent < 1 || warningPercent > 95) throw new Error("Warning threshold must be between 1% and 95%");
  if (emailReminderPercent <= warningPercent || emailReminderPercent > 99) throw new Error("Email reminder threshold must be after the first warning and below 100%");
  if (escalationGraceMinutes < 0 || escalationGraceMinutes > 10080) throw new Error("Escalation grace is invalid");

  const db = getProductionPostgresRuntime().nativePool;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const agreement = await client.query<any>(`
      SELECT a.id::text AS agreement_uuid,a.vendor_id::text AS vendor_uuid,a.agreement_code,a.status::text AS status,
             a.commercial_terms_snapshot
      FROM vendor_commercial_agreements a
      WHERE a.public_id=$1 OR a.id::text=$1
      FOR UPDATE
    `, [agreementId]);
    if (!agreement.rowCount) throw new Error("Agreement not found");
    const row = agreement.rows[0];
    if (["terminated","expired","superseded","rejected"].includes(String(row.status))) throw new Error("SLA policy cannot be attached to a closed agreement");
    const actor = await actorUuid(client, principal);
    const commercial = (row.commercial_terms_snapshot ?? {}) as Record<string, unknown>;
    const sourceText = {
      orderAcceptanceSla: commercial.orderAcceptanceSla ?? null,
      fulfilmentSla: commercial.fulfilmentSla ?? null,
      supportSla: commercial.supportSla ?? null,
      agreementCode: String(row.agreement_code)
    };
    await client.query(`
      INSERT INTO vendor_order_sla_policies(
        id,public_id,agreement_id,vendor_id,enabled,acceptance_minutes,preparation_minutes,warning_percent,
        email_reminder_percent,escalation_grace_minutes,timezone,source_text_snapshot,created_by,updated_by,created_at,updated_at
      ) VALUES(
        $1,$2,$3,$4,true,$5,$6,$7,$8,$9,'Europe/Athens',$10::jsonb,$11,$11,now(),now()
      )
      ON CONFLICT (agreement_id) DO UPDATE SET
        vendor_id=EXCLUDED.vendor_id,enabled=true,acceptance_minutes=EXCLUDED.acceptance_minutes,
        preparation_minutes=EXCLUDED.preparation_minutes,warning_percent=EXCLUDED.warning_percent,
        email_reminder_percent=EXCLUDED.email_reminder_percent,escalation_grace_minutes=EXCLUDED.escalation_grace_minutes,
        timezone=EXCLUDED.timezone,source_text_snapshot=EXCLUDED.source_text_snapshot,updated_by=EXCLUDED.updated_by,updated_at=now()
    `, [
      randomUUID(), `sla_policy_${randomUUID().replaceAll("-", "")}`, row.agreement_uuid, row.vendor_uuid,
      acceptanceMinutes, preparationMinutes, warningPercent, emailReminderPercent, escalationGraceMinutes,
      JSON.stringify(sourceText), actor
    ]);
    await client.query(`
      INSERT INTO vendor_agreement_audit_log(agreement_id,vendor_id,action,from_status,to_status,actor_user_id,metadata)
      VALUES($1,$2,'order_sla_policy_saved',$3,$3,$4,$5::jsonb)
    `, [
      row.agreement_uuid, row.vendor_uuid, String(row.status), actor,
      JSON.stringify({ acceptanceMinutes, preparationMinutes, warningPercent, emailReminderPercent, escalationGraceMinutes })
    ]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  return adminSlaPolicyWorkspace();
}
