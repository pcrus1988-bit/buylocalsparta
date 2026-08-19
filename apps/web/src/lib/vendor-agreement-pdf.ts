export type VendorAgreementPdfData = Readonly<{
  agreementCode: string;
  agreementVersion: number;
  createdAt: string;
  startsAt: string;
  endsAt?: string;
  vendor: Readonly<{
    legalName: string;
    tradingName?: string;
    legalForm?: string;
    taxNumber?: string;
    taxOffice?: string;
    gemiNumber?: string;
    registeredAddress?: string;
    shopAddress?: string;
    legalRepresentative?: string;
    contactEmail?: string;
    phone?: string;
    iban?: string;
    bankBeneficiary?: string;
    categories?: string;
  }>;
  commercial: Readonly<{
    planName?: string;
    listingFeeMinor?: number;
    recurringFeeMinor?: number;
    recurringFeePeriod?: string;
    commissionRateBps: number;
    commissionTaxMode: string;
    commissionTaxRateBps: number;
    commissionBase?: string;
    settlementTerms?: string;
    paymentProcessingTerms?: string;
    contractTerm?: string;
    autoRenewal?: string;
    terminationNoticeDays?: number;
    specialCommercialTerms?: string;
    orderAcceptanceSla?: string;
    fulfilmentSla?: string;
    pickupShippingMethods?: string;
    stockFreshnessRequirement?: string;
    supportSla?: string;
  }>;
  govgrReference?: string;
}>;

export const KONTA_MOY_LEGAL_DETAILS = Object.freeze({
  legalName: "SP BUSINESS LAB – ΠΟΛΙΑΚΟΦ ΣΤΑΝΙΣΛΑΒ",
  brand: "KONTA MOY",
  website: "www.kontamou.site",
  taxNumber: "182294894",
  gemiNumber: "193836403000",
  gemiStatus: "Ενεργή",
  gemiAuthority: "ΕΠΑΓΓΕΛΜΑΤΙΚΟ ΕΠΙΜΕΛΗΤΗΡΙΟ ΑΘΗΝΑΣ",
  address: "Αστυπαλαίας 32, 11256 Αθήνα",
  email: "info@kontamou.site",
  phone: "6936999686",
  representative: "Πολιάκοφ Στανισλάβ"
});

function value(input: unknown, fallback = "—"): string {
  if (input == null) return fallback;
  const result = String(input).trim();
  return result || fallback;
}

function date(valueInput?: string): string {
  if (!valueInput) return "—";
  const parsed = new Date(valueInput);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleDateString("el-GR") : valueInput;
}

function euro(minor?: number): string {
  if (minor == null) return "—";
  return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100);
}

function percentage(bps: number): string {
  return `${(bps / 100).toLocaleString("el-GR", { maximumFractionDigits: 2 })}%`;
}

function periodLabel(period?: string): string {
  if (period === "month") return "μηνιαίως";
  if (period === "year") return "ετησίως";
  if (period === "term") return "ανά συμφωνημένη περίοδο";
  return "—";
}

function taxModeLabel(mode: string): string {
  if (mode === "plus_vat") return "πλέον ΦΠΑ";
  if (mode === "none") return "χωρίς ΦΠΑ";
  return "με ΦΠΑ εντός της συμφωνημένης προμήθειας";
}

function article(title: string, paragraphs: string[]): unknown[] {
  return [
    { text: title, style: "articleTitle", margin: [0, 11, 0, 4] },
    ...paragraphs.map((text) => ({ text, style: "body", margin: [0, 0, 0, 4] }))
  ];
}

