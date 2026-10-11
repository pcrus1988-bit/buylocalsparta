import { KONTA_MOY_LEGAL_DETAILS, type VendorAgreementPdfData } from "./vendor-agreement-pdf";
import type { VendorPlanAgreementTerms } from "./vendor-plan-agreements";

export type DirectoryAgreementSubject = VendorAgreementPdfData["vendor"];

export type DirectoryAgreementPreview = Readonly<{
  agreementCode: string;
  createdAt: string;
  vendor: DirectoryAgreementSubject;
  plan: VendorPlanAgreementTerms;
}>;

function value(item: unknown): string {
  return typeof item === "string" && item.trim() ? item.trim() : "—";
}
function euro(valueMinor: number): string {
  return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(valueMinor / 100);
}
function article(title: string, paragraphs: readonly string[]): unknown[] {
  return [
    { text: title, style: "article", margin: [0, 11, 0, 4] },
    ...paragraphs.map(text => ({ text, margin: [0, 0, 0, 5] }))
  ];
}

/** Directory-only contract. Never reuse merchant/supplier clauses for CLAIM or PRESENCE. */
export function buildDirectoryAgreementPreview(data: DirectoryAgreementPreview): Record<string, unknown> {
  if (data.plan.kind !== "directory") throw new Error("Directory agreement requires a directory-only plan");
  const { vendor, plan } = data;
  const isClaim = plan.planCode === "claim";
  const content: unknown[] = [
    { text: "ΠΡΟΣΧΕΔΙΟ ΣΥΜΒΑΣΗΣ — ΥΠΟ ΝΟΜΙΚΟ ΕΛΕΓΧΟ", style: "notice" },
    { text: isClaim ? "ΟΡΟΙ ΔΩΡΕΑΝ ΚΑΤΑΧΩΡΙΣΗΣ CLAIM" : "ΣΥΜΦΩΝΙΑ ΨΗΦΙΑΚΗΣ ΠΑΡΟΥΣΙΑΣ PRESENCE", style: "title" },
    { text: "KONTA MOY · μη εμπορική καταχώριση HUB", style: "subtitle" },
    { text: "Κωδικός προσχεδίου: " + data.agreementCode + " · Έκδοση: " + plan.templateVersion },
    { text: "Ημερομηνία δημιουργίας: " + new Date(data.createdAt).toLocaleDateString("el-GR") },
    { text: "Πάροχος: " + KONTA_MOY_LEGAL_DETAILS.legalName + " · ΑΦΜ " + KONTA_MOY_LEGAL_DETAILS.taxNumber },
    { text: "Επιχείρηση: " + value(vendor.legalName) + " · ΑΦΜ " + value(vendor.taxNumber) },
    { text: "Εκπρόσωπος: " + value(vendor.legalRepresentative) + " · Email: " + value(vendor.contactEmail) },
    ...article("1. Αντικείμενο και πεδίο εφαρμογής", [
      isClaim
        ? "Η δωρεάν υπηρεσία CLAIM παρέχει επαληθευμένη βασική καταχώριση στον τοπικό κατάλογο και δυνατότητα διόρθωσης των δημοσίων στοιχείων."
        : "Η PRESENCE παρέχει ενισχυμένη ψηφιακή παρουσία, προβολή μέσων και δυνατότητες επικοινωνίας ή αιτημάτων ενδιαφέροντος σύμφωνα με το Παράρτημα Α.",
      "Η συγκεκριμένη συμφωνία ΔΕΝ δημιουργεί λογαριασμό εμπόρου για πωλήσεις, κατάλογο προϊόντων προς checkout, υποχρεώσεις εκπλήρωσης παραγγελιών, εκκαθαρίσεις ή υπηρεσίες πληρωμών."
    ]),
    ...article("2. Ταυτοποίηση και ακρίβεια", [
      "Η επιχείρηση βεβαιώνει ότι διαθέτει εξουσία εκπροσώπησης και ότι τα στοιχεία της (ΓΕΜΗ, ΑΦΜ, διεύθυνση, κατηγορίες και επικοινωνία) είναι ακριβή και θα ενημερώνονται όταν αλλάζουν.",
      "Η KONTA MOY δύναται να ζητά εύλογα αποδεικτικά νόμιμης εκπροσώπησης πριν από τη δημοσίευση ή ουσιώδη αλλαγή."
    ]),
    ...article("3. Περιεχόμενο, φωτογραφίες και σήματα", [
      "Η επιχείρηση παρέχει μη αποκλειστική και ανακλητή άδεια εμφάνισης των φωτογραφιών, του διακριτικού τίτλου, των σημάτων και των πληροφοριών που υποβάλλει για τις ανάγκες της καταχώρισης και της προβολής της.",
      "Η επιχείρηση εγγυάται ότι διαθέτει δικαιώματα χρήσης του υλικού. Η KONTA MOY μπορεί να αποσύρει περιεχόμενο που παραβιάζει δικαιώματα τρίτων ή νόμιμες υποχρεώσεις."
    ]),
    ...article("4. Σύνδεσμοι και προαιρετική ενσωμάτωση εξωτερικού ιστοτόπου", [
      "Όπου η λειτουργία διατίθεται, ο διαχειριστής της επιχείρησης μπορεί να ενεργοποιεί ή να απενεργοποιεί την προαιρετική προβολή του υπάρχοντος ιστοτόπου του εντός iframe.",
      "Η ενσωμάτωση εξαρτάται από την τεχνική πολιτική του τρίτου ιστοτόπου, όπως X-Frame-Options και Content-Security-Policy, και ενδέχεται να μην υποστηρίζεται. Δεν επιτρέπεται παράκαμψη των περιορισμών του.",
      "Η εξωτερική υπηρεσία παραμένει υπό την ευθύνη του αντίστοιχου εκδότη. Τυχόν cookies/ιχνηλάτες τρίτου ιστοτόπου απαιτούν κατάλληλη ενημέρωση και νόμιμη βάση πριν από τη φόρτωση."
    ]),
    ...article("5. Προσωπικά δεδομένα και δημόσια στοιχεία", [
      "Δημοσιεύονται μόνο τα επαγγελματικά στοιχεία που επιτρέπονται από το πρόγραμμα και έχουν επιβεβαιωθεί για δημοσίευση. Η ιδιωτική διεύθυνση email της αίτησης δεν δημοσιοποιείται χωρίς χωριστή επιλογή.",
      "Κάθε μέρος συμμορφώνεται με τον ΓΚΠΔ. Αιτήματα πρόσβασης, διόρθωσης, διαγραφής και αντιρρήσεων αξιολογούνται σύμφωνα με τη νομοθεσία."
    ]),
    ...article("6. Τέλη, διάρκεια και τερματισμός", [
      "Εφάπαξ τέλος: " + euro(plan.setupFeeMinor) + ". Περιοδικό τέλος: " + euro(plan.recurringFeeMinor) +
        (plan.recurringFeePeriod === "month" ? " / μήνα" : plan.recurringFeePeriod === "year" ? " / έτος" : "") +
        ". Προμήθεια πωλήσεων: 0% (δεν παρέχεται checkout). Τα ποσά είναι προ ΦΠΑ όπου επιβάλλεται.",
      "Διάρκεια: " + plan.contractTerm + ". " + plan.autoRenewal,
      "Η επιχείρηση μπορεί να ζητήσει παύση/απόσυρση της καταχώρισης. Για καταβληθέντα τέλη ή προπληρωμένες περιόδους, η οριστική πολιτική επιστροφής και καταγγελίας απαιτεί ειδική συμβατική έγκριση."
    ]),
    ...article("7. Διαθεσιμότητα και αλλαγές υπηρεσίας", [
      "Η KONTA MOY επιδιώκει εύλογη διαθεσιμότητα και ασφάλεια της υπηρεσίας, χωρίς εγγύηση κατάταξης, επισκεψιμότητας ή οικονομικού αποτελέσματος.",
      "Ουσιώδης αλλαγή στους συμβατικούς όρους απαιτεί νέα δημοσιευμένη έκδοση και, όπου απαιτείται, νέα αποδοχή· δεν τροποποιεί αναδρομικά προηγούμενες δεσμεύσεις."
    ]),
    ...article("8. Αναφορές και επικοινωνία", [
      "Αιτήματα διόρθωσης ή διακοπής: " + KONTA_MOY_LEGAL_DETAILS.email + ". Η πλατφόρμα μπορεί να περιορίζει δημοσίευση κατόπιν αιτιολογημένης αναφοράς ή νόμιμης υποχρέωσης.",
      "Εφαρμόζεται το ελληνικό δίκαιο, με την επιφύλαξη κανόνων αναγκαστικού δικαίου."
    ]),
    { text: "ΠΑΡΑΡΤΗΜΑ Α — ΕΙΔΙΚΟ ΠΡΟΓΡΑΜΜΑ " + plan.name, style: "heading", pageBreak: "before" },
    { table: { widths: [175, "*"], body: [
      ["Πλάνο", plan.name], ["Κωδικός πλάνου", plan.planCode],
      ["Περιοχή / αγορά", plan.market], ["Κύκλος", plan.billingCycle],
      ["Τέλος ένταξης", euro(plan.setupFeeMinor)],
      ["Περιοδικό τέλος", euro(plan.recurringFeeMinor)],
      ["Προμήθεια", "0% — μη εμπορική καταχώριση"],
      ["Έκδοση προτύπου", plan.templateVersion]
    ] }, layout: "lightHorizontalLines" },
    { text: "Περιλαμβανόμενα δικαιώματα και λειτουργίες:", style: "article", margin: [0, 15, 0, 4] },
    { ul: plan.features.map(feature => ({ text: feature })) },
    { text: "ΣΗΜΑΝΤΙΚΟ: Αυτό το PDF αποτελεί μόνο προσχέδιο. Δεν αποδεικνύει αποδοχή, ταυτοποίηση, gov.gr υπογραφή ή ενεργοποίηση υπηρεσίας.", style: "notice", margin: [0, 20, 0, 0] }
  ];
  return {
    pageSize: "A4",
    pageMargins: [45, 58, 45, 55],
    defaultStyle: { font: "Roboto", fontSize: 9, lineHeight: 1.25 },
    footer: (page: number, count: number) => ({
      columns: [
        { text: data.agreementCode + " · " + plan.templateVersion, alignment: "left", fontSize: 7 },
        { text: "Σελίδα " + page + " / " + count, alignment: "right", fontSize: 7 }
      ], margin: [45, 8, 45, 0]
    }),
    styles: {
      title: { fontSize: 15, bold: true, alignment: "center", margin: [0, 7, 0, 4] },
      subtitle: { fontSize: 10, bold: true, alignment: "center", margin: [0, 0, 0, 14] },
      heading: { fontSize: 12, bold: true },
      article: { fontSize: 10, bold: true },
      notice: { fontSize: 9, bold: true, color: "#A5442F" }
    },
    content
  };
}

export async function renderDirectoryAgreementPreviewPdf(data: DirectoryAgreementPreview): Promise<Buffer> {
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
      pdfMake.createPdf(buildDirectoryAgreementPreview(data)).getBuffer((bytes: Uint8Array) => resolve(Buffer.from(bytes)));
    } catch (cause) { reject(cause); }
  });
}
