import { KONTA_MOY_EMAIL_COMPANY } from "@buy-local-sparta/resend-notifications";

export const LEGAL_LAST_UPDATED = "18 Σεπτεμβρίου 2026";
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
  },
  {
    name: "bls_driver_session",
    category: "necessary",
    purpose: "Διατηρεί την authenticated συνεδρία του Local Delivery Partner/οδηγού και προστατεύει τις λειτουργίες ανάθεσης, QR και live delivery.",
    duration: "Έως 12 ώρες ανά συνεδρία",
    whenSet: "Με επιτυχή σύνδεση οδηγού",
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
    activation: "Μόνο μετά από server-verified αποδοχή Analytics στο consent layer."
  },
  {
    name: "Vercel Speed Insights",
    provider: "Vercel",
    category: "analytics",
    technology: "Vercel Speed Insights / Web Vitals",
    purpose: "Μέτρηση τεχνικής απόδοσης και Core Web Vitals ώστε να εντοπίζουμε αργές ή προβληματικές εμπειρίες χρήσης.",
    data: "Τεχνικά δεδομένα απόδοσης και πλοήγησης της σελίδας. Δεν χρησιμοποιείται από το ΚΟΝΤΑ ΜΟΥ για advertising profile.",
    activation: "Μόνο μετά από server-verified αποδοχή Analytics στο consent layer."
  },
  {
    name: "Google Analytics 4",
    provider: "Google LLC",
    category: "analytics",
    technology: "Google tag (gtag.js) · Measurement ID G-NC8QWH2WTD",
    purpose: "Μέτρηση page views, πλοήγησης, engagement και απόδοσης του δημόσιου marketplace.",
    data: "Ψευδωνυμικά online identifiers και τεχνικά δεδομένα επίσκεψης/συσκευής που απαιτούνται για GA4 reporting. Δεν αποστέλλουμε στοιχεία πληρωμής και έχουμε απενεργοποιήσει Google signals και ad-personalisation signals στον tag configuration.",
    activation: "Δεν φορτώνεται πριν από server-verified αποδοχή Analytics. Δεν καταγράφει τα operational workspaces /admin, /vendor, /driver, /delivery/manage και /daily."
  }
] as const;

