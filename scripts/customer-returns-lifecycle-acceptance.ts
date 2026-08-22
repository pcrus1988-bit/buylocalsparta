import { randomUUID } from "node:crypto";
import { hashPassword } from "../packages/core/src/index.ts";
import {
  createPostgresRuntimeFromEnv,
  PostgresAdminAuthService,
  PostgresCustomerAuthService,
  PostgresVendorAuthService,
  PostgresVivaPaymentsService,
  type VivaPaymentsGateway
} from "../packages/postgres-runtime/src/index.ts";
import { customerReturnsSnapshot, requestCustomerReturn } from "../apps/web/src/lib/customer-returns-service.ts";
import {
  reconcileRefundedReturnFinance,
  reconcileRefundedReturnInventory,
  routeAuthorizedReturnToVendor,
  vendorReturnIntakeAction
} from "../apps/web/src/lib/return-operations-service.ts";

if (process.env.BLS_ACCEPTANCE_SYNTHETIC_DB !== "true") {
  throw new Error("Refusing to run returns acceptance outside an explicitly synthetic disposable database");
}

class FakeVivaGateway implements VivaPaymentsGateway {
  readonly environment = "demo" as const;
  createCount = 0;
  refundCount = 0;
  readonly #transactions = new Map<string, Awaited<ReturnType<VivaPaymentsGateway["retrieveTransaction"]>>>();

  checkoutUrl(orderCode: string) { return `https://demo.vivapayments.com/web/checkout?ref=${orderCode}`; }
  async createPaymentOrder(_input: Parameters<VivaPaymentsGateway["createPaymentOrder"]>[0]) {
    this.createCount += 1;
    const orderCode = (9_100_000_000_000_000n + BigInt(this.createCount)).toString();
    return { orderCode, checkoutUrl: this.checkoutUrl(orderCode) };
  }
  confirm(orderCode: string, amountMinor: number) {
    const transactionId = randomUUID();
    this.#transactions.set(transactionId, { transactionId, orderCode, statusId: "F", amountMinor, currencyCode: 978 });
    return transactionId;
  }
  async retrieveTransaction(transactionId: string) {
    const transaction = this.#transactions.get(transactionId);
    if (!transaction) throw new Error(`Synthetic Viva transaction ${transactionId} not found`);
    return transaction;
  }
  async refund(input: Parameters<VivaPaymentsGateway["refund"]>[0]) {
    const original = this.#transactions.get(input.transactionId);
    if (!original) throw new Error("Synthetic Viva original transaction not found");
    this.refundCount += 1;
    const transactionId = randomUUID();
    this.#transactions.set(transactionId, { ...original, transactionId, statusId: "F", amountMinor: input.amountMinor });
    return { success: true, statusId: "F", transactionId, amountMinor: input.amountMinor };
  }
  async cancelPaymentOrder(_orderCode: string) {}
  async webhookVerificationKey() { return "returns-acceptance-webhook-key"; }
}

const runtime = createPostgresRuntimeFromEnv({ applicationName: "customer-returns-lifecycle-acceptance" });
const now = Date.now();
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const secret = process.env.BLS_AUTH_SECRET?.trim() || "returns-acceptance-auth-secret-0123456789";
const userId = `usr_returns_${suffix}`;
const otherUserId = `usr_returns_other_${suffix}`;
const vendorId = `vendor_returns_${suffix}`;
const vendorUserId = `usr_vendor_returns_${suffix}`;
const adminUserId = `usr_admin_returns_${suffix}`;
const financeUserId = `usr_finance_returns_${suffix}`;
const canonicalId = `canonical_returns_${suffix}`;
const locationId = `location_returns_${suffix}`;
const offerId = `offer_returns_${suffix}`;
const customerEmail = `returns-${suffix}@example.test`;
const otherEmail = `returns-other-${suffix}@example.test`;
const vendorEmail = `returns-vendor-${suffix}@example.test`;
const adminEmail = `returns-admin-${suffix}@example.test`;
const financeEmail = `returns-finance-${suffix}@example.test`;

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function expectFailure(run: () => Promise<unknown>, pattern: RegExp, message: string) {
  let matched = false;
  try { await run(); }
  catch (error) { matched = error instanceof Error && pattern.test(error.message); }
  if (!matched) throw new Error(message);
}

