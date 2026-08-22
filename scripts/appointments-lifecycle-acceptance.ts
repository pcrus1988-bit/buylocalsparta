import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { hashPassword, type Role } from "../packages/core/src/index.ts";
import {
  createPostgresRuntimeFromEnv,
  PostgresCustomerAuthService,
  PostgresVendorAuthService
} from "../packages/postgres-runtime/src/index.ts";
import {
  bookCustomerAppointment,
  cancelCustomerAppointment,
  customerAppointmentAdvisers,
  customerAppointments,
  rescheduleCustomerAppointment
} from "../apps/web/src/lib/customer-appointments-runtime.ts";
import { vendorAppointmentLifecycleAction } from "../apps/web/src/lib/vendor-appointments-runtime.ts";

if (process.env.BLS_ACCEPTANCE_SYNTHETIC_DB !== "true") {
  throw new Error("Refusing to run appointments acceptance outside an explicitly synthetic disposable database");
}

const runtime = createPostgresRuntimeFromEnv({ applicationName: "appointments-lifecycle-acceptance" });
const now = Date.now();
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const secret = process.env.BLS_AUTH_SECRET?.trim() || "appointments-acceptance-auth-secret-0123456789";

const customerId = `usr_appointments_${suffix}`;
const otherCustomerId = `usr_appointments_other_${suffix}`;
const vendorId = `vendor_appointments_${suffix}`;
const otherVendorId = `vendor_appointments_other_${suffix}`;
const vendorOwnerId = `usr_vendor_appointments_owner_${suffix}`;
const vendorStaffId = `usr_vendor_appointments_staff_${suffix}`;
const otherVendorOwnerId = `usr_vendor_appointments_other_${suffix}`;
const adviserId = `adviser_appointments_${suffix}`;
const otherAdviserId = `adviser_appointments_other_${suffix}`;

const customerEmail = `appointments-${suffix}@example.test`;
const otherCustomerEmail = `appointments-other-${suffix}@example.test`;
const vendorOwnerEmail = `appointments-vendor-owner-${suffix}@example.test`;
const vendorStaffEmail = `appointments-vendor-staff-${suffix}@example.test`;
const otherVendorEmail = `appointments-vendor-other-${suffix}@example.test`;

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function expectFailure(run: () => Promise<unknown>, pattern: RegExp, message: string) {
  let matched = false;
  try {
    await run();
  } catch (error) {
    matched = error instanceof Error && pattern.test(error.message);
  }
  if (!matched) throw new Error(message);
}

async function saveAccount(input: {
  id: string;
  email: string;
  password: string;
  roles: readonly Role[];
  vendorId?: string;
  createdAt: number;
}) {
  await runtime.persistence.identity.saveAccount({
    scope: { marketId: "sparta", platformAccess: true },
    account: {
      id: input.id,
      email: input.email,
      passwordHash: hashPassword(input.password),
      status: "active",
      roles: [...input.roles],
      vendorId: input.vendorId,
      emailVerified: true,
      createdAt: input.createdAt
    }
  });
}

function source(path: string): string {
  return readFileSync(`${process.cwd()}/${path}`, "utf8");
}

