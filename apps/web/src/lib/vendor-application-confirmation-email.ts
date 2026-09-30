import { sendTransactionalEmailBestEffort } from "./transactional-email";
import { vendorApplicationPlanTerms, type VendorApplicationPlanSnapshot } from "./vendor-application-plan";

export async function sendVendorApplicationConfirmationEmail(input: {
  to: string;
  tradingName: string;
  applicationId: string;
  plan: VendorApplicationPlanSnapshot;
  trialAccessUrl?: string;
  trialExpiresAt?: number;
  idempotencySuffix?: string;
  now?: number;
}) {
  const terms = vendorApplicationPlanTerms(input.plan);
  const now = input.now ?? Date.now();
  const trialActive = Boolean(input.trialAccessUrl && input.trialExpiresAt && input.trialExpiresAt > now);
  const subject = `Η αίτησή σας καταχωρίστηκε · ${input.applicationId} · ΚΟΝΤΑ ΜΟΥ`;
  const text = [
    "Καλησπέρα από το ΚΟΝΤΑ ΜΟΥ,",
    "",
    `Λάβαμε την αίτηση συνεργασίας για το κατάστημα «${input.tradingName}».`,
    `Αριθμός αίτησης: ${input.applicationId}`,
    "Κατάσταση: Σε επαλήθευση",
    "",
    "Η επιλογή σας",
    `Πρόγραμμα: ${terms.name}`,
    `Κόστος ένταξης: ${terms.setup}`,
    `Συνδρομή: ${terms.subscription}`,
    `Διάρκεια προγράμματος: ${terms.duration}`,
    `Προμήθεια marketplace: ${terms.commission}`,
    "Χρέωση κατά την αίτηση: Όχι — δεν έγινε χρέωση.",
    "",
    input.trialAccessUrl
      ? trialActive
        ? "Το ιδιωτικό 3ήμερο Vendor Trial είναι ήδη έτοιμο."
        : "Το 3ήμερο write-enabled Vendor Trial έχει ολοκληρωθεί. Ο ασφαλής σύνδεσμος παραμένει διαθέσιμος μόνο όσο ισχύει η περίοδος πρόσβασης/επισκόπησης."
      : "Η αίτηση βρίσκεται στο στάδιο επαλήθευσης. Trial πρόσβαση θα δοθεί μόλις ολοκληρωθεί η ασφαλής σύνδεση με το κατάστημα.",
    input.trialAccessUrl ? `Email πρόσβασης: ${input.to}` : undefined,
    input.trialAccessUrl ? "Ο παρακάτω προσωπικός ασφαλής σύνδεσμος είναι το διαπιστευτήριο εισόδου για το Trial. Δεν είναι μόνιμος vendor κωδικός και δεν ενεργοποιεί δημόσια πώληση." : undefined,
    input.trialAccessUrl ? `Άνοιγμα Vendor Trial: ${input.trialAccessUrl}` : undefined,
    input.trialExpiresAt ? `Λήξη write-enabled Trial: ${formatAthensDate(input.trialExpiresAt)}` : undefined,
    "",
    "Επόμενα βήματα",
    "1. Εξερεύνησε το πραγματικό Vendor Dashboard και το onboarding wizard.",
    "2. Ρύθμισε storefront, στοιχεία καταστήματος και προϊόντα στο ιδιωτικό Trial.",
    "3. Η ομάδα ΚΟΝΤΑ ΜΟΥ ελέγχει τα στοιχεία επιχείρησης και την εκπροσώπηση/επικοινωνία.",
    "4. Μετά το verification, η αίτηση περνά σε catalogue onboarding και test readiness.",
    "5. Δημόσια εμφάνιση, πραγματικές παραγγελίες και πληρωμές παραμένουν κλειδωμένες μέχρι την τελική, governed ενεργοποίηση.",
    "",
    "Τα ποσά παραπάνω είναι το snapshot του προγράμματος που καταγράφηκε με την αίτηση. Η τελική φορολογική μεταχείριση και οι συμβατικοί όροι επιβεβαιώνονται πριν την ενεργοποίηση.",
    "",
    "ΚΟΝΤΑ ΜΟΥ"
  ].filter((line): line is string => typeof line === "string").join("\n");

  return sendTransactionalEmailBestEffort({
    to: input.to,
    subject,
    text,
    eventType: "vendor.application_received",
    idempotencyKey: `vendor-application-received:v3:${input.applicationId}:${input.idempotencySuffix ?? "initial"}`,
    payload: {
      applicationId: input.applicationId,
      tradingName: input.tradingName,
      planCode: input.plan.code,
      trial: Boolean(input.trialAccessUrl)
    }
  });
}

function formatAthensDate(value: number): string {
  return new Intl.DateTimeFormat("el-GR", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Europe/Athens"
  }).format(new Date(value));
}
