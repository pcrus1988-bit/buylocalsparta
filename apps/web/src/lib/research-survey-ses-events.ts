import { createVerify, X509Certificate } from "node:crypto";
import type { SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

type SnsEnvelope = Readonly<{
  Type: string;
  MessageId: string;
  TopicArn: string;
  Message: string;
  Timestamp: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
  Subject?: string;
  SubscribeURL?: string;
  Token?: string;
}>;

type SesResearchEvent = Readonly<{
  eventType?: string;
  notificationType?: string;
  mail?: Readonly<{ messageId?: string }>;
  bounce?: Readonly<{ bounceType?: string; bounceSubType?: string }>;
  complaint?: Readonly<Record<string, unknown>>;
  delivery?: Readonly<Record<string, unknown>>;
}>;

function text(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

export async function handleResearchSesSnsWebhook(
  rawPayload: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<Readonly<{ confirmed?: boolean; duplicate?: boolean; processed?: boolean; ignored?: string }>> {
  const expectedTopicArn = env.BLS_RESEARCH_SES_SNS_TOPIC_ARN?.trim();
  if (!expectedTopicArn) throw new Error("BLS_RESEARCH_SES_SNS_TOPIC_ARN is required");
  const envelope = parseEnvelope(rawPayload);
  await verifySnsEnvelope(envelope, expectedTopicArn);

  if (envelope.Type === "SubscriptionConfirmation") {
    await confirmSubscription(envelope, expectedTopicArn);
    return { confirmed: true };
  }
  if (envelope.Type !== "Notification") {
    return { ignored: envelope.Type || "unsupported_sns_type" };
  }

  let event: SesResearchEvent;
  try {
    event = JSON.parse(envelope.Message) as SesResearchEvent;
  } catch {
    throw new Error("RESEARCH_SES_EVENT_INVALID_JSON");
  }
  return processResearchSesEvent(event, envelope.MessageId);
}

async function processResearchSesEvent(
  event: SesResearchEvent,
  snsMessageId: string
): Promise<Readonly<{ duplicate?: boolean; processed?: boolean; ignored?: string }>> {
  if (!productionDatabaseConfigured()) throw new Error("SURVEY_DATABASE_UNAVAILABLE");
  const providerMessageId = text(event.mail?.messageId).trim();
  const eventType = text(event.eventType || event.notificationType).trim();
  if (!providerMessageId || !eventType) return { ignored: "missing_provider_message_or_type" };

  const runtime = getProductionPostgresRuntime();
  const client = await runtime.sqlPool.connect();
  try {
    await client.query("BEGIN");
    const inviteResult = await client.query<SqlRow>(`
      SELECT
        ri.id AS invite_id,
        ri.study_id,
        ri.sample_unit_id,
        ri.contact_point_id,
        ri.status,
        cp.contact_value_hash
      FROM research_invites ri
      LEFT JOIN research_contact_points cp ON cp.id=ri.contact_point_id
      JOIN research_invite_events e ON e.invite_id=ri.id
      WHERE e.event_type='sent'
        AND e.metadata->>'providerMessageId'=$1
      ORDER BY e.occurred_at DESC,e.id DESC
      LIMIT 1
      FOR UPDATE OF ri
    `, [providerMessageId]);
    const invite = inviteResult.rows[0];
    if (!invite) {
      await client.query("COMMIT");
      return { ignored: "provider_message_not_research_invite" };
    }

    const duplicate = await client.query<SqlRow>(`
      SELECT 1
      FROM research_invite_events
      WHERE invite_id=$1 AND metadata->>'snsMessageId'=$2
      LIMIT 1
    `, [invite.invite_id, snsMessageId]);
    if (duplicate.rows[0]) {
      await client.query("COMMIT");
      return { duplicate: true };
    }

    const metadata = {
      source: "ses_sns",
      snsMessageId,
      providerMessageId,
      providerEventType: eventType,
      bounceType: event.bounce?.bounceType ?? null,
      bounceSubType: event.bounce?.bounceSubType ?? null
    };

    if (eventType === "Delivery") {
      await client.query(`
        INSERT INTO research_invite_events (invite_id,event_type,metadata)
        VALUES ($1,'delivered',$2::jsonb)
      `, [invite.invite_id, JSON.stringify(metadata)]);
    } else if (eventType === "Open") {
      await client.query(`
        UPDATE research_invites
        SET status=CASE WHEN status='sent' THEN 'opened' ELSE status END,
            first_opened_at=COALESCE(first_opened_at,now())
        WHERE id=$1
      `, [invite.invite_id]);
      await client.query(`
        INSERT INTO research_invite_events (invite_id,event_type,metadata)
        VALUES ($1,'opened',$2::jsonb)
      `, [invite.invite_id, JSON.stringify(metadata)]);
      if (invite.sample_unit_id) {
        await disposition(client, text(invite.sample_unit_id), "opened", "eligible", metadata);
      }
    } else if (eventType === "Bounce") {
      const permanentBounce = event.bounce?.bounceType === "Permanent";
      if (permanentBounce && invite.contact_value_hash) {
        await client.query(`
          INSERT INTO research_contact_suppression_events (
            contact_type,contact_value_hash,action,reason,study_id,invite_id,source,metadata
          )
          VALUES ('email',$1,'suppress','ses_bounce',$2,$3,'ses_sns',$4::jsonb)
        `, [invite.contact_value_hash, invite.study_id, invite.invite_id, JSON.stringify(metadata)]);
        await client.query(`
          UPDATE research_contact_points
          SET suppression_status='bounced'
          WHERE contact_type='email' AND contact_value_hash=$1
        `, [invite.contact_value_hash]);
      } else if (invite.contact_point_id) {
        // Transient/undetermined bounces close the current contact row, but are
        // not promoted into a cross-wave suppression without permanent evidence.
        await client.query(`
          UPDATE research_contact_points
          SET suppression_status='bounced'
          WHERE id=$1
        `, [invite.contact_point_id]);
      }
      await client.query("UPDATE research_invites SET status='suppressed' WHERE id=$1", [invite.invite_id]);
      await client.query(`
        INSERT INTO research_invite_events (invite_id,event_type,metadata)
        VALUES ($1,'bounced',$2::jsonb)
      `, [invite.invite_id, JSON.stringify(metadata)]);
      if (invite.sample_unit_id) {
        await disposition(client, text(invite.sample_unit_id), "bounce", "eligible", metadata);
      }
    } else if (eventType === "Complaint") {
      if (invite.contact_value_hash) {
        await client.query(`
          INSERT INTO research_contact_suppression_events (
            contact_type,contact_value_hash,action,reason,study_id,invite_id,source,metadata
          )
          VALUES ('email',$1,'suppress','ses_complaint',$2,$3,'ses_sns',$4::jsonb)
        `, [invite.contact_value_hash, invite.study_id, invite.invite_id, JSON.stringify(metadata)]);
        await client.query(`
          UPDATE research_contact_points
          SET suppression_status='suppressed'
          WHERE contact_type='email' AND contact_value_hash=$1
        `, [invite.contact_value_hash]);
      } else if (invite.contact_point_id) {
        await client.query(`
          UPDATE research_contact_points
          SET suppression_status='suppressed'
          WHERE id=$1
        `, [invite.contact_point_id]);
      }
      await client.query("UPDATE research_invites SET status='suppressed' WHERE id=$1", [invite.invite_id]);
      await client.query(`
        INSERT INTO research_invite_events (invite_id,event_type,metadata)
        VALUES ($1,'suppressed',$2::jsonb)
      `, [invite.invite_id, JSON.stringify({ ...metadata, reason: "complaint" })]);
      if (invite.sample_unit_id) {
        await disposition(
          client,
          text(invite.sample_unit_id),
          "noncontact",
          "eligible",
          { ...metadata, reason: "complaint_suppression" }
        );
      }
    } else if (eventType === "Reject" || eventType === "Rendering Failure") {
      await client.query(`
        UPDATE research_invites
        SET status=CASE WHEN status IN ('created','sent') THEN 'expired' ELSE status END
        WHERE id=$1
      `, [invite.invite_id]);
      await client.query(`
        INSERT INTO research_invite_events (invite_id,event_type,metadata)
        VALUES ($1,'expired',$2::jsonb)
      `, [invite.invite_id, JSON.stringify({ ...metadata, reason: eventType })]);
      if (invite.sample_unit_id) {
        await disposition(
          client,
          text(invite.sample_unit_id),
          "noncontact",
          "eligible",
          { ...metadata, reason: eventType }
        );
      }
    } else {
      await client.query("COMMIT");
      return { ignored: eventType };
    }

    await client.query("COMMIT");
    return { processed: true };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function disposition(
  client: Awaited<ReturnType<ReturnType<typeof getProductionPostgresRuntime>["sqlPool"]["connect"]>>,
  sampleUnitId: string,
  code: "opened" | "bounce" | "noncontact",
  eligibility: "eligible" | "ineligible" | "unknown",
  metadata: Record<string, unknown>
): Promise<void> {
  await client.query(`
    INSERT INTO research_sample_disposition_events
      (sample_unit_id,disposition_code,eligibility,source,metadata)
    VALUES ($1,$2,$3,'ses_sns',$4::jsonb)
  `, [sampleUnitId, code, eligibility, JSON.stringify(metadata)]);
}

function parseEnvelope(rawPayload: string): SnsEnvelope {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawPayload) as Record<string, unknown>;
  } catch {
    throw new Error("SNS_PAYLOAD_INVALID_JSON");
  }
  const required = [
    "Type",
    "MessageId",
    "TopicArn",
    "Message",
    "Timestamp",
    "SignatureVersion",
    "Signature",
    "SigningCertURL"
  ] as const;
  for (const key of required) {
    if (typeof parsed[key] !== "string" || !String(parsed[key]).trim()) {
      throw new Error(`SNS_${key.toUpperCase()}_MISSING`);
    }
  }
  return parsed as unknown as SnsEnvelope;
}

async function verifySnsEnvelope(envelope: SnsEnvelope, expectedTopicArn: string): Promise<void> {
  if (envelope.TopicArn !== expectedTopicArn) throw new Error("SNS_TOPIC_NOT_ALLOWED");
  if (!["1","2"].includes(envelope.SignatureVersion)) throw new Error("SNS_SIGNATURE_VERSION_UNSUPPORTED");

  const region = expectedTopicArn.split(":")[3];
  if (!region) throw new Error("SNS_TOPIC_REGION_INVALID");
  const expectedHost = `sns.${region}.amazonaws.com`;
  const certUrl = new URL(envelope.SigningCertURL);
  if (
    certUrl.protocol !== "https:" ||
    certUrl.hostname !== expectedHost ||
    !/^\/SimpleNotificationService-[A-Za-z0-9_-]+\.pem$/.test(certUrl.pathname)
  ) {
    throw new Error("SNS_SIGNING_CERT_URL_NOT_ALLOWED");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  let certificatePem: string;
  try {
    const response = await fetch(certUrl, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new Error(`SNS_SIGNING_CERT_FETCH_FAILED:${response.status}`);
    certificatePem = await response.text();
    if (certificatePem.length > 64 * 1024) throw new Error("SNS_SIGNING_CERT_TOO_LARGE");
  } finally {
    clearTimeout(timer);
  }

  const certificate = new X509Certificate(certificatePem);
  const now = Date.now();
  if (Date.parse(certificate.validFrom) > now || Date.parse(certificate.validTo) < now) {
    throw new Error("SNS_SIGNING_CERT_EXPIRED");
  }

  const verifier = createVerify(envelope.SignatureVersion === "2" ? "RSA-SHA256" : "RSA-SHA1");
  verifier.update(snsStringToSign(envelope), "utf8");
  verifier.end();
  if (!verifier.verify(certificate.publicKey, Buffer.from(envelope.Signature, "base64"))) {
    throw new Error("SNS_SIGNATURE_INVALID");
  }
}

function snsStringToSign(envelope: SnsEnvelope): string {
  const fields = envelope.Type === "Notification"
    ? [
        ["Message", envelope.Message],
        ["MessageId", envelope.MessageId],
        ...(envelope.Subject ? [["Subject", envelope.Subject]] : []),
        ["Timestamp", envelope.Timestamp],
        ["TopicArn", envelope.TopicArn],
        ["Type", envelope.Type]
      ]
    : [
        ["Message", envelope.Message],
        ["MessageId", envelope.MessageId],
        ["SubscribeURL", envelope.SubscribeURL ?? ""],
        ["Timestamp", envelope.Timestamp],
        ["Token", envelope.Token ?? ""],
        ["TopicArn", envelope.TopicArn],
        ["Type", envelope.Type]
      ];
  return fields.map(([key,value]) => `${key}\n${value}\n`).join("");
}

async function confirmSubscription(envelope: SnsEnvelope, expectedTopicArn: string): Promise<void> {
  if (!envelope.SubscribeURL || !envelope.Token) throw new Error("SNS_SUBSCRIPTION_CONFIRMATION_INCOMPLETE");
  const region = expectedTopicArn.split(":")[3];
  const url = new URL(envelope.SubscribeURL);
  if (url.protocol !== "https:" || url.hostname !== `sns.${region}.amazonaws.com`) {
    throw new Error("SNS_SUBSCRIBE_URL_NOT_ALLOWED");
  }
  if (url.searchParams.get("TopicArn") !== expectedTopicArn) {
    throw new Error("SNS_SUBSCRIBE_TOPIC_MISMATCH");
  }
  const response = await fetch(url, { method: "GET", cache: "no-store" });
  if (!response.ok) throw new Error(`SNS_SUBSCRIPTION_CONFIRMATION_FAILED:${response.status}`);
}