try {
  const readiness = await runtime.readiness();
  expect(readiness.ok, `Database is not ready: ${readiness.message}`);

  await runtime.persistence.identity.saveAccount({
    scope: { marketId: "sparta", platformAccess: true },
    account: { id: userId, email: customerEmail, passwordHash: hashPassword("Customer!12345"), status: "active", roles: ["customer"], emailVerified: true, createdAt: now }
  });
  await runtime.persistence.identity.saveAccount({
    scope: { marketId: "sparta", platformAccess: true },
    account: { id: otherUserId, email: otherEmail, passwordHash: hashPassword("Customer!12345"), status: "active", roles: ["customer"], emailVerified: true, createdAt: now }
  });

  await runtime.sqlPool.query(`
    WITH market AS (SELECT id FROM markets WHERE code='sparta'),
    category AS (
      INSERT INTO categories (market_id,code,slug,commerce_mode,active,taxonomy_role,assignable,discoverable)
      SELECT id,$1,$1,'standard',true,'product_class',true,true FROM market
      ON CONFLICT (market_id,slug) DO UPDATE SET active=true,taxonomy_role='product_class',assignable=true,discoverable=true
      RETURNING id
    )
    INSERT INTO canonical_variants (public_id,market_id,category_id,slug,platform_price_minor,currency,tax_rate_bps,active,suppressed,recalled)
    SELECT $2,market.id,category.id,$2,1299,'EUR',2400,true,false,false FROM market,category
  `, [`returns-${suffix}`, canonicalId]);
  await runtime.sqlPool.query(`
    WITH market AS (SELECT id FROM markets WHERE code='sparta')
    INSERT INTO vendor_businesses (public_id,market_id,legal_name,trading_name,status,verification_completed_at,contract_started_at)
    SELECT $1,market.id,$2,$2,'active',$3,$3 FROM market
  `, [vendorId, `Returns Acceptance Vendor ${suffix}`, new Date(now)]);
  await runtime.sqlPool.query(`
    WITH market AS (SELECT id FROM markets WHERE code='sparta'),vendor AS (SELECT id FROM vendor_businesses WHERE public_id=$1)
    INSERT INTO vendor_locations (public_id,vendor_id,market_id,name,address_line1,locality,postcode,active,verified_at)
    SELECT $2,vendor.id,market.id,'Returns Acceptance','1 Returns Street','Sparta','23100',true,$3 FROM market,vendor
  `, [vendorId, locationId, new Date(now)]);
  await runtime.sqlPool.query(`
    WITH market AS (SELECT id FROM markets WHERE code='sparta'),vendor AS (SELECT id FROM vendor_businesses WHERE public_id=$1),
         location AS (SELECT id FROM vendor_locations WHERE public_id=$2),canonical AS (SELECT id FROM canonical_variants WHERE public_id=$3)
    INSERT INTO vendor_offers (public_id,market_id,vendor_id,location_id,canonical_variant_id,vendor_sku,status,supplier_unit_price_minor,currency,supplier_tax_rate_bps,fulfilment_modes,approved_at)
    SELECT $4,market.id,vendor.id,location.id,canonical.id,$5,'approved',800,'EUR',2400,ARRAY['pickup']::fulfilment_mode[],$6 FROM market,vendor,location,canonical
  `, [vendorId, locationId, canonicalId, offerId, `RET-${suffix}`, new Date(now)]);
  await runtime.sqlPool.query(`
    INSERT INTO inventory_balances (offer_id,on_hand,active_reservations,safety_stock,blocked,source,source_confidence,stock_confirmed_at,freshness_ttl_seconds,freshness_status,updated_at)
    SELECT id,3,0,0,0,'returns_acceptance','merchant_confirmed',$2,86400,'fresh',$2 FROM vendor_offers WHERE public_id=$1
  `, [offerId, new Date(now)]);

  await runtime.persistence.identity.saveAccount({
    scope: { marketId: "sparta", platformAccess: true },
    account: { id: vendorUserId, email: vendorEmail, passwordHash: hashPassword("Vendor!12345"), status: "active", roles: ["vendor_owner"], vendorId, emailVerified: true, createdAt: now }
  });
  await runtime.persistence.identity.saveAccount({
    scope: { marketId: "sparta", platformAccess: true },
    account: { id: adminUserId, email: adminEmail, passwordHash: hashPassword("AdminStrong!123"), status: "active", roles: ["super_admin"], emailVerified: true, createdAt: now }
  });
  await runtime.persistence.identity.saveAccount({
    scope: { marketId: "sparta", platformAccess: true },
    account: { id: financeUserId, email: financeEmail, passwordHash: hashPassword("FinanceStrong!123"), status: "active", roles: ["platform_finance"], emailVerified: true, createdAt: now }
  });

  const customerAuth = new PostgresCustomerAuthService({ identity: runtime.persistence.identity, secret });
  const vendorAuth = new PostgresVendorAuthService({ identity: runtime.persistence.identity, secret });
  const adminAuth = new PostgresAdminAuthService({ identity: runtime.persistence.identity, secret });
  const customer = await customerAuth.authenticate({ email: customerEmail, password: "Customer!12345", now: now + 100 });
  const otherCustomer = await customerAuth.authenticate({ email: otherEmail, password: "Customer!12345", now: now + 110 });
  const vendor = await vendorAuth.authenticate({ email: vendorEmail, password: "Vendor!12345", now: now + 120 });
  const admin = await adminAuth.authenticate({ email: adminEmail, password: "AdminStrong!123", now: now + 130 });
  const finance = await adminAuth.authenticate({ email: financeEmail, password: "FinanceStrong!123", now: now + 140 });

  const vivaGateway = new FakeVivaGateway();
  const viva = new PostgresVivaPaymentsService(runtime.sqlPool, vivaGateway);
  const checkoutKey = `returns-checkout-${suffix}`;
  const visitorKey = `returns_visitor_${suffix}_secure`;
  const order = await runtime.customerCommerce.checkout({ checkoutKey, visitorKey, customerId: userId, postcode: "23100", fulfilmentMode: "pickup", items: [{ canonicalVariantId: canonicalId, quantity: 1 }], now: now + 200 });
  expect(order.status === "pending_payment", "Returns acceptance order did not start pending payment");
  const initiated = await viva.initiateOrderPayment({ orderId: order.id, customerId: userId, visitorKey, now: now + 210 });
  const transactionId = vivaGateway.confirm(initiated.orderCode, order.total.minor);
  const confirmed = await viva.reconcileTransaction({ transactionId, expectedOrderCode: initiated.orderCode, source: "webhook", now: now + 220 });
  expect(confirmed.paymentStatus === "captured" && confirmed.orderStatus === "confirmed", "Returns acceptance payment did not reach captured/confirmed");

  const fulfilment = (await runtime.vendorOperations.dashboard(vendor.principal)).fulfilments.find((item) => item.orderId === order.id);
  expect(fulfilment, "Paid order was not visible to assigned vendor");
  await runtime.vendorOperations.actOnFulfilment(vendor.principal, { fulfilmentId: fulfilment.id, action: "accept", now: now + 230 });
  await runtime.sqlPool.query(`UPDATE fulfilment_orders SET status='delivered',delivered_at=$2,updated_at=$2 WHERE public_id=$1`, [fulfilment.id, new Date(now + 240)]);
  await runtime.sqlPool.query(`UPDATE order_lines SET status='fulfilled',fulfilled_quantity=quantity,fulfilled_at=$2 WHERE order_id=(SELECT id FROM customer_orders WHERE public_id=$1)`, [order.id, new Date(now + 240)]);
  await runtime.sqlPool.query(`UPDATE customer_orders SET status='fulfilled',updated_at=$2 WHERE public_id=$1`, [order.id, new Date(now + 240)]);

  const line = await runtime.sqlPool.query<{ public_id: string; vendor_proceeds_minor: number } & Record<string, unknown>>(`SELECT public_id,vendor_proceeds_minor FROM order_lines WHERE order_id=(SELECT id FROM customer_orders WHERE public_id=$1) LIMIT 1`, [order.id]);
  const lineId = String(line.rows[0]?.public_id ?? "");
  const vendorRecoveryMinor = Number(line.rows[0]?.vendor_proceeds_minor ?? 0);
  expect(lineId && vendorRecoveryMinor > 0, "Fulfilled return line did not persist vendor proceeds");

  const procurementId = `procurement_returns_${suffix}`;
  await runtime.sqlPool.query(`
    INSERT INTO procurements(id,public_id,procurement_number,market_id,order_id,fulfilment_order_id,vendor_id,status,currency,supplier_net_minor,supplier_tax_minor,shipping_reimbursement_minor,service_fee_minor,adjustment_minor,payable_minor,created_at,updated_at)
    SELECT gen_random_uuid(),$1,$2,m.id,o.id,fo.id,v.id,'payable','EUR',800,192,0,0,0,992,$3,$3
    FROM markets m,customer_orders o,fulfilment_orders fo,vendor_businesses v
    WHERE m.code='sparta' AND o.public_id=$4 AND fo.public_id=$5 AND v.public_id=$6
  `, [procurementId, `PROC-RET-${suffix}`, new Date(now + 250), order.id, fulfilment.id, vendorId]);
  const batch = await runtime.adminOperations.settlementAction(admin.principal, { kind: "create", procurementIds: [procurementId], now: now + 260 });
  await runtime.adminOperations.settlementAction(admin.principal, { kind: "submit", batchId: batch.id, now: now + 270 });
  await runtime.adminOperations.settlementAction(finance.principal, { kind: "approve", batchId: batch.id, now: now + 280 });
  await runtime.adminOperations.settlementAction(finance.principal, { kind: "pay", batchId: batch.id, payoutReference: `RETURNS-${suffix}`, now: now + 290 });
  const settled = await runtime.sqlPool.query<{ status: string; post_settlement_return_receivable_minor: number } & Record<string, unknown>>(`SELECT status::text AS status,post_settlement_return_receivable_minor FROM procurements WHERE public_id=$1`, [procurementId]);
  expect(settled.rows[0]?.status === "settled" && Number(settled.rows[0]?.post_settlement_return_receivable_minor) === 0, "Synthetic procurement did not settle before return refund");

  await expectFailure(
    () => requestCustomerReturn(otherCustomer.principal, { orderId: order.id, orderLineId: lineId, quantity: 1, reason: "withdrawal", requestedRemedy: "refund", now: now + 300 }),
    /ORDER_OR_LINE_NOT_FOUND/,
    "Cross-customer return request was not rejected"
  );
  await expectFailure(
    () => requestCustomerReturn(customer.principal, { orderId: order.id, orderLineId: lineId, quantity: 2, reason: "withdrawal", requestedRemedy: "refund", now: now + 310 }),
    /Only 1 unit\(s\) remain returnable/,
    "Return quantity guard did not reject over-return"
  );

  const requested = await requestCustomerReturn(customer.principal, { orderId: order.id, orderLineId: lineId, quantity: 1, reason: "withdrawal", requestedRemedy: "refund", note: "Synthetic full-lifecycle acceptance", now: now + 320 });
  expect(/^RET-\d{5,}$/.test(requested.returnNumber), `Return reference is not canonical: ${requested.returnNumber}`);
  const requestedSnapshot = await customerReturnsSnapshot(customer.principal, order.id);
  expect(requestedSnapshot.cases.some((item) => item.returnNumber === requested.returnNumber && item.status === "requested"), "Customer return was not visible after request");
  expect(requestedSnapshot.returnableByLine[lineId] === 0, "Open return did not reserve the fulfilled quantity");
  await expectFailure(() => requestCustomerReturn(customer.principal, { orderId: order.id, orderLineId: lineId, quantity: 1, reason: "defect", requestedRemedy: "refund", now: now + 325 }), /Only 0 unit\(s\) remain returnable/, "Concurrent/open return reservation did not prevent duplicate return");

  await runtime.adminGovernance.returnAction(admin.principal, { returnId: requested.returnId, action: "approve", reason: "Eligibility confirmed", now: now + 330 });
  await expectFailure(() => runtime.adminGovernance.returnAction(admin.principal, { returnId: requested.returnId, action: "approve", now: now + 331 }), /cannot be approved/, "Invalid duplicate approval transition was accepted");
  await runtime.adminGovernance.returnAction(admin.principal, { returnId: requested.returnId, action: "authorize", reason: "Return to assigned vendor", now: now + 340 });
  await routeAuthorizedReturnToVendor(requested.returnId, now + 341);
  const routed = await runtime.sqlPool.query<{ status: string; destination_type: string; vendor_id: string; rma_code: string } & Record<string, unknown>>(`SELECT r.status::text AS status,r.destination_type,vb.public_id AS vendor_id,r.rma_code FROM returns r LEFT JOIN vendor_businesses vb ON vb.id=r.destination_vendor_id WHERE r.public_id=$1`, [requested.returnId]);
  expect(routed.rows[0]?.status === "in_transit" && routed.rows[0]?.destination_type === "vendor" && routed.rows[0]?.vendor_id === vendorId && /^RMA-/.test(String(routed.rows[0]?.rma_code ?? "")), "Authorized return was not routed to the assigned vendor with an RMA");

  await vendorReturnIntakeAction(vendor.principal, { returnId: requested.returnId, action: "receive", reason: "Synthetic vendor receipt", now: now + 350 });
  await vendorReturnIntakeAction(vendor.principal, { returnId: requested.returnId, action: "inspect_sellable", reason: "Synthetic item is sellable", now: now + 360 });
  await expectFailure(() => vendorReturnIntakeAction({ ...vendor.principal, vendorId: `vendor_wrong_${suffix}` }, { returnId: requested.returnId, action: "receive", now: now + 361 }), /access denied/, "Vendor return tenant isolation was not enforced");
  await runtime.adminGovernance.returnAction(admin.principal, { returnId: requested.returnId, action: "approve_refund", reason: "Inspection passed", now: now + 370 });

  const stockBeforeRefund = await runtime.sqlPool.query<{ on_hand: number } & Record<string, unknown>>(`SELECT on_hand FROM inventory_balances WHERE offer_id=(SELECT id FROM vendor_offers WHERE public_id=$1)`, [offerId]);
  const refundsBefore = vivaGateway.refundCount;
  const refund = await viva.executeApprovedReturnRefund({ returnId: requested.returnId, actorUserId: finance.principal.userId, now: now + 380 });
  expect(refund.status === "completed" && vivaGateway.refundCount === refundsBefore + 1, "Approved return did not execute exactly one Viva refund");
  await reconcileRefundedReturnInventory(requested.returnId, now + 390);
  await reconcileRefundedReturnFinance(requested.returnId, finance.principal.userId, now + 391);
  await reconcileRefundedReturnInventory(requested.returnId, now + 400);
  await reconcileRefundedReturnFinance(requested.returnId, finance.principal.userId, now + 401);

  await expectFailure(() => viva.executeApprovedReturnRefund({ returnId: requested.returnId, actorUserId: finance.principal.userId, now: now + 410 }), /has not been approved/, "Refund replay did not stop after the return closed");
  expect(vivaGateway.refundCount === refundsBefore + 1, "Refund replay executed a second provider refund");

  const finalState = await runtime.sqlPool.query<{
    return_status: string; refunded_quantity: number; line_status: string; order_status: string; payment_status: string;
    refunded_minor: number; refund_id: string; on_hand: number; receivable_minor: number; restock_count: number; finance_audit_count: number
  } & Record<string, unknown>>(`
    SELECT r.status::text AS return_status,ol.refunded_quantity,ol.status::text AS line_status,o.status::text AS order_status,p.status::text AS payment_status,
           p.refunded_minor,rf.public_id AS refund_id,ib.on_hand,pr.post_settlement_return_receivable_minor AS receivable_minor,
           (SELECT count(*)::int FROM inventory_movements im WHERE im.offer_id=ol.assigned_offer_id AND im.movement_type='return_restock' AND im.metadata->>'returnId'=r.public_id) AS restock_count,
           (SELECT count(*)::int FROM audit_events ae WHERE ae.action='return.vendor_finance.reconciled' AND ae.entity_type='return' AND ae.entity_id=r.public_id) AS finance_audit_count
    FROM returns r JOIN return_lines rl ON rl.return_id=r.id JOIN order_lines ol ON ol.id=rl.order_line_id
    JOIN customer_orders o ON o.id=r.order_id JOIN payments p ON p.order_id=o.id JOIN refunds rf ON rf.id=rl.refund_id
    JOIN inventory_balances ib ON ib.offer_id=ol.assigned_offer_id JOIN procurements pr ON pr.public_id=$2
    WHERE r.public_id=$1
  `, [requested.returnId, procurementId]);
  const state = finalState.rows[0];
  expect(state?.return_status === "refunded", "Return did not close as refunded");
  expect(Number(state?.refunded_quantity) === 1 && state?.line_status === "refunded", "Refund did not reconcile order-line quantity/status");
  expect(state?.order_status === "refunded" && state?.payment_status === "refunded", "Refund did not reconcile customer order/payment status");
  expect(Number(state?.refunded_minor) === refund.amountMinor && String(state?.refund_id ?? "") === refund.id, "Return line was not linked to the completed refund");
  expect(Number(state?.on_hand) === Number(stockBeforeRefund.rows[0]?.on_hand ?? 0) + 1 && Number(state?.restock_count) === 1, "Sellable return was not restocked exactly once");
  expect(Number(state?.receivable_minor) === vendorRecoveryMinor && Number(state?.finance_audit_count) === 1, "Post-settlement vendor recovery was not reconciled exactly once");

  const audit = await runtime.sqlPool.query<{ action: string } & Record<string, unknown>>(`SELECT action FROM audit_events WHERE entity_type='return' AND entity_id=$1 ORDER BY created_at`, [requested.returnId]);
  const actions = new Set(audit.rows.map((row) => String(row.action)));
  for (const required of ["return.approve", "return.authorize", "return.approve_refund", "return.refund.executed", "return.vendor_finance.reconciled"]) {
    expect(actions.has(required), `Append-only return audit is missing ${required}`);
  }

  const finalSnapshot = await customerReturnsSnapshot(customer.principal, order.id);
  expect(finalSnapshot.cases.some((item) => item.returnNumber === requested.returnNumber && item.status === "refunded" && item.approvedRemedy === "refund"), "Customer snapshot did not expose the closed refunded return");
  expect(finalSnapshot.returnableByLine[lineId] === 0, "Refunded quantity became returnable again");

  console.log(JSON.stringify({
    ok: true,
    orderId: order.id,
    returnNumber: requested.returnNumber,
    refundId: refund.id,
    customerOwnershipIsolation: true,
    overReturnProtection: true,
    canonicalReturnReference: true,
    adminTransitionGuards: true,
    vendorTenantIsolation: true,
    vendorReceiptAndInspection: true,
    vivaRefundLinkage: true,
    sellableRestockExactlyOnce: true,
    postSettlementVendorRecoveryExactlyOnce: true,
    appendOnlyAuditCoverage: true
  }, null, 2));
} finally {
  await runtime.close();
}
