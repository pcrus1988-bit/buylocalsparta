/** Curated, dated, public-source series. Do not silently join different indicator definitions. */
export type ExternalPoint = Readonly<{ period: string; year: number; value: number; source?: string }>;
export type ExternalSeries = Readonly<{ id: string; label: string; points: readonly ExternalPoint[] }>;
export type ExternalGroup = Readonly<{
  id: string;
  title: string;
  subtitle: string;
  unit: "index" | "balance" | "percent" | "euro" | "days";
  frequency: "annual" | "month-of-year";
  comparison: "direct" | "trend-only" | "descriptive";
  sourceIds: readonly string[];
  series: readonly ExternalSeries[];
  caution: string;
}>;
export type ExternalStudy = Readonly<{
  id: string;
  issuer: string;
  title: string;
  year: number;
  kind: "sentiment" | "survey" | "statistical";
  url: string;
  detail: string;
}>;
const annual = (values: readonly number[], start = 2022): ExternalPoint[] =>
  values.map((value, offset) => ({ period: String(start + offset), year: start + offset, value }));
const months = (values: readonly number[], year: number): ExternalPoint[] =>
  values.map((value, offset) => ({ period: String(offset + 1).padStart(2, "0"), year, value }));

export const EXTERNAL_STUDIES: readonly ExternalStudy[] = [
  { id:"silc-2025", issuer:"ΕΛΣΤΑΤ · EU-SILC", title:"Εισόδημα και συνθήκες διαβίωσης 2025 (εισοδήματα 2024)", year:2025, kind:"survey", url:"https://www.statistics.gr/documents/20181/30dc21b1-d0b6-feb9-beca-62e75e6b0d86", detail:"Δελτίο 19/03/2026, σελ. 8: μέσο ετήσιο ισοδύναμο διαθέσιμο εισόδημα 2018–2024 σε ευρώ, χρονολογημένο βάσει έτους εισοδήματος. Έτος έρευνας = έτος εισοδήματος + 1." },
  { id:"silc-2024", issuer:"ΕΛΣΤΑΤ · EU-SILC", title:"Κίνδυνος φτώχειας 2024 (εισοδήματα 2023)", year:2024, kind:"survey", url:"https://www.statistics.gr/documents/20181/18581077/DT_ftoxeia_2024_en.pdf/03f634ec-bb96-3df6-c3a5-99a25d3126d6", detail:"Δημοσίευση 16/04/2025 · μέσο ισοδύναμο εισόδημα 12.391 € (έτος εισοδήματος 2023), επιβεβαίωση της ιστορικής σειράς." },
  { id:"elstat-cpi-2025", issuer:"ΕΛΣΤΑΤ", title:"Δείκτης Τιμών Καταναλωτή 2025 και επιμέρους κατηγορίες", year:2025, kind:"statistical", url:"https://lms.statistics.gr/documents/20181/18744362/DT_deiktis_timon_katanaloti_2025_%CE%95%CE%9D.pdf/fabbec7f-6c21-b455-5f6b-2319cbab2836", detail:"Δημοσίευση 13/01/2026 · μέση ετήσια μεταβολή εθνικού ΔΤΚ 2025 +2,5%. Κατηγορίες: τρόφιμα +2,0%, στέγαση +4,2%, μεταφορές +0,3%, εστίαση/καταλύματα +6,3%. Όχι η ετήσια μεταβολή Δεκεμβρίου." },
  { id:"eurostat-hicp-2025", issuer:"Eurostat", title:"Εναρμονισμένος Δείκτης Τιμών · ετήσιες χρονοσειρές", year:2025, kind:"statistical", url:"https://ec.europa.eu/eurostat/databrowser/view/prc_hicp_aind/default/table?lang=en", detail:"Ετήσιος μέσος ΕνΔΤΚ Ελλάδας 2019–2025· παλαιά έκδοση με βάση 2015=100. Το ιστορικό αρχείο αντικαταστάθηκε από prc_hicp_ainr· διατηρείται η αρχική βάση και η στρογγυλοποίηση του επιλεγμένου στιγμιότυπου." },
  { id:"gsevee-income-2023", issuer:"ΙΜΕ ΓΣΕΒΕΕ", title:"Εισόδημα και δαπάνες διαβίωσης νοικοκυριών 2023", year:2023, kind:"survey", url:"https://imegsevee.gr/%CE%B4%CE%B7%CE%BC%CE%BF%CF%83%CE%B9%CE%B5%CF%8D%CF%83%CE%B5%CE%B9%CF%82/etisia-erevna-gia-to-eisodima-tis-dapanes-diaviosis-noikokyrion-2023/", detail:"12η ετήσια έρευνα· για νοικοκυριά με ανεπαρκές εισόδημα αυτό διαρκούσε κατά μέσο όρο 19 ημέρες· οι αυξήσεις τιμών τροφίμων επηρέασαν το 72,7% των νοικοκυριών." },
  { id:"gsevee-income-2024", issuer:"ΙΜΕ ΓΣΕΒΕΕ", title:"Εισόδημα και δαπάνες διαβίωσης νοικοκυριών 2024", year:2024, kind:"survey", url:"https://imegsevee.gr/%CE%B4%CE%B7%CE%BC%CE%BF%CF%83%CE%B9%CE%B5%CF%8D%CF%83%CE%B5%CE%B9%CF%82/etisia-erevna-gia-to-eisodima-tis-dapanes-diaviosis-noikokyrion-2024/", detail:"13η ετήσια έρευνα · εισόδημα επαρκεί κατά μέσο όρο 19 ημέρες για τις πληττόμενες οικογένειες, 81,6% δεν αποταμιεύει, 72,4% περικόπτουν άλλες δαπάνες λόγω ακρίβειας." },
  { id:"gsevee-income-2025", issuer:"ΙΜΕ ΓΣΕΒΕΕ", title:"Εισόδημα και δαπάνες διαβίωσης νοικοκυριών 2025", year:2025, kind:"survey", url:"https://imegsevee.gr/%CE%B4%CE%B7%CE%BC%CE%BF%CF%83%CE%B9%CE%B5%CF%8D%CF%83%CE%B5%CE%B9%CF%82/etisia-erevna-gia-to-eisodima-tis-dapanes-diaviosis-ton-noikokyrion-2025/", detail:"14η ετήσια έρευνα, δημοσιεύθηκε Φεβρουάριο 2026· κατά μέσο όρο 18 ημέρες επάρκειας εισοδήματος, 54% περικοπές βασικών αναγκών, 55,7% δυσκολία έκτακτης δαπάνης 500€." },
  { id:"silc-gini-2025", issuer:"ΕΛΣΤΑΤ · EU-SILC", title:"Ανισότητα εισοδήματος 2025 (εισοδηματικό έτος 2024)", year:2025, kind:"statistical", url:"https://www.statistics.gr/documents/20181/1a15bbfa-74f9-1101-7381-56a83db53ad9", detail:"Δελτίο 19/03/2026 · Συντελεστής Gini (0–100) για έτη έρευνας 2019–2025. Κάθε παρατήρηση αφορά το προηγούμενο έτος εισοδήματος." },
  { id: "hbs-2024", issuer: "ΕΛΣΤΑΤ", title: "Έρευνα Οικογενειακών Προϋπολογισμών 2024", year: 2024, kind: "survey", url: "https://www.statistics.gr/documents/20181/18678055/DT_eop_2024_EN.pdf/d33a2eda-0a74-7516-6cfe-75cfae8c4b40", detail: "Επίσημο ενημερωτικό γράφημα 25/09/2025· μέση μηνιαία δαπάνη, αστικές/αγροτικές περιοχές, μερίδια 13 κατηγοριών. Το 2024 υιοθετήθηκε η ταξινόμηση COICOP-HBS 2018." },
  { id: "hbs-2025", issuer: "ΕΛΣΤΑΤ", title: "Έρευνα Οικογενειακών Προϋπολογισμών 2025", year: 2025, kind: "survey", url: "https://www.statistics.gr/documents/20181/18958813/DT_eop_2025_en.pdf/5f6cedd1-de1b-f227-f783-508c5976295b", detail: "Επίσημο ενημερωτικό γράφημα 25/09/2026· δαπάνη νοικοκυριών 2009–2025, ποσοστά καταναλωτικού καλαθιού και έξοδα αγαθών σε ευρώ. Ονομαστικές τιμές." },
  { id: "elstat-greece-2026q3", issuer: "ΕΛΣΤΑΤ", title: "Greece in Figures · Ιούλιος–Σεπτέμβριος 2026", year: 2026, kind: "statistical", url: "https://www.statistics.gr/documents/20181/18849188/GreeceinFigures_2026Q3_EN.pdf/ea76cf13-0a2a-459a-6b06-fae9b76847bd", detail: "Σελίδα 90 (PDF σελ. 46): ετήσιοι δείκτες 2024–2025 και Ιανουάριος–Ιούλιος 2026. Κύκλος εργασιών, όγκος, τρόφιμα και λοιπά αγαθά· βάση 2021=100." },
  { id: "elstat-june-2025", issuer: "ΕΛΣΤΑΤ", title: "Δείκτες λιανεμπορίου · Ιούνιος 2025", year: 2025, kind: "statistical", url: "https://www.statistics.gr/documents/20181/34964649-e888-f454-011a-38b5a5965277", detail: "Δελτίο 29/08/2025· ετήσιος ρυθμός κύκλου εργασιών +3,0% και όγκου +1,8% τον Ιούνιο 2025." },
  { id: "elstat-june-2026", issuer: "ΕΛΣΤΑΤ", title: "Δείκτες λιανεμπορίου · Ιούνιος 2026", year: 2026, kind: "statistical", url: "https://www.statistics.gr/documents/20181/458d8052-829f-635e-664d-06f1726e095d", detail: "Αρχικό δελτίο 31/08/2026· ετήσια μεταβολή κύκλου εργασιών +4,2% και όγκου +1,9%. Σημειώστε ότι οι δείκτες ενδέχεται να αναθεωρηθούν." },
  { id: "esee-summer-2025", issuer: "ΕΣΕΕ · ΙΝΕΜΥ", title: "Πανελλαδική έρευνα Θερινών Εκπτώσεων 2025", year: 2025, kind: "survey", url: "https://old2025.esee.gr/web/%CE%B1%CF%80%CE%BF%CF%84%CE%B5%CE%BB%CE%AD%CF%83%CE%BC%CE%B1%CF%84%CE%B1-%CE%B8%CE%B5%CF%81%CE%B9%CE%BD%CF%8E%CE%BD-%CE%B5%CE%BA%CF%80%CF%84%CF%8E%CF%83%CE%B5%CF%89%CE%BD-2025/", detail: "Δελτίο 28/08/2025· 59% χειρότερες πωλήσεις, 51% χαμηλότερη επισκεψιμότητα, 47% χαμηλή ικανοποίηση. Διαφορετικά ερωτήματα και βάσεις απαντήσεων." },
  { id: "ielka-consumer-2025", issuer: "ΙΕΛΚΑ", title: "Ετήσια έρευνα αγοραστικής συμπεριφοράς 2025", year: 2025, kind: "survey", url: "https://ielka.gr/anakoinosi-13-5-2025/", detail: "Έρευνα Φεβρουαρίου 2025 με 1.500 καταναλωτές: 47% βασικό κριτήριο η δαπάνη, 30% ποιότητα, 58% αναζητούν ενεργά προσφορές." },
  { id: "ielka-ai-2025", issuer: "ΙΕΛΚΑ", title: "Χρήση τεχνητής νοημοσύνης στις αγορές 2025", year: 2025, kind: "survey", url: "https://ielka.gr/anakoinosi-09-12-2025/", detail: "Έρευνα Οκτωβρίου 2025: 500 χρήστες AI· προϊόντα, αναζήτηση πληροφοριών, αξιοπιστία προτάσεων. Δείγμα μόνο χρηστών AI, όχι του συνολικού πληθυσμού." },
  { id: "ielka-environment-2025", issuer: "ΙΕΛΚΑ", title: "Καταναλωτικές επιλογές και περιβάλλον 2025", year: 2025, kind: "survey", url: "https://ielka.gr/anakoinosi-26-05-2025/", detail: "Πανελλαδική έρευνα Α΄ τριμήνου 2025, 1.500 καταναλωτές· περιβαλλοντική στάση έναντι προθυμίας για υψηλότερη τιμή." },
  { id: "esee-annual-2025", issuer: "ΕΣΕΕ · ΙΝΕΜΥ", title: "Ετήσια Έκθεση Ελληνικού Εμπορίου 2025", year: 2025, kind: "statistical", url: "https://www.esee.gr/", detail: "Δείκτες εμπορίου (ανακοινωμένοι από την ΕΣΕΕ): 225.671 επιχειρήσεις με έτος 2023, 181,3 δισ. € τζίρος 2025 και 759,9 χιλ. απασχολούμενοι 2025. Οι χρονιές των μετρήσεων διαφέρουν." },
  { id: "esee-annual-2023", issuer: "ΕΣΕΕ · ΙΝΕΜΥ", title: "Ετήσια Έκθεση Ελληνικού Εμπορίου 2023", year: 2023, kind: "statistical", url: "https://esee.gr/wp-content/uploads/2024/03/%CE%95tisia_ekthesi_2023_cover.pdf", detail: "Ιστορική ετήσια έκθεση ΙΝΕΜΥ/ΕΣΕΕ, με κλαδική αποτύπωση πριν τις μελέτες 2024–2025. Διαφορετικές χρονολογίες και ορισμοί απαιτούν έλεγχο πριν από σύγκριση." },
  { id: "eurostat-ecommerce-2025", issuer: "Eurostat", title: "Αγορές μέσω διαδικτύου 2020–2025 · isoc_ec_ib20", year: 2025, kind: "statistical", url: "https://ec.europa.eu/eurostat/databrowser/product/view/isoc_ec_ib20?lang=en", detail: "Εναρμονισμένη στατιστική διαδικτυακών αγορών, πολίτες Ελλάδας και ΕΕ-27, 2020–2025. Διαφορετικά υποσύνολα και παρονομαστές· χρειάζεται ακριβές φιλτράρισμα πριν από αριθμητική παράθεση." },
  { id: "iobe-2026", issuer: "ΙΟΒΕ · DG ECFIN", title: "Έρευνα οικονομικής συγκυρίας, Σεπτέμβριος 2026", year: 2026, kind: "sentiment", url: "https://iobe.gr/wp-content/uploads/2026/10/BCS_02102026_REP_GR.pdf", detail: "Πίνακας 1, σελ. 4: ετήσιο και μηνιαίο οικονομικό κλίμα. Πίνακας 4, σελ. 10: λιανικό εμπόριο." },
  { id: "iobe-2025", issuer: "ΙΟΒΕ · DG ECFIN", title: "Έρευνα οικονομικής συγκυρίας, Σεπτέμβριος 2025", year: 2025, kind: "sentiment", url: "https://iobe.gr/wp-content/uploads/2025/10/BCS_01102025_REP_G%CE%A1.pdf", detail: "Πίνακας 4, σελ. 10: επιχειρηματικές προσδοκίες λιανικού εμπορίου." },
  { id: "iobe-2024", issuer: "ΙΟΒΕ · DG ECFIN", title: "Έρευνα οικονομικής συγκυρίας, Σεπτέμβριος 2024", year: 2024, kind: "sentiment", url: "https://iobe.gr/wp-content/uploads/2025/06/BCS_01102024_REP_G%CE%A1.pdf", detail: "Πίνακας 4, σελ. 10: επιχειρηματικές προσδοκίες λιανικού εμπορίου." },
  { id: "iobe-2023", issuer: "ΙΟΒΕ · DG ECFIN", title: "Έρευνα οικονομικής συγκυρίας, Σεπτέμβριος 2023", year: 2023, kind: "sentiment", url: "https://iobe.gr/docs/situation/BCS_03102023_REP_GR.pdf", detail: "Λιανικό εμπόριο: δείκτης Σεπτεμβρίου 2023. Ιστορικό αντίγραφο, ενδέχεται να αλλάξει ο σύνδεσμος." },
  { id: "bog-2025", issuer: "Τράπεζα της Ελλάδος · ΙΟΒΕ / EC", title: "Note on the Greek Economy, 05/09/2025", year: 2025, kind: "sentiment", url: "https://www.bankofgreece.gr/Publications/Note_on_the_Greek_economy_05_09_2025.pdf", detail: "Πίνακας 6, σελ. 62: ετήσιοι δείκτες ισοζυγίων 2022–2024, εποχικά διορθωμένοι." },
  { id: "ielka-2025", issuer: "ΙΕΛΚΑ", title: "Τιμές σούπερ μάρκετ, Σεπτέμβριος 2025", year: 2025, kind: "statistical", url: "https://www.ese.gr/meiomenos-plithorismos-supermarket-septemvrio-2025/", detail: "Μεταβολή Σεπτεμβρίου 2025 έναντι Σεπτεμβρίου 2024, οργανωμένο λιανεμπόριο τροφίμων." },
  { id: "ielka-2026", issuer: "ΙΕΛΚΑ", title: "Τιμές σούπερ μάρκετ, Σεπτέμβριος 2026", year: 2026, kind: "statistical", url: "https://www.ese.gr/ekseliksi-timon-supermarket-septemvrios-2026/", detail: "Μεταβολή Σεπτεμβρίου 2026 έναντι Σεπτεμβρίου 2025, ίδιο ειδικό κανάλι." },
  { id: "esee-2026", issuer: "ΕΣΕΕ · ΙΝΕΜΥ", title: "Κίνηση καταστημάτων, εορτές 2025–2026", year: 2026, kind: "survey", url: "https://www.poee-org.gr/index.php/nea-anakoinoseis/apotelesmata-tis-panelladikis-erevnas-pou-dieksigage-to-inemy-tis-esee-gia-tin-kinisi-ton-emporikon-katastimaton-kata-ti-diarkeia-tis-eortastikis-periodou-2025-2026", detail: "Δειγματοληπτική έρευνα σε εμπορικές επιχειρήσεις. Αναφορά στις αυτοδηλωμένες πωλήσεις, όχι στον συνολικό τζίρο." },
  { id: "elstat-2026", issuer: "ΕΛΣΤΑΤ", title: "Δείκτες κύκλου εργασιών και όγκου λιανικού εμπορίου", year: 2026, kind: "statistical", url: "https://www.statistics.gr/el/statistics/-/publication/DKT39/2026-M06", detail: "Επίσημες χρονοσειρές όγκου και κύκλου εργασιών. Δεν ταυτίζονται με δείκτες γνώμης." },
  { id: "ec-data", issuer: "Ευρωπαϊκή Επιτροπή · DG ECFIN", title: "Χρονοσειρές ερευνών επιχειρήσεων και καταναλωτών", year: 2026, kind: "sentiment", url: "https://economy-finance.ec.europa.eu/economic-forecast-and-surveys/business-and-consumer-surveys/download-business-and-consumer-survey-data/time-series_en", detail: "Εναρμονισμένες χρονοσειρές, με επισήμανση για εποχική διόρθωση και μεταγενέστερες αναθεωρήσεις." }
];

