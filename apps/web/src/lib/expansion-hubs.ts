export const EXPANSION_REGION_LABELS = {
  ATT: "Αττική",
  PEL: "Πελοπόννησος",
  WGR: "Δυτική Ελλάδα",
  CGR: "Στερεά Ελλάδα",
  THS: "Θεσσαλία",
  EPI: "Ήπειρος",
  WMC: "Δυτική Μακεδονία",
  CMC: "Κεντρική Μακεδονία",
  EMT: "Ανατολική Μακεδονία και Θράκη",
  CRE: "Κρήτη",
  ION: "Ιόνια Νησιά",
  NAE: "Βόρειο Αιγαίο",
  SAE: "Νότιο Αιγαίο"
} as const;

export type ExpansionRegionCode = keyof typeof EXPANSION_REGION_LABELS;
export type ExpansionCoverageMode = "GEODESIC_RADIUS_25KM" | "ISLAND_LOCKED_RADIUS_25KM" | "WHOLE_ISLAND" | "LEGACY_SPARTA";
export type ExpansionHubClass = "METRO" | "MAJOR_CITY" | "REGIONAL_CENTER" | "SUBREGIONAL_CENTER" | "COVERAGE_NODE" | "ISLAND_PRIMARY" | "ISLAND_SECONDARY" | "LEGACY_PILOT";
export type ExpansionMarketTier = "T1" | "T2" | "T3" | "T4" | "T5";
export type ExpansionResearchPriority = "S" | "A" | "B" | "C";

export type ExpansionHub = Readonly<{
  id: string;
  nameEl: string;
  slug: string;
  regionCode: ExpansionRegionCode;
  regionEl: string;
  regionalUnit: string;
  latitude: number;
  longitude: number;
  radiusKm: 25;
  coverageMode: ExpansionCoverageMode;
  hubClass: ExpansionHubClass;
  marketTier: ExpansionMarketTier;
  researchPriority: ExpansionResearchPriority;
  isLive: boolean;
  isSpartaLegacy: boolean;
  futureSeoPath: string;
}>;

type HubSeed = readonly [
  id: string,
  nameEl: string,
  slug: string,
  regionCode: ExpansionRegionCode,
  regionalUnit: string,
  latitude: number,
  longitude: number,
  coverageMode: ExpansionCoverageMode,
  hubClass: ExpansionHubClass,
  marketTier: ExpansionMarketTier,
  researchPriority: ExpansionResearchPriority
];

