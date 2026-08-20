import { randomUUID } from "node:crypto";
import {
  PostgresUnitOfWork,
  type Notification,
  type NotificationPurpose,
  type SqlExecutor,
  type SqlPool,
  type SqlRow
} from "@buy-local-sparta/core";

const SYSTEM_CREATOR = "system:auto-discovery";
const TOKEN_PATTERN = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

type TemplateRow = SqlRow & {
  event_type: string;
  locale: "el" | "en";
  purpose: NotificationPurpose;
  revision: number;
  title_template: string;
  body_template: string;
  created_by_public_id: string;
  created_at: Date | string;
};

type ObservedRow = SqlRow & {
  event_type: string;
  locale: "el" | "en";
  purpose: NotificationPurpose;
  title: string;
  body: string;
  payload: Record<string, unknown> | null;
  created_at: Date | string;
};

export type EmailTemplateCatalogItem = Readonly<{
  eventType: string;
  locale: "el" | "en";
  purpose: NotificationPurpose;
  subject: string;
  body: string;
  revision: number;
  customized: boolean;
  source: "template" | "observed";
  variables: readonly string[];
  updatedAt: string;
}>;

export type EmailTemplateRevisionInput = Readonly<{
  eventType: string;
  locale: "el" | "en";
  subject: string;
  body: string;
  actorPublicId: string;
}>;

export class PostgresEmailTemplateRegistry {
  readonly #uow: PostgresUnitOfWork;

  constructor(db: SqlPool) {
    this.#uow = new PostgresUnitOfWork(db);
  }