export const EXTERNAL_GROUPS: readonly ExternalGroup[] = [
  {
    id:"income-refyear",title:"Διαθέσιμο εισόδημα στην Ελλάδα",subtitle:"EU-SILC · πραγματικό έτος εισοδήματος 2018–2024 · €/ισοδύναμο άτομο/έτος",
    unit:"euro",frequency:"annual",comparison:"direct",sourceIds:["silc-2025","silc-2024"],
    caution:"Το 2025 είναι το έτος ΕΡΕΥΝΑΣ, με αναφορά σε εισοδήματα του 2024. Το μέσο ισοδύναμο διαθέσιμο εισόδημα υπολογίζεται ΑΝΑ ισοδύναμο άτομο (όχι ανά νοικοκυριό ή μισθωτό), σε τρέχοντα ευρώ και όχι σε πραγματικές τιμές. Δεν ταυτίζεται σε ποσό με τον οικογενειακό προϋπολογισμό.",
    series:[{id:"equivalised-income",label:"Μέσο διαθέσιμο εισόδημα · έτος εισοδήματος",points:annual([9382,10041,9952,10832,11546,12391,13381],2018)}]
  },
  {
    id:"hicp-annual-index",title:"Σωρευτική αύξηση επιπέδου τιμών",subtitle:"Eurostat · ΕνΔΤΚ ετήσιος μέσος · βάση 2015=100",
    unit:"index",frequency:"annual",comparison:"direct",sourceIds:["eurostat-hicp-2025"],
    caution:"Εναρμονισμένος δείκτης τιμών καταναλωτή, ετήσιος μέσος Ελλάδας, παλαιά/παγωμένη έκδοση (2015=100) με μία δεκαδική. Ο δείκτης είναι ΕΠΙΠΕΔΟ τιμών, όχι ετήσιο ποσοστό πληθωρισμού. Για νέο vintage ελέγξτε τον διάδοχο Eurostat prc_hicp_ainr.",
    series:[{id:"hicp-greece",label:"Ελλάδα · ΕνΔΤΚ",points:annual([102.5,101.2,101.8,111.2,115.8,119.3,122.8],2019)}]
  },
  {
    id:"hicp-annual-inflation",title:"Ετήσιος μέσος πληθωρισμός",subtitle:"Eurostat · ΕνΔΤΚ Ελλάδας, 2020–2025 · % ανά έτος",
    unit:"percent",frequency:"annual",comparison:"direct",sourceIds:["eurostat-hicp-2025"],
    caution:"Ετήσια μέση μεταβολή ΕνΔΤΚ (Eurostat), ΟΧΙ ετήσιος πληθωρισμός Δεκεμβρίου, ούτε μεταβολή του εθνικού ΔΤΚ. Επίσης η μεταβολή μεταξύ στρογγυλοποιημένων επιπέδων ΕνΔΤΚ μπορεί να αποκλίνει κατά 0,1 μονάδα από τα δημοσιευμένα ποσοστά.",
    series:[{id:"hicp-gr-annual",label:"Ελλάδα · ετήσιος μέσος %",points:annual([-1.3,0.6,9.3,4.2,3.0,2.9],2020)}]
  },
  {
    id:"greek-cpi-2025-categories",title:"Πληθωρισμός ανά βασική ανάγκη",subtitle:"ΕΛΣΤΑΤ · εθνικός ΔΤΚ · μέσες ετήσιες μεταβολές 2025",
    unit:"percent",frequency:"annual",comparison:"descriptive",sourceIds:["elstat-cpi-2025"],
    caution:"Έξι ομάδες με διαφορετική βαρύτητα καταναλωτικού καλαθιού: μη αθροίζετε τα ποσοστά, ούτε ταυτίζετε αυξήσεις τιμών με αύξηση της κατανάλωσης. Εθνικός ΔΤΚ 2020=100· διαφέρει από ΕνΔΤΚ Eurostat.",
    series:[
      {id:"cpi-2025-food",label:"Τρόφιμα / μη αλκοολούχα",points:[{period:"2025",year:2025,value:2.0}]},
      {id:"cpi-2025-housing",label:"Στέγαση",points:[{period:"2025",year:2025,value:4.2}]},
      {id:"cpi-2025-hospitality",label:"Εστίαση / καταλύματα",points:[{period:"2025",year:2025,value:6.3}]},
      {id:"cpi-2025-transport",label:"Μεταφορές",points:[{period:"2025",year:2025,value:0.3}]},
      {id:"cpi-2025-health",label:"Υγεία",points:[{period:"2025",year:2025,value:1.5}]},
      {id:"cpi-2025-overall",label:"Γενικός εθνικός ΔΤΚ",points:[{period:"2025",year:2025,value:2.5}]}
    ]
  },
  {
    id:"income-inequality-2019-2025",title:"Ανισότητα διαθέσιμου εισοδήματος",subtitle:"EU-SILC · συντελεστής Gini, έτη έρευνας 2019–2025",
    unit:"index",frequency:"annual",comparison:"direct",sourceIds:["silc-gini-2025"],
    caution:"Gini σε κλίμακα 0–100 (όχι ποσοστό): υψηλότερος δείκτης σημαίνει μεγαλύτερη ανισότητα. Κάθε έτος ΕΡΕΥΝΑΣ 2019–2025 αφορά εισοδήματα του προηγούμενου έτους. Δεν δείχνει μέσο εισόδημα ούτε μεταβολή των δαπανών.",
    series:[{id:"income-gini-survey",label:"Gini · έτος έρευνας",points:annual([31.0,31.4,32.4,31.4,31.8,31.8,31.6],2019)}]
  },
  {
    id:"gsevee-days-2023-2025",title:"Για πόσες ημέρες επαρκεί το εισόδημα;",subtitle:"ΙΜΕ ΓΣΕΒΕΕ · έρευνες 2023–2025 · υποκειμενική επάρκεια",
    unit:"days",frequency:"annual",comparison:"trend-only",sourceIds:["gsevee-income-2023","gsevee-income-2024","gsevee-income-2025"],
    caution:"Δείκτης αυτοαναφερόμενης επάρκειας μετρημένος σε ημέρες ανά μήνα. Αφορά κυρίως νοικοκυριά με μη επαρκές εισόδημα· η ακριβής σύνθεση δείγματος/διατύπωση μπορεί να αλλάζει από έτος σε έτος. Δεν αποτελεί επίσημη μέτρηση πραγματικού διαθέσιμου εισοδήματος.",
    series:[{id:"days-affordable",label:"Ημέρες επάρκειας για οικονομικά πιεζόμενους",points:annual([19,19,18],2023)}]
  },
  {
    id:"gsevee-budget-2025",title:"Πίεση εισοδήματος και περικοπές",subtitle:"ΙΜΕ ΓΣΕΒΕΕ · ετήσια έρευνα νοικοκυριών 2025",
    unit:"percent",frequency:"annual",comparison:"descriptive",sourceIds:["gsevee-income-2025"],
    caution:"Διαφορετικά ερωτήματα της ίδιας δειγματοληπτικής έρευνας. Δεν αθροίζονται μεταξύ τους και δεν μπορούν να συσχετιστούν σε ατομικό επίπεδο χωρίς μικροδεδομένα.",
    series:[
      {id:"gsevee-cut-essentials",label:"Περικοπές βασικών αναγκών",points:[{period:"2025",year:2025,value:54.0}]},
      {id:"gsevee-emergency500",label:"Δυσκολία έκτακτου εξόδου 500€",points:[{period:"2025",year:2025,value:55.7}]},
      {id:"gsevee-income-not-enough",label:"Εισόδημα δεν φτάνει τον μήνα (περίπου)",points:[{period:"2025",year:2025,value:60.0}]}
    ]
  },
  {
    id: "household-spending-history",
    title: "Μέση μηνιαία δαπάνη νοικοκυριού",
    subtitle: "ΕΛΣΤΑΤ · Ελλάδα, 2019–2025 · ονομαστικές τιμές",
    unit: "euro", frequency: "annual", comparison: "direct", sourceIds: ["hbs-2024","hbs-2025"],
    caution: "Μέσος όρος ανά νοικοκυριό σε τρέχοντα ευρώ, όχι κατά κεφαλήν και όχι πραγματική δαπάνη. Η αύξηση αντανακλά και μεταβολές τιμών. Έρευνες διαφορετικών ετών· η ΕΟΠ 2024 άλλαξε ταξινόμηση αγαθών.",
    series: [{id:"hbs-monthly-average",label:"Μέση μηνιαία δαπάνη",points:annual([1454.76,1309.17,1399.71,1579.81,1663.82,1724.54,1820.20],2019)}]
  },
  {
    id: "household-urban-rural",
    title: "Δαπάνες νοικοκυριών · αστικές και αγροτικές περιοχές",
    subtitle: "Έρευνα Οικογενειακών Προϋπολογισμών 2024–2025",
    unit: "euro", frequency: "annual", comparison: "direct", sourceIds: ["hbs-2024","hbs-2025"],
    caution: "Μέσες μηνιαίες ονομαστικές δαπάνες ανά νοικοκυριό, όχι ανά κάτοικο. Η διαφορά αστικών/αγροτικών περιοχών δεν εξηγείται αιτιωδώς από τη γεωγραφία και δεν είναι μέτρο ακρίβειας.",
    series: [
      {id:"hbs-urban",label:"Αστικές περιοχές",points:annual([1821.26,1892.86],2024)},
      {id:"hbs-rural",label:"Αγροτικές περιοχές",points:annual([1296.41,1386.11],2024)}
    ]
  },
  {
    id: "household-budget-mix",
    title: "Πού κατανέμεται ο οικογενειακός προϋπολογισμός",
    subtitle: "Μερίδια συνολικής μηνιαίας δαπάνης · 2024–2025",
    unit: "percent", frequency: "annual", comparison: "trend-only", sourceIds: ["hbs-2024","hbs-2025"],
    caution: "Ποσοστά επιμέρους κατηγοριών επί του συνολικού προϋπολογισμού, όχι μεταβολές τιμών. Παρουσιάζονται έξι επιλεγμένες κατηγορίες, όχι το σύνολο του καλαθιού. Διαφορά ετών σε ποσοστιαίες μονάδες.",
    series: [
      {id:"hbs-food-share",label:"Τρόφιμα και μη αλκοολούχα",points:annual([20.7,20.4],2024)},
      {id:"hbs-housing-share",label:"Στέγαση",points:annual([14.4,14.7],2024)},
      {id:"hbs-transport-share",label:"Μεταφορές",points:annual([13.3,13.6],2024)},
      {id:"hbs-clothing-share",label:"Ένδυση και υπόδηση",points:annual([5.0,4.9],2024)},
      {id:"hbs-durables-share",label:"Διαρκή αγαθά",points:annual([4.3,4.4],2024)},
      {id:"hbs-culture-share",label:"Αναψυχή και πολιτισμός",points:annual([4.0,4.1],2024)}
    ]
  },
  {
    id: "household-food-spending",
    title: "Μηνιαία δαπάνη σε είδη διατροφής",
    subtitle: "Επιλεγμένες ομάδες αγαθών · ΕΛΣΤΑΤ 2024–2025",
    unit: "euro", frequency: "annual", comparison: "trend-only", sourceIds: ["hbs-2024","hbs-2025"],
    caution: "Ευρώ ανά μέσο νοικοκυριό σε τρέχουσες τιμές. Η μεταβολή δαπάνης αντανακλά τιμές, ποσότητες και σύνθεση αγορών· δεν ισούται με πληθωρισμό συγκεκριμένων τροφίμων.",
    series: [
      {id:"food-meat",label:"Κρέας",points:annual([76.11,83.66],2024)},
      {id:"food-dairy",label:"Γάλα, τυρί και αυγά",points:annual([56.58,59.37],2024)},
      {id:"food-vegetables",label:"Λαχανικά",points:annual([49.84,50.16],2024)},
      {id:"food-bread",label:"Ψωμί και δημητριακά",points:annual([48.64,49.60],2024)},
      {id:"food-fish",label:"Ψάρια",points:annual([24.99,27.00],2024)},
      {id:"food-coffee",label:"Καφές, τσάι και κακάο",points:annual([9.56,10.70],2024)}
    ]
  },
  {
    id: "retail-annual-2024-2025",
    title: "Λιανικό εμπόριο · κύκλος εργασιών και όγκος",
    subtitle: "ΕΛΣΤΑΤ · μέσος ετήσιος δείκτης, βάση 2021=100",
    unit: "index", frequency: "annual", comparison: "trend-only", sourceIds: ["elstat-greece-2026q3"],
    caution: "Οι δύο σειρές έχουν κοινό έτος βάσης αλλά διαφορετικό περιεχόμενο: ο κύκλος εργασιών είναι σε τρέχουσες τιμές, ο όγκος σε σταθερές. Η διαφορά επιπέδων δεν αποτελεί μέτρηση πληθωρισμού. Τα στοιχεία 2025 είναι προσωρινά.",
    series: [
      {id:"retail-turnover-annual",label:"Κύκλος εργασιών (ονομαστικός)",points:annual([118.4,122.2],2024)},
      {id:"retail-volume-annual",label:"Όγκος (σταθερές τιμές)",points:annual([98.2,100.3],2024)}
    ]
  },
  {
    id: "retail-2026-monthly-indices",
    title: "Πωλήσεις λιανεμπορίου · μηνιαία πορεία 2026",
    subtitle: "ΕΛΣΤΑΤ · Ιανουάριος–Ιούλιος 2026 · βάση 2021=100",
    unit: "index", frequency: "month-of-year", comparison: "trend-only", sourceIds: ["elstat-greece-2026q3"],
    caution: "Μη εποχικά διορθωμένοι δείκτες, αναγμένοι σε τυπικό μήνα. Μη συγκρίνετε διαδοχικούς μήνες ως καθαρή αύξηση, λόγω εποχικότητας. Ο όγκος αφαιρεί την επίδραση τιμών, ο τζίρος όχι. Ιούλιος προσωρινός.",
    series: [
      {id:"retail-2026-turnover",label:"Κύκλος εργασιών · 2026",points:months([112.4,119.4,124.4,125.4,132.1,133.8,136.2],2026)},
      {id:"retail-2026-volume",label:"Όγκος · 2026",points:months([92.2,98.2,98.9,99.0,104.5,105.9,111.5],2026)}
    ]
  },
  {
    id: "retail-sectors-2026",
    title: "Λιανικό εμπόριο · τρόφιμα έναντι λοιπών αγαθών",
    subtitle: "Κλαδικός κύκλος εργασιών · Ιανουάριος–Ιούλιος 2026",
    unit: "index", frequency: "month-of-year", comparison: "trend-only", sourceIds: ["elstat-greece-2026q3"],
    caution: "Κλαδικοί ονομαστικοί δείκτες βάσης 2021=100, εκτός καυσίμων για τα μη τρόφιμα. Διαφορετικά μεγέθη κλάδων και προϊόντα. Δεν είναι απόλυτοι τζίροι· Ιούλιος προσωρινός, εποχικότητα μη προσαρμοσμένη.",
    series: [
      {id:"retail-food-sector-2026",label:"Τρόφιμα",points:months([120.2,126.1,129.9,134.2,138.1,138.6,141.1],2026)},
      {id:"retail-nonfood-sector-2026",label:"Μη τρόφιμα (χωρίς καύσιμα)",points:months([110.8,119.0,120.2,122.5,131.7,135.6,137.3],2026)}
    ]
  },
  {
    id: "retail-june-growth",
    title: "Ιούνιος · ετήσια μεταβολή λιανεμπορίου",
    subtitle: "Αρχικές ανακοινώσεις ΕΛΣΤΑΤ · Ιούνιος 2025 και 2026",
    unit: "percent", frequency: "annual", comparison: "trend-only", sourceIds: ["elstat-june-2025","elstat-june-2026"],
    caution: "Κάθε τιμή είναι ετήσιος ρυθμός μεταβολής του Ιουνίου σε σχέση με τον προηγούμενο Ιούνιο (ποσοστό, όχι δείκτης). Συνδυάζονται οι αρχικές εκδόσεις 2025 και 2026. Οι στατιστικές ενδέχεται να αναθεωρηθούν: η νεότερη έκδοση ΕΛΣΤΑΤ Q3/2026 δίνει +4,1% για ονομαστικό Ιούνιο 2026 αντί αρχικού +4,2%.",
    series: [
      {id:"june-turnover-growth",label:"Κύκλος εργασιών · ετήσια %",points:annual([3.0,4.2],2025)},
      {id:"june-volume-growth",label:"Όγκος · ετήσια %",points:annual([1.8,1.9],2025)}
    ]
  },
  {
    id: "esee-summer-2025-survey",
    title: "Θερινές εκπτώσεις · εμπειρία εμπόρων",
    subtitle: "Έρευνα ΕΣΕΕ/ΙΝΕΜΥ · Αύγουστος 2025",
    unit: "percent", frequency: "annual", comparison: "descriptive", sourceIds: ["esee-summer-2025"],
    caution: "Τα ποσοστά προέρχονται από διαφορετικές ερωτήσεις στην ίδια έρευνα και δεν αθροίζονται. Εμπειρίες και εκτιμήσεις συμμετεχουσών επιχειρήσεων — όχι εθνικό στατιστικό σύνολο πωλήσεων.",
    series: [
      {id:"summer-sales-down",label:"Χειρότερες πωλήσεις από 2024",points:[{period:"2025",year:2025,value:59}]},
      {id:"summer-footfall-down",label:"Χαμηλότερη επισκεψιμότητα",points:[{period:"2025",year:2025,value:51}]},
      {id:"summer-dissatisfied",label:"Λίγο ή καθόλου ικανοποιημένοι",points:[{period:"2025",year:2025,value:47}]},
      {id:"summer-keep-discounts",label:"Σχεδίαζαν συνέχιση προσφορών",points:[{period:"2025",year:2025,value:37}]}
    ]
  },
  {
    id: "ielka-food-choice-2025",
    title: "Πώς επιλέγουν τρόφιμα οι καταναλωτές",
    subtitle: "Έρευνα ΙΕΛΚΑ · 1.500 άτομα · Φεβρουάριος 2025",
    unit: "percent", frequency: "annual", comparison: "descriptive", sourceIds: ["ielka-consumer-2025"],
    caution: "Κύριο κριτήριο επιλογής τροφίμων ανά συμμετέχοντα. Εμφανίζονται μόνο οι δύο δημοσιευμένες εδώ κατηγορίες, όχι όλες οι πιθανές απαντήσεις. Διαφορετικό δείγμα από τις έρευνες επιχειρήσεων ΕΣΕΕ.",
    series: [
      {id:"ielka-cost-choice",label:"Χρηματική δαπάνη",points:[{period:"2025",year:2025,value:47}]},
      {id:"ielka-quality-choice",label:"Ποιότητα",points:[{period:"2025",year:2025,value:30}]}
    ]
  },
  {
    id: "ielka-offers-2025",
    title: "Συμπεριφορά απέναντι σε προσφορές",
    subtitle: "Ετήσια έρευνα ΙΕΛΚΑ · Φεβρουάριος 2025",
    unit: "percent", frequency: "annual", comparison: "descriptive", sourceIds: ["ielka-consumer-2025"],
    caution: "Δύο διαφορετικές ερωτήσεις: 58% αναζητούν ενεργά προσφορές, αλλά μόνο 19% λένε ότι προτιμούν προσφορές αντί χαμηλών σταθερών τιμών. Δεν είναι συμπληρωματικά ποσοστά ούτε δείκτης μεταβολής.",
    series: [
      {id:"ielka-offers-seek",label:"Αναζητούν ενεργά προσφορές",points:[{period:"2025",year:2025,value:58}]},
      {id:"ielka-offers-prefer",label:"Προτιμούν προσφορές από χαμηλές τιμές",points:[{period:"2025",year:2025,value:19}]}
    ]
  },
  {
    id: "annual-esi",
    title: "Οικονομικό κλίμα · ετήσιο",
    subtitle: "Ελλάδα, ΕΕ-27 και Ευρωζώνη · 2022–2025",
    unit: "index", frequency: "annual", comparison: "direct", sourceIds: ["iobe-2026", "ec-data"],
    caution: "Ίδιος εναρμονισμένος δείκτης και ίδια έκδοση δεδομένων (Οκτώβριος 2026). Το 2026 δεν είναι ολοκληρωμένο έτος και δεν παρουσιάζεται ως ετήσιος μέσος.",
    series: [
      { id: "esi-gr", label: "Ελλάδα", points: annual([104.9, 107.2, 107.6, 107.4]) },
      { id: "esi-eu", label: "ΕΕ-27", points: annual([101.8, 95.6, 96.3, 95.8]) },
      { id: "esi-ea", label: "Ευρωζώνη", points: annual([102.3, 96.4, 95.9, 95.6]) }
    ]
  },
  {
    id: "monthly-esi",
    title: "Οικονομικό κλίμα · σύγκριση ίδιων μηνών",
    subtitle: "Επικάλυψη 2025 και 2026 · επιλέξτε έτος και περιοχή",
    unit: "index", frequency: "month-of-year", comparison: "direct", sourceIds: ["iobe-2026", "ec-data"],
    caution: "Η επικάλυψη συγκρίνει τον ίδιο ημερολογιακό μήνα διαφορετικών ετών. Για το 2026 υπάρχουν στοιχεία μόνο έως τον Σεπτέμβριο· δεν υπολογίζεται μέσος όρος ολόκληρου έτους.",
    series: [
      { id: "mesi-gr25", label: "Ελλάδα · 2025", points: months([108.0,106.3,107.2,106.9,106.6,105.7,108.6,109.7,105.9,107.2,105.7,106.9],2025) },
      { id: "mesi-gr26", label: "Ελλάδα · 2026", points: months([105.1,107.6,106.8,105.8,107.3,107.8,107.2,106.9,107.6],2026) },
      { id: "mesi-eu25", label: "ΕΕ-27 · 2025", points: months([95.9,96.9,95.8,94.7,95.6,94.7,95.9,95.8,96.3,97.2,97.4,97.3],2025) },
      { id: "mesi-eu26", label: "ΕΕ-27 · 2026", points: months([98.9,98.2,96.6,93.8,94.2,95.7,97.3,98.3,97.9],2026) },
      { id: "mesi-ea25", label: "Ευρωζώνη · 2025", points: months([95.5,96.5,95.6,94.3,95.4,94.4,96.0,95.6,96.1,97.3,97.5,97.2],2025) },
      { id: "mesi-ea26", label: "Ευρωζώνη · 2026", points: months([99.1,98.3,96.8,93.7,94.3,95.6,97.1,98.4,97.9],2026) }
    ]
  },
  {
    id: "annual-balances",
    title: "Προσδοκίες ανά τομέα · ετήσιοι μέσοι",
    subtitle: "Ισοζύγια λιανεμπορίου, καταναλωτών, υπηρεσιών · 2022–2024",
    unit: "balance", frequency: "annual", comparison: "trend-only", sourceIds: ["bog-2025", "ec-data"],
    caution: "Οι τρεις σειρές είναι ισοζύγια αλλά μετρούν διαφορετικές έννοιες και πληθυσμούς. Η κοινή παράθεση δείχνει πορεία, όχι ισοδύναμη ένταση ή αιτιώδη σχέση.",
    series: [
      { id: "balance-retail", label: "Εμπιστοσύνη λιανεμπορίου", points: annual([5.3,21.3,12.6]) },
      { id: "balance-consumer", label: "Καταναλωτική εμπιστοσύνη", points: annual([-50.7,-40.0,-46.0]) },
      { id: "balance-services", label: "Εμπιστοσύνη υπηρεσιών", points: annual([26.4,31.5,39.7]) }
    ]
  },
  {
    id: "retail-september",
    title: "Επιχειρηματικές προσδοκίες λιανεμπορίου",
    subtitle: "Ίδιος μήνας κάθε έτους · Σεπτέμβριος 2023–2026",
    unit: "index", frequency: "annual", comparison: "direct", sourceIds: ["iobe-2023","iobe-2024","iobe-2025","iobe-2026"],
    caution: "Εθνικός δείκτης ΙΟΒΕ με βάση 2000–2010=100. Δεν είναι ο δείκτης εμπιστοσύνης λιανεμπορίου της ΕΕ σε μορφή ισοζυγίου. Οι ιστορικές εκδόσεις μπορεί να αναθεωρηθούν.",
    series: [{ id: "retail-sep", label: "Ελλάδα · Σεπτέμβριος", points: annual([124.3,97.5,97.8,116.0],2023) }]
  },
  {
    id: "retail-monthly",
    title: "Λιανεμπόριο · επικάλυψη μηνών",
    subtitle: "Εθνικός δείκτης προσδοκιών ΙΟΒΕ · 2025 vs 2026",
    unit: "index", frequency: "month-of-year", comparison: "direct", sourceIds: ["iobe-2026"],
    caution: "Ο ίδιος εθνικός δείκτης ΙΟΒΕ στα δύο έτη. Τα στοιχεία του 2026 τελειώνουν τον Σεπτέμβριο. Ο εθνικός δείκτης ΙΟΒΕ δεν είναι σε ίδια κλίμακα με το ευρωπαϊκό ισοζύγιο.",
    series: [
      { id: "retail-2025", label: "2025", points: months([93.8,98.4,94.9,98.6,100.4,105.9,93.4,91.1,97.8,106.4,113.5,97.2],2025) },
      { id: "retail-2026", label: "2026", points: months([101.0,110.7,104.9,105.6,104.5,108.3,116.8,112.7,116.0],2026) }
    ]
  },
  {
    id: "supermarket-prices",
    title: "Μεταβολή τιμών σούπερ μάρκετ",
    subtitle: "Ετήσιος ρυθμός μεταβολής τον Σεπτέμβριο · ΙΕΛΚΑ",
    unit: "percent", frequency: "annual", comparison: "direct", sourceIds: ["ielka-2025","ielka-2026"],
    caution: "Κάθε τιμή είναι η ετήσια μεταβολή τιμών για τον συγκεκριμένο Σεπτέμβριο στο οργανωμένο λιανεμπόριο τροφίμων — όχι επίπεδο τιμών. Η διαφορά των ρυθμών εκφράζεται σε ποσοστιαίες μονάδες.",
    series: [{ id: "ielka-september", label: "Σεπτέμβριος · ετήσια μεταβολή", points: annual([0.61,-0.75],2025) }]
  },
  {
    id: "holiday-survey",
    title: "Εορταστική αγορά · δηλώσεις επιχειρήσεων",
    subtitle: "ΕΣΕΕ / ΙΝΕΜΥ · εορτές 2025–2026",
    unit: "percent", frequency: "annual", comparison: "descriptive", sourceIds: ["esee-2026"],
    caution: "Διαφορετικές κατηγορίες απαντήσεων στην ΙΔΙΑ έρευνα, όχι χρονική εξέλιξη. Η έρευνα επιχειρήσεων δεν είναι μέτρηση τζίρου και δεν συγκρίνεται αριθμητικά με τις τιμές ΙΕΛΚΑ.",
    series: [
      { id: "holiday-lower", label: "Χαμηλότερες πωλήσεις", points: [{period:"2026",year:2026,value:52}] },
      { id: "holiday-same", label: "Αμετάβλητες πωλήσεις", points: [{period:"2026",year:2026,value:32}] }
    ]
  }
];

export function externalGroup(id: string): ExternalGroup | undefined {
  return EXTERNAL_GROUPS.find((group) => group.id === id);
}

export function externalChange(first: number, last: number): number {
  return Math.round((last - first) * 100) / 100;
}

export function externalCsvCell(value: string | number): string {
  const safe = typeof value === "number" ? String(value) : value.replace(/^[\s]*[=+\-@]/, (prefix) => "'" + prefix);
  return '"' + safe.replace(/"/g, '""') + '"';
}

export function externalCsv(group: ExternalGroup, chosenIds: readonly string[], start: number, end: number): string {
  const rows: (string | number)[][] = [["indicator","series","year","period","value","unit","source"]];
  const sources = group.sourceIds.map(id => EXTERNAL_STUDIES.find(study => study.id === id)?.url ?? id).join("; ");
  for (const line of group.series) {
    if (!chosenIds.includes(line.id)) continue;
    for (const point of line.points) {
      if (point.year < start || point.year > end) continue;
      rows.push([group.title,line.label,point.year,point.period,point.value,group.unit,sources]);
    }
  }
  return rows.map((row) => row.map(externalCsvCell).join(",")).join("\r\n") + "\r\n";
}