try {
  const readiness = await runtime.readiness();
  expect(readiness.ok, `Database is not ready: ${readiness.message}`);

  const customerApi = source("apps/web/src/app/api/account/appointments/route.ts");
  const customerActionApi = source("apps/web/src/app/api/account/appointments/action/route.ts");
  const vendorApi = source("apps/web/src/app/api/vendor/advice/appointments/route.ts");
  expect(customerApi.includes("requireAccountSession(request, true)"), "Customer appointment creation route is not CSRF protected");
  expect(customerActionApi.includes("requireAccountSession(request, true)"), "Customer appointment mutation route is not CSRF protected");
  expect(vendorApi.includes("requireVendorSession(request, true)"), "Vendor appointment mutation route is not CSRF protected");
  expect([customerApi, customerActionApi, vendorApi].every((value) => value.includes('"Cache-Control": "no-store"')), "Appointment APIs must disable response caching");

  await saveAccount({ id: customerId, email: customerEmail, password: "Customer!12345", roles: ["customer"], createdAt: now });
  await saveAccount({ id: otherCustomerId, email: otherCustomerEmail, password: "Customer!12345", roles: ["customer"], createdAt: now + 1 });

  await runtime.sqlPool.query(`
    WITH market AS (SELECT id FROM markets WHERE code='sparta')
    INSERT INTO vendor_businesses(public_id,market_id,legal_name,trading_name,status,verification_completed_at,contract_started_at)
    SELECT $1,market.id,$2,$2,'active',$3,$3 FROM market
  `, [vendorId, `Appointments Acceptance Vendor ${suffix}`, new Date(now)]);
  await runtime.sqlPool.query(`
    WITH market AS (SELECT id FROM markets WHERE code='sparta')
    INSERT INTO vendor_businesses(public_id,market_id,legal_name,trading_name,status,verification_completed_at,contract_started_at)
    SELECT $1,market.id,$2,$2,'active',$3,$3 FROM market
  `, [otherVendorId, `Appointments Isolation Vendor ${suffix}`, new Date(now)]);

  await saveAccount({ id: vendorOwnerId, email: vendorOwnerEmail, password: "Vendor!12345", roles: ["vendor_owner"], vendorId, createdAt: now + 10 });
  await saveAccount({ id: vendorStaffId, email: vendorStaffEmail, password: "Vendor!12345", roles: ["vendor_staff"], vendorId, createdAt: now + 11 });
  await saveAccount({ id: otherVendorOwnerId, email: otherVendorEmail, password: "Vendor!12345", roles: ["vendor_owner"], vendorId: otherVendorId, createdAt: now + 12 });

  await runtime.sqlPool.query(`
    WITH vendor_user AS (
      SELECT vu.id,vu.vendor_id
      FROM vendor_users vu JOIN users u ON u.id=vu.user_id
      WHERE u.public_id=$1 AND vu.active=true
      LIMIT 1
    )
    INSERT INTO adviser_profiles(public_id,vendor_user_id,vendor_id,display_name,job_title,languages,specialties,active)
    SELECT $2,vendor_user.id,vendor_user.vendor_id,$3,'Local adviser',ARRAY['el']::text[],ARRAY['appointments acceptance']::text[],true
    FROM vendor_user
  `, [vendorOwnerId, adviserId, `Adviser ${suffix}`]);
  await runtime.sqlPool.query(`
    WITH vendor_user AS (
      SELECT vu.id,vu.vendor_id
      FROM vendor_users vu JOIN users u ON u.id=vu.user_id
      WHERE u.public_id=$1 AND vu.active=true
      LIMIT 1
    )
    INSERT INTO adviser_profiles(public_id,vendor_user_id,vendor_id,display_name,job_title,languages,specialties,active)
    SELECT $2,vendor_user.id,vendor_user.vendor_id,$3,'Isolation adviser',ARRAY['el']::text[],ARRAY['appointments isolation']::text[],true
    FROM vendor_user
  `, [otherVendorOwnerId, otherAdviserId, `Other Adviser ${suffix}`]);

  const customerAuth = new PostgresCustomerAuthService({ identity: runtime.persistence.identity, secret });
  const vendorAuth = new PostgresVendorAuthService({ identity: runtime.persistence.identity, secret });
  const customer = await customerAuth.authenticate({ email: customerEmail, password: "Customer!12345", now: now + 100 });
  const otherCustomer = await customerAuth.authenticate({ email: otherCustomerEmail, password: "Customer!12345", now: now + 110 });
  const vendorOwner = await vendorAuth.authenticate({ email: vendorOwnerEmail, password: "Vendor!12345", now: now + 120 });
  const otherVendor = await vendorAuth.authenticate({ email: otherVendorEmail, password: "Vendor!12345", now: now + 130 });

  const advisers = await customerAppointmentAdvisers(customer.principal);
  expect(advisers.some((item) => item.id === adviserId && item.vendorId === vendorId), "Active vendor adviser was not discoverable by the customer");
  expect(advisers.some((item) => item.id === otherAdviserId && item.vendorId === otherVendorId), "Second active vendor adviser was not discoverable by the customer");

  const firstStart = now + 2 * 60 * 60 * 1000;
  const first = await bookCustomerAppointment(customer.principal, {
    vendorId,
    adviserId,
    startsAt: firstStart,
    durationMinutes: 30,
    channel: "in_person",
    notes: "Θέλω βοήθεια πριν από την αγορά.",
    now: now + 200
  });
  expect(first.status === "confirmed", "New appointment did not enter confirmed state");
  expect(first.vendorId === vendorId && first.adviserId === adviserId, "Appointment was not bound to the selected vendor/adviser");

  const bookingNotifications = await runtime.sqlPool.query<{ total: number; distinct_public_ids: number; distinct_users: number } & Record<string, unknown>>(`
    SELECT count(*)::int AS total,
           count(DISTINCT public_id)::int AS distinct_public_ids,
           count(DISTINCT user_id)::int AS distinct_users
    FROM notifications
    WHERE event_type='appointment.created' AND payload->>'appointmentId'=$1
  `, [first.id]);
  expect(Number(bookingNotifications.rows[0]?.total) === 2, "Appointment booking did not notify both active vendor users");
  expect(Number(bookingNotifications.rows[0]?.distinct_public_ids) === 2, "Vendor appointment notifications reused a globally unique public id");
  expect(Number(bookingNotifications.rows[0]?.distinct_users) === 2, "Vendor appointment notification fan-out did not target two distinct users");

  expect(!(await customerAppointments(otherCustomer.principal)).some((item) => item.id === first.id), "Cross-customer appointment leaked into another account");
  await expectFailure(
    () => cancelCustomerAppointment(otherCustomer.principal, first.id, now + 300),
    /δεν βρέθηκε|not found/i,
    "Another customer could cancel an appointment they do not own"
  );
  await expectFailure(
    () => rescheduleCustomerAppointment(otherCustomer.principal, { appointmentId: first.id, startsAt: firstStart + 60 * 60 * 1000, durationMinutes: 30, now: now + 310 }),
    /δεν βρέθηκε|not found/i,
    "Another customer could reschedule an appointment they do not own"
  );
  await expectFailure(
    () => vendorAppointmentLifecycleAction(otherVendor.principal, first.id, "cancel", now + 320),
    /access denied/i,
    "Another vendor could mutate an appointment outside its tenant"
  );

  await expectFailure(
    () => bookCustomerAppointment(otherCustomer.principal, {
      vendorId,
      adviserId,
      startsAt: firstStart + 5 * 60 * 1000,
      durationMinutes: 30,
      channel: "phone",
      now: now + 330
    }),
    /ώρα.*δεσμεύτηκε|slot|available/i,
    "Overlapping adviser booking was not rejected"
  );

  const rescheduledStart = now + 3 * 60 * 60 * 1000;
  const moved = await rescheduleCustomerAppointment(customer.principal, {
    appointmentId: first.id,
    startsAt: rescheduledStart,
    durationMinutes: 45,
    now: now + 400
  });
  expect(moved.status === "rescheduled", "Customer reschedule did not enter rescheduled state");
  expect(moved.startsAt === rescheduledStart && moved.endsAt === rescheduledStart + 45 * 60 * 1000, "Rescheduled slot was not persisted exactly");

  const rescheduleNotifications = await runtime.sqlPool.query<{ total: number; distinct_public_ids: number; distinct_users: number } & Record<string, unknown>>(`
    SELECT count(*)::int AS total,
           count(DISTINCT public_id)::int AS distinct_public_ids,
           count(DISTINCT user_id)::int AS distinct_users
    FROM notifications
    WHERE event_type='appointment.rescheduled' AND payload->>'appointmentId'=$1
  `, [first.id]);
  expect(Number(rescheduleNotifications.rows[0]?.total) === 2, "Appointment reschedule did not notify both active vendor users");
  expect(Number(rescheduleNotifications.rows[0]?.distinct_public_ids) === 2, "Reschedule notification fan-out reused a public id");

  const released = await bookCustomerAppointment(otherCustomer.principal, {
    vendorId,
    adviserId,
    startsAt: firstStart,
    durationMinutes: 30,
    channel: "phone",
    now: now + 410
  });
  expect(released.status === "confirmed", "Rescheduling did not release the original adviser slot");

  await expectFailure(
    () => vendorAppointmentLifecycleAction(vendorOwner.principal, first.id, "complete", rescheduledStart - 1),
    /πριν από την ώρα|before/i,
    "Vendor could complete an appointment before its start"
  );
  await expectFailure(
    () => vendorAppointmentLifecycleAction(vendorOwner.principal, first.id, "no_show", rescheduledStart - 1),
    /αφού ξεκινήσει|after|start/i,
    "Vendor could mark no-show before appointment start"
  );

  await vendorAppointmentLifecycleAction(vendorOwner.principal, first.id, "complete", rescheduledStart + 60_000);
  const completed = (await customerAppointments(customer.principal)).find((item) => item.id === first.id);
  expect(completed?.status === "completed", "Vendor completion did not persist completed state");
  await expectFailure(
    () => cancelCustomerAppointment(customer.principal, first.id, rescheduledStart + 120_000),
    /δεν μπορεί πλέον|cannot/i,
    "Customer could cancel an already completed appointment"
  );
  await expectFailure(
    () => rescheduleCustomerAppointment(customer.principal, { appointmentId: first.id, startsAt: rescheduledStart + 2 * 60 * 60 * 1000, durationMinutes: 30, now: rescheduledStart + 120_000 }),
    /δεν μπορεί πλέον|cannot/i,
    "Customer could reschedule an already completed appointment"
  );

  const completionNotification = await runtime.sqlPool.query<{ total: number } & Record<string, unknown>>(`
    SELECT count(*)::int AS total FROM notifications
    WHERE event_type='appointment.completed' AND payload->>'appointmentId'=$1
  `, [first.id]);
  expect(Number(completionNotification.rows[0]?.total) === 1, "Vendor completion did not notify the owning customer exactly once");
  await expectFailure(
    () => vendorAppointmentLifecycleAction(vendorOwner.principal, first.id, "complete", rescheduledStart + 180_000),
    /Μόνο επιβεβαιωμένο|confirmed/i,
    "Completed appointment accepted a duplicate completion transition"
  );

  await vendorAppointmentLifecycleAction(vendorOwner.principal, released.id, "no_show", firstStart + 60_000);
  const noShow = (await customerAppointments(otherCustomer.principal)).find((item) => item.id === released.id);
  expect(noShow?.status === "no_show", "Vendor no-show did not persist no_show state");
  const noShowNotification = await runtime.sqlPool.query<{ total: number } & Record<string, unknown>>(`
    SELECT count(*)::int AS total FROM notifications
    WHERE event_type='appointment.no_show' AND payload->>'appointmentId'=$1
  `, [released.id]);
  expect(Number(noShowNotification.rows[0]?.total) === 1, "No-show did not notify the owning customer exactly once");

  const cancellableStart = now + 5 * 60 * 60 * 1000;
  const cancellable = await bookCustomerAppointment(customer.principal, {
    vendorId,
    adviserId,
    startsAt: cancellableStart,
    durationMinutes: 30,
    channel: "phone",
    now: now + 500
  });
  const cancelled = await cancelCustomerAppointment(customer.principal, cancellable.id, now + 510);
  expect(cancelled.status === "cancelled", "Customer cancellation did not persist cancelled state");
  await expectFailure(
    () => vendorAppointmentLifecycleAction(vendorOwner.principal, cancellable.id, "complete", cancellableStart + 60_000),
    /Μόνο επιβεβαιωμένο|confirmed/i,
    "Vendor could complete a customer-cancelled appointment"
  );

  await expectFailure(
    () => bookCustomerAppointment(customer.principal, {
      vendorId,
      adviserId,
      startsAt: now + 6 * 60 * 60 * 1000,
      durationMinutes: 20,
      channel: "phone",
      now: now + 520
    }),
    /30, 45 ή 60|duration/i,
    "Unsupported appointment duration was accepted"
  );
  await expectFailure(
    () => bookCustomerAppointment(customer.principal, {
      vendorId,
      adviserId,
      startsAt: now + 6 * 60 * 60 * 1000,
      durationMinutes: 30,
      channel: "video",
      now: now + 530
    }),
    /επικοινωνίας|channel/i,
    "Unsupported appointment channel was accepted"
  );

  const audits = await runtime.sqlPool.query<{ action: string; actor_public_id: string | null } & Record<string, unknown>>(`
    SELECT action,actor_public_id
    FROM audit_events
    WHERE entity_type='appointment' AND entity_id=ANY($1::text[])
    ORDER BY created_at
  `, [[first.id, released.id, cancellable.id]]);
  const actions = audits.rows.map((row) => String(row.action));
  for (const required of ["appointment.created", "appointment.rescheduled", "appointment.vendor_complete", "appointment.vendor_no_show", "appointment.customer_cancelled"]) {
    expect(actions.includes(required), `Appointment audit trail is missing ${required}`);
  }
  expect(audits.rows.every((row) => typeof row.actor_public_id === "string" && row.actor_public_id.length > 0), "Appointment audit event is missing actor_public_id");

  const duplicateNotificationIds = await runtime.sqlPool.query<{ duplicates: number } & Record<string, unknown>>(`
    SELECT count(*)::int AS duplicates FROM (
      SELECT public_id FROM notifications GROUP BY public_id HAVING count(*)>1
    ) d
  `);
  expect(Number(duplicateNotificationIds.rows[0]?.duplicates) === 0, "Appointment flow created duplicate notification public IDs");

  console.log(JSON.stringify({
    ok: true,
    appointmentId: first.id,
    releasedSlotAppointmentId: released.id,
    cancelledAppointmentId: cancellable.id,
    customerOwnershipIsolation: true,
    vendorTenantIsolation: true,
    adviserOverlapProtection: true,
    rescheduleReleasesSlot: true,
    earlyCompletionGuard: true,
    earlyNoShowGuard: true,
    completedTerminalGuard: true,
    customerCancellationGuard: true,
    multiUserVendorNotificationFanout: true,
    notificationPublicIdsUnique: true,
    customerNotificationsExactlyOnce: true,
    auditActorPublicIdsPresent: true,
    auditActions: actions
  }, null, 2));
} finally {
  await runtime.close();
}
