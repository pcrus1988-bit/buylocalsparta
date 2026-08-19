import { randomUUID } from "node:crypto";
import { createPostgresRuntimeFromEnv, EXPECTED_SCHEMA_VERSION } from "../packages/postgres-runtime/src/index.ts";
import { PostgresCustomerAddressService } from "../packages/postgres-runtime/src/customer-addresses.ts";

const runtime = createPostgresRuntimeFromEnv({ applicationName: "kontamou-fiscal-integration-smoke" });
const addresses = new PostgresCustomerAddressService(runtime.sqlPool);
const now = Date.now();
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const categoryCode = `fiscal-smoke-${suffix}`;
const canonicalId = `canonical_fiscal_smoke_${suffix}`;
const vendorId = `vendor_fiscal_smoke_${suffix}`;
const locationId = `location_fiscal_smoke_${suffix}`;
const offerId = `offer_fiscal_smoke_${suffix}`;
const verifierId = `usr_fiscal_verifier_${suffix}`;
const customerId = `usr_fiscal_customer_${suffix}`;
const checkoutKey = `fiscal-checkout-${suffix}`;
const visitorKey = `fiscal_visitor_${suffix}_0123456789`;
const agreementCode = `FISCAL-SMOKE-${suffix}`;
const customerGrossMinor = 1240;

