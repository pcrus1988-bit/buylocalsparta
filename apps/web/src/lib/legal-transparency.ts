import { KONTA_MOY_EMAIL_COMPANY } from "@buy-local-sparta/resend-notifications";

export const LEGAL_LAST_UPDATED = "21 Αυγούστου 2026";
export const CONTROLLER = KONTA_MOY_EMAIL_COMPANY;

export type CookieCategory = "necessary" | "personalisation" | "analytics" | "marketing";

export type CookieRegistryEntry = Readonly<{
  name: string;
  category: CookieCategory;
  purpose: string;
  duration: string;
  whenSet: string;
  httpOnly: boolean;
  consentRequired: boolean;
}>;

export const COOKIE_REGISTRY: readonly CookieRegistryEntry[] = [
  {
    name: "bls_consent_v1",
    category: "necessary",
    purpose: "Αποθηκεύει την έκδοση και τις επιλογές συγκατάθεσης για προαιρετική προσωποποίηση, analytics και marketing ώστε να θυμόμαστε την επιλογή και να μπορεί να ανακληθεί.",
    duration: "180 ημέρες",
    whenSet: "Μετά από επιλογή στο banner ή στις Ρυθμίσεις cookies",
    httpOnly: false,
    consentRequired: false
  },
  {
    name: "bls_marketplace",
    category: "necessary",
    purpose: "Ψευδωνυμικό αναγνωριστικό πρώτου μέρους για αναγκαία συνέχεια marketplace, ασφάλεια/rate limiting και λειτουργίες δίκαιης ανάθεσης σε ροές καταστήματος, προϊόντος, καλαθιού, checkout, λογαριασμού και dashboards.",
    duration: "31 ημέρες",
    whenSet: "Μόνο σε λειτουργικές ροές που χρειάζονται διατηρήσιμη marketplace identity",
    httpOnly: true,
    consentRequired: false
  },
  {
    name: "bls_analytics",
    category: "analytics",
    purpose: "Ξεχωριστό ψευδωνυμικό αναγνωριστικό για μέτρηση page views, engagement και product performance. Δεν χρησιμοποιείται ως essential marketplace identity.",
    duration: "Έως 180 ημέρες, διαγράφεται αμέσως όταν ανακληθεί Analytics consent",
    whenSet: "Μόνο μετά από ρητή αποδοχή Analytics",
    httpOnly: true,
    consentRequired: true
  },
  {
    name: "bls_session",
    category: "necessary",
    purpose: "Διατηρεί την authenticated συνεδρία πελάτη και προστατεύει τις λειτουργίες λογαριασμού.",
    duration: "Έως 12 ώρες ανά συνεδρία",
    whenSet: "Με επιτυχή σύνδεση πελάτη",
    httpOnly: true,
    consentRequired: false
  },
  {
    name: "bls_vendor_session",
    category: "necessary",
    purpose: "Διατηρεί την authenticated συνεδρία συνεργαζόμενου καταστήματος.",
    duration: "Έως 8 ώρες ανά συνεδρία",
    whenSet: "Με επιτυχή σύνδεση Vendor",
    httpOnly: true,
    consentRequired: false
  },
  {
    name: "bls_admin_session",
    category: "necessary",
    purpose: "Διατηρεί την authenticated συνεδρία εξουσιοδοτημένου χρήστη διαχείρισης.",
    duration: "Έως 6 ώρες ανά συνεδρία",
    whenSet: "Με επιτυχή σύνδεση Admin",
    httpOnly: true,
    consentRequired: false
  },
  {
    name: "bls_daily_session",
    category: "necessary",
    purpose: "Διατηρεί την authenticated συνεδρία του περιορισμένου Vendor Daily workspace.",
    duration: "Έως 12 ώρες ανά συνεδρία",
    whenSet: "Με επιτυχή σύνδεση Daily",
    httpOnly: true,
    consentRequired: false
  }
] as const;

export const DATA_RECIPIENTS = [
  {
    name: "Viva.com",
    purpose: "Πληρωμή, επιβεβαίωση συναλλαγής, reconciliation και refund",
    data: "Όνομα όπου υπάρχει, email, τηλέφωνο, γλώσσα, ποσό και αναφορά παραγγελίας/συναλλαγής"
  },
  {
    name: "BOX NOW",
    purpose: "Δημιουργία και εκτέλεση αποστολής σε locker",
    data: "Όνομα παραλήπτη, email, τηλέφωνο, locker προορισμού, αναφορά παραγγελίας και απαραίτητα στοιχεία δέματος"
  },
  {
    name: "Resend",
    purpose: "Αποστολή και, όπου χρησιμοποιείται, λήψη transactional email",
    data: "Διεύθυνση email και περιεχόμενο/μεταδεδομένα της σχετικής επικοινωνίας"
  },
  {
    name: "AADE / myDATA",
    purpose: "Νόμιμη φορολογική διαβίβαση και τήρηση φορολογικού ίχνους",
    data: "Τα στοιχεία που απαιτούνται από την εκάστοτε φορολογική υποχρέωση"
  },
  {
    name: "Vercel / Supabase και τεχνική υποδομή",
    purpose: "Φιλοξενία εφαρμογής, βάσης δεδομένων, ασφάλεια, λειτουργία και αντίγραφα ασφαλείας",
    data: "Τα δεδομένα που είναι τεχνικά αναγκαία για τη συγκεκριμένη υπηρεσία, υπό συμβατικές και τεχνικές δικλίδες"
  }
] as const;

export const DATA_ACCESS_EXAMPLES = [
  ["Παραλαβή από κατάστημα", "Το κατάστημα βλέπει την παραγγελία, τα είδη και τα στοιχεία που χρειάζονται για ασφαλή παραλαβή. Δεν χρειάζεται πλήρη διεύθυνση κατοικίας ή στοιχεία πληρωμής."],
  ["Τοπική παράδοση από συνεργάτη", "Ο συνεργάτης λαμβάνει μόνο τα στοιχεία παραλήπτη/διεύθυνσης/επικοινωνίας που απαιτούνται για τη συγκεκριμένη παράδοση."],
  ["BOX NOW", "Το ΚΟΝΤΑ ΜΟΥ διαβιβάζει απευθείας στον πάροχο τα απαραίτητα στοιχεία παραλήπτη και locker για την αποστολή."],
  ["Υποστήριξη", "Εξουσιοδοτημένοι χρήστες βλέπουν μόνο τα στοιχεία λογαριασμού, παραγγελίας και επικοινωνίας που χρειάζονται για το αίτημα."],
  ["Οικονομικά / φορολογικά", "Οι εξουσιοδοτημένοι ρόλοι βλέπουν στοιχεία συναλλαγής, refund και φορολογικά δεδομένα όπου απαιτείται, όχι άσχετο ιστορικό συνομιλιών ή marketing profile."],
  ["Analytics", "Χρησιμοποιούνται ψευδωνυμικά/συγκεντρωτικά δεδομένα μόνο όταν υπάρχει η απαιτούμενη επιλογή Analytics και δεν αποκαλύπτεται διεύθυνση, τηλέφωνο ή στοιχεία πληρωμής."]
] as const;
