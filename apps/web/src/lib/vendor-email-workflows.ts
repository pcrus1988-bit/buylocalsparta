import type { VendorOnboardingState } from "@buy-local-sparta/core";
import { sendTransactionalEmailBestEffort } from "./transactional-email";

function publicBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.BLS_PUBLIC_BASE_URL?.trim() || env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const production = env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || env.VERCEL_URL?.trim();
  return production ? `https://${production.replace(/^https?:\/\//, "").replace(/\/$/, "")}` : "https://kontamou.site";
}

export async function sendVendorApplicationReceiptEmail(input: {
  to: string;
  tradingName: string;
  applicationId: string;
}) {
  const subject = "Λάβαμε την αίτηση συνεργασίας σας · ΚΟΝΤΑ ΜΟΥ Sparta";
  const text = [
    `Καλησπέρα από το ΚΟΝΤΑ ΜΟΥ Sparta,`,
    "",
    `Λάβαμε την αίτηση συνεργασίας για το κατάστημα «${input.tradingName}».`,
    `Κωδικός αίτησης: ${input.applicationId}`,
    "",
    "Η αίτηση βρίσκεται τώρα στο στάδιο επαλήθευσης. Δεν δημιουργείται αυτόματα δημόσια παρουσία ή πρόσβαση vendor πριν ολοκληρωθούν οι απαιτούμενοι έλεγχοι.",
    "Θα σας ενημερώνουμε με email όταν αλλάζει ουσιαστικά το στάδιο της αίτησης ή όταν χρειαζόμαστε επιπλέον στοιχεία.",
    "",
    `Πληροφορίες συνεργασίας: ${publicBaseUrl()}/join`,
    "",
    "ΚΟΝΤΑ ΜΟΥ Sparta"
  ].join("\n");
  return sendTransactionalEmailBestEffort({
    to: input.to,
    subject,
    text,
    eventType: "vendor.application_received",
    idempotencyKey: `vendor-application-received:${input.applicationId}`,
    payload: { applicationId: input.applicationId, tradingName: input.tradingName }
  });
}

export async function sendVendorApplicationStateEmail(input: {
  to: string;
  tradingName: string;
  applicationId: string;
  state: VendorOnboardingState;
  reason?: string;
}) {
  const message = stateMessage(input.state);
  const subject = `${message.subject} · ΚΟΝΤΑ ΜΟΥ Sparta`;
  const text = [
    `Καλησπέρα από το ΚΟΝΤΑ ΜΟΥ Sparta,`,
    "",
    `Υπάρχει ενημέρωση για την αίτηση του καταστήματος «${input.tradingName}».`,
    `Κωδικός αίτησης: ${input.applicationId}`,
    `Νέο στάδιο: ${message.label}`,
    "",
    message.body,
    input.reason?.trim() ? `\nΣημείωση από την ομάδα: ${input.reason.trim()}` : undefined,
    "",
    message.link ? `${message.linkLabel}: ${publicBaseUrl()}${message.link}` : undefined,
    "",
    "ΚΟΝΤΑ ΜΟΥ Sparta"
  ].filter((line): line is string => typeof line === "string").join("\n");
  return sendTransactionalEmailBestEffort({
    to: input.to,
    subject,
    text,
    eventType: `vendor.application_${input.state}`,
    idempotencyKey: `vendor-application-state:${input.applicationId}:${input.state}`,
    payload: { applicationId: input.applicationId, tradingName: input.tradingName, state: input.state }
  });
}

export async function sendResearchVendorInvitationEmail(input: {
  to: string;
  tradingName: string;
  researchId: string;
}) {
  const applyUrl = `${publicBaseUrl()}/join`;
  return sendTransactionalEmailBestEffort({
    to: input.to,
    subject: "Πρόσκληση συνεργασίας · ΚΟΝΤΑ ΜΟΥ Sparta",
    text: [
      `Καλησπέρα στην ομάδα του «${input.tradingName}»,`,
      "",
      "Το ΚΟΝΤΑ ΜΟΥ Sparta δημιουργεί μια οργανωμένη τοπική αγορά για καταστήματα της Σπάρτης και της ευρύτερης περιοχής, με κοινή ψηφιακή βιτρίνα, vendor workspace και δίκαιη συμμετοχή στην προβολή προϊόντων.",
      "",
      "Θα χαρούμε να εξετάσουμε μαζί τη συμμετοχή του καταστήματός σας. Η πρόσκληση δεν ενεργοποιεί λογαριασμό ούτε δημιουργεί οποιαδήποτε χρέωση· η επίσημη διαδικασία ξεκινά μόνο όταν ο ιδιοκτήτης ή εξουσιοδοτημένος εκπρόσωπος υποβάλει την αίτηση.",
      "",
      `Δείτε τα προγράμματα και τη διαδικασία: ${applyUrl}`,
      "",
      "Μπορείτε επίσης να απαντήσετε απευθείας σε αυτό το email για οποιαδήποτε ερώτηση.",
      "",
      "ΚΟΝΤΑ ΜΟΥ Sparta"
    ].join("\n"),
    eventType: "vendor.research_invitation",
    idempotencyKey: `research-vendor-invite:v1:${input.researchId}`,
    payload: { researchId: input.researchId, tradingName: input.tradingName }
  });
}

