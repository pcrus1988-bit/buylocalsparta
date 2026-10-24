/** Historic νομοί / prefecture map keys from the licensed GeoJSON asset.
 * Distinct from the 13 current administrative Περιφέρειες.
 */
export const GREECE_PREFECTURES = [
 {
  "key": "Pella",
  "label": "Πέλλα"
 },
 {
  "key": "Euritania",
  "label": "Ευρυτανία"
 },
 {
  "key": "Larisa",
  "label": "Λάρισα"
 },
 {
  "key": "Lakonia",
  "label": "Λακωνία"
 },
 {
  "key": "Heraklio",
  "label": "Ηράκλειο"
 },
 {
  "key": "Evros",
  "label": "Έβρος"
 },
 {
  "key": "Samos",
  "label": "Σάμος"
 },
 {
  "key": "Peiraias and islands",
  "label": "Πειραιάς και νήσοι"
 },
 {
  "key": "Chalkidiki",
  "label": "Χαλκιδική"
 },
 {
  "key": "Serres",
  "label": "Σέρρες"
 },
 {
  "key": "Kozani",
  "label": "Κοζάνη"
 },
 {
  "key": "Imathia",
  "label": "Ημαθία"
 },
 {
  "key": "Fthiotida",
  "label": "Φθιώτιδα"
 },
 {
  "key": "Chios",
  "label": "Χίος"
 },
 {
  "key": "Achaia",
  "label": "Αχαΐα"
 },
 {
  "key": "Florina",
  "label": "Φλώρινα"
 },
 {
  "key": "Preveza",
  "label": "Πρέβεζα"
 },
 {
  "key": "Evia",
  "label": "Εύβοια"
 },
 {
  "key": "Grevena",
  "label": "Γρεβενά"
 },
 {
  "key": "Athens",
  "label": "Αθήνα"
 },
 {
  "key": "Kefallonia",
  "label": "Κεφαλλονία"
 },
 {
  "key": "East Attica",
  "label": "Ανατολική Αττική"
 },
 {
  "key": "Rodopi",
  "label": "Ροδόπη"
 },
 {
  "key": "Korinthos",
  "label": "Κόρινθος"
 },
 {
  "key": "Chania",
  "label": "Χανιά"
 },
 {
  "key": "Lesvos",
  "label": "Λέσβος"
 },
 {
  "key": "Arkadia",
  "label": "Αρκαδία"
 },
 {
  "key": "Kastoria",
  "label": "Καστοριά"
 },
 {
  "key": "Zakynthos",
  "label": "Ζάκυνθος"
 },
 {
  "key": "Drama",
  "label": "Δράμα"
 },
 {
  "key": "Kyklades",
  "label": "Κυκλάδες"
 },
 {
  "key": "Lefkada",
  "label": "Λευκάδα"
 },
 {
  "key": "Viotia",
  "label": "Βοιωτία"
 },
 {
  "key": "Lasithio",
  "label": "Λασίθιο"
 },
 {
  "key": "Rethymno",
  "label": "Ρέθυμνο"
 },
 {
  "key": "Magnisia",
  "label": "Μαγνησία"
 },
 {
  "key": "Argolida",
  "label": "Αργολίδα"
 },
 {
  "key": "Kavala",
  "label": "Καβάλα"
 },
 {
  "key": "Ilia",
  "label": "Ηλεία"
 },
 {
  "key": "Karditsa",
  "label": "Καρδίτσα"
 },
 {
  "key": "Arta",
  "label": "Άρτα"
 },
 {
  "key": "Agio oros",
  "label": "Άγιο όρος"
 },
 {
  "key": "Thessaloniki",
  "label": "Θεσσαλονίκη"
 },
 {
  "key": "Xanthi",
  "label": "Ξάνθη"
 },
 {
  "key": "Dodekanisa",
  "label": "Δωδεκάνησα"
 },
 {
  "key": "Kilkis",
  "label": "Κιλκίς"
 },
 {
  "key": "Mesinia",
  "label": "Μεσσηνία"
 },
 {
  "key": "Thesprotia",
  "label": "Θεσπρωτία"
 },
 {
  "key": "Trikala",
  "label": "Τρίκαλα"
 },
 {
  "key": "Kerkyra",
  "label": "Κέρκυρα"
 },
 {
  "key": "Pieria",
  "label": "Πιερία"
 },
 {
  "key": "West Attica",
  "label": "Δυτική Αττική"
 },
 {
  "key": "Ioannina",
  "label": "Ιωάννινα"
 },
 {
  "key": "Fokida",
  "label": "Φωκίδα"
 },
 {
  "key": "Aitoloakarnania",
  "label": "Αιτωλοακαρνανία"
 }
] as const;
export const PREFECTURE_NAMES = new Map<string,string>(GREECE_PREFECTURES.map(p=>[p.key,p.label]));
