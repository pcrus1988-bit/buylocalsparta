import { randomUUID } from "node:crypto";
import { hashPassword, type Role, type SessionPrincipal } from "../packages/core/src/index.ts";
import {
  createPostgresRuntimeFromEnv,
  PostgresAdminAuthService,
  PostgresCustomerAuthService,
} from "../packages/postgres-runtime/src/index.ts";
import {
  cancelCustomerEmailChange,
  confirmCustomerEmailChange,
  customerPendingEmailChange,
  requestCustomerEmailChange,
} from "../apps/web/src/lib/customer-email-change-runtime.ts";
import {
  createCustomerSupportCase,
  customerSupportCases,
  replyCustomerSupportCase,
} from "../apps/web/src/lib/customer-support-runtime.ts";
import { adminReplyToCustomerSupportCase } from "../apps/web/src/lib/admin-customer-support-reply.ts";
import {
  adminCustomer360,
  adminCustomerSupportCaseAction,
} from "../apps/web/src/lib/admin-customer-support.ts";

const previousNodeEnv = process.env.NODE_ENV;
const previousDelivery = process.env.BLS_EMAIL_DELIVERY_ENABLED;
const previousAppUrl = process.env.APP_URL;
process.env.NODE_ENV = "test";
process.env.BLS_EMAIL_DELIVERY_ENABLED = "false";
process.env.APP_URL = "https://acceptance.kontamou.test";

const runtime = createPostgresRuntimeFromEnv({ applicationName: "buy-local-sparta-customer-security-support-acceptance" });
const secret = process.env.BLS_AUTH_SECRET?.trim() || "customer-acceptance-auth-secret-0123456789";
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const requestId = `customer-acceptance-${suffix}`;
const startedAt = Date.now();
const password = "CustomerAcceptance!123";
const seededPublicIds: string[] = [];
const supportCasePublicIds: string[] = [];
const orderPublicIds: string[] = [];

try {
  const customerAuth = new PostgresCustomerAuthService({ identity: runtime.persistence.identity, secret });
  const adminAuth = new PostgresAdminAuthService({ identity: runtime.persistence.identity, secret });

  const happy = await seedAndLoginCustomer("happy", customerAuth, startedAt);
  const cancelled = await seedAndLoginCustomer("cancelled", customerAuth, startedAt + 100);
  const expired = await seedAndLoginCustomer("expired", customerAuth, startedAt + 200);
  const duplicate = await seedAndLoginCustomer("duplicate", customerAuth, startedAt + 300);
  const support = await seedAndLoginCustomer("support", customerAuth, startedAt + 400);
  const other = await seedAndLoginCustomer("other", customerAuth, startedAt + 500);
  const duplicateTargetEmail = `customer-acceptance-claimed-${suffix}@example.test`;
  await seedAccount({
    publicId: `usr_customer_accept_claimed_${suffix}`,
    email: duplicateTargetEmail,
    roles: ["customer"],
    password,
    now: startedAt + 600,
  });

  const adminPublicId = `usr_customer_support_accept_${suffix}`;
  const adminEmail = `customer-support-accept-${suffix}@example.test`;
  const adminPassword = "SupportAcceptance!123";
  await seedAccount({
    publicId: adminPublicId,
    email: adminEmail,
    roles: ["customer_support"],
    password: adminPassword,
    now: startedAt + 700,
  });
  const adminLogin = await adminAuth.authenticate({ email: adminEmail, password: adminPassword, now: startedAt + 800 });

  await verifyHappyEmailChange(happy, customerAuth);
  await verifyCancelledEmailChange(cancelled);
  await verifyExpiredEmailChange(expired);
  await verifyDuplicateTargetEmail(duplicate, duplicateTargetEmail);
  await verifyContextualSupportFlow(support.principal, other.principal, adminLogin.principal);

  console.log("Customer security/support acceptance OK: verified email-change confirmation, expiry, cancellation, duplicate-target rejection, session revocation, contextual order support ownership, internal-note isolation, admin reply visibility and customer reply lifecycle.");
} finally {
  await cleanup().catch((error) => {
    console.error("Customer security/support acceptance cleanup failed", error);
  });
  await runtime.close();
  restoreEnv("NODE_ENV", previousNodeEnv);
  restoreEnv("BLS_EMAIL_DELIVERY_ENABLED", previousDelivery);
  restoreEnv("APP_URL", previousAppUrl);
}

