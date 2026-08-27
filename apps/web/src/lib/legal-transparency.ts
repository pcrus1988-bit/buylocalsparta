import { KONTA_MOY_EMAIL_COMPANY } from "@buy-local-sparta/resend-notifications";

export const LEGAL_LAST_UPDATED = "28 Αυγούστου 2026";
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

export type TrackerRegistryEntry = Readonly<{
  name: string;
  provider: string;
  category: CookieCategory;
  technology: string;
  purpose: string;
  data: string;
  activation: string;
}>;

export const COOKIE_REGISTRY: readonly CookieRegistryEntry[] = [
  {
    name: "bls_consent_v1",
    category: "necessary",
    purpose: "Αποθηκεύει την έκδοση και τις επιλογές συγκατάθεσης ώστε να θυμόμαστε την επιλογή και να μπορεί να ανακληθεί.",
    duration: "180 ημέρες",
    whenSet: "Μετά από επιλογή στο banner ή στις Ρυθμίσεις cookies",
    httpOnly: false,
    consentRequired: false
  },
  {
    name: "bls_consent_receipt",
    category: "necessary",
    purpose: "Υπογεγραμμένη HttpOnly απόδειξη της ίδιας επιλογής. Επιτρέπει στον server να επαληθεύει ότι προαιρετικό analytics ενεργοποιήθηκε μέσω του consent flow και όχι επειδή τροποποιήθηκε χειροκίνητα ένα browser cookie.",
    duration: "180 ημέρες",
    whenSet: "Μαζί με κάθε αποδοχή, απόρριψη ή αποθήκευση επιλογών",
    httpOnly: true,
    consentRequired: false
  },
  {
    name: "bls_marketplace",
    category: "necessary",
    purpose: "Ψευδωνυμικό first-party αναγνωριστικό για συνέχεια της ενεργής marketplace συνεδρίας, ασφάλεια/rate limiting και συνεπή δίκαιη ανάθεση προσφοράς. Δεν χρησιμοποιείται για analytics ή advertising.",
    duration: "Μόνο για τη συνεδρία κατά τη δημόσια ανακάλυψη· έως 31 ημέρες όταν ο χρήστης εισέρχεται σε cart/checkout, authentication ή εξουσιοδοτημένο operational workspace",
    whenSet: "Ως session cookie σε ροές καταστήματος/προϊόντος/Ask Local/συμβουλής ή API continuity· με 31ήμερη διάρκεια μόνο σε transactional ή authenticated ροές",
    httpOnly: true,
    consentRequired: false
  },
  {
    name: "bls_analytics",
    category: "analytics",
    purpose: "Ξεχωριστό ψευδωνυμικό first-party αναγνωριστικό για μέτρηση page views, engagement και product performance. Δεν χρησιμοποιείται ως essential marketplace identity.",
    duration: "Έως 180 ημέρες, διαγράφεται αμέσως όταν ανακληθεί Analytics consent",
    whenSet: "Μόνο μετά από ρητή αποδοχή Analytics και έγκυρη υπογεγραμμένη consent receipt",
    httpOnly: true,
    consentRequired: true
  },
  {
    name: "_ga",
    category: "analytics",
    purpose: "Google Analytics 4 first-party cookie για διάκριση ψευδωνυμικών επισκέψεων και βασική μέτρηση χρήσης του δημόσιου marketplace.",
    duration: "Έως 2 έτη σύμφωνα με τη ρύθμιση του Google Analytics",
    whenSet: "Μόνο αφού ο επισκέπτης αποδεχθεί Analytics",
    httpOnly: false,
    consentRequired: true
  },
  {
    name: "_ga_<container-id>",
    category: "analytics",
    purpose: "Google Analytics 4 first-party cookie που διατηρεί την κατάσταση της συγκεκριμένης GA4 ιδιοκτησίας/ροής μέτρησης.",
    duration: "Έως 2 έτη σύμφωνα με τη ρύθμιση του Google Analytics",
    whenSet: "Μόνο αφού ο επισκέπτης αποδεχθεί Analytics",
    httpOnly: false,
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

export const TRACKER_REGISTRY: readonly TrackerRegistryEntry[] = [
  {
    name: "Product analytics events",
    provider: "ΚΟΝΤΑ ΜΟΥ · first party",
    category: "analytics",
    technology: "First-party HTTP event capture + bls_analytics pseudonymous identifier",
    purpose: "Μέτρηση page views, engagement και add-to-cart/product performance.",
    data: "Ψευδωνυμικό analytics hash, product/offer references, surface και περιορισμένο engagement metadata. Όχι όνομα, email, τηλέφωνο, διεύθυνση ή στοιχεία πληρωμής.",
    activation: "Μόνο όταν το browser preference επιτρέπει Analytics και ο server επαληθεύσει έγκυρη HttpOnly υπογεγραμμένη consent receipt."
  },
  {
    name: "Vercel Analytics",
    provider: "Vercel",
    category: "analytics",
    technology: "Vercel Web Analytics",
    purpose: "Συγκεντρωτική μέτρηση επισκεψιμότητας και απόδοσης του web application.",
    data: "Τεχνικά και συγκεντρωτικά δεδομένα επίσκεψης/σελίδας όπως παρέχονται από το Vercel Analytics. Δεν χρησιμοποιείται από το ΚΟΝΤΑ ΜΟΥ για advertising profile.",
    activation: "Μόνο μετά από αποδοχή Analytics στο consent layer."
  },
  {
    name: "Google Analytics 4",
    provider: "Google LLC",
    category: "analytics",
    technology: "Google tag (gtag.js) · Measurement ID G-NC8QWH2WTD",
    purpose: "Μέτρηση page views, πλοήγησης, engagement και απόδοσης του δημόσιου marketplace.",
    data: "Ψευδωνυμικά online identifiers και τεχνικά δεδομένα επίσκεψης/συσκευής που απαιτούνται για GA4 reporting. Δεν αποστέλλουμε στοιχεία πληρωμής και έχουμε απενεργοποιήσει Google signals και ad-personalisation signals στον tag configuration.",
    activation: "Δεν φορτώνεται πριν από αποδοχή Analytics. Δεν καταγράφει τα operational workspaces /admin, /vendor, /driver, /delivery/manage και /daily."
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
    name: "Google Analytics",
    purpose: "Μέτρηση επισκεψιμότητας, πλοήγησης και engagement μετά από προαιρετική συγκατάθεση Analytics",
    data: "Ψευδωνυμικά online identifiers και τεχνικά δεδομένα χρήσης/συσκευής που απαιτούνται για GA4 reporting· όχι στοιχεία πληρωμής"
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