// Source of truth: KONTA_MOU_Greece_Expansion_Master_2026 / Hub_Master.
// Keep this list aligned with the planning workbook. The UI deliberately does not
// infer island membership from distance: coverageMode remains explicit for that reason.
const HUB_SEEDS: readonly HubSeed[] = [
  ["KM-HUB-001", "Αθήνα", "athina", "ATT", "Central Athens", 37.9838, 23.7275, "GEODESIC_RADIUS_25KM", "METRO", "T1", "A"],
  ["KM-HUB-002", "Μέγαρα", "megara", "ATT", "West Attica", 37.9942, 23.3439, "GEODESIC_RADIUS_25KM", "SUBREGIONAL_CENTER", "T3", "B"],
  ["KM-HUB-003", "Ωρωπός", "oropos", "ATT", "East Attica", 38.3034, 23.755, "GEODESIC_RADIUS_25KM", "SUBREGIONAL_CENTER", "T3", "B"],
  ["KM-HUB-004", "Λαύριο", "lavrio", "ATT", "East Attica", 37.7145, 24.0565, "GEODESIC_RADIUS_25KM", "SUBREGIONAL_CENTER", "T3", "B"],
  ["KM-HUB-005", "Αίγινα", "aigina", "ATT", "Islands", 37.7467, 23.4275, "WHOLE_ISLAND", "ISLAND_PRIMARY", "T4", "C"],
  ["KM-HUB-006", "Πόρος", "poros", "ATT", "Islands", 37.4994, 23.4536, "WHOLE_ISLAND", "ISLAND_PRIMARY", "T5", "C"],
  ["KM-HUB-007", "Κύθηρα", "kythira", "ATT", "Islands", 36.149, 22.989, "WHOLE_ISLAND", "ISLAND_PRIMARY", "T5", "C"],
  ["KM-HUB-008", "Κόρινθος", "korinthos", "PEL", "Corinthia", 37.9386, 22.9322, "GEODESIC_RADIUS_25KM", "REGIONAL_CENTER", "T2", "A"],
  ["KM-HUB-009", "Ξυλόκαστρο", "xylokastro", "PEL", "Corinthia", 38.0776, 22.6317, "GEODESIC_RADIUS_25KM", "SUBREGIONAL_CENTER", "T4", "B"],
  ["KM-HUB-010", "Ναύπλιο", "nafplio", "PEL", "Argolis", 37.5686, 22.8069, "GEODESIC_RADIUS_25KM", "REGIONAL_CENTER", "T3", "A"],
  ["KM-HUB-011", "Κρανίδι", "kranidi", "PEL", "Argolis", 37.3797, 23.1597, "GEODESIC_RADIUS_25KM", "SUBREGIONAL_CENTER", "T4", "B"],
  ["KM-HUB-012", "Τρίπολη", "tripoli", "PEL", "Arcadia", 37.5089, 22.3794, "GEODESIC_RADIUS_25KM", "REGIONAL_CENTER", "T2", "A"],
  ["KM-HUB-013", "Λεωνίδιο", "leonidio", "PEL", "Arcadia", 37.1668, 22.8577, "GEODESIC_RADIUS_25KM", "COVERAGE_NODE", "T5", "C"],
  ["KM-HUB-014", "Μεγαλόπολη", "megalopoli", "PEL", "Arcadia", 37.4011, 22.1422, "GEODESIC_RADIUS_25KM", "COVERAGE_NODE", "T4", "B"],
  ["KM-HUB-015", "Σπάρτη", "sparti", "PEL", "Laconia", 37.0745, 22.4303, "LEGACY_SPARTA", "LEGACY_PILOT", "T3", "S"],
  ["KM-HUB-016", "Γύθειο", "gytheio", "PEL", "Laconia", 36.761, 22.5652, "GEODESIC_RADIUS_25KM", "SUBREGIONAL_CENTER", "T4", "B"],
  ["KM-HUB-017", "Μολάοι", "molai", "PEL", "Laconia", 36.8074, 22.8513, "GEODESIC_RADIUS_25KM", "SUBREGIONAL_CENTER", "T4", "B"],
  ["KM-HUB-018", "Αρεόπολη", "areopoli", "PEL", "Laconia", 36.6667, 22.3833, "GEODESIC_RADIUS_25KM", "COVERAGE_NODE", "T5", "C"],
  ["KM-HUB-019", "Καλαμάτα", "kalamata", "PEL", "Messenia", 37.0389, 22.1142, "GEODESIC_RADIUS_25KM", "REGIONAL_CENTER", "T2", "A"],
  ["KM-HUB-020", "Πύλος", "pylos", "PEL", "Messenia", 36.9125, 21.6965, "GEODESIC_RADIUS_25KM", "SUBREGIONAL_CENTER", "T4", "B"],
  ["KM-HUB-021", "Κυπαρισσία", "kyparissia", "PEL", "Messenia", 37.2511, 21.6736, "GEODESIC_RADIUS_25KM", "SUBREGIONAL_CENTER", "T4", "B"],
  ["KM-HUB-022", "Πάτρα", "patra", "WGR", "Achaea", 38.2466, 21.7346, "GEODESIC_RADIUS_25KM", "MAJOR_CITY", "T1", "A"],
  ["KM-HUB-023", "Αίγιο", "aigio", "WGR", "Achaea", 38.2486, 22.0819, "GEODESIC_RADIUS_25KM", "SUBREGIONAL_CENTER", "T3", "B"],
  ["KM-HUB-024", "Καλάβρυτα", "kalavryta", "WGR", "Achaea", 38.0327, 22.1122, "GEODESIC_RADIUS_25KM", "COVERAGE_NODE", "T5", "C"],
  ["KM-HUB-025", "Πύργος", "pyrgos", "WGR", "Elis", 37.6751, 21.441, "GEODESIC_RADIUS_25KM", "REGIONAL_CENTER", "T3", "A"],
  ["KM-HUB-026", "Μεσολόγγι", "mesolongi", "WGR", "Aetolia-Acarnania", 38.3694, 21.429, "GEODESIC_RADIUS_25KM", "REGIONAL_CENTER", "T3", "B"],
  ["KM-HUB-027", "Αγρίνιο", "agrinio", "WGR", "Aetolia-Acarnania", 38.6214, 21.4078, "GEODESIC_RADIUS_25KM", "REGIONAL_CENTER", "T2", "A"],
  ["KM-HUB-028", "Αμφιλοχία", "amfilochia", "WGR", "Aetolia-Acarnania", 38.8583, 21.1664, "GEODESIC_RADIUS_25KM", "SUBREGIONAL_CENTER", "T4", "B"],
  ["KM-HUB-029", "Λαμία", "lamia", "CGR", "Phthiotis", 38.9, 22.4333, "GEODESIC_RADIUS_25KM", "REGIONAL_CENTER", "T2", "A"],
  ["KM-HUB-030", "Αταλάντη", "atalanti", "CGR", "Phthiotis", 38.6515, 22.9996, "GEODESIC_RADIUS_25KM", "SUBREGIONAL_CENTER", "T4", "B"],
  ["KM-HUB-031", "Λιβαδειά", "livadeia", "CGR", "Boeotia", 38.435, 22.8739, "GEODESIC_RADIUS_25KM", "REGIONAL_CENTER", "T3", "B"],
  ["KM-HUB-032", "Θήβα", "thiva", "CGR", "Boeotia", 38.325, 23.3189, "GEODESIC_RADIUS_25KM", "REGIONAL_CENTER", "T3", "A"],
  ["KM-HUB-033", "Άμφισσα", "amfissa", "CGR", "Phocis", 38.5281, 22.3771, "GEODESIC_RADIUS_25KM", "REGIONAL_CENTER", "T4", "B"],
  ["KM-HUB-034", "Καρπενήσι", "karpenisi", "CGR", "Evrytania", 38.9122, 21.7986, "GEODESIC_RADIUS_25KM", "REGIONAL_CENTER", "T4", "B"],
  ["KM-HUB-035", "Χαλκίδα", "chalkida", "CGR", "Euboea", 38.4635, 23.6028, "ISLAND_LOCKED_RADIUS_25KM", "REGIONAL_CENTER", "T2", "A"],
  ["KM-HUB-036", "Αλιβέρι", "aliveri", "CGR", "Euboea", 38.4167, 24.0333, "ISLAND_LOCKED_RADIUS_25KM", "SUBREGIONAL_CENTER", "T4", "B"],
  ["KM-HUB-037", "Κύμη", "kymi", "CGR", "Euboea", 38.634, 24.102, "ISLAND_LOCKED_RADIUS_25KM", "SUBREGIONAL_CENTER", "T5", "C"],
  ["KM-HUB-038", "Ιστιαία", "istiaia", "CGR", "Euboea", 38.9552, 23.1521, "ISLAND_LOCKED_RADIUS_25KM", "SUBREGIONAL_CENTER", "T4", "B"],
  ["KM-HUB-039", "Κάρυστος", "karystos", "CGR", "Euboea", 38.0137, 24.4169, "ISLAND_LOCKED_RADIUS_25KM", "SUBREGIONAL_CENTER", "T4", "B"],
  ["KM-HUB-040", "Σκύρος", "skyros", "CGR", "Euboea", 38.904, 24.5631, "WHOLE_ISLAND", "ISLAND_PRIMARY", "T5", "C"],
  ["KM-HUB-041", "Λάρισα", "larisa", "THS", "Larissa", 39.639, 22.4191, "GEODESIC_RADIUS_25KM", "MAJOR_CITY", "T1", "A"],
  ["KM-HUB-042", "Βόλος", "volos", "THS", "Magnesia", 39.361, 22.9422, "GEODESIC_RADIUS_25KM", "MAJOR_CITY", "T1", "A"],
  ["KM-HUB-043", "Τρίκαλα", "trikala", "THS", "Trikala", 39.5553, 21.7679, "GEODESIC_RADIUS_25KM", "REGIONAL_CENTER", "T2", "A"],
  ["KM-HUB-044", "Καρδίτσα", "karditsa", "THS", "Karditsa", 39.3646, 21.9215, "GEODESIC_RADIUS_25KM", "REGIONAL_CENTER", "T2", "A"],
  ["KM-HUB-045", "Καλαμπάκα", "kalampaka", "THS", "Trikala", 39.7044, 21.626, "GEODESIC_RADIUS_25KM", "SUBREGIONAL_CENTER", "T4", "B"],
  ["KM-HUB-046", "Ελασσόνα", "elassona", "THS", "Larissa", 39.8947, 22.1886, "GEODESIC_RADIUS_25KM", "SUBREGIONAL_CENTER", "T4", "B"],
  ["KM-HUB-047", "Φάρσαλα", "farsala", "THS", "Larissa", 39.2947, 22.3847, "GEODESIC_RADIUS_25KM", "SUBREGIONAL_CENTER", "T4", "B"],
  ["KM-HUB-048", "Αλμυρός", "almyros", "THS", "Magnesia", 39.182, 22.7594, "GEODESIC_RADIUS_25KM", "SUBREGIONAL_CENTER", "T4", "B"],
  ["KM-HUB-049", "Αγιά", "agia-larisas", "THS", "Larissa", 39.7188, 22.7587, "GEODESIC_RADIUS_25KM", "COVERAGE_NODE", "T5", "C"],
  ["KM-HUB-050", "Σκιάθος", "skiathos", "THS", "Sporades", 39.1624, 23.4909, "WHOLE_ISLAND", "ISLAND_PRIMARY", "T4", "B"],
  ["KM-HUB-051", "Ιωάννινα", "ioannina", "EPI", "Ioannina", 39.665, 20.8537, "GEODESIC_RADIUS_25KM", "MAJOR_CITY", "T2", "A"],
  ["KM-HUB-052", "Κόνιτσα", "konitsa", "EPI", "Ioannina", 40.0486, 20.7569, "GEODESIC_RADIUS_25KM", "COVERAGE_NODE", "T5", "C"],
  ["KM-HUB-053", "Μέτσοβο", "metsovo", "EPI", "Ioannina", 39.7703, 21.1822, "GEODESIC_RADIUS_25KM", "COVERAGE_NODE", "T5", "C"],
  ["KM-HUB-054", "Άρτα", "arta", "EPI", "Arta", 39.16, 20.9877, "GEODESIC_RADIUS_25KM", "REGIONAL_CENTER", "T3", "A"],
  ["KM-HUB-055", "Πρέβεζα", "preveza", "EPI", "Preveza", 38.9562, 20.7506, "GEODESIC_RADIUS_25KM", "REGIONAL_CENTER", "T3", "A"],
  ["KM-HUB-056", "Ηγουμενίτσα", "igoumenitsa", "EPI", "Thesprotia", 39.5034, 20.2673, "GEODESIC_RADIUS_25KM", "REGIONAL_CENTER", "T3", "A"],
  ["KM-HUB-057", "Πάργα", "parga", "EPI", "Preveza", 39.2855, 20.4006, "GEODESIC_RADIUS_25KM", "SUBREGIONAL_CENTER", "T4", "B"],
  ["KM-HUB-058", "Παραμυθιά", "paramythia", "EPI", "Thesprotia", 39.4711, 20.5111, "GEODESIC_RADIUS_25KM", "COVERAGE_NODE", "T5", "C"],
  ["KM-HUB-059", "Κοζάνη", "kozani", "WMC", "Kozani", 40.3007, 21.7889, "GEODESIC_RADIUS_25KM", "REGIONAL_CENTER", "T2", "A"],
  ["KM-HUB-060", "Πτολεμαΐδα", "ptolemaida", "WMC", "Kozani", 40.5147, 21.6786, "GEODESIC_RADIUS_25KM", "REGIONAL_CENTER", "T3", "A"],
  ["KM-HUB-061", "Φλώρινα", "florina", "WMC", "Florina", 40.782, 21.4098, "GEODESIC_RADIUS_25KM", "REGIONAL_CENTER", "T3", "B"],
  ["KM-HUB-062", "Καστοριά", "kastoria", "WMC", "Kastoria", 40.5217, 21.2634, "GEODESIC_RADIUS_25KM", "REGIONAL_CENTER", "T3", "A"],
  ["KM-HUB-063", "Γρεβενά", "grevena", "WMC", "Grevena", 40.0845, 21.4274, "GEODESIC_RADIUS_25KM", "REGIONAL_CENTER", "T4", "B"],
  ["KM-HUB-064", "Θεσσαλονίκη", "thessaloniki", "CMC", "Thessaloniki", 40.6401, 22.9444, "GEODESIC_RADIUS_25KM", "METRO", "T1", "A"],
  ["KM-HUB-065", "Κατερίνη", "katerini", "CMC", "Pieria", 40.2696, 22.506, "GEODESIC_RADIUS_25KM", "REGIONAL_CENTER", "T2", "A"],
  ["KM-HUB-066", "Βέροια", "veria", "CMC", "Imathia", 40.5244, 22.2024, "GEODESIC_RADIUS_25KM", "REGIONAL_CENTER", "T2", "A"],
  ["KM-HUB-067", "Έδεσσα", "edessa", "CMC", "Pella", 40.8026, 22.0475, "GEODESIC_RADIUS_25KM", "REGIONAL_CENTER", "T3", "B"],
  ["KM-HUB-068", "Γιαννιτσά", "giannitsa", "CMC", "Pella", 40.7919, 22.4075, "GEODESIC_RADIUS_25KM", "REGIONAL_CENTER", "T2", "A"],
  ["KM-HUB-069", "Κιλκίς", "kilkis", "CMC", "Kilkis", 40.993, 22.875, "GEODESIC_RADIUS_25KM", "REGIONAL_CENTER", "T3", "B"],
  ["KM-HUB-070", "Πολύκαστρο", "polykastro", "CMC", "Kilkis", 40.9942, 22.5694, "GEODESIC_RADIUS_25KM", "SUBREGIONAL_CENTER", "T4", "B"],
  ["KM-HUB-071", "Σέρρες", "serres", "CMC", "Serres", 41.0856, 23.5497, "GEODESIC_RADIUS_25KM", "MAJOR_CITY", "T2", "A"],
  ["KM-HUB-072", "Πολύγυρος", "polygyros", "CMC", "Chalkidiki", 40.377, 23.441, "GEODESIC_RADIUS_25KM", "REGIONAL_CENTER", "T4", "B"],
  ["KM-HUB-073", "Νέα Μουδανιά", "nea-moudania", "CMC", "Chalkidiki", 40.242, 23.284, "GEODESIC_RADIUS_25KM", "SUBREGIONAL_CENTER", "T3", "A"],
  ["KM-HUB-074", "Νικήτη", "nikiti", "CMC", "Chalkidiki", 40.2237, 23.6688, "GEODESIC_RADIUS_25KM", "SUBREGIONAL_CENTER", "T4", "B"],
  ["KM-HUB-075", "Ιερισσός", "ierissos", "CMC", "Chalkidiki", 40.3981, 23.8758, "GEODESIC_RADIUS_25KM", "SUBREGIONAL_CENTER", "T4", "B"],
  ["KM-HUB-076", "Καβάλα", "kavala", "EMT", "Kavala", 40.9396, 24.4069, "GEODESIC_RADIUS_25KM", "MAJOR_CITY", "T2", "A"],
  ["KM-HUB-077", "Δράμα", "drama", "EMT", "Drama", 41.149, 24.1471, "GEODESIC_RADIUS_25KM", "REGIONAL_CENTER", "T2", "A"],
  ["KM-HUB-078", "Ξάνθη", "xanthi", "EMT", "Xanthi", 41.1349, 24.888, "GEODESIC_RADIUS_25KM", "REGIONAL_CENTER", "T2", "A"],
  ["KM-HUB-079", "Κομοτηνή", "komotini", "EMT", "Rhodope", 41.1181, 25.4054, "GEODESIC_RADIUS_25KM", "REGIONAL_CENTER", "T2", "A"],
  ["KM-HUB-080", "Αλεξανδρούπολη", "alexandroupoli", "EMT", "Evros", 40.8457, 25.8739, "GEODESIC_RADIUS_25KM", "MAJOR_CITY", "T2", "A"],
  ["KM-HUB-081", "Διδυμότειχο", "didymoteicho", "EMT", "Evros", 41.3496, 26.4961, "GEODESIC_RADIUS_25KM", "SUBREGIONAL_CENTER", "T4", "B"],
  ["KM-HUB-082", "Ορεστιάδα", "orestiada", "EMT", "Evros", 41.5031, 26.5297, "GEODESIC_RADIUS_25KM", "REGIONAL_CENTER", "T3", "A"],
  ["KM-HUB-083", "Λιμένας Θάσου", "limenas-thasou", "EMT", "Kavala", 40.7781, 24.7094, "ISLAND_LOCKED_RADIUS_25KM", "ISLAND_PRIMARY", "T4", "B"],
  ["KM-HUB-084", "Λιμενάρια Θάσου", "limenaria-thasou", "EMT", "Kavala", 40.6273, 24.5762, "ISLAND_LOCKED_RADIUS_25KM", "ISLAND_SECONDARY", "T5", "C"],
  ["KM-HUB-085", "Καμαριώτισσα", "kamariotissa-samothrakis", "EMT", "Evros", 40.4743, 25.4761, "WHOLE_ISLAND", "ISLAND_PRIMARY", "T5", "C"],
  ["KM-HUB-086", "Κίσσαμος", "kissamos", "CRE", "Chania", 35.4939, 23.6576, "ISLAND_LOCKED_RADIUS_25KM", "SUBREGIONAL_CENTER", "T4", "B"],
  ["KM-HUB-087", "Χανιά", "chania", "CRE", "Chania", 35.5138, 24.018, "ISLAND_LOCKED_RADIUS_25KM", "MAJOR_CITY", "T2", "A"],
  ["KM-HUB-088", "Παλαιόχωρα", "palaiochora", "CRE", "Chania", 35.2315, 23.6819, "ISLAND_LOCKED_RADIUS_25KM", "COVERAGE_NODE", "T5", "C"],
  ["KM-HUB-089", "Ρέθυμνο", "rethymno", "CRE", "Rethymno", 35.3656, 24.4823, "ISLAND_LOCKED_RADIUS_25KM", "REGIONAL_CENTER", "T2", "A"],
  ["KM-HUB-090", "Πλακιάς", "plakias", "CRE", "Rethymno", 35.1928, 24.394, "ISLAND_LOCKED_RADIUS_25KM", "COVERAGE_NODE", "T5", "C"],
  ["KM-HUB-091", "Ηράκλειο", "irakleio", "CRE", "Heraklion", 35.3387, 25.1442, "ISLAND_LOCKED_RADIUS_25KM", "MAJOR_CITY", "T1", "A"],
  ["KM-HUB-092", "Μοίρες", "moires", "CRE", "Heraklion", 35.0514, 24.8733, "ISLAND_LOCKED_RADIUS_25KM", "SUBREGIONAL_CENTER", "T4", "B"],
  ["KM-HUB-093", "Άγιος Νικόλαος", "agios-nikolaos", "CRE", "Lasithi", 35.1911, 25.7134, "ISLAND_LOCKED_RADIUS_25KM", "REGIONAL_CENTER", "T3", "A"],
  ["KM-HUB-094", "Ιεράπετρα", "ierapetra", "CRE", "Lasithi", 35.0119, 25.7407, "ISLAND_LOCKED_RADIUS_25KM", "REGIONAL_CENTER", "T3", "A"],
  ["KM-HUB-095", "Σητεία", "sitia", "CRE", "Lasithi", 35.2087, 26.1048, "ISLAND_LOCKED_RADIUS_25KM", "REGIONAL_CENTER", "T4", "B"],
  ["KM-HUB-096", "Κέρκυρα", "kerkyra", "ION", "Corfu", 39.6243, 19.9217, "ISLAND_LOCKED_RADIUS_25KM", "ISLAND_PRIMARY", "T2", "A"],
  ["KM-HUB-097", "Σιδάρι", "sidari", "ION", "Corfu", 39.79, 19.704, "ISLAND_LOCKED_RADIUS_25KM", "ISLAND_SECONDARY", "T4", "B"],
  ["KM-HUB-098", "Λευκίμμη", "lefkimmi", "ION", "Corfu", 39.4231, 20.0707, "ISLAND_LOCKED_RADIUS_25KM", "ISLAND_SECONDARY", "T4", "B"],
  ["KM-HUB-099", "Λευκάδα", "lefkada", "ION", "Lefkada", 38.8302, 20.7047, "WHOLE_ISLAND", "ISLAND_PRIMARY", "T3", "A"],
  ["KM-HUB-100", "Αργοστόλι", "argostoli", "ION", "Kefalonia", 38.1754, 20.4886, "ISLAND_LOCKED_RADIUS_25KM", "ISLAND_PRIMARY", "T3", "A"],
  ["KM-HUB-101", "Σάμη", "sami-kefalonias", "ION", "Kefalonia", 38.2526, 20.6465, "ISLAND_LOCKED_RADIUS_25KM", "ISLAND_SECONDARY", "T5", "C"],
  ["KM-HUB-102", "Βαθύ Ιθάκης", "vathy-ithakis", "ION", "Ithaca", 38.3642, 20.7185, "WHOLE_ISLAND", "ISLAND_PRIMARY", "T5", "C"],
  ["KM-HUB-103", "Ζάκυνθος", "zakynthos", "ION", "Zakynthos", 37.787, 20.8999, "WHOLE_ISLAND", "ISLAND_PRIMARY", "T2", "A"],
  ["KM-HUB-104", "Γάιος Παξών", "gaios-paxoi", "ION", "Corfu", 39.1978, 20.1858, "WHOLE_ISLAND", "ISLAND_PRIMARY", "T5", "C"],
  ["KM-HUB-105", "Μυτιλήνη", "mytilini", "NAE", "Lesbos", 39.1067, 26.5553, "ISLAND_LOCKED_RADIUS_25KM", "ISLAND_PRIMARY", "T2", "A"],
  ["KM-HUB-106", "Καλλονή Λέσβου", "kalloni-lesvou", "NAE", "Lesbos", 39.2324, 26.2073, "ISLAND_LOCKED_RADIUS_25KM", "ISLAND_SECONDARY", "T4", "B"],
  ["KM-HUB-107", "Μόλυβος", "mythimna-molyvos", "NAE", "Lesbos", 39.368, 26.174, "ISLAND_LOCKED_RADIUS_25KM", "ISLAND_SECONDARY", "T5", "C"],
  ["KM-HUB-108", "Χίος", "chios", "NAE", "Chios", 38.3682, 26.1359, "ISLAND_LOCKED_RADIUS_25KM", "ISLAND_PRIMARY", "T2", "A"],
  ["KM-HUB-109", "Πυργί Χίου", "pyrgi-chiou", "NAE", "Chios", 38.2262, 25.999, "ISLAND_LOCKED_RADIUS_25KM", "ISLAND_SECONDARY", "T5", "C"],
  ["KM-HUB-110", "Βαθύ Σάμου", "vathy-samou", "NAE", "Samos", 37.7548, 26.9778, "ISLAND_LOCKED_RADIUS_25KM", "ISLAND_PRIMARY", "T3", "A"],
  ["KM-HUB-111", "Καρλόβασι", "karlovasi", "NAE", "Samos", 37.7953, 26.7044, "ISLAND_LOCKED_RADIUS_25KM", "ISLAND_SECONDARY", "T4", "B"],
  ["KM-HUB-112", "Μύρινα", "myrina", "NAE", "Lemnos", 39.8748, 25.0636, "ISLAND_LOCKED_RADIUS_25KM", "ISLAND_PRIMARY", "T4", "B"],
  ["KM-HUB-113", "Μούδρος", "moudros", "NAE", "Lemnos", 39.872, 25.269, "ISLAND_LOCKED_RADIUS_25KM", "ISLAND_SECONDARY", "T5", "C"],
  ["KM-HUB-114", "Άγιος Κήρυκος", "agios-kirykos", "NAE", "Ikaria", 37.6153, 26.2945, "WHOLE_ISLAND", "ISLAND_PRIMARY", "T5", "C"],
  ["KM-HUB-115", "Ρόδος", "rodos", "SAE", "Rhodes", 36.4341, 28.2176, "ISLAND_LOCKED_RADIUS_25KM", "ISLAND_PRIMARY", "T1", "A"],
  ["KM-HUB-116", "Λίνδος", "lindos", "SAE", "Rhodes", 36.0917, 28.0853, "ISLAND_LOCKED_RADIUS_25KM", "ISLAND_SECONDARY", "T4", "B"],
  ["KM-HUB-117", "Γεννάδι", "gennadi", "SAE", "Rhodes", 36.0236, 27.9235, "ISLAND_LOCKED_RADIUS_25KM", "ISLAND_SECONDARY", "T5", "C"],
  ["KM-HUB-118", "Κως", "kos", "SAE", "Kos", 36.8933, 27.2889, "ISLAND_LOCKED_RADIUS_25KM", "ISLAND_PRIMARY", "T2", "A"],
  ["KM-HUB-119", "Κέφαλος", "kefalos", "SAE", "Kos", 36.7454, 26.9584, "ISLAND_LOCKED_RADIUS_25KM", "ISLAND_SECONDARY", "T5", "C"],
  ["KM-HUB-120", "Κάλυμνος", "kalymnos", "SAE", "Kalymnos", 36.9488, 26.983, "WHOLE_ISLAND", "ISLAND_PRIMARY", "T3", "A"],
  ["KM-HUB-121", "Λέρος", "leros", "SAE", "Kalymnos", 37.1323, 26.852, "WHOLE_ISLAND", "ISLAND_PRIMARY", "T4", "B"],
  ["KM-HUB-122", "Πάτμος", "patmos", "SAE", "Kalymnos", 37.3098, 26.5478, "WHOLE_ISLAND", "ISLAND_PRIMARY", "T4", "B"],
  ["KM-HUB-123", "Πηγάδια Καρπάθου", "pigadia-karpathou", "SAE", "Karpathos-Kasos", 35.507, 27.213, "WHOLE_ISLAND", "ISLAND_PRIMARY", "T4", "B"],
  ["KM-HUB-124", "Ερμούπολη", "ermoupoli", "SAE", "Syros", 37.444, 24.942, "WHOLE_ISLAND", "ISLAND_PRIMARY", "T3", "A"],
  ["KM-HUB-125", "Νάξος", "naxos", "SAE", "Naxos", 37.1036, 25.376, "WHOLE_ISLAND", "ISLAND_PRIMARY", "T3", "A"],
  ["KM-HUB-126", "Παροικιά", "parikia", "SAE", "Paros", 37.0853, 25.1486, "WHOLE_ISLAND", "ISLAND_PRIMARY", "T3", "A"],
  ["KM-HUB-127", "Μύκονος", "mykonos", "SAE", "Mykonos", 37.4467, 25.3289, "WHOLE_ISLAND", "ISLAND_PRIMARY", "T2", "A"],
  ["KM-HUB-128", "Τήνος", "tinos", "SAE", "Tinos", 37.5375, 25.1634, "WHOLE_ISLAND", "ISLAND_PRIMARY", "T4", "B"],
  ["KM-HUB-129", "Φηρά", "fira", "SAE", "Thira", 36.4167, 25.4333, "WHOLE_ISLAND", "ISLAND_PRIMARY", "T2", "A"],
  ["KM-HUB-130", "Αδάμαντας Μήλου", "adamas-milou", "SAE", "Milos", 36.725, 24.446, "WHOLE_ISLAND", "ISLAND_PRIMARY", "T4", "B"],
  ["KM-HUB-131", "Χώρα Άνδρου", "chora-androu", "SAE", "Andros", 37.838, 24.937, "WHOLE_ISLAND", "ISLAND_PRIMARY", "T4", "B"]
];

