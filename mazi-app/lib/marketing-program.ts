/** Proposed MAZI financial model. NOT activated billing or a member cash account. */
export const MAZI_MONTHLY_PRICE_EUR = 250;
export const HUB_PRO_REFERENCE_PRICE_EUR = 99;
export const MONTHLY_SERVICE_TOKENS = 250;
export const MARKETING_LAUNCH_STATUS = "planned" as const;
export const marketingAllocation = [
  { key:"fund", title:"Αναπτυξιακό Ταμείο", percent:40 },
  { key:"marketing", title:"Συλλογική προβολή", percent:20 },
  { key:"services", title:"HUB PRO & υλοποίηση υπηρεσιών", percent:25 },
  { key:"operations", title:"Λειτουργία & τεχνολογία", percent:10 },
  { key:"reserve", title:"Αποθεματικό & συμμόρφωση", percent:5 }
] as const;
export const marketingChannels = [
  {number:"01",title:"Κοινές ψηφιακές καμπάνιες",description:"Ομαδικές καμπάνιες σε Meta, αναζήτηση και επιλεγμένα κανάλια, με τεκμηριωμένη στόχευση και προορισμό τη σχετική παρουσία στο KONTA ΜΟΥ."},
  {number:"02",title:"Τοπική και φυσική προβολή",description:"Περιφερειακές δράσεις, καταστήματα, QR, έντυπο υλικό, επιλεγμένες τοπικές εκδηλώσεις και παραδοσιακά μέσα όπου επαρκεί ο διαθέσιμος προϋπολογισμός."},
  {number:"03",title:"Προβολή στο KONTA ΜΟΥ",description:"Θεματικές συλλογές, επιλεγμένες προσφορές και εναλλασσόμενες προωθητικές θέσεις με καθαρή σήμανση διαφήμισης, χωρίς αλλοίωση οργανικών αποτελεσμάτων."},
  {number:"04",title:"Κοινό δημιουργικό",description:"Επιμελημένα κείμενα, γραφιστικά, βίντεο, προετοιμασία καταλόγων και δημιουργικά για πολλαπλές ανεξάρτητες επιχειρήσεις."},
  {number:"05",title:"Μετρήσιμα αποτελέσματα",description:"Δαπάνες, εγκεκριμένα δημιουργικά, εμφανίσεις, κλικ και επισκέψεις όπου υπάρχουν πραγματικά επαληθευμένα δεδομένα."}
] as const;
export const euro = (amount:number) => new Intl.NumberFormat("el-GR",{style:"currency",currency:"EUR",maximumFractionDigits:2}).format(amount);
