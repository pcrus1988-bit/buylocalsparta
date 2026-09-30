import type { VendorOnboardingState } from "@buy-local-sparta/core";
import { sendTransactionalEmailBestEffort } from "./transactional-email";

function operationsEmail(env: NodeJS.ProcessEnv = process.env): string {
  return env.BLS_OPERATIONS_EMAIL?.trim() || "info@kontamou.site";
}

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
  requestedPlanCode?: string;
  trialAccessUrl?: string;
  trialExpiresAt?: number;
}) {
  const subject = "Λάβαμε την αίτηση συνεργασίας σας · ΚΟΝΤΑ ΜΟΥ";
  const text = [
    "Καλησπέρα από το ΚΟΝΤΑ ΜΟΥ,",
    "",
    `Λάβαμε την αίτηση συνεργασίας για το κατάστημα «${input.tradingName}».`,
    `Αριθμός αίτησης: ${input.applicationId}`,
    input.requestedPlanCode ? `Επιλεγμένο πρόγραμμα: ${input.requestedPlanCode}` : undefined,
    "",
    input.trialAccessUrl ? "Το ιδιωτικό 3ήμερο Vendor Trial είναι ήδη έτοιμο." : "Η αίτηση βρίσκεται τώρα στο στάδιο επαλήθευσης.",
    input.trialAccessUrl ? `Email πρόσβασης: ${input.to}` : undefined,
    input.trialAccessUrl ? "Δεν χρειάζεται προσωρινός κωδικός: ο παρακάτω προσωπικός ασφαλής σύνδεσμος λειτουργεί ως διαπιστευτήριο για το Trial." : undefined,
    input.trialAccessUrl ? `Άνοιγμα 3ήμερου Trial: ${input.trialAccessUrl}` : undefined,
    input.trialExpiresAt ? `Λήξη write-enabled Trial: ${formatAthensDate(input.trialExpiresAt)}` : undefined,
    "",
    "Επόμενα βήματα:",
    "1. Εξερεύνησε το πραγματικό Vendor Dashboard και το onboarding wizard.",
    "2. Ρύθμισε storefront, στοιχεία καταστήματος και προϊόντα στο ιδιωτικό Trial.",
    "3. Η ομάδα ΚΟΝΤΑ ΜΟΥ ελέγχει εκπροσώπηση/επικοινωνία και τα στοιχεία της επιχείρησης.",
    "4. Δημόσια εμφάνιση, πραγματικές παραγγελίες και πληρωμές παραμένουν κλειδωμένες μέχρι την τελική ενεργοποίηση.",
    "",
    `Πληροφορίες συνεργασίας: ${publicBaseUrl()}/join`,
    "",
    "ΚΟΝΤΑ ΜΟΥ"
  ].filter((line): line is string => typeof line === "string").join("\n");
  return sendTransactionalEmailBestEffort({
    to: input.to,
    subject,
    text,
    eventType: "vendor.application_received",
    idempotencyKey: `vendor-application-received:v2:${input.applicationId}`,
    payload: { applicationId: input.applicationId, tradingName: input.tradingName, trial: Boolean(input.trialAccessUrl) }
  });
}

