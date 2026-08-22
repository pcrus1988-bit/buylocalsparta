import { readFileSync } from "node:fs";
import type { SessionPrincipal } from "../packages/core/src/index.ts";
import { vendorAppointmentLifecycleAction } from "../apps/web/src/lib/vendor-appointments-runtime.ts";

if (process.env.BLS_ACCEPTANCE_SYNTHETIC_DB !== "true") {
  throw new Error("Refusing to run appointment authorization acceptance outside an explicitly synthetic disposable database");
}

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const customerRuntime = readFileSync(`${root}/apps/web/src/lib/customer-appointments-runtime.ts`, "utf8");
const vendorRuntime = readFileSync(`${root}/apps/web/src/lib/vendor-appointments-runtime.ts`, "utf8");
const customerClient = readFileSync(`${root}/apps/web/src/components/CustomerAppointmentsClient.tsx`, "utf8");

expect(vendorRuntime.includes('can(role, "advice.write")'), "Vendor appointment mutation is not gated by advice.write RBAC");
expect(vendorRuntime.includes("VENDOR_ADVICE_FORBIDDEN"), "Vendor appointment mutation lacks a distinct advice authorization failure");
expect(customerRuntime.includes("vendor_user_roles vur"), "Vendor appointment notification fan-out does not consult vendor roles");
expect(customerRuntime.includes("vur.role IN ('vendor_owner','vendor_adviser')"), "Appointment notifications are not limited to advice-authorized vendor roles");
expect(customerRuntime.includes("vendor_locations vl"), "Phone appointment capability does not consult public vendor locations");
expect(customerRuntime.includes("phoneAvailable"), "Phone appointment capability is not projected to the customer UI");
expect(customerRuntime.includes('channel === "phone" && !adviser.phoneAvailable'), "Phone appointment capability is not enforced server-side");
expect(customerClient.includes('disabled={!selectedAdviser?.phoneAvailable}'), "Phone appointment option is not disabled when public phone is unavailable");
expect(customerClient.includes("#store-info"), "Phone appointment UX does not link to the vendor's public contact details");
expect(customerClient.includes("δεν κοινοποιούμε ιδιωτικά στοιχεία λογαριασμού"), "Phone appointment UX does not state the privacy boundary");
expect(!customerClient.includes("το κατάστημα θα χρησιμοποιήσει τα στοιχεία της παραγγελίας/λογαριασμού"), "Phone appointment UX still implies private account/order data is shared with the vendor");

const forbiddenPrincipal = {
  userId: "usr_appointments_forbidden",
  roles: ["vendor_catalog"],
  vendorId: "vendor_appointments_forbidden"
} as unknown as SessionPrincipal;

let forbidden = false;
try {
  await vendorAppointmentLifecycleAction(forbiddenPrincipal, "appointment_forbidden", "cancel", Date.now());
} catch (error) {
  forbidden = error instanceof Error && error.message === "VENDOR_ADVICE_FORBIDDEN";
}
expect(forbidden, "A vendor_catalog principal was not rejected before appointment mutation");

console.log(JSON.stringify({
  ok: true,
  adviceWriteRequired: true,
  nonAdviceVendorRejected: true,
  notificationFanoutRoleScoped: true,
  phoneAppointmentUsesPublicVendorContact: true,
  phoneAppointmentCapabilityGated: true,
  privateCustomerContactNotRequired: true
}, null, 2));