try {
  const readiness = await runtime.readiness(EXPECTED_SCHEMA_VERSION);
  if (!readiness.ok) throw new Error(`Fiscal smoke refused to run: ${readiness.message}`);

  await runtime.sqlPool.query(`
    INSERT INTO users(public_id,email,status,email_verified_at,preferred_locale,created_at,updated_at)
    VALUES
      ($1,$2,'active',$5,'el',$5,$5),
      ($3,$4,'active',$5,'el',$5,$5)
  `, [verifierId, `fiscal-verifier-${suffix}@example.test`, customerId, `fiscal-customer-${suffix}@example.test`, new Date(now)]);

  const profile = await addresses.upsert(customerId, {
    label: "Fiscal smoke",
    fullName: "Fiscal Smoke Customer",
    line1: "1 Customer Street",
    locality: "Sparta",
    region: "Lakonia",
    postcode: "23100",
    countryCode: "GR",
    phone: "+306900000000",
    isDefaultBilling: true,
    isDefaultDelivery: true
  }, now);
  const customerAddress = profile.addresses[0];
  if (!customerAddress) throw new Error("Fiscal smoke customer address was not created");

  await runtime.sqlPool.query(`
    WITH market AS (SELECT id FROM markets WHERE code='sparta')
    INSERT INTO categories(market_id,code,slug,commerce_mode,active,created_at)
    SELECT id,$1,$1,'standard',true,$2 FROM market
  `, [categoryCode, new Date(now)]);

  await runtime.sqlPool.query(`
    WITH market AS (SELECT id FROM markets WHERE code='sparta'),
         category AS (SELECT id FROM categories WHERE code=$1)
    INSERT INTO canonical_variants(
      public_id,market_id,category_id,slug,platform_price_minor,currency,tax_rate_bps,active,suppressed,recalled,price_updated_at,created_at,updated_at
    )
    SELECT $2,market.id,category.id,$2,$3,'EUR',2400,true,false,false,$4,$4,$4 FROM market,category
  `, [categoryCode, canonicalId, customerGrossMinor, new Date(now)]);

  await runtime.sqlPool.query(`
    WITH market AS (SELECT id FROM markets WHERE code='sparta')
    INSERT INTO vendor_businesses(
      public_id,market_id,legal_name,trading_name,status,verification_completed_at,contract_started_at,created_at,updated_at
    )
    SELECT $1,market.id,$2,$2,'active',$3,$3,$3,$3 FROM market
  `, [vendorId, `Fiscal Smoke Vendor ${suffix}`, new Date(now)]);

  await runtime.sqlPool.query(`
    WITH market AS (SELECT id FROM markets WHERE code='sparta'),
         vendor AS (SELECT id FROM vendor_businesses WHERE public_id=$1)
    INSERT INTO vendor_locations(
      public_id,vendor_id,market_id,name,address_line1,locality,postcode,country_code,active,verified_at,created_at,updated_at
    )
    SELECT $2,vendor.id,market.id,'Fiscal Smoke Location','1 Fiscal Street','Sparta','23100','GR',true,$3,$3,$3 FROM market,vendor
  `, [vendorId, locationId, new Date(now)]);

  await runtime.sqlPool.query(`
    WITH market AS (SELECT id FROM markets WHERE code='sparta'),
         vendor AS (SELECT id FROM vendor_businesses WHERE public_id=$1),
         verifier AS (SELECT id FROM users WHERE public_id=$2)
    INSERT INTO vendor_commercial_agreements(
      market_id,vendor_id,agreement_code,agreement_version,status,starts_at,signed_at,
      commission_rate_bps,commission_basis,commission_tax_mode,commission_tax_rate_bps,commission_applies_to_shipping,
      source_document_reference,signed_pdf_object_key,signed_pdf_sha256,signed_document_received_at,
      govgr_reference,govgr_verified_at,govgr_verified_by,activated_at,created_at,updated_at
    )
    SELECT market.id,vendor.id,$3,1,'active',$4,$4,
           500,'merchandise_gross','included',2400,false,
           'fiscal-smoke','private/fiscal-smoke/signed.pdf',$5,$4,
           $6,$4,verifier.id,$4,$4,$4
      FROM market,vendor,verifier
  `, [vendorId, verifierId, agreementCode, new Date(now - 60_000), "a".repeat(64), `GOVGR-FISCAL-${suffix}`]);

  await runtime.sqlPool.query(`
    WITH market AS (SELECT id FROM markets WHERE code='sparta'),
         vendor AS (SELECT id FROM vendor_businesses WHERE public_id=$1),
         location AS (SELECT id FROM vendor_locations WHERE public_id=$2),
         canonical AS (SELECT id FROM canonical_variants WHERE public_id=$3)
    INSERT INTO vendor_offers(
      public_id,market_id,vendor_id,location_id,canonical_variant_id,vendor_sku,status,
      supplier_unit_price_minor,customer_price_minor,currency,supplier_tax_rate_bps,fulfilment_modes,approved_at,created_at,updated_at
    )
    SELECT $4,market.id,vendor.id,location.id,canonical.id,$5,'approved',
           $6,$6,'EUR',2400,ARRAY['pickup']::fulfilment_mode[],$7,$7,$7
      FROM market,vendor,location,canonical
  `, [vendorId, locationId, canonicalId, offerId, `FISCAL-${suffix}`, customerGrossMinor, new Date(now)]);

  await runtime.sqlPool.query(`
    INSERT INTO inventory_balances(
      offer_id,on_hand,active_reservations,safety_stock,blocked,source,source_confidence,
      stock_confirmed_at,freshness_ttl_seconds,freshness_status,updated_at
    )
    SELECT id,5,0,0,0,'fiscal_smoke','merchant_confirmed',$2,86400,'fresh',$2
      FROM vendor_offers WHERE public_id=$1
  `, [offerId, new Date(now)]);

  const order = await runtime.customerCommerce.checkout({
    checkoutKey,
    visitorKey,
    customerId,
    postcode: customerAddress.postcode,
    fulfilmentMode: "pickup",
    items: [{ canonicalVariantId: canonicalId, quantity: 1 }],
    now: now + 1_000
  });
  if (order.status !== "pending_payment") throw new Error("Fiscal smoke order must begin pending_payment");

  await addresses.attachOrderSnapshots({
    customerId,
    orderId: order.id,
    billingAddressId: customerAddress.id,
    deliveryAddressId: customerAddress.id,
    now: now + 1_100
  });
  const receiptSnapshot = { documentType: "receipt", source: "checkout_address_lock", lockedAt: new Date(now + 1_200).toISOString() } as const;
  await runtime.fiscalWork.lockCheckoutSnapshot({ customerId, orderId: order.id, snapshot: receiptSnapshot, now: now + 1_200 });
  await runtime.fiscalWork.lockCheckoutSnapshot({ customerId, orderId: order.id, snapshot: { ...receiptSnapshot, lockedAt: new Date(now + 1_250).toISOString() }, now: now + 1_250 });

  let fiscalChoiceChangeBlocked = false;
  try {
    await runtime.fiscalWork.lockCheckoutSnapshot({
      customerId,
      orderId: order.id,
      snapshot: { documentType: "invoice", source: "checkout_address_lock", lockedAt: new Date(now + 1_300).toISOString(), business: {} },
      now: now + 1_300
    });
  } catch {
    fiscalChoiceChangeBlocked = true;
  }
  if (!fiscalChoiceChangeBlocked) throw new Error("Fiscal checkout lock allowed receipt/invoice choice to change after locking");

  const payment = await runtime.sqlPool.query<Record<string, unknown> & { public_id: string }>(`
    UPDATE payments
       SET status='captured',authorised_minor=$2,captured_minor=$2,updated_at=$3
     WHERE order_id=(SELECT id FROM customer_orders WHERE public_id=$1)
     RETURNING public_id
  `, [order.id, order.total.minor, new Date(now + 2_000)]);
  const paymentId = String(payment.rows[0]?.public_id ?? "");
  if (!paymentId) throw new Error("Fiscal smoke could not capture the persisted payment");

  const queued = await runtime.sqlPool.query<Record<string, unknown> & { count: string; idempotency_key: string }>(`
    SELECT count(*)::text AS count,min(idempotency_key) AS idempotency_key
      FROM outbox_events
     WHERE aggregate_public_id=$1 AND event_type='fiscal.order_paid'
  `, [order.id]);
  if (Number(queued.rows[0]?.count ?? 0) !== 1) throw new Error("Payment capture did not enqueue exactly one fiscal.order_paid event");
  if (!String(queued.rows[0]?.idempotency_key ?? "").startsWith("fiscal.order_paid:")) throw new Error("Fiscal outbox event is missing its deterministic idempotency key");

  await runtime.sqlPool.query(`UPDATE payments SET status='captured',updated_at=$2 WHERE public_id=$1`, [paymentId, new Date(now + 2_100)]);
  const queuedAfterReplay = await runtime.sqlPool.query<Record<string, unknown> & { count: string }>(`
    SELECT count(*)::text AS count FROM outbox_events
     WHERE aggregate_public_id=$1 AND event_type='fiscal.order_paid'
  `, [order.id]);
  if (Number(queuedAfterReplay.rows[0]?.count ?? 0) !== 1) throw new Error("Repeated captured status created a duplicate fiscal outbox event");

  const workerId = `fiscal-smoke:${suffix}`;
  const events = await runtime.persistence.outbox.claim(now + 3_000, 10, 60_000, ["fiscal.order_paid"], workerId);
  const event = events.find((entry) => entry.aggregateId === order.id);
  if (!event) throw new Error("Fiscal worker could not claim the paid-order event");
  const payload = event.payload as Record<string, unknown>;
  const materialized = await runtime.fiscalWork.materializePaidOrder({
    orderId: String(payload.orderId ?? event.aggregateId),
    paymentId: String(payload.paymentId ?? ""),
    eventCapturedMinor: Number(payload.capturedMinor),
    eventCurrency: String(payload.currency ?? ""),
    now: now + 3_100
  });
  if (!materialized.created || materialized.documentType !== "retail_receipt") throw new Error("Fiscal worker did not create the expected receipt work item");
  await runtime.persistence.outbox.complete(event.id, now + 3_200, workerId);

  const replay = await runtime.fiscalWork.materializePaidOrder({
    orderId: order.id,
    paymentId,
    eventCapturedMinor: order.total.minor,
    eventCurrency: "EUR",
    now: now + 3_300
  });
  if (replay.created || replay.documentId !== materialized.documentId) throw new Error("Fiscal materialization replay was not idempotent");

  const stored = await runtime.sqlPool.query<Record<string, unknown> & {
    count: string; provider: string | null; transmission_status: string; status: string; issuance_channel: string; document_type: string;
  }>(`
    SELECT count(*) OVER()::text AS count,td.provider,td.transmission_status,td.status,
           td.payload_snapshot->>'issuanceChannel' AS issuance_channel,td.type AS document_type
      FROM tax_documents td
     WHERE td.order_id=(SELECT id FROM customer_orders WHERE public_id=$1)
       AND td.type IN ('retail_receipt','customer_invoice')
  `, [order.id]);
  const fiscalRow = stored.rows[0];
  if (!fiscalRow || Number(fiscalRow.count) !== 1) throw new Error("Fiscal materialization did not persist exactly one customer tax document");
  if (fiscalRow.provider !== null || fiscalRow.transmission_status !== "not_ready" || fiscalRow.status !== "pending") throw new Error("Fiscal work item was incorrectly marked as issued/transmitted before timologio");
  if (fiscalRow.issuance_channel !== "timologio" || fiscalRow.document_type !== "retail_receipt") throw new Error("Fiscal work item does not preserve the timologio-first receipt choice");

  const issueDate = athensDate(now + 4_000);
  const mark = `${String(now).replace(/\D/g, "")}${String(process.pid).padStart(6, "0")}`.slice(0, 30);
  const reconciled = await runtime.fiscalWork.recordTimologioIssuance({
    documentId: materialized.documentId,
    documentNumber: `A-${suffix.toUpperCase()}`,
    aadeMark: mark,
    aadeUid: `UID-${suffix}`,
    qrUrl: `https://www.aade.gr/fiscal-smoke/${suffix}`,
    issueDate,
    actorUserId: verifierId,
    now: now + 4_000
  });
  if (reconciled.aadeMark !== mark || reconciled.status !== "issued" || reconciled.transmissionStatus !== "accepted") throw new Error("Timologio reconciliation did not persist official identifiers");

  let conflictBlocked = false;
  try {
    await runtime.fiscalWork.recordTimologioIssuance({
      documentId: materialized.documentId,
      documentNumber: `OTHER-${suffix}`,
      aadeMark: `${mark}9`,
      issueDate,
      actorUserId: verifierId,
      now: now + 4_100
    });
  } catch {
    conflictBlocked = true;
  }
  if (!conflictBlocked) throw new Error("Timologio reconciliation allowed an existing MARK/document number to be overwritten");

  console.log(JSON.stringify({
    ok: true,
    schema: EXPECTED_SCHEMA_VERSION,
    orderId: order.id,
    paymentId,
    fiscalDocumentId: materialized.documentId,
    documentType: materialized.documentType,
    addressSnapshotLocked: true,
    fiscalChoiceLocked: true,
    outboxIdempotent: true,
    materializationIdempotent: true,
    timologioReconciled: true,
    aadeNetworkCalls: 0
  }));
} finally {
  await runtime.close();
}

function athensDate(epochMs: number): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Athens", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(epochMs));
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}
