/**
 * Fixed editorial structure for Ελληνικό Λιανεμπόριο 2026.
 *
 * Added during fieldwork, AFTER the locked plan: chapters are editorial;
 * all new two-group associations are exploratory, never preregistered.
 * The private randomized marketplace choice experiment EXP01 is excluded.
 */
export type ResearchPublicChapter = Readonly<{
  id: string;
  number: string;
  title: string;
  subtitle: string;
  questions: readonly string[];
  metrics: readonly string[];
  relationIds: readonly string[];
  scientificNote: string;
}>;

export const RESEARCH_PUBLIC_CHAPTERS: readonly ResearchPublicChapter[] = [
  {
    id: "economic-viability", number: "01",
    title: "Οικονομικές πιέσεις και βιωσιμότητα",
    subtitle: "Τζίρος, κερδοφορία, λειτουργικό κόστος και πιέσεις στη βιωσιμότητα",
    questions: ["Q02", "Q21", "Q27"],
    metrics: [
      "business_financial_trends_12m.operating_costs.share.increased",
      "business_financial_trends_12m.profitability.share.decreased",
      "business_financial_divergence.share.turnover_up_profit_down",
      "economic_viability_pressures.share.purchasing_power",
      "economic_viability_pressures.share.suppliers",
      "economic_viability_pressures.share.liquidity"
    ],
    relationIds: ["costs-and-profit", "size-and-profit"],
    scientificNote: "Οι μεταβολές είναι αυτοαναφερόμενες κατευθύνσεις, όχι καταγεγραμμένα ποσά ισολογισμών. Η ταυτόχρονη αύξηση κόστους και πτώση κερδοφορίας δεν τεκμηριώνει αιτιότητα."
  },
  {
    id: "digital-transformation", number: "02",
    title: "Ψηφιακή ετοιμότητα και ηλεκτρονικό εμπόριο",
    subtitle: "Εργαλεία, διαδικτυακές πωλήσεις, ψηφιακή ωριμότητα και εμπόδια εισόδου",
    questions: ["Q03", "Q04", "Q05", "Q06", "Q22", "Q24"],
    metrics: [
      "digital_readiness.mean",
      "sales_channels.share.own_eshop",
      "digital_sales_share.share.0",
      "digital_capabilities.stock_sync.share.yes",
      "catalog_update_frequency.share.realtime",
      "first_online_sale_barriers.share.technical_skills"
    ],
    relationIds: ["digital-and-growth", "eshop-and-growth"],
    scientificNote: "Ο δείκτης ψηφιακής ετοιμότητας είναι σύνθετη μετρήσιμη κλίμακα. Η σχέση ψηφιοποίησης και ανάπτυξης είναι συσχέτιση και μπορεί να επηρεάζεται από μέγεθος και κλάδο."
  },
  {
    id: "customers-local", number: "03",
    title: "Πελάτες και τοπική εμπορική αγορά",
    subtitle: "Πηγές νέων πελατών, τοπική εξάρτηση και επίδραση της διαδικτυακής παρουσίας",
    questions: ["Q09", "Q10", "Q11", "Q12", "Q25", "Q26"],
    metrics: [
      "customer_acquisition_sources.share.word_of_mouth",
      "customer_acquisition_sources.share.google",
      "acquisition_difficulty_change.mean",
      "local_customer_share.share.76_100",
      "local_product_discovery_importance.mean",
      "online_presence_local_store_impact.share.increased_some"
    ],
    relationIds: ["local-and-discovery", "online-and-store"],
    scientificNote: "Η Q25 καταγράφει την εκτίμηση των επιχειρήσεων για επισκέψεις/αγορές και όχι μετρημένη μεταβολή πελατείας. Η Q26 αφορά μόνο την υπό όρους προσδοκία χωρίς ουσιαστική online παρουσία."
  },
  {
    id: "daily-frictions", number: "04",
    title: "Λειτουργικές δυσκολίες και εμπόδια ανάπτυξης",
    subtitle: "Απόθεμα, τεχνολογία, διοίκηση, logistics και εύρεση πελατών",
    questions: ["Q05", "Q06", "Q07", "Q08", "Q18"],
    metrics: [
      "retail_friction.mean",
      "operational_friction.stock.mean",
      "operational_friction.acquisition.mean",
      "operational_friction.admin.mean",
      "top_growth_barriers.share.acquisition",
      "top_growth_barriers.share.platform_cost"
    ],
    relationIds: ["stock-tools-and-friction", "catalog-tools-and-friction"],
    scientificNote: "Οι βαθμολογίες δυσκολίας απεικονίζουν υποκειμενικές εμπειρίες. Οι τρεις επιλεγμένες δυσκολίες ανά επιχείρηση είναι πολλαπλές αποκρίσεις: τα ποσοστά δεν αθροίζουν σε 100%."
  },
  {
    id: "investment-confidence", number: "05",
    title: "Εμπιστοσύνη, επενδύσεις και προοπτικές",
    subtitle: "Προσδοκίες 12μήνου, χρηματοδότηση επενδύσεων και μελλοντικά σχέδια",
    questions: ["Q16", "Q17", "Q19", "Q20", "Q21"],
    metrics: [
      "retail_confidence.mean",
      "sales_outlook.share.up_small",
      "sales_outlook.share.down_small",
      "investment_capacity_confidence_12m.share.unlikely",
      "investment_intentions.share.none",
      "investment_intentions.share.erp"
    ],
    relationIds: ["finance-and-investment", "profit-and-optimism"],
    scientificNote: "Οι προσδοκίες για τους επόμενους 12 μήνες δεν είναι προβλέψεις πραγματικών μελλοντικών πωλήσεων. Ο σύνθετος δείκτης υπολογίζεται με τους προεγγεγραμμένους κανόνες."
  },
  {
    id: "structural-differences", number: "06",
    title: "Διαφορές ανά περιοχή, κλάδο και μέγεθος",
    subtitle: "Ποιοι τύποι επιχειρήσεων αντιμετωπίζουν διαφορετικές οικονομικές και ψηφιακές συνθήκες",
    questions: ["Q02", "Q05", "Q17", "Q19", "Q21", "Q27"],
    metrics: [
      "digital_readiness.mean",
      "retail_friction.mean",
      "retail_confidence.mean",
      "business_financial_trends_12m.profitability.share.decreased"
    ],
    relationIds: ["size-and-optimism"],
    scientificNote: "Οι γεωγραφικές/κλαδικές κατατάξεις δεν αποτελούν αυτόματα επιστημονικά τεκμηριωμένες διαφορές. Δημοσιεύονται μόνο επαρκή υποσύνολα και γνωστοποιούνται οι περιορισμοί της δειγματοληψίας."
  }
] as const;

export const MIN_PUBLIC_RELATION_ARM = 30;