async function seedAndLoginCustomer(label: string, auth: PostgresCustomerAuthService, now: number) {
  const publicId = `usr_customer_accept_${label}_${suffix}`;
  const email = `customer-accept-${label}-${suffix}@example.test`;
  await seedAccount({ publicId, email, roles: ["customer"], password, now });
  const login = await auth.authenticate({ email, password, now: now + 1 });
  return { publicId, email, login, principal: login.principal };
}

async function seedAccount(input: { publicId: string; email: string; roles: Role[]; password: string; now: number }) {
  seededPublicIds.push(input.publicId);
  await runtime.persistence.identity.saveAccount({
    scope: { marketId: "sparta", platformAccess: true, requestId },
    account: {
      id: input.publicId,
      email: input.email,
      passwordHash: hashPassword(input.password),
      status: "active",
      roles: input.roles,
      emailVerified: true,
      createdAt: input.now,
    },
  });
}

async function verifyHappyEmailChange(
  customer: Awaited<ReturnType<typeof seedAndLoginCustomer>>,
  auth: PostgresCustomerAuthService,
) {
  const now = startedAt + 10_000;
  const secondSession = await auth.authenticate({ email: customer.email, password, now: now + 1 });
  const newEmail = `customer-accept-happy-new-${suffix}@example.test`;
  const requested = await requestCustomerEmailChange(customer.principal, {
    newEmail,
    currentPassword: password,
    now: now + 2,
  });
  if (requested.delivered || !requested.verificationUrl) throw new Error("Development email-change request did not return a verification URL");
  const pending = await customerPendingEmailChange(customer.principal, now + 3);
  if (!pending || pending.email !== newEmail) throw new Error("Pending email-change target was not persisted");

  const token = tokenFrom(requested.verificationUrl);
  const confirmed = await confirmCustomerEmailChange({ token, now: now + 4 });
  if (confirmed.userId !== customer.publicId || confirmed.newEmail !== newEmail) throw new Error("Email-change confirmation returned the wrong customer/email");
  if (await customerPendingEmailChange(customer.principal, now + 5)) throw new Error("Consumed email-change request remained pending");

  const firstSessionStillValid = await auth.session(customer.login.token, now + 6);
  const secondSessionStillValid = await auth.session(secondSession.token, now + 7);
  if (firstSessionStillValid || secondSessionStillValid) throw new Error("Email change did not revoke all existing customer sessions");

  const persisted = await runtime.sqlPool.query("SELECT email::text AS email FROM users WHERE public_id=$1", [customer.publicId]);
  if (String(persisted.rows[0]?.email ?? "") !== newEmail) throw new Error("Confirmed login email was not persisted");
  const notice = await runtime.sqlPool.query(`
    SELECT 1 AS present FROM notifications n JOIN users u ON u.id=n.user_id
    WHERE u.public_id=$1 AND n.event_type='account.email_changed' LIMIT 1
  `, [customer.publicId]);
  if (!notice.rowCount) throw new Error("Successful email change did not create the account security notification");
}

async function verifyCancelledEmailChange(customer: Awaited<ReturnType<typeof seedAndLoginCustomer>>) {
  const now = startedAt + 20_000;
  const requested = await requestCustomerEmailChange(customer.principal, {
    newEmail: `customer-accept-cancelled-new-${suffix}@example.test`,
    currentPassword: password,
    now,
  });
  const token = tokenFrom(requiredVerificationUrl(requested));
  const cancelled = await cancelCustomerEmailChange(customer.principal, now + 1);
  if (!cancelled.cancelled) throw new Error("Pending email change was not cancelled");
  await expectReject("cancelled email-change token", () => confirmCustomerEmailChange({ token, now: now + 2 }));
}

async function verifyExpiredEmailChange(customer: Awaited<ReturnType<typeof seedAndLoginCustomer>>) {
  const now = startedAt + 30_000;
  const requested = await requestCustomerEmailChange(customer.principal, {
    newEmail: `customer-accept-expired-new-${suffix}@example.test`,
    currentPassword: password,
    now,
  });
  const token = tokenFrom(requiredVerificationUrl(requested));
  await expectReject("expired email-change token", () => confirmCustomerEmailChange({ token, now: requested.expiresAt + 1 }));
}