export const DATA_RECIPIENTS = [
  {
    name: "Mollie",
    purpose: "Διεκπεραίωση πληρωμής, επιβεβαίωση συναλλαγής, authorisation/capture, reconciliation και refund",
    data: "Ποσό, order/payment references και, όταν απαιτείται από τη μέθοδο πληρωμής, στοιχεία χρέωσης/αποστολής και γραμμές παραγγελίας"
  },
  {
    name: "Klarna ή άλλος payment-method provider όταν επιλεγεί",
    purpose: "Παροχή της συγκεκριμένης μεθόδου πληρωμής και δικοί της έλεγχοι επιλεξιμότητας/κινδύνου",
    data: "Τα στοιχεία που χρειάζεται η επιλεγμένη μέθοδος πληρωμής, μέσω της ασφαλούς payment flow, όπως στοιχεία χρέωσης, αποστολής, ποσό και γραμμές παραγγελίας"
  },
  {
    name: "Συνεργαζόμενα καταστήματα / fulfilment partners",
    purpose: "Προετοιμασία παραγγελίας, pickup, Ask Local απάντηση, επιστροφή ή άλλη συγκεκριμένη εργασία εξυπηρέτησης",
    data: "Μόνο τα στοιχεία προϊόντος, παραγγελίας και επικοινωνίας που χρειάζονται για τη συγκεκριμένη εργασία"
  },
  {
    name: "Συνεργαζόμενοι dropshipping / supplier-fulfilment προμηθευτές",
    purpose: "Εκτέλεση και αποστολή supplier-fulfilled προϊόντων όταν το order forwarding είναι ενεργό",
    data: "Γραμμές παραγγελίας, αναγνωριστικά προϊόντων και τα αναγκαία στοιχεία παραλήπτη/αποστολής για το συγκεκριμένο fulfilment"
  },
  {
    name: "Local Delivery Partners",
    purpose: "Τοπική παραλαβή, παράδοση, επιστροφή και live tracking ενεργής εργασίας",
    data: "Στοιχεία της ανατεθειμένης εργασίας και, όταν χρειάζεται για την εκτέλεση, όνομα/διεύθυνση/επικοινωνία παραλήπτη. Οι μη ανατεθειμένοι οδηγοί δεν βλέπουν την ακριβή διεύθυνση πελάτη."
  },
  {
    name: "BOX NOW",
    purpose: "Δημιουργία και εκτέλεση αποστολής σε locker",
    data: "Όνομα παραλήπτη, email, τηλέφωνο, locker προορισμού, αναφορά παραγγελίας και απαραίτητα στοιχεία δέματος"
  },
  {
    name: "ACS, DHL, DPD ή άλλος συνεργαζόμενος carrier",
    purpose: "Μεταφορά, παράδοση και tracking όταν χρησιμοποιείται η αντίστοιχη υπηρεσία",
    data: "Στοιχεία παραλήπτη, διεύθυνση ή σημείο παράδοσης, στοιχεία επικοινωνίας, αναφορά αποστολής και απαραίτητα στοιχεία δέματος"
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
  ["Παραλαβή από κατάστημα", "Το κατάστημα βλέπει την παραγγελία, τα είδη και ό,τι χρειάζεται για ασφαλή παραλαβή. Δεν χρειάζεται πλήρη διεύθυνση κατοικίας ή στοιχεία πληρωμής."],
  ["Ask Local", "Το κατάστημα στο οποίο δρομολογήθηκε το αίτημα βλέπει την περιγραφή, τις σχετικές διευκρινίσεις και, αν τις έστειλες, φωτογραφία/barcode ή transcript που χρειάζονται για να απαντήσει. Δεν αποκτά πρόσβαση σε άσχετο ιστορικό λογαριασμού."],
  ["Τοπική παράδοση", "Η ακριβής διεύθυνση πελάτη κρύβεται από μη ανατεθειμένες εργασίες. Ο ανατεθειμένος οδηγός τη λαμβάνει όταν τη χρειάζεται για να εκτελέσει την ενεργή παράδοση ή επιστροφή."],
  ["Supplier-fulfilled παραγγελία", "Ο συνεργαζόμενος προμηθευτής λαμβάνει μόνο όσα στοιχεία χρειάζονται για να εκτελέσει και να αποστείλει τα δικά του προϊόντα, όταν το forwarding της παραγγελίας είναι ενεργό."],
  ["Gift Card «Στο μαγαζί»", "Το συμμετέχον κατάστημα μπορεί να ελέγξει την εγκυρότητα/υπόλοιπο και να καταχωρίσει την εξαργύρωση, χωρίς να χρειάζεται πρόσβαση στο πλήρες ιστορικό του πελάτη."],
  ["Υποστήριξη", "Εξουσιοδοτημένοι χρήστες βλέπουν το ticket και μόνο το σχετικό marketplace context που χρειάζεται για να επιλυθεί το αίτημα."],
  ["Οικονομικά / φορολογικά", "Οι εξουσιοδοτημένοι ρόλοι βλέπουν στοιχεία συναλλαγής, refund και φορολογικά δεδομένα όπου απαιτείται, όχι άσχετο ιστορικό συνομιλιών ή marketing profile."],
  ["Analytics", "Χρησιμοποιούνται ψευδωνυμικά/συγκεντρωτικά δεδομένα μόνο όταν υπάρχει η απαιτούμενη επιλογή Analytics και δεν αποκαλύπτεται διεύθυνση, τηλέφωνο ή στοιχεία πληρωμής."]
] as const;