export const EXPANSION_HUBS: readonly ExpansionHub[] = HUB_SEEDS.map(([
  id,
  nameEl,
  slug,
  regionCode,
  regionalUnit,
  latitude,
  longitude,
  coverageMode,
  hubClass,
  marketTier,
  researchPriority
]) => {
  const isSpartaLegacy = id === "KM-HUB-015";
  return {
    id,
    nameEl,
    slug,
    regionCode,
    regionEl: EXPANSION_REGION_LABELS[regionCode],
    regionalUnit,
    latitude,
    longitude,
    radiusKm: 25,
    coverageMode,
    hubClass,
    marketTier,
    researchPriority,
    isLive: isSpartaLegacy,
    isSpartaLegacy,
    futureSeoPath: isSpartaLegacy ? "/" : `/agora/${slug}`
  };
});

export const EXPANSION_REGION_CODES = Object.keys(EXPANSION_REGION_LABELS) as ExpansionRegionCode[];

export function getExpansionHubBySlug(slug: string): ExpansionHub | undefined {
  return EXPANSION_HUBS.find((hub) => hub.slug === slug);
}

export function assertExpansionHubMaster(): void {
  if (EXPANSION_HUBS.length !== 131) {
    throw new Error(`Expansion hub master must contain 131 hubs; found ${EXPANSION_HUBS.length}`);
  }
  if (!EXPANSION_HUBS.some((hub) => hub.id === "KM-HUB-015" && hub.isSpartaLegacy)) {
    throw new Error("Expansion hub master must preserve Sparta as KM-HUB-015");
  }
}