  /**
   * Registers an event the first time it is observed and applies the latest Admin-authored
   * revision. System-discovered revisions are catalog baselines only: code-generated copy
   * remains authoritative until an Admin explicitly saves an override.
   */
  async resolveForSend(notification: Notification): Promise<Notification> {
    if (notification.channel !== "email") return notification;
    return this.#uow.withTransaction({ platformAccess: true, requestId: `email-template-resolve:${notification.eventType}:${randomUUID()}` }, async (tx) => {
      await ensureDiscoveredTx(tx, notification);
      const custom = await tx.query<TemplateRow>(`
        SELECT event_type, locale, purpose, revision, title_template, body_template,
               created_by_public_id, created_at
          FROM notification_templates
         WHERE event_type=$1 AND channel='email' AND locale=$2 AND active=true
           AND created_by_public_id <> $3
         ORDER BY revision DESC, created_at DESC
         LIMIT 1
      `, [notification.eventType, notification.locale, SYSTEM_CREATOR]);
      const row = custom.rows[0];
      if (!row) return notification;

      const values = templateValues(notification);
      const title = renderTemplate(row.title_template, values);
      const body = renderTemplate(row.body_template, values);
      if (hasUnresolvedToken(title) || hasUnresolvedToken(body)) {
        console.error(JSON.stringify({
          level: "error",
          event: "notification_template.unresolved_variable",
          eventType: notification.eventType,
          revision: Number(row.revision)
        }));
        return notification;
      }
      return {
        ...notification,
        title,
        body,
        templateVersion: `admin-email-v${Number(row.revision)}`
      };
    });
  }

  async ensureDiscovered(notification: Notification): Promise<void> {
    if (notification.channel !== "email") return;
    await this.#uow.withTransaction({ platformAccess: true, requestId: `email-template-discover:${notification.eventType}:${randomUUID()}` }, async (tx) => {
      await ensureDiscoveredTx(tx, notification);
    });
  }

  async catalog(): Promise<readonly EmailTemplateCatalogItem[]> {
    return this.#uow.withTransaction({ platformAccess: true, requestId: `email-template-catalog:${randomUUID()}` }, async (tx) => {
      const templates = await tx.query<TemplateRow>(`
        SELECT DISTINCT ON (event_type,locale)
               event_type,locale,purpose,revision,title_template,body_template,created_by_public_id,created_at
          FROM notification_templates
         WHERE channel='email' AND active=true
         ORDER BY event_type,locale,revision DESC,created_at DESC
      `);
      const observed = await tx.query<ObservedRow>(`
        SELECT DISTINCT ON (event_type,locale)
               event_type,locale,purpose,title,body,payload,created_at
          FROM notifications
         WHERE channel='email'
         ORDER BY event_type,locale,created_at DESC
      `);

      const items = new Map<string, EmailTemplateCatalogItem>();
      for (const row of templates.rows) {
        const key = catalogKey(row.event_type, row.locale);
        items.set(key, {
          eventType: row.event_type,
          locale: row.locale,
          purpose: row.purpose,
          subject: row.title_template,
          body: row.body_template,
          revision: Number(row.revision),
          customized: row.created_by_public_id !== SYSTEM_CREATOR,
          source: "template",
          variables: variablesIn(`${row.title_template}\n${row.body_template}`),
          updatedAt: iso(row.created_at)
        });
      }
      for (const row of observed.rows) {
        const key = catalogKey(row.event_type, row.locale);
        if (items.has(key)) continue;
        const payload = jsonObject(row.payload);
        const subject = parameterize(row.title, payload);
        const body = parameterize(row.body, payload);
        items.set(key, {
          eventType: row.event_type,
          locale: row.locale,
          purpose: row.purpose,
          subject,
          body,
          revision: 0,
          customized: false,
          source: "observed",
          variables: variablesIn(`${subject}\n${body}`),
          updatedAt: iso(row.created_at)
        });
      }
      return [...items.values()].sort((a, b) => a.eventType.localeCompare(b.eventType) || a.locale.localeCompare(b.locale));
    }, { readOnly: true });
  }

  async saveRevision(input: EmailTemplateRevisionInput): Promise<EmailTemplateCatalogItem> {
    const eventType = cleanEventType(input.eventType);
    const locale = input.locale === "en" ? "en" : "el";
    const subject = cleanSubject(input.subject);
    const body = cleanBody(input.body);
    const actorPublicId = input.actorPublicId.trim();
    if (!actorPublicId) throw new Error("Admin actor is required");

    return this.#uow.withTransaction({ platformAccess: true, requestId: `email-template-save:${eventType}:${randomUUID()}` }, async (tx) => {
      await ensureBaselineForEvent(tx, eventType, locale);
      const baseline = await tx.query<TemplateRow>(`
        SELECT event_type,locale,purpose,revision,title_template,body_template,created_by_public_id,created_at
          FROM notification_templates
         WHERE event_type=$1 AND channel='email' AND locale=$2 AND created_by_public_id=$3
         ORDER BY revision DESC LIMIT 1
      `, [eventType, locale, SYSTEM_CREATOR]);
      if (!baseline.rowCount) throw new Error("This email event has not been observed yet");
      const base = baseline.rows[0]!;
      const allowed = new Set(variablesIn(`${base.title_template}\n${base.body_template}`));
      for (const variable of variablesIn(`${subject}\n${body}`)) {
        if (!allowed.has(variable)) throw new Error(`Unknown template variable: {{${variable}}}`);
      }

      await tx.query(`SELECT pg_advisory_xact_lock(hashtext($1 || ':' || $2))`, [eventType, locale]);
      const revisionResult = await tx.query<SqlRow>(`
        SELECT COALESCE(MAX(revision),0)+1 AS revision
          FROM notification_templates
         WHERE event_type=$1 AND channel='email' AND locale=$2
      `, [eventType, locale]);
      const revision = Number(revisionResult.rows[0]?.revision ?? 1);
      await tx.query(`
        UPDATE notification_templates
           SET active=false
         WHERE event_type=$1 AND channel='email' AND locale=$2
           AND created_by_public_id <> $3 AND active=true
      `, [eventType, locale, SYSTEM_CREATOR]);
      const inserted = await tx.query<TemplateRow>(`
        INSERT INTO notification_templates(
          public_id,event_type,channel,locale,purpose,revision,title_template,body_template,
          required,active,created_by,created_by_public_id,created_at
        ) VALUES($1,$2,'email',$3,$4,$5,$6,$7,($4='transactional'),true,NULL,$8,clock_timestamp())
        RETURNING event_type,locale,purpose,revision,title_template,body_template,created_by_public_id,created_at
      `, [`ntpl_${randomUUID().replace(/-/g, "")}`, eventType, locale, base.purpose, revision, subject, body, actorPublicId]);
      return catalogItemFromTemplate(inserted.rows[0]!, true);
    });
  }

  async reset(input: { eventType: string; locale: "el" | "en" }): Promise<void> {
    const eventType = cleanEventType(input.eventType);
    const locale = input.locale === "en" ? "en" : "el";
    await this.#uow.withTransaction({ platformAccess: true, requestId: `email-template-reset:${eventType}:${randomUUID()}` }, async (tx) => {
      await tx.query(`
        UPDATE notification_templates
           SET active = (created_by_public_id = $3)
         WHERE event_type=$1 AND channel='email' AND locale=$2
      `, [eventType, locale, SYSTEM_CREATOR]);
    });
  }
}

async function ensureDiscoveredTx(tx: SqlExecutor, notification: Notification): Promise<void> {
  const subject = parameterize(notification.title, notification.payload);
  const body = parameterize(notification.body, notification.payload);
  await tx.query(`
    INSERT INTO notification_templates(
      public_id,event_type,channel,locale,purpose,revision,title_template,body_template,
      required,active,created_by,created_by_public_id,created_at
    )
    SELECT $1,$2,'email',$3,$4,
           COALESCE((SELECT MAX(revision)+1 FROM notification_templates WHERE event_type=$2 AND channel='email' AND locale=$3),1),
           $5,$6,($4='transactional'),true,NULL,$7,clock_timestamp()
     WHERE NOT EXISTS (
       SELECT 1 FROM notification_templates
        WHERE event_type=$2 AND channel='email' AND locale=$3 AND created_by_public_id=$7
     )
    ON CONFLICT DO NOTHING
  `, [`ntpl_${randomUUID().replace(/-/g, "")}`, notification.eventType, notification.locale, notification.purpose, subject, body, SYSTEM_CREATOR]);
}