async function verifyDuplicateTargetEmail(customer: Awaited<ReturnType<typeof seedAndLoginCustomer>>, claimedEmail: string) {
  await expectReject("already-claimed target email", () => requestCustomerEmailChange(customer.principal, {
    newEmail: claimedEmail,
    currentPassword: password,
    now: startedAt + 40_000,
  }));
  const pending = await customerPendingEmailChange(customer.principal, startedAt + 40_001);
  if (pending) throw new Error("Rejected duplicate target email left an active pending email-change token");
}

async function verifyContextualSupportFlow(customer: SessionPrincipal, otherCustomer: SessionPrincipal, admin: SessionPrincipal) {
  const now = startedAt + 50_000;
  const orderPublicId = `order_customer_accept_${suffix}`;
  const orderNumber = `ACCEPT-${suffix.toUpperCase()}`;
  orderPublicIds.push(orderPublicId);
  const seededOrder = await runtime.sqlPool.query(`
    INSERT INTO customer_orders(
      order_number,market_id,user_id,checkout_key,status,subtotal_minor,tax_minor,total_minor,
      billing_address_snapshot,fulfilment_preference,terms_version,public_id,checkout_fingerprint,confirmed_at
    )
    SELECT $1,m.id,u.id,$2,'confirmed',1000,240,1240,'{}'::jsonb,'pickup','customer-acceptance-v1',$3,$4,$5
    FROM markets m,users u
    WHERE m.code='sparta' AND u.public_id=$6
    RETURNING id::text AS id
  `, [orderNumber, `checkout-${suffix}`, orderPublicId, `fingerprint-${suffix}`, new Date(now), customer.userId]);
  if (seededOrder.rowCount !== 1) throw new Error("Failed to seed contextual-support order");

  await expectReject("cross-customer order context", () => createCustomerSupportCase(otherCustomer, {
    subject: "Order ownership rejection",
    category: "order",
    message: "This customer must not be able to attach another customer's order.",
    contextType: "order",
    contextId: orderPublicId,
    now: now + 1,
  }));

  const subject = `Order support ${suffix}`;
  const createdCases = await createCustomerSupportCase(customer, {
    subject,
    category: "order",
    message: "Initial customer-visible order support message.",
    contextType: "order",
    contextId: orderPublicId,
    now: now + 2,
  });
  const created = createdCases.find((item) => item.subject === subject);
  if (!created || created.contextType !== "order" || created.contextReference !== orderNumber) {
    throw new Error("Customer support case did not retain the validated customer-owned order context");
  }

  const internal = await runtime.sqlPool.query(`
    SELECT public_id FROM customer_support_cases WHERE reference_number=$1 LIMIT 1
  `, [created.referenceNumber]);
  const casePublicId = String(internal.rows[0]?.public_id ?? "");
  if (!casePublicId) throw new Error("Created support case could not be resolved to its private public id for admin acceptance");
  supportCasePublicIds.push(casePublicId);

  const internalNote = "Internal diagnosis: verify fulfilment state before replying.";
  await adminCustomerSupportCaseAction(admin, {
    caseId: casePublicId,
    action: "add_note",
    reason: internalNote,
  });
  const adminVisible = await adminCustomer360(admin, customer.userId);
  const adminCase = adminVisible.supportCases.find((item) => item.id === casePublicId);
  if (!adminCase?.events.some((event) => event.note === internalNote)) throw new Error("Admin internal support note was not persisted for staff");

  const visibleReply = "Customer-visible support reply: your order context is confirmed.";
  await adminReplyToCustomerSupportCase(admin, { caseId: created.referenceNumber, message: visibleReply, now: now + 3 });
  let customerCases = await customerSupportCases(customer);
  let customerCase = customerCases.find((item) => item.referenceNumber === created.referenceNumber);
  if (!customerCase) throw new Error("Customer could not read their support case after admin reply");
  if (customerCase.status !== "waiting_customer") throw new Error("Admin customer-visible reply did not move the case to waiting_customer");
  if (customerCase.messages.some((message) => message.body === internalNote)) throw new Error("Internal admin note leaked into the customer support timeline");
  if (!customerCase.messages.some((message) => message.body === visibleReply && message.sender === "support")) throw new Error("Explicit admin reply was not customer-visible");

  await expectReject("cross-customer support reply", () => replyCustomerSupportCase(otherCustomer, {
    caseId: created.referenceNumber,
    message: "This reply must be rejected by ownership isolation.",
    now: now + 4,
  }));

  const customerReply = "Customer reply after support response.";
  customerCases = await replyCustomerSupportCase(customer, {
    caseId: created.referenceNumber,
    message: customerReply,
    now: now + 5,
  });
  customerCase = customerCases.find((item) => item.referenceNumber === created.referenceNumber);
  if (!customerCase || customerCase.status !== "waiting_internal") throw new Error("Customer reply did not move support lifecycle to waiting_internal");
  if (!customerCase.messages.some((message) => message.body === customerReply && message.sender === "customer")) throw new Error("Customer support reply was not persisted in the visible timeline");
  if (customerCase.messages.some((message) => message.body === internalNote)) throw new Error("Internal admin note became visible after customer reply");

  const visibility = await runtime.sqlPool.query(`
    SELECT count(*) FILTER (WHERE customer_visible=true)::int AS visible,
           count(*) FILTER (WHERE customer_visible=false)::int AS internal
    FROM customer_support_case_events e
    JOIN customer_support_cases sc ON sc.id=e.case_id
    WHERE sc.public_id=$1
  `, [casePublicId]);
  if (Number(visibility.rows[0]?.visible ?? 0) < 3 || Number(visibility.rows[0]?.internal ?? 0) < 1) {
    throw new Error("Support event visibility flags did not preserve customer-visible/internal separation");
  }
}

