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
  mail?: Readonly<{
    messageId?: string;
    tags?: Readonly<Record<string, readonly string[]>>;
  }>;
  bounce?: Readonly<{ bounceType?: string; bounceSubType?: string }>;
  complaint?: Readonly<Record<string, unknown>>;
  delivery?: Readonly<Record<string, unknown>>;
  deliveryDelay?: Readonly<{
    delayType?: string;
    delayedRecipients?: readonly Readonly<{
      emailAddress?: string;
      status?: string;
      diagnosticCode?: string;
    }>[];
    expirationTime?: string;
    reportingMTA?: string;
    timestamp?: string;
  }>;
}>;

function text(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

// Keep SES diagnostics useful for operations without copying the delayed
// recipient address into the research event ledger.
function deliveryDelayMetadata(event: SesResearchEvent): Record<string, unknown> {
  const delay = event.deliveryDelay;
  const recipient = delay?.delayedRecipients?.[0];
  return {
    delayType: text(delay?.delayType).slice(0, 120) || null,
    smtpStatus: text(recipient?.status).slice(0, 80) || null,
    diagnosticCode: text(recipient?.diagnosticCode).replace(/[\r\n]+/g, " ").slice(0, 500) || null,
    expirationTime: text(delay?.expirationTime).slice(0, 80) || null,
    reportingMTA: text(delay?.reportingMTA).slice(0, 200) || null,
    delayTimestamp: text(delay?.timestamp).slice(0, 80) || null
  };
}

function deliveryDelaySummary(event: SesResearchEvent): string {
  const details = deliveryDelayMetadata(event);
  const parts = [
    "SES delivery delay",
    text(details.delayType) || "Undetermined",
    text(details.smtpStatus),
    text(details.diagnosticCode)
  ].filter(Boolean);
  return parts.join(": ").slice(0, 1000);
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
  const attemptTag = text(event.mail?.tags?.research_attempt?.[0]).trim();
  if (!providerMessageId || !eventType) return { ignored: "missing_provider_message_or_type" };

  const runtime = getProductionPostgresRuntime();
  const client = await runtime.sqlPool.connect();
  try {
    await client.query("BEGIN");
    const attemptResult = await client.query<SqlRow>(`
      SELECT
        ri.id AS invite_id,
        ri.study_id,
        ri.sample_unit_id,
        ri.contact_point_id,
        ri.status,
        cp.contact_value_hash,
        m.id AS message_id
      FROM research_invite_messages m
      JOIN research_invites ri ON ri.id=m.invite_id
      LEFT JOIN research_contact_points cp ON cp.id=ri.contact_point_id
      WHERE m.provider_message_id=$1
         OR ($2::text<>'' AND m.id::text=$2)
      ORDER BY m.created_at DESC,m.id DESC
      LIMIT 1
      FOR UPDATE OF m,ri
    `, [providerMessageId, attemptTag]);

    let invite = attemptResult.rows[0];
    if (!invite) {
      const inviteResult = await client.query<SqlRow>(`
        SELECT
          ri.id AS invite_id,
          ri.study_id,
          ri.sample_unit_id,
          ri.contact_point_id,
          ri.status,
          cp.contact_value_hash,
          NULL::uuid AS message_id
        FROM research_invites ri
        LEFT JOIN research_contact_points cp ON cp.id=ri.contact_point_id
        JOIN research_invite_events e ON e.invite_id=ri.id
        WHERE e.event_type='sent'
          AND e.metadata->>'providerMessageId'=$1
        ORDER BY e.occurred_at DESC,e.id DESC
        LIMIT 1
        FOR UPDATE OF ri
      `, [providerMessageId]);
      invite = inviteResult.rows[0];
    }
    if (!invite) {
      const deliveryResult = await client.query<SqlRow>(`
        SELECT
          d.id AS delivery_id,
          d.study_id,
          d.contact_point_id,
          d.status,
          cp.contact_type,
          cp.contact_value_hash
        FROM research_participant_deliveries d
        JOIN research_contact_points cp ON cp.id=d.contact_point_id
        WHERE d.provider_message_id=$1
        LIMIT 1
        FOR UPDATE OF d
      `, [providerMessageId]);
      const delivery = deliveryResult.rows[0];
      if (!delivery) {
        await client.query("COMMIT");
        return { ignored: "provider_message_not_research_message" };
      }

      const deliveryDuplicate = await client.query<SqlRow>(`
        SELECT 1
        FROM research_participant_delivery_events
        WHERE delivery_id=$1 AND metadata->>'snsMessageId'=$2
        LIMIT 1
      `, [delivery.delivery_id, snsMessageId]);
      if (deliveryDuplicate.rows[0]) {
        await client.query("COMMIT");
        return { duplicate: true };
      }

      const metadata = {
        source: "ses_sns",
        snsMessageId,
        providerMessageId,
        providerEventType: eventType,
        bounceType: event.bounce?.bounceType ?? null,
        bounceSubType: event.bounce?.bounceSubType ?? null,
        ...(eventType === "DeliveryDelay" ? deliveryDelayMetadata(event) : {})
      };
      let deliveryEventType: "sent" | "delivered" | "opened" | "bounced" | "complained" | "failed" | undefined;
      if (eventType === "Delivery") {
        deliveryEventType = "delivered";
        await client.query(`
          UPDATE research_participant_deliveries
          SET last_error=CASE
                WHEN last_error LIKE 'SES delivery delay:%' THEN NULL
                ELSE last_error
              END,
              updated_at=now()
          WHERE id=$1
        `, [delivery.delivery_id]);
      } else if (eventType === "Open") {
        deliveryEventType = "opened";
        await client.query(`
          UPDATE research_participant_deliveries
          SET last_error=CASE
                WHEN last_error LIKE 'SES delivery delay:%' THEN NULL
                ELSE last_error
              END,
              updated_at=now()
          WHERE id=$1
        `, [delivery.delivery_id]);
      } else if (eventType === "DeliveryDelay") {
        deliveryEventType = "sent";
        await client.query(`
          UPDATE research_participant_deliveries
          SET last_error=$2,updated_at=now()
          WHERE id=$1
            AND status NOT IN ('failed','cancelled')
        `, [delivery.delivery_id, deliveryDelaySummary(event)]);
      } else if (eventType === "Bounce") {
        deliveryEventType = "bounced";
        const permanentBounce = event.bounce?.bounceType === "Permanent";
        if (permanentBounce && delivery.contact_value_hash) {
          await client.query(`
            INSERT INTO research_contact_suppression_events (
              contact_type,contact_value_hash,action,reason,study_id,source,metadata
            )
            VALUES ($1,$2,'suppress','ses_bounce',$3,'ses_sns',$4::jsonb)
          `, [
            delivery.contact_type,
            delivery.contact_value_hash,
            delivery.study_id,
            JSON.stringify({ ...metadata, deliveryId: delivery.delivery_id })
          ]);
          await client.query(`
            UPDATE research_contact_points
            SET suppression_status='bounced'
            WHERE contact_type=$1 AND contact_value_hash=$2
          `, [delivery.contact_type, delivery.contact_value_hash]);
        } else {
          await client.query(
            "UPDATE research_contact_points SET suppression_status='bounced' WHERE id=$1",
            [delivery.contact_point_id]
          );
        }
        await client.query(`
          UPDATE research_participant_deliveries
          SET status='failed',
              last_error=$2,
              updated_at=now()
          WHERE id=$1
        `, [delivery.delivery_id, `SES bounce: ${event.bounce?.bounceType ?? "unknown"}`]);
      } else if (eventType === "Complaint") {
        deliveryEventType = "complained";
        if (delivery.contact_value_hash) {
          await client.query(`
            INSERT INTO research_contact_suppression_events (
              contact_type,contact_value_hash,action,reason,study_id,source,metadata
            )
            VALUES ($1,$2,'suppress','ses_complaint',$3,'ses_sns',$4::jsonb)
          `, [
            delivery.contact_type,
            delivery.contact_value_hash,
            delivery.study_id,
            JSON.stringify({ ...metadata, deliveryId: delivery.delivery_id })
          ]);
          await client.query(`
            UPDATE research_contact_points
            SET suppression_status='suppressed'
            WHERE contact_type=$1 AND contact_value_hash=$2
          `, [delivery.contact_type, delivery.contact_value_hash]);
        } else {
          await client.query(
            "UPDATE research_contact_points SET suppression_status='suppressed' WHERE id=$1",
            [delivery.contact_point_id]
          );
        }
        await client.query(`
          UPDATE research_participant_deliveries
          SET status='failed',last_error='SES complaint',updated_at=now()
          WHERE id=$1
        `, [delivery.delivery_id]);
      } else if (eventType === "Reject" || eventType === "Rendering Failure") {
        deliveryEventType = "failed";
        await client.query(`
          UPDATE research_participant_deliveries
          SET status='failed',last_error=$2,updated_at=now()
          WHERE id=$1
        `, [delivery.delivery_id, `SES ${eventType}`]);
      } else {
        await client.query("COMMIT");
        return { ignored: eventType };
      }

      await client.query(`
        INSERT INTO research_participant_delivery_events
          (delivery_id,event_type,provider_message_id,metadata)
        VALUES ($1,$2,$3,$4::jsonb)
      `, [
        delivery.delivery_id,
        deliveryEventType,
        providerMessageId,
        JSON.stringify(metadata)
      ]);
      await client.query("COMMIT");
      return { processed: true };
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
      attemptId: text(invite.message_id) || attemptTag || null,
      bounceType: event.bounce?.bounceType ?? null,
      bounceSubType: event.bounce?.bounceSubType ?? null,
      ...(eventType === "DeliveryDelay" ? deliveryDelayMetadata(event) : {})
    };

    if (eventType === "Delivery") {
      await client.query(`
        UPDATE research_invites
        SET status=CASE WHEN status='created' THEN 'sent' ELSE status END,
            sent_at=COALESCE(sent_at,now())
        WHERE id=$1
      `, [invite.invite_id]);
      if (invite.message_id) {
        await client.query(`
          UPDATE research_invite_messages
          SET status=CASE WHEN status IN ('opened','bounced','complained') THEN status ELSE 'delivered' END,
              provider_message_id=COALESCE(provider_message_id,$2),
              sent_at=COALESCE(sent_at,now()),
              delivered_at=COALESCE(delivered_at,now()),
              last_error=CASE
                WHEN last_error LIKE 'SES delivery delay:%' THEN NULL
                ELSE last_error
              END,
              updated_at=now()
          WHERE id=$1
        `, [invite.message_id, providerMessageId]);
      }
      await client.query(`
        INSERT INTO research_invite_events (invite_id,event_type,metadata)
        VALUES ($1,'delivered',$2::jsonb)
      `, [invite.invite_id, JSON.stringify(metadata)]);
    } else if (eventType === "Open") {
      await client.query(`
        UPDATE research_invites
        SET status=CASE WHEN status IN ('created','sent') THEN 'opened' ELSE status END,
            sent_at=COALESCE(sent_at,now()),
            first_opened_at=COALESCE(first_opened_at,now())
        WHERE id=$1
      `, [invite.invite_id]);
      if (invite.message_id) {
        await client.query(`
          UPDATE research_invite_messages
          SET status='opened',
              provider_message_id=COALESCE(provider_message_id,$2),
              sent_at=COALESCE(sent_at,now()),
              opened_at=COALESCE(opened_at,now()),
              last_error=CASE
                WHEN last_error LIKE 'SES delivery delay:%' THEN NULL
                ELSE last_error
              END,
              updated_at=now()
          WHERE id=$1
        `, [invite.message_id, providerMessageId]);
      }
      await client.query(`
        INSERT INTO research_invite_events (invite_id,event_type,metadata)
        VALUES ($1,'opened',$2::jsonb)
      `, [invite.invite_id, JSON.stringify(metadata)]);
      if (invite.sample_unit_id) {
        await disposition(client, text(invite.sample_unit_id), "opened", "eligible", metadata);
      }
    } else if (eventType === "DeliveryDelay") {
      if (invite.message_id) {
        await client.query(`
          UPDATE research_invite_messages
          SET provider_message_id=COALESCE(provider_message_id,$2),
              last_error=$3,
              updated_at=now()
          WHERE id=$1
            AND status NOT IN ('delivered','opened','bounced','complained','failed','cancelled')
        `, [invite.message_id, providerMessageId, deliveryDelaySummary(event)]);
      }
      // Keep the canonical invitation active. A delivery delay is temporary,
      // so it must not suppress the address or change sample disposition.
      await client.query(`
        INSERT INTO research_invite_events (invite_id,event_type,metadata)
        VALUES ($1,'sent',$2::jsonb)
      `, [invite.invite_id, JSON.stringify(metadata)]);
    } else if (eventType === "Bounce") {
      const permanentBounce = event.bounce?.bounceType === "Permanent";
      if (invite.message_id) {
        await client.query(`
          UPDATE research_invite_messages
          SET status='bounced',
              provider_message_id=COALESCE(provider_message_id,$2),
              last_error=$3,
              updated_at=now()
          WHERE id=$1
        `, [
          invite.message_id,
          providerMessageId,
          `SES bounce: ${event.bounce?.bounceType ?? "unknown"}`
        ]);
      }
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
      if (invite.message_id) {
        await client.query(`
          UPDATE research_invite_messages
          SET status='complained',
              provider_message_id=COALESCE(provider_message_id,$2),
              last_error='SES complaint',
              updated_at=now()
          WHERE id=$1
        `, [invite.message_id, providerMessageId]);
      }
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
      if (invite.message_id) {
        await client.query(`
          UPDATE research_invite_messages
          SET status='failed',
              provider_message_id=COALESCE(provider_message_id,$2),
              last_error=$3,
              updated_at=now()
          WHERE id=$1
        `, [invite.message_id, providerMessageId, `SES ${eventType}`]);
      }
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