export async function sendHubProspectApplicationReceiptEmail(input: {
  to: string;
  businessName: string;
  reference: string;
  hubName: string;
  hubSlug: string;
  planCode: string;
  billingCycle: string;
  setupFeeCents: number;
  recurringFeeCents: number;
  commissionBps: number;
  trialAccessUrl: string;
  trialExpiresAt: number;
  idempotencySuffix?: string;
}) {
  const billingLabel = input.planCode === "claim"
    ? "Δωρεάν"
    : input.billingCycle === "annual"
      ? `Ετήσια · ${formatEuro(input.recurringFeeCents)} / έτος`
      : `Μηνιαία · ${formatEuro(input.recurringFeeCents)} / μήνα`;
  const setupLabel = input.setupFeeCents > 0 ? formatEuro(input.setupFeeCents) : "€0";
  const commissionLabel = `${(input.commissionBps / 100).toLocaleString("el-GR", { maximumFractionDigits: 2 })}%`;
  const subject = `Η αίτησή σας καταχωρίστηκε · ${input.reference} · ΚΟΝΤΑ ΜΟΥ`;
  const text = [
    "Καλησπέρα από το ΚΟΝΤΑ ΜΟΥ,",
    "",
    `Λάβαμε την αίτηση συνεργασίας για το κατάστημα «${input.businessName}».`,
    `Αριθμός αίτησης: ${input.reference}`,
    `HUB: ${input.hubName}`,
    "",
    "Η επιλογή σας",
    `Πρόγραμμα: ${input.planCode.toUpperCase()}`,
    `Χρέωση: ${billingLabel}`,
    `Κόστος ένταξης: ${setupLabel}`,
    `Προμήθεια marketplace: ${commissionLabel}`,
    "Πληρωμή κατά την αίτηση: Όχι — δεν έγινε χρέωση.",
    "",
    "Το 3ήμερο Vendor Trial σας είναι έτοιμο",
    `Email πρόσβασης: ${input.to}`,
    "Δεν χρειάζεται προσωρινός κωδικός. Ο προσωπικός ασφαλής σύνδεσμος παρακάτω λειτουργεί ως διαπιστευτήριο για το Trial:",
    input.trialAccessUrl,
    `Λήξη write-enabled Trial: ${formatAthensDate(input.trialExpiresAt)}`,
    "",
    "Τι μπορείτε να κάνετε τώρα:",
    "1. Μπείτε στο πραγματικό Vendor Dashboard.",
    "2. Ολοκληρώστε το onboarding wizard και προσαρμόστε το storefront σας.",
    "3. Προσθέστε προϊόντα και εξερευνήστε τα καθημερινά εργαλεία σε ιδιωτικό περιβάλλον.",
    "4. Δείτε το private storefront preview πριν από οποιαδήποτε δημόσια ενεργοποίηση.",
    "",
    "Τι γίνεται στη συνέχεια:",
    "• Η ομάδα ΚΟΝΤΑ ΜΟΥ ελέγχει τα στοιχεία Γ.Ε.ΜΗ. και την εκπροσώπηση/επικοινωνία.",
    "• Θα λάβετε email όταν αλλάξει ουσιαστικά το στάδιο της αίτησης ή αν χρειαστούμε επιπλέον στοιχεία.",
    "• Το Trial δεν ενεργοποιεί δημόσια πώληση, πραγματικές παραγγελίες ή πληρωμές.",
    "",
    `Προγράμματα HUB: ${publicBaseUrl()}/hubs/join`,
    "",
    "ΚΟΝΤΑ ΜΟΥ"
  ].join("\n");
  const suffix = input.idempotencySuffix?.trim() || "initial";
  return sendTransactionalEmailBestEffort({
    to: input.to,
    subject,
    text,
    eventType: "hub.application_received",
    idempotencyKey: `hub-application-received:v2:${input.reference}:${suffix}`,
    payload: {
      reference: input.reference,
      hubSlug: input.hubSlug,
      planCode: input.planCode,
      billingCycle: input.billingCycle,
      trial: true
    }
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
  const subject = `${message.subject} · ΚΟΝΤΑ ΜΟΥ`;
  const text = [
    "Καλησπέρα από το ΚΟΝΤΑ ΜΟΥ,",
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
    "ΚΟΝΤΑ ΜΟΥ"
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

export async function sendHubProspectStateEmail(input: {
  to: string;
  businessName: string;
  reference: string;
  state: "contacted" | "qualified" | "verified" | "approved" | "declined" | "converted";
  reason?: string;
}) {
  const message = hubStateMessage(input.state);
  const text = [
    "Καλησπέρα από το ΚΟΝΤΑ ΜΟΥ,",
    "",
    `Υπάρχει ενημέρωση για την αίτηση του καταστήματος «${input.businessName}».`,
    `Αριθμός αίτησης: ${input.reference}`,
    `Νέο στάδιο: ${message.label}`,
    "",
    message.body,
    input.reason?.trim() ? `\nΣημείωση από την ομάδα: ${input.reason.trim()}` : undefined,
    "",
    `Προγράμματα HUB: ${publicBaseUrl()}/hubs/join`,
    "",
    "ΚΟΝΤΑ ΜΟΥ"
  ].filter((line): line is string => typeof line === "string").join("\n");
  return sendTransactionalEmailBestEffort({
    to: input.to,
    subject: `${message.subject} · ${input.reference} · ΚΟΝΤΑ ΜΟΥ`,
    text,
    eventType: `hub.application_${input.state}`,
    idempotencyKey: `hub-application-state:${input.reference}:${input.state}`,
    payload: { reference: input.reference, state: input.state }
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
  return sendTransactionalEmailBestEffort({
    to: operationsEmail(),
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
      `Admin queue: ${publicBaseUrl()}/admin/applications`
    ].join("\n"),
    eventType: "admin.vendor_application_received",
    idempotencyKey: `admin-vendor-application:${input.applicationId}`,
    payload: { applicationId: input.applicationId }
  });
}

export async function notifyOperationsOfHubProspectApplication(input: {
  reference: string;
  businessName: string;
  contactName: string;
  contactEmail: string;
  phone: string;
  hubName: string;
  hubSlug: string;
  planCode: string;
  billingCycle: string;
}) {
  return sendTransactionalEmailBestEffort({
    to: operationsEmail(),
    subject: `Νέα αίτηση HUB · ${input.businessName}`,
    text: [
      "Νέα αίτηση επέκτασης HUB καταχωρίστηκε στο ΚΟΝΤΑ ΜΟΥ.",
      "",
      `Κατάστημα: ${input.businessName}`,
      `Υπεύθυνος: ${input.contactName}`,
      `Email: ${input.contactEmail}`,
      `Τηλέφωνο: ${input.phone}`,
      `HUB: ${input.hubName} (${input.hubSlug})`,
      `Πλάνο: ${input.planCode}`,
      `Χρέωση: ${input.billingCycle}`,
      `Αριθμός αίτησης: ${input.reference}`,
      "",
      `Admin queue: ${publicBaseUrl()}/admin/applications`
    ].join("\n"),
    eventType: "admin.hub_prospect_application_received",
    idempotencyKey: `admin-hub-prospect-application:${input.reference}`,
    payload: { applicationId: input.reference, hubSlug: input.hubSlug }
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

function hubStateMessage(state: "contacted" | "qualified" | "verified" | "approved" | "declined" | "converted") {
  switch (state) {
    case "contacted": return { label: "Επικοινωνία σε εξέλιξη", subject: "Ξεκινήσαμε την επεξεργασία της αίτησής σας", body: "Η ομάδα συνεργατών άνοιξε την αίτησή σας και προχωρά στον έλεγχο των επόμενων στοιχείων." };
    case "qualified": return { label: "Qualified", subject: "Η αίτησή σας προχώρησε", body: "Τα βασικά στοιχεία της αίτησης έχουν ελεγχθεί και συνεχίζουμε στο στάδιο επαλήθευσης της συνεργασίας." };
    case "verified": return { label: "Verified", subject: "Η επαλήθευση ολοκληρώθηκε", body: "Η αίτηση έχει περάσει τον βασικό έλεγχο. Ακολουθεί η τελική εμπορική/λειτουργική προετοιμασία πριν από απόφαση ενεργοποίησης." };
    case "approved": return { label: "Approved", subject: "Η αίτησή σας εγκρίθηκε", body: "Η αίτηση εγκρίθηκε για να συνεχίσει στα επόμενα βήματα onboarding και ενεργοποίησης του αντίστοιχου HUB." };
    case "declined": return { label: "Δεν προχωρά", subject: "Ενημέρωση για την αίτησή σας", body: "Η συγκεκριμένη αίτηση δεν προχωρά στο επόμενο στάδιο αυτή τη στιγμή. Αν χρειάζεστε διευκρίνιση, μπορείτε να απαντήσετε σε αυτό το email." };
    case "converted": return { label: "Μεταφέρθηκε σε onboarding", subject: "Η αίτησή σας πέρασε στο onboarding", body: "Η αίτηση μεταφέρθηκε από το prospect στάδιο στην οργανωμένη διαδικασία onboarding συνεργάτη." };
  }
}

function formatEuro(cents: number): string {
  return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(cents / 100);
}

function formatAthensDate(value: number): string {
  return new Intl.DateTimeFormat("el-GR", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Europe/Athens"
  }).format(new Date(value));
}