export function buildVendorAgreementDocument(data: VendorAgreementPdfData): Record<string, unknown> {
  const vendor = data.vendor;
  const commercial = data.commercial;
  const agreementReference = value(data.govgrReference, "ΕΚΚΡΕΜΕΙ – συμπληρώνεται μετά τη συνυπογραφή");
  const noticeDays = commercial.terminationNoticeDays == null ? "όπως συμφωνείται στο Παράρτημα Α" : `${commercial.terminationNoticeDays} ημερών`;

  const content: unknown[] = [
    { text: "ΣΥΜΒΑΣΗ ΣΥΝΕΡΓΑΣΙΑΣ ΕΜΠΟΡΙΚΟΥ ΣΥΝΕΡΓΑΤΗ", style: "title" },
    { text: "ΠΛΑΤΦΟΡΜΑ KONTA MOY", style: "subtitle", margin: [0, 2, 0, 14] },
    {
      table: {
        widths: [150, "*"],
        body: [
          ["Κωδικός Συμφωνίας", data.agreementCode],
          ["Έκδοση", `v${data.agreementVersion}`],
          ["Ημερομηνία δημιουργίας", date(data.createdAt)],
          ["Ημερομηνία έναρξης", date(data.startsAt)],
          ["Reference gov.gr", agreementReference]
        ]
      },
      layout: "lightHorizontalLines",
      margin: [0, 0, 0, 14]
    },
    { text: "ΣΥΜΒΑΛΛΟΜΕΝΑ ΜΕΡΗ", style: "heading" },
    { text: "Α. SP BUSINESS LAB / KONTA MOY", style: "partyTitle" },
    {
      ul: [
        `Επωνυμία: ${KONTA_MOY_LEGAL_DETAILS.legalName}`,
        `Εμπορική πλατφόρμα: ${KONTA_MOY_LEGAL_DETAILS.brand}`,
        `Ιστότοπος: ${KONTA_MOY_LEGAL_DETAILS.website}`,
        `Α.Φ.Μ.: ${KONTA_MOY_LEGAL_DETAILS.taxNumber}`,
        `Αρ. Γ.Ε.ΜΗ.: ${KONTA_MOY_LEGAL_DETAILS.gemiNumber}`,
        `Κατάσταση Γ.Ε.ΜΗ.: ${KONTA_MOY_LEGAL_DETAILS.gemiStatus}`,
        `Αρμόδια Υπηρεσία Γ.Ε.ΜΗ.: ${KONTA_MOY_LEGAL_DETAILS.gemiAuthority}`,
        `Διεύθυνση: ${KONTA_MOY_LEGAL_DETAILS.address}`,
        `Email: ${KONTA_MOY_LEGAL_DETAILS.email}`,
        `Τηλέφωνο: ${KONTA_MOY_LEGAL_DETAILS.phone}`,
        `Νόμιμος εκπρόσωπος: ${KONTA_MOY_LEGAL_DETAILS.representative}`
      ],
      style: "body"
    },
    { text: "Β. Εμπορικός Συνεργάτης", style: "partyTitle", margin: [0, 9, 0, 3] },
    {
      ul: [
        `Επωνυμία / Ονοματεπώνυμο: ${value(vendor.legalName)}`,
        `Διακριτικός τίτλος: ${value(vendor.tradingName)}`,
        `Νομική μορφή: ${value(vendor.legalForm)}`,
        `Α.Φ.Μ.: ${value(vendor.taxNumber)}`,
        `Δ.Ο.Υ.: ${value(vendor.taxOffice)}`,
        `Αρ. Γ.Ε.ΜΗ.: ${value(vendor.gemiNumber)}`,
        `Έδρα: ${value(vendor.registeredAddress)}`,
        `Διεύθυνση καταστήματος: ${value(vendor.shopAddress)}`,
        `Νόμιμος εκπρόσωπος: ${value(vendor.legalRepresentative)}`,
        `Email: ${value(vendor.contactEmail)}`,
        `Τηλέφωνο: ${value(vendor.phone)}`,
        `IBAN πληρωμών: ${value(vendor.iban)}`,
        `Δικαιούχος λογαριασμού: ${value(vendor.bankBeneficiary)}`
      ],
      style: "body"
    },
    { text: "ΠΡΟΟΙΜΙΟ", style: "heading", margin: [0, 12, 0, 5] },
    { text: "Η KONTA MOY λειτουργεί ψηφιακή εμπορική πλατφόρμα με σκοπό την προβολή, προώθηση, διάθεση και εμπορική αξιοποίηση προϊόντων επιχειρήσεων, με έμφαση στην τοπική αγορά, στη διαφάνεια, στην ανθρώπινη εξυπηρέτηση, στη δίκαιη παρουσίαση των συνεργαζόμενων επιχειρήσεων και στην αξιόπιστη εξυπηρέτηση του τελικού καταναλωτή. Ο Συνεργάτης δηλώνει ότι ασκεί νόμιμα εμπορική δραστηριότητα και επιθυμεί να συμμετέχει στην πλατφόρμα KONTA MOY υπό τους όρους της παρούσας.", style: "body" },

    ...article("ΑΡΘΡΟ 1 – ΟΡΙΣΜΟΙ", [
      "Για τους σκοπούς της παρούσας, «Πλατφόρμα» σημαίνει την ηλεκτρονική πλατφόρμα KONTA MOY και κάθε σχετικό web application, vendor portal, admin interface ή συναφή ηλεκτρονική υπηρεσία. «Συνεργάτης» ή «Προμηθευτής» σημαίνει την επιχείρηση που συμβάλλεται με την KONTA MOY. «Προϊόν» σημαίνει κάθε αγαθό που έχει εγκριθεί προς διάθεση μέσω της Πλατφόρμας. «Παραγγελία» σημαίνει επιβεβαιωμένη συναλλαγή που αφορά προϊόν ή προϊόντα του Συνεργάτη.",
      "«Καθαρή Αξία Πωλήσεων» και «Προμήθεια» έχουν την έννοια και τη βάση υπολογισμού που ορίζονται στο Παράρτημα Α. «Υπογεγραμμένη Συμφωνία» σημαίνει την παρούσα μετά την ολοκλήρωση της ψηφιακής συνυπογραφής/βεβαίωσης μέσω gov.gr και την απόδοση σχετικού κωδικού επαλήθευσης."
    ]),
    ...article("ΑΡΘΡΟ 2 – ΑΝΤΙΚΕΙΜΕΝΟ ΤΗΣ ΣΥΝΕΡΓΑΣΙΑΣ", [
      "Ο Συνεργάτης αναθέτει στην KONTA MOY, στο πλαίσιο των υπηρεσιών της, την προβολή, εμπορική παρουσίαση, διαχείριση και προώθηση των εγκεκριμένων προϊόντων και του καταστήματός του μέσω της Πλατφόρμας.",
      "Η KONTA MOY δύναται να παρέχει ηλεκτρονική παρουσία καταστήματος και προϊόντων, διαχείριση καταλόγου, αναζήτηση και κατηγοριοποίηση, λήψη και διαχείριση παραγγελιών, υπηρεσίες πληρωμών μέσω συνεργαζόμενων παρόχων, τοπική παραλαβή ή αποστολή, εξυπηρέτηση πελατών, analytics και reports, εργαλεία επικοινωνίας, διαχείριση αποθέματος, marketing και διαχείριση επιστροφών/refunds. Η συνεργασία δεν είναι αποκλειστική εκτός εάν συμφωνηθεί ρητά διαφορετικά."
    ]),
    ...article("ΑΡΘΡΟ 3 – ΠΡΟΫΠΟΘΕΣΗ ΕΝΕΡΓΟΠΟΙΗΣΗΣ ΤΟΥ ΣΥΝΕΡΓΑΤΗ", [
      "Η δημιουργία vendor account, η καταχώριση στοιχείων ή η δημιουργία της παρούσας συμφωνίας δεν συνεπάγεται ενεργοποίηση του καταστήματος.",
      "Η ενεργοποίηση τελεί υπό την προϋπόθεση ολοκλήρωσης του ελέγχου εταιρικών/φορολογικών στοιχείων, στοιχείων πληρωμών, αποδοχής οικονομικών όρων, δημιουργίας του τελικού PDF, ψηφιακής συνυπογραφής από αμφότερα τα Μέρη μέσω gov.gr, αποθήκευσης του τελικού υπογεγραμμένου PDF, καταχώρισης του Reference/Κωδικού επαλήθευσης gov.gr και ρητής επαλήθευσής του από εξουσιοδοτημένο διαχειριστή της KONTA MOY.",
      "Μέχρι την ολοκλήρωση των ανωτέρω ο Συνεργάτης παραμένει μη ενεργός και δεν επιτρέπεται εμπορική ενεργοποίηση του καταστήματος. Η ενεργοποίηση καταγράφεται ηλεκτρονικά και αποτελεί την έναρξη της εμπορικής συνεργασίας, εκτός αν ορίζεται διαφορετικά στο Παράρτημα Α."
    ]),
    ...article("ΑΡΘΡΟ 4 – ΔΗΛΩΣΕΙΣ ΚΑΙ ΣΤΟΙΧΕΙΑ ΤΟΥ ΣΥΝΕΡΓΑΤΗ", [
      "Ο Συνεργάτης δηλώνει ότι όλα τα στοιχεία που παρέχει είναι ακριβή, πλήρη και επίκαιρα, ότι ασκεί νόμιμα τη δραστηριότητά του και διαθέτει όλες τις άδειες, εγκρίσεις και δικαιώματα που απαιτούνται για τα προϊόντα που διαθέτει.",
      "Ο Συνεργάτης ενημερώνει χωρίς αδικαιολόγητη καθυστέρηση την KONTA MOY για κάθε αλλαγή σε ΑΦΜ, ΓΕΜΗ, έδρα, νόμιμο εκπρόσωπο, στοιχεία πληρωμών ή άλλα κρίσιμα στοιχεία και δεν καταχωρεί πλαστά, παράνομα, μη ασφαλή, ανακληθέντα ή μη συμμορφούμενα προϊόντα."
    ]),
    ...article("ΑΡΘΡΟ 5 – ΕΜΠΟΡΙΚΟ ΜΟΝΤΕΛΟ ΚΑΙ ΠΩΛΗΣΕΙΣ", [
      "Για τους σκοπούς του παρόντος προτύπου, η KONTA MOY λειτουργεί ως εμπορικό σημείο συναλλαγής προς τον τελικό καταναλωτή και ο Συνεργάτης ως προμηθευτής και συνεργάτης εκπλήρωσης των σχετικών παραγγελιών, σύμφωνα με τους ειδικότερους οικονομικούς και φορολογικούς όρους του Παραρτήματος Α.",
      "Ο Συνεργάτης υποχρεούται να εκδίδει προς την SP BUSINESS LAB τα νόμιμα παραστατικά που αντιστοιχούν στις συναλλαγές μεταξύ των Μερών. Οι λεπτομέρειες invoicing, VAT, settlement και τυχόν παρακρατήσεων καθορίζονται στο Παράρτημα Α και εφαρμόζονται πάντοτε σύμφωνα με την εκάστοτε ισχύουσα νομοθεσία."
    ]),
    ...article("ΑΡΘΡΟ 6 – ΚΑΤΑΛΟΓΟΣ, ΠΡΟΪΟΝΤΑ ΚΑΙ ΠΕΡΙΕΧΟΜΕΝΟ", [
      "Η KONTA MOY δύναται να οργανώνει τα προϊόντα σε ενιαίο κατάλογο, κατηγορίες, υποκατηγορίες, παραλλαγές, μάρκες και λοιπές ταξινομήσεις και να διορθώνει μορφοποίηση, κατηγοριοποίηση ή τεχνικά στοιχεία για λόγους συνέπειας χωρίς να αλλοιώνει ουσιώδη χαρακτηριστικά.",
      "Εφόσον το ίδιο προϊόν παρέχεται από περισσότερους Συνεργάτες, δύναται να εμφανίζεται ως ενιαίο προϊόν με περισσότερες πηγές εφοδιασμού. Δεν παρέχεται εγγύηση συγκεκριμένου αριθμού εμφανίσεων, επισκέψεων, παραγγελιών ή κύκλου εργασιών. Ο Συνεργάτης παρέχει μη αποκλειστική άδεια χρήσης των σημάτων, εικόνων και πληροφοριών που παραδίδει αποκλειστικά για τη λειτουργία και προώθηση της συνεργασίας."
    ]),
    ...article("ΑΡΘΡΟ 7 – ΤΙΜΕΣ ΚΑΙ ΑΠΟΘΕΜΑ", [
      "Ο Συνεργάτης παρέχει ακριβείς και επίκαιρες τιμές και πληροφορίες διαθεσιμότητας. Δεν επιτρέπεται σκόπιμη παρουσίαση ανύπαρκτου αποθέματος ή παραπλανητικής τιμής. Το απόθεμα ενημερώνεται άμεσα ή μέσω διαθέσιμου μηχανισμού συγχρονισμού. Ειδικές συμφωνίες τιμολόγησης ή προωθητικές ενέργειες συμφωνούνται ξεχωριστά."
    ]),
    ...article("ΑΡΘΡΟ 8 – ΑΝΑΘΕΣΗ ΚΑΙ ΕΚΤΕΛΕΣΗ ΠΑΡΑΓΓΕΛΙΩΝ", [
      "Η KONTA MOY δύναται να χρησιμοποιεί μηχανισμούς δίκαιης ανάθεσης παραγγελιών μεταξύ επιλέξιμων Συνεργατών, λαμβάνοντας υπόψη διαθεσιμότητα, ακρίβεια αποθέματος, γεωγραφία, δυνατότητα εκπλήρωσης, ποιότητα εξυπηρέτησης, ιστορικό αναθέσεων και αρχές δίκαιης κατανομής.",
      "Η συμμετοχή δεν παρέχει αποκλειστικό δικαίωμα εκτέλεσης παραγγελίας. Ο Συνεργάτης εκτελεί ανατεθείσες παραγγελίες εντός των SLA του Παραρτήματος Γ. Σε αδυναμία εκπλήρωσης, η KONTA MOY δύναται να αναθέσει την παραγγελία σε άλλο επιλέξιμο συνεργάτη."
    ]),
    ...article("ΑΡΘΡΟ 9 – ΟΙΚΟΝΟΜΙΚΟΙ ΟΡΟΙ ΚΑΙ ΠΡΟΜΗΘΕΙΑ", [
      `Οι οικονομικοί όροι της συνεργασίας αποτυπώνονται στο Παράρτημα Α. Η συμφωνημένη προμήθεια είναι ${percentage(commercial.commissionRateBps)} (${taxModeLabel(commercial.commissionTaxMode)}).`,
      "Ακυρωμένες ή πλήρως επιστραφείσες συναλλαγές δεν δημιουργούν οριστική προμήθεια, εκτός από τυχόν μη ανακτήσιμα έξοδα που έχουν συμφωνηθεί. Σε μερική επιστροφή πραγματοποιείται αντίστοιχος αναλογικός αντιλογισμός. Η KONTA MOY παρέχει κατάσταση εκκαθάρισης με πωλήσεις, επιστροφές, προμήθειες και λοιπές χρεώσεις."
    ]),
    ...article("ΑΡΘΡΟ 10 – ΠΛΗΡΩΜΕΣ ΚΑΙ ΕΚΚΑΘΑΡΙΣΕΙΣ", [
      "Οι πληρωμές του Συνεργάτη πραγματοποιούνται στον δηλωμένο και επαληθευμένο τραπεζικό λογαριασμό. Ο Συνεργάτης ευθύνεται για την ορθότητα του IBAN και των στοιχείων δικαιούχου.",
      "Η KONTA MOY δύναται να συμψηφίζει νόμιμες και ληξιπρόθεσμες απαιτήσεις που προκύπτουν από προμήθειες, συνδρομές, refunds, chargebacks, διορθώσεις συναλλαγών και λοιπές συμβατικά συμφωνημένες χρεώσεις. Κάθε settlement αποτυπώνεται σε αναλυτική κατάσταση."
    ]),
    ...article("ΑΡΘΡΟ 11 – ΑΚΥΡΩΣΕΙΣ, ΕΠΙΣΤΡΟΦΕΣ ΚΑΙ ΕΛΑΤΤΩΜΑΤΙΚΑ ΠΡΟΪΟΝΤΑ", [
      "Ο Συνεργάτης συνεργάζεται πλήρως με την KONTA MOY για την εφαρμογή της εκάστοτε ισχύουσας νομοθεσίας προστασίας καταναλωτή και ευθύνεται για πραγματικά ελαττώματα, έλλειψη συμφωνημένων ιδιοτήτων ή παραβίαση υποχρεώσεων που αποδίδονται στο προϊόν ή στην εκπλήρωση από τον ίδιο.",
      "Οι οικονομικές επιπτώσεις επιστροφών ή refunds αποτυπώνονται στην επόμενη διαθέσιμη εκκαθάριση. Προϊόντα με κίνδυνο ασφαλείας μπορούν να ανασταλούν άμεσα."
    ]),
    ...article("ΑΡΘΡΟ 12 – ΑΣΦΑΛΕΙΑ ΠΡΟΪΟΝΤΩΝ ΚΑΙ ΣΥΜΜΟΡΦΩΣΗ", [
      "Ο Συνεργάτης διαθέτει αποκλειστικά προϊόντα που μπορούν νόμιμα να κυκλοφορούν στην ελληνική και ενωσιακή αγορά. Όπου απαιτείται παρέχει στοιχεία κατασκευαστή/εισαγωγέα/υπεύθυνου οικονομικού φορέα, σήμανση CE, οδηγίες, προειδοποιήσεις, σειριακούς αριθμούς, GTIN/EAN/ISBN και κάθε άλλη υποχρεωτική πληροφορία.",
      "Σε ανάκληση, safety notice ή άλλο περιστατικό συμμόρφωσης ενημερώνει αμέσως την KONTA MOY. Η KONTA MOY δύναται να αναστείλει προϊόν, να παγώσει σχετικές παραγγελίες, να ζητήσει αποδεικτικά συμμόρφωσης ή να προχωρήσει σε ελεγχόμενη ανάκληση."
    ]),
    ...article("ΑΡΘΡΟ 13 – ΠΡΟΒΟΛΗ, ΚΑΤΑΤΑΞΗ ΚΑΙ ΑΡΧΕΣ ΔΙΚΑΙΟΣΥΝΗΣ", [
      "Η KONTA MOY εφαρμόζει κανόνες κατάταξης και ανάθεσης με σκοπό τη συνάφεια, τη διαθεσιμότητα, την ποιότητα εξυπηρέτησης και τη δίκαιη μεταχείριση των Συνεργατών. Η κατάταξη δύναται να επηρεάζεται από συνάφεια αναζήτησης, πραγματική διαθεσιμότητα, γεωγραφική καταλληλότητα, ποιότητα δεδομένων, αξιοπιστία εκπλήρωσης, freshness αποθέματος, προηγούμενη έκθεση και μηχανισμούς fairness.",
      "Η καταβολή προμήθειας δεν δημιουργεί αυτομάτως δικαίωμα προνομιακής οργανικής κατάταξης, εκτός εάν πρόκειται για σαφώς αναγνωρίσιμη διαφημιστική υπηρεσία."
    ]),
    ...article("ΑΡΘΡΟ 14 – ΕΞΥΠΗΡΕΤΗΣΗ ΠΕΛΑΤΩΝ", [
      "Ο Συνεργάτης συνεργάζεται με την KONTA MOY για την έγκαιρη επίλυση ερωτημάτων και παραπόνων και παρέχει ακριβείς απαντήσεις σχετικά με προϊόντα, διαθεσιμότητα και εκπλήρωση. Η επικοινωνία δύναται να πραγματοποιείται μέσω Vendor Portal, email, τηλεφώνου ή άλλου δηλωμένου καναλιού."
    ]),
    ...article("ΑΡΘΡΟ 15 – ΠΡΟΣΩΠΙΚΑ ΔΕΔΟΜΕΝΑ", [
      "Τα Μέρη συμμορφώνονται με τον Γενικό Κανονισμό Προστασίας Δεδομένων και την εφαρμοζόμενη ελληνική νομοθεσία. Κάθε Μέρος ενεργεί ως αυτοτελώς υπεύθυνος επεξεργασίας για τις επεξεργασίες που πραγματοποιεί για δικούς του σκοπούς.",
      "Στον Συνεργάτη παρέχονται μόνο δεδομένα πελατών που είναι εύλογα αναγκαία για εκτέλεση παραγγελίας ή άλλη νόμιμη λειτουργία και δεν επιτρέπεται ανεξάρτητο marketing χωρίς χωριστή νόμιμη βάση. Όπου απαιτείται, εφαρμόζεται ειδικό Data Processing Agreement."
    ]),
    ...article("ΑΡΘΡΟ 16 – ΕΜΠΙΣΤΕΥΤΙΚΟΤΗΤΑ", [
      "Κάθε Μέρος διατηρεί εμπιστευτικές οικονομικές, εμπορικές, τεχνικές και επιχειρηματικές πληροφορίες που λαμβάνει στο πλαίσιο της συνεργασίας και δεν τις γνωστοποιεί σε τρίτους χωρίς νόμιμη αιτία. Η υποχρέωση εξακολουθεί να ισχύει και μετά τη λήξη της συνεργασίας."
    ]),
    ...article("ΑΡΘΡΟ 17 – ΠΡΟΣΒΑΣΗ ΚΑΙ ΑΣΦΑΛΕΙΑ ΛΟΓΑΡΙΑΣΜΟΥ", [
      "Τα credentials του Vendor Portal είναι προσωπικά και δεν κοινοποιούνται σε μη εξουσιοδοτημένα πρόσωπα. Ο Συνεργάτης ευθύνεται για τις ενέργειες των χρηστών που έχει εξουσιοδοτήσει. Η KONTA MOY δύναται να διατηρεί audit logs σημαντικών ενεργειών για ασφάλεια, οικονομικό έλεγχο και συμμόρφωση."
    ]),
    ...article("ΑΡΘΡΟ 18 – ΔΙΑΡΚΕΙΑ", [
      `Η συμφωνία αρχίζει την ${date(data.startsAt)}. Αρχική διάρκεια: ${value(commercial.contractTerm)}. Αυτόματη ανανέωση: ${value(commercial.autoRenewal)}. Η τυχόν ημερομηνία λήξης που έχει καταχωριστεί είναι ${date(data.endsAt)}. Οι ειδικότεροι όροι ανανέωσης καθορίζονται στο Παράρτημα Α.`
    ]),
    ...article("ΑΡΘΡΟ 19 – ΑΝΑΣΤΟΛΗ, ΑΠΕΝΕΡΓΟΠΟΙΗΣΗ ΚΑΙ ΚΑΤΑΓΓΕΛΙΑ", [
      "Η KONTA MOY δύναται να αναστείλει συγκεκριμένο προϊόν ή λειτουργία όταν υπάρχει τεκμηριωμένος λόγος. Άμεση προσωρινή αναστολή δύναται να πραγματοποιηθεί ιδίως σε περίπτωση παρανομίας, απάτης, παραποίησης στοιχείων, κινδύνου για καταναλωτές, πλαστών προϊόντων, σοβαρού cybersecurity incident, σοβαρής παραβίασης προσωπικών δεδομένων ή επανειλημμένης αδυναμίας εκπλήρωσης.",
      `Για συνήθη καταγγελία της εμπορικής σχέσης εφαρμόζεται προειδοποίηση ${noticeDays}, εκτός εάν συντρέχει λόγος άμεσης καταγγελίας. Ο Συνεργάτης δύναται να ζητήσει επανεξέταση απόφασης αναστολής ή απενεργοποίησης. Μετά τη λήξη διεκπεραιώνονται οι εκκρεμείς οικονομικές υποχρεώσεις και επιστροφές.`
    ]),
    ...article("ΑΡΘΡΟ 20 – ΕΥΘΥΝΗ", [
      "Κάθε Μέρος ευθύνεται για ζημία που προκαλείται από δική του υπαίτια παραβίαση συμβατικών ή νόμιμων υποχρεώσεων. Ο Συνεργάτης ευθύνεται ιδίως για τη νομιμότητα και αυθεντικότητα προϊόντων, την ακρίβεια πληροφοριών, τη συμμόρφωση και ασφάλεια προϊόντων, την πραγματική διαθεσιμότητα, την ορθή συσκευασία και πλημμελή εκπλήρωση που οφείλεται στον ίδιο. Καμία διάταξη δεν αποκλείει ευθύνη που δεν μπορεί νομίμως να αποκλειστεί."
    ]),
    ...article("ΑΡΘΡΟ 21 – ΑΝΩΤΕΡΑ ΒΙΑ", [
      "Κανένα Μέρος δεν ευθύνεται για καθυστέρηση ή αδυναμία εκπλήρωσης στον βαθμό που αυτή οφείλεται σε γεγονός ανωτέρας βίας, εφόσον ενημερώνει το άλλο Μέρος χωρίς αδικαιολόγητη καθυστέρηση και λαμβάνει εύλογα μέτρα περιορισμού των συνεπειών."
    ]),
    ...article("ΑΡΘΡΟ 22 – ΕΠΙΚΟΙΝΩΝΙΕΣ", [
      `Για την KONTA MOY: ${KONTA_MOY_LEGAL_DETAILS.email}, ${KONTA_MOY_LEGAL_DETAILS.address}. Για τον Συνεργάτη: ${value(vendor.contactEmail)}, ${value(vendor.registeredAddress)}. Οι ηλεκτρονικές ειδοποιήσεις στις δηλωμένες διευθύνσεις αποτελούν έγκυρο κανάλι συμβατικής επικοινωνίας, με την επιφύλαξη τυχόν υποχρεωτικού διαφορετικού τύπου.`
    ]),
    ...article("ΑΡΘΡΟ 23 – ΜΕΤΑΒΟΛΗ ΤΩΝ ΟΡΩΝ ΚΑΙ VERSIONING", [
      "Η υπογεγραμμένη έκδοση αποτελεί αμετάβλητο ιστορικό συμβατικό έγγραφο. Μεταβολή οικονομικών ή ουσιωδών συμβατικών όρων δεν τροποποιεί αναδρομικά το ήδη υπογεγραμμένο PDF. Κάθε ουσιώδης μεταβολή πραγματοποιείται μέσω νέας έκδοσης ή πρόσθετης πράξης με σαφή αναφορά στον αρχικό Κωδικό Συμφωνίας και, όπου απαιτείται, νέα αποδοχή/υπογραφή."
    ]),
    ...article("ΑΡΘΡΟ 24 – ΕΦΑΡΜΟΣΤΕΟ ΔΙΚΑΙΟ ΚΑΙ ΔΙΑΦΟΡΕΣ", [
      "Η παρούσα διέπεται από το Ελληνικό Δίκαιο και το εφαρμοζόμενο δίκαιο της Ευρωπαϊκής Ένωσης. Τα Μέρη επιδιώκουν αρχικά επίλυση διαφορών μέσω καλόπιστης διαπραγμάτευσης. Με την επιφύλαξη διατάξεων αναγκαστικού δικαίου, αρμόδια ορίζονται τα δικαστήρια της Αθήνας."
    ]),
    ...article("ΑΡΘΡΟ 25 – ΤΕΛΙΚΕΣ ΔΙΑΤΑΞΕΙΣ", [
      "Τα Παραρτήματα αποτελούν αναπόσπαστο μέρος της παρούσας. Η ακυρότητα μίας διάταξης δεν επηρεάζει την ισχύ των υπολοίπων. Η μη άσκηση δικαιώματος δεν θεωρείται παραίτηση. Η παρούσα αποτελεί την πλήρη συμφωνία των Μερών για το αντικείμενό της, εκτός εάν προηγούμενη συμφωνία αναφέρεται ρητά ως διατηρούμενη σε ισχύ."
    ]),

    { text: "ΠΑΡΑΡΤΗΜΑ Α – ΕΜΠΟΡΙΚΟΙ ΟΡΟΙ", style: "heading", pageBreak: "before" },
    {
      table: {
        widths: [190, "*"],
        body: [
          ["Κωδικός Συμφωνίας", data.agreementCode],
          ["Πρόγραμμα", value(commercial.planName)],
          ["Εφάπαξ τέλος ένταξης / καταχώρισης", euro(commercial.listingFeeMinor)],
          ["Περιοδική χρέωση", `${euro(commercial.recurringFeeMinor)} · ${periodLabel(commercial.recurringFeePeriod)}`],
          ["Προμήθεια επί πωλήσεων", percentage(commercial.commissionRateBps)],
          ["Φορολογικός χειρισμός προμήθειας", `${taxModeLabel(commercial.commissionTaxMode)} · συντελεστής ${percentage(commercial.commissionTaxRateBps)}`],
          ["Βάση υπολογισμού προμήθειας", value(commercial.commissionBase, "Αξία εμπορευμάτων")],
          ["Χρόνος / όροι εκκαθάρισης", value(commercial.settlementTerms)],
          ["Έξοδα πληρωμών", value(commercial.paymentProcessingTerms)],
          ["Διάρκεια", value(commercial.contractTerm)],
          ["Ανανέωση", value(commercial.autoRenewal)],
          ["Προειδοποίηση καταγγελίας", noticeDays],
          ["Ειδικοί όροι", value(commercial.specialCommercialTerms)]
        ]
      },
      layout: "lightHorizontalLines"
    },
    { text: "ΠΑΡΑΡΤΗΜΑ Β – ΣΤΟΙΧΕΙΑ ΣΥΝΕΡΓΑΤΗ", style: "heading", margin: [0, 18, 0, 5] },
    {
      table: {
        widths: [190, "*"],
        body: [
          ["Επωνυμία", value(vendor.legalName)],
          ["Κατάστημα", value(vendor.tradingName)],
          ["ΑΦΜ", value(vendor.taxNumber)],
          ["ΓΕΜΗ", value(vendor.gemiNumber)],
          ["Νόμιμος εκπρόσωπος", value(vendor.legalRepresentative)],
          ["Έδρα", value(vendor.registeredAddress)],
          ["Email", value(vendor.contactEmail)],
          ["Τηλέφωνο", value(vendor.phone)],
          ["IBAN", value(vendor.iban)],
          ["Κατηγορίες δραστηριότητας", value(vendor.categories)]
        ]
      },
      layout: "lightHorizontalLines"
    },
    { text: "ΠΑΡΑΡΤΗΜΑ Γ – ΛΕΙΤΟΥΡΓΙΚΟΙ ΟΡΟΙ / SLA", style: "heading", margin: [0, 18, 0, 5] },
    {
      table: {
        widths: [190, "*"],
        body: [
          ["Χρόνος επιβεβαίωσης παραγγελίας", value(commercial.orderAcceptanceSla)],
          ["Χρόνος προετοιμασίας", value(commercial.fulfilmentSla)],
          ["Μέθοδοι παραλαβής / αποστολής", value(commercial.pickupShippingMethods)],
          ["Απαίτηση freshness αποθέματος", value(commercial.stockFreshnessRequirement)],
          ["Χρόνος απάντησης υποστήριξης", value(commercial.supportSla)]
        ]
      },
      layout: "lightHorizontalLines"
    },
    { text: "ΨΗΦΙΑΚΗ ΥΠΟΓΡΑΦΗ", style: "heading", margin: [0, 20, 0, 5] },
    { text: "Τα Μέρη συμφωνούν να ολοκληρώσουν την υπογραφή της παρούσας μέσω της υπηρεσίας Ψηφιακής Βεβαίωσης Ιδιωτικού Συμφωνητικού του gov.gr.", style: "body" },
    {
      columns: [
        { width: "50%", stack: [{ text: "Για την SP BUSINESS LAB / KONTA MOY", bold: true }, { text: KONTA_MOY_LEGAL_DETAILS.representative, margin: [0, 24, 0, 0] }] },
        { width: "50%", stack: [{ text: "Για τον Συνεργάτη", bold: true }, { text: value(vendor.legalRepresentative), margin: [0, 24, 0, 0] }] }
      ],
      margin: [0, 12, 0, 22]
    },
    { text: `Κωδικός Συμφωνίας: ${data.agreementCode} · Έκδοση v${data.agreementVersion}`, bold: true },
    { text: `Reference / Κωδικός Επαλήθευσης gov.gr: ${agreementReference}`, margin: [0, 4, 0, 0] }
  ];

  return {
    pageSize: "A4",
    pageMargins: [45, 58, 45, 55],
    defaultStyle: { font: "Roboto", fontSize: 9, lineHeight: 1.25 },
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: `${data.agreementCode} · v${data.agreementVersion}`, alignment: "left", margin: [45, 10, 0, 0], fontSize: 7 },
        { text: `Σελίδα ${currentPage} / ${pageCount}`, alignment: "right", margin: [0, 10, 45, 0], fontSize: 7 }
      ]
    }),
    styles: {
      title: { fontSize: 16, bold: true, alignment: "center" },
      subtitle: { fontSize: 11, bold: true, alignment: "center" },
      heading: { fontSize: 12, bold: true },
      partyTitle: { fontSize: 10, bold: true },
      articleTitle: { fontSize: 10, bold: true },
      body: { fontSize: 9, lineHeight: 1.25 }
    },
    content
  };
}

export async function renderVendorAgreementPdf(data: VendorAgreementPdfData): Promise<Buffer> {
  const pdfMakeModule = await import("pdfmake/build/pdfmake.js");
  const fontsModule = await import("pdfmake/build/vfs_fonts.js");
  const pdfMake = (pdfMakeModule.default ?? pdfMakeModule) as any;
  const fonts = (fontsModule.default ?? fontsModule) as any;
  pdfMake.vfs = fonts.pdfMake?.vfs ?? fonts.vfs ?? fonts;
  pdfMake.fonts = {
    Roboto: {
      normal: "Roboto-Regular.ttf",
      bold: "Roboto-Medium.ttf",
      italics: "Roboto-Italic.ttf",
      bolditalics: "Roboto-MediumItalic.ttf"
    }
  };
  return await new Promise<Buffer>((resolve, reject) => {
    try {
      pdfMake.createPdf(buildVendorAgreementDocument(data)).getBuffer((buffer: Uint8Array) => resolve(Buffer.from(buffer)));
    } catch (error) {
      reject(error);
    }
  });
}