async function ensureBaselineForEvent(tx: SqlExecutor, eventType: string, locale: "el" | "en"): Promise<void> {
  const exists = await tx.query<SqlRow>(`
    SELECT 1 FROM notification_templates
     WHERE event_type=$1 AND channel='email' AND locale=$2 AND created_by_public_id=$3 LIMIT 1
  `, [eventType, locale, SYSTEM_CREATOR]);
  if (exists.rowCount) return;
  const observed = await tx.query<ObservedRow>(`
    SELECT event_type,locale,purpose,title,body,payload,created_at
      FROM notifications
     WHERE event_type=$1 AND channel='email' AND locale=$2
     ORDER BY created_at DESC LIMIT 1
  `, [eventType, locale]);
  const row = observed.rows[0];
  if (!row) return;
  const payload = jsonObject(row.payload);
  await tx.query(`
    INSERT INTO notification_templates(
      public_id,event_type,channel,locale,purpose,revision,title_template,body_template,
      required,active,created_by,created_by_public_id,created_at
    )
    SELECT $1,$2,'email',$3,$4,
           COALESCE((SELECT MAX(revision)+1 FROM notification_templates WHERE event_type=$2 AND channel='email' AND locale=$3),1),
           $5,$6,($4='transactional'),true,NULL,$7,clock_timestamp()
     WHERE NOT EXISTS (
       SELECT 1 FROM notification_templates WHERE event_type=$2 AND channel='email' AND locale=$3 AND created_by_public_id=$7
     )
    ON CONFLICT DO NOTHING
  `, [`ntpl_${randomUUID().replace(/-/g, "")}`, eventType, locale, row.purpose, parameterize(row.title, payload), parameterize(row.body, payload), SYSTEM_CREATOR]);
}

function catalogItemFromTemplate(row: TemplateRow, customized: boolean): EmailTemplateCatalogItem {
  return {
    eventType: row.event_type,
    locale: row.locale,
    purpose: row.purpose,
    subject: row.title_template,
    body: row.body_template,
    revision: Number(row.revision),
    customized,
    source: "template",
    variables: variablesIn(`${row.title_template}\n${row.body_template}`),
    updatedAt: iso(row.created_at)
  };
}

function templateValues(notification: Notification): Record<string, unknown> {
  return {
    ...notification.payload,
    eventType: notification.eventType,
    locale: notification.locale,
    ...(notification.userId ? { userId: notification.userId } : {}),
    ...(notification.vendorId ? { vendorId: notification.vendorId } : {})
  };
}

function parameterize(value: string, payload: Record<string, unknown>): string {
  let result = String(value ?? "");
  const candidates = Object.entries(payload)
    .filter(([key, raw]) => validVariableName(key) && primitiveTemplateValue(raw))
    .map(([key, raw]) => [key, String(raw)] as const)
    .filter(([, raw]) => raw.length >= 3)
    .sort((a, b) => b[1].length - a[1].length);
  for (const [key, raw] of candidates) result = result.split(raw).join(`{{${key}}}`);
  return result.trim();
}

function renderTemplate(template: string, values: Record<string, unknown>): string {
  return template.replace(TOKEN_PATTERN, (match, key: string) => {
    const value = values[key];
    return value === undefined || value === null ? match : String(value);
  }).trim();
}

function variablesIn(template: string): readonly string[] {
  const found = new Set<string>();
  for (const match of template.matchAll(new RegExp(TOKEN_PATTERN.source, "g"))) found.add(match[1]!);
  return [...found].sort();
}

function hasUnresolvedToken(value: string): boolean { return /\{\{\s*[a-zA-Z0-9_.-]+\s*\}\}/.test(value); }
function validVariableName(value: string): boolean { return /^[a-zA-Z0-9_.-]+$/.test(value); }
function primitiveTemplateValue(value: unknown): value is string | number | boolean { return typeof value === "string" || typeof value === "number" || typeof value === "boolean"; }
function catalogKey(eventType: string, locale: string): string { return `${eventType}:${locale}`; }
function jsonObject(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function iso(value: Date | string): string { return value instanceof Date ? value.toISOString() : new Date(value).toISOString(); }

function cleanEventType(value: string): string {
  const result = value.trim();
  if (!/^[a-zA-Z0-9_.:-]{2,160}$/.test(result)) throw new Error("Invalid email event type");
  return result;
}
function cleanSubject(value: string): string {
  const result = value.trim();
  if (!result || result.length > 240 || /[\r\n]/.test(result)) throw new Error("Subject must be 1–240 characters without line breaks");
  return result;
}
function cleanBody(value: string): string {
  const result = value.trim();
  if (!result || result.length > 120_000) throw new Error("Email body must be 1–120000 characters");
  return result;
}