export async function notifyOperationsOfVendorApplication(input: {
  applicationId: string;
  tradingName: string;
  legalName: string;
  contactEmail: string;
  requestedPlanCode: string;
}) {
  const to = process.env.BLS_OPERATIONS_EMAIL?.trim();
  if (!to) return { sent: false as const };
  return sendTransactionalEmailBestEffort({
    to,
    subject: `Νέα αίτηση vendor · ${input.tradingName}`,
    text: [
      "Νέα αίτηση συνεργασίας καταχωρίστηκε στο ΚΟΝΤΑ ΜΟΥ Sparta.",
      "",
      `Κατάστημα: ${input.tradingName}`,
      `Νομική ονομασία: ${input.legalName}`,
      `Email: ${input.contactEmail}`,
      `Πλάνο: ${input.requestedPlanCode}`,
      `Application ID: ${input.applicationId}`,
      "",
      `Admin queue: ${publicBaseUrl()}/admin/vendors`
    ].join("\n"),
    eventType: "admin.vendor_application_received",
    idempotencyKey: `admin-vendor-application:${input.applicationId}`,
    payload: { applicationId: input.applicationId }
  });
}

function stateMessage(state: VendorOnboardingState) {
  switch (state) {
    case "verification_pending": return { label: "Σε επαλήθευση", subject: "Η αίτησή σας βρίσκεται σε επαλήθευση", body: "Ελέγχουμε τα στοιχεία της επιχείρησης και της τοποθεσίας. Θα επικοινωνήσουμε μαζί σας αν χρειαστούμε πρόσθετα δικαιολογητικά.", link: "/join/requirements", linkLabel: "Readiness check" };
    case "catalog_onboarding": return { label: "Onboarding καταλόγου", subject: "Η επαλήθευση προχώρησε", body: "Η αίτηση πέρασε στο στάδιο οργάνωσης καταλόγου. Επόμενο βήμα είναι η προετοιμασία προϊόντων, αποθέματος, media και fulfilment.", link: "/join", linkLabel: "Διαδικασία συνεργασίας" };
    case "test_ready": return { label: "Έτοιμο για δοκιμή", subject: "Το κατάστημά σας είναι έτοιμο για τελικό έλεγχο", body: "Οι βασικές προϋποθέσεις onboarding έχουν ολοκληρωθεί και γίνεται ο τελικός έλεγχος πριν από την ενεργοποίηση.", link: "/join", linkLabel: "Διαδικασία συνεργασίας" };
    case "active": return { label: "Ενεργό", subject: "Η συνεργασία σας ενεργοποιήθηκε", body: "Το κατάστημα έχει περάσει τα απαιτούμενα activation gates. Η ομάδα μας θα σας δώσει ή θα επιβεβαιώσει τα στοιχεία πρόσβασης στο vendor workspace και τα επόμενα βήματα λειτουργίας.", link: "/vendor/login", linkLabel: "Vendor workspace" };
    case "restricted": return { label: "Περιορισμένο", subject: "Ενημέρωση για την κατάσταση της συνεργασίας", body: "Η λειτουργία του vendor έχει περιοριστεί μέχρι να επιλυθεί το θέμα που αναφέρεται παρακάτω. Παρακαλούμε απαντήστε σε αυτό το email αν χρειάζεστε διευκρίνιση.", link: "/join/requirements", linkLabel: "Απαιτήσεις" };
    case "suspended": return { label: "Σε αναστολή", subject: "Η συνεργασία σας τέθηκε σε αναστολή", body: "Η λειτουργία του vendor έχει τεθεί προσωρινά σε αναστολή. Παρακαλούμε επικοινωνήστε με την ομάδα μας ή απαντήστε σε αυτό το email για την αποκατάσταση.", link: undefined, linkLabel: undefined };
    case "closed": return { label: "Κλειστό", subject: "Η διαδικασία συνεργασίας ολοκληρώθηκε", body: "Η συγκεκριμένη αίτηση ή συνεργασία έχει κλείσει. Αν θεωρείτε ότι χρειάζεται επανεξέταση, μπορείτε να απαντήσετε σε αυτό το email.", link: "/join", linkLabel: "Πληροφορίες συνεργασίας" };
    default: return { label: state, subject: "Ενημέρωση αίτησης συνεργασίας", body: "Η κατάσταση της αίτησης ενημερώθηκε.", link: "/join", linkLabel: "Πληροφορίες συνεργασίας" };
  }
}