function requiredVerificationUrl(result: { verificationUrl?: string }): string {
  if (!result.verificationUrl) throw new Error("Expected non-production verification URL");
  return result.verificationUrl;
}

function tokenFrom(verificationUrl: string): string {
  const token = new URL(verificationUrl).searchParams.get("token")?.trim();
  if (!token) throw new Error("Email-change verification URL did not contain a token");
  return token;
}

async function expectReject(label: string, operation: () => Promise<unknown>) {
  let rejected = false;
  try {
    await operation();
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error(`Expected ${label} to be rejected`);
}

async function cleanup() {
  if (!seededPublicIds.length) return;
  await runtime.sqlPool.query(`DELETE FROM audit_events WHERE actor_public_id = ANY($1::text[]) OR (entity_type='customer_support_case' AND entity_id = ANY($2::text[]))`, [seededPublicIds, supportCasePublicIds]);
  await runtime.sqlPool.query(`DELETE FROM notifications WHERE user_id IN (SELECT id FROM users WHERE public_id = ANY($1::text[]))`, [seededPublicIds]);
  await runtime.sqlPool.query(`DELETE FROM customer_support_case_events WHERE case_id IN (SELECT id FROM customer_support_cases WHERE public_id = ANY($1::text[]))`, [supportCasePublicIds]);
  await runtime.sqlPool.query(`DELETE FROM customer_support_cases WHERE public_id = ANY($1::text[])`, [supportCasePublicIds]);
  await runtime.sqlPool.query(`DELETE FROM customer_orders WHERE public_id = ANY($1::text[])`, [orderPublicIds]);
  await runtime.sqlPool.query(`DELETE FROM customer_email_change_tokens WHERE user_id IN (SELECT id FROM users WHERE public_id = ANY($1::text[]))`, [seededPublicIds]);
  await runtime.sqlPool.query(`DELETE FROM password_reset_tokens WHERE user_id IN (SELECT id FROM users WHERE public_id = ANY($1::text[]))`, [seededPublicIds]);
  await runtime.sqlPool.query(`DELETE FROM user_sessions WHERE user_id IN (SELECT id FROM users WHERE public_id = ANY($1::text[]))`, [seededPublicIds]);
  await runtime.sqlPool.query(`DELETE FROM platform_user_roles WHERE user_id IN (SELECT id FROM users WHERE public_id = ANY($1::text[]))`, [seededPublicIds]);
  await runtime.sqlPool.query(`DELETE FROM users WHERE public_id = ANY($1::text[])`, [seededPublicIds]);
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
