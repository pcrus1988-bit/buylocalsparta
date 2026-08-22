export type SiteLink = Readonly<{
  label: string;
  href: string;
  description?: string;
}>;

type SitemapChangeFrequency = "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";

type IndexableStaticRoute = SiteLink & Readonly<{
  changeFrequency: SitemapChangeFrequency;
  priority: number;
}>;

export const SITE_LINKS = {
  home: { label: "Αρχική", href: "/", description: "Η κεντρική είσοδος στην τοπική αγορά της Σπάρτης." },
  shop: { label: "Προϊόντα", href: "/shop", description: "Ο ενιαίος κατάλογος προϊόντων του marketplace." },
  shops: { label: "Καταστήματα & άνθρωποι", href: "/shops", description: "Χαρτογραφημένες τοπικές επιχειρήσεις και ενεργοί συνεργάτες, με σαφή ένδειξη του σταδίου συνεργασίας." },
  shopsMap: { label: "Χάρτης καταστημάτων", href: "/shops/map", description: "Διαδραστικός χάρτης τοπικών επιχειρήσεων με κατηγορίες, φίλτρα απόστασης και απευθείας πρόσβαση σε κάθε δημόσιο dossier." },
  advice: { label: "Συμβουλή από κατάστημα", href: "/advice", description: "Βρες δημόσια διαθέσιμους τοπικούς συμβούλους πριν αγοράσεις." },
  askLocal: { label: "Ask Local", href: "/ask-local", description: "Στείλε ιδιωτικά αυτό που ψάχνεις σε κατάλληλο τοπικό συνεργάτη." },
  howItWorks: { label: "Πώς λειτουργεί", href: "/how-it-works", description: "Από την ανακάλυψη μέχρι checkout, fulfilment και υποστήριξη." },
  fairness: { label: "Δίκαιη ανάθεση", href: "/fairness", description: "Οι κανόνες που αποτρέπουν την άσκοπη εσωτερική σύγκρουση εμπόρων." },
  delivery: { label: "Παράδοση & παραλαβή", href: "/delivery-pickup", description: "Τοπική παραλαβή, αποστολή και επιλογές fulfilment." },
  payments: { label: "Πληρωμές & ασφάλεια", href: "/payments-security", description: "Πώς προστατεύεται η ενιαία συναλλαγή του marketplace." },
  returns: { label: "Επιστροφές & refunds", href: "/returns-refunds", description: "Επιστροφές, επισκευές, αντικαταστάσεις και επιστροφές χρημάτων." },
  privacy: { label: "Privacy controls", href: "/privacy-controls", description: "Διαχείριση ιδιωτικότητας, προσωποποίησης και δικαιωμάτων δεδομένων." },
  privacyNotice: { label: "Πολιτική Απορρήτου", href: "/privacy", description: "Πώς χρησιμοποιούνται, διαβιβάζονται, προστατεύονται και διατηρούνται προσωπικά δεδομένα." },
  cookies: { label: "Πολιτική Cookies", href: "/cookies", description: "Το τρέχον cookie registry, οι κατηγορίες συγκατάθεσης και ο τρόπος ανάκλησης επιλογής." },
  accessibility: { label: "Προσβασιμότητα", href: "/accessibility", description: "Ο στόχος WCAG 2.2 AA, η τρέχουσα κατάσταση και ο τρόπος αναφοράς εμποδίου." },
  about: { label: "Η ιδέα και η αποστολή", href: "/about", description: "Γιατί δημιουργήθηκε το ΚΟΝΤΑ ΜΟΥ Sparta και ποιο πρόβλημα λύνει." },
  help: { label: "Κέντρο βοήθειας", href: "/help", description: "Καθοδήγηση για αγορές, αιτήματα και υποστήριξη." },
  join: { label: "Γίνε συνεργάτης", href: "/join", description: "Η πρόταση συνεργασίας για τοπικές επιχειρήσεις." },
  joinRequirements: { label: "Προϋποθέσεις συνεργασίας", href: "/join/requirements", description: "Readiness checklist πριν από την αίτηση εμπόρου." },
  sitemap: { label: "Χάρτης ιστοτόπου", href: "/sitemap", description: "Όλες οι πραγματικές δημόσιες διαδρομές σε ένα σημείο." },
  login: { label: "Σύνδεση πελάτη", href: "/login", description: "Σύνδεση σε υπάρχον λογαριασμό πελάτη." },
  register: { label: "Δημιουργία λογαριασμού", href: "/register", description: "Δημιουργία νέου λογαριασμού πελάτη." },
  vendorApply: { label: "Αίτηση συνεργασίας", href: "/join/apply", description: "Η πραγματική φόρμα αίτησης για νέο συνεργάτη." }
} as const satisfies Record<string, SiteLink>;

export const INDEXABLE_STATIC_ROUTES: ReadonlyArray<IndexableStaticRoute> = [
  { ...SITE_LINKS.home, changeFrequency: "daily", priority: 1 },
  { ...SITE_LINKS.shop, changeFrequency: "daily", priority: 0.9 },
  { ...SITE_LINKS.shops, changeFrequency: "daily", priority: 0.85 },
  { ...SITE_LINKS.shopsMap, changeFrequency: "daily", priority: 0.8 },
  { ...SITE_LINKS.advice, changeFrequency: "weekly", priority: 0.8 },
  { ...SITE_LINKS.askLocal, changeFrequency: "weekly", priority: 0.8 },
  { ...SITE_LINKS.howItWorks, changeFrequency: "monthly", priority: 0.75 },
  { ...SITE_LINKS.fairness, changeFrequency: "monthly", priority: 0.65 },
  { ...SITE_LINKS.delivery, changeFrequency: "monthly", priority: 0.65 },
  { ...SITE_LINKS.payments, changeFrequency: "monthly", priority: 0.65 },
  { ...SITE_LINKS.returns, changeFrequency: "monthly", priority: 0.65 },
  { ...SITE_LINKS.privacy, changeFrequency: "monthly", priority: 0.6 },
  { ...SITE_LINKS.privacyNotice, changeFrequency: "monthly", priority: 0.6 },
  { ...SITE_LINKS.cookies, changeFrequency: "monthly", priority: 0.55 },
  { ...SITE_LINKS.accessibility, changeFrequency: "monthly", priority: 0.55 },
  { ...SITE_LINKS.about, changeFrequency: "monthly", priority: 0.65 },
  { ...SITE_LINKS.help, changeFrequency: "monthly", priority: 0.65 },
  { ...SITE_LINKS.join, changeFrequency: "monthly", priority: 0.6 },
  { ...SITE_LINKS.joinRequirements, changeFrequency: "monthly", priority: 0.55 },
  { ...SITE_LINKS.sitemap, changeFrequency: "monthly", priority: 0.4 }
];

export const PRIMARY_NAVIGATION: ReadonlyArray<SiteLink> = [
  SITE_LINKS.shop,
  SITE_LINKS.shops,
  SITE_LINKS.advice,
  SITE_LINKS.askLocal,
  SITE_LINKS.howItWorks
];

export const FOOTER_NAVIGATION = [
  {
    title: "Ανακάλυψε",
    links: [SITE_LINKS.shop, SITE_LINKS.shops, SITE_LINKS.advice, SITE_LINKS.askLocal]
  },
  {
    title: "Αγορά με σιγουριά",
    links: [SITE_LINKS.howItWorks, SITE_LINKS.payments, SITE_LINKS.delivery, SITE_LINKS.returns]
  },
  {
    title: "ΚΟΝΤΑ ΜΟΥ Sparta",
    links: [SITE_LINKS.about, SITE_LINKS.fairness, SITE_LINKS.help, SITE_LINKS.join, SITE_LINKS.sitemap]
  },
  {
    title: "Ιδιωτικότητα & πρόσβαση",
    links: [SITE_LINKS.privacyNotice, SITE_LINKS.cookies, SITE_LINKS.privacy, SITE_LINKS.accessibility]
  }
] as const;

export const HUMAN_SITEMAP_SECTIONS = [
  { title: "Ανακάλυψη", links: [SITE_LINKS.home, SITE_LINKS.shop, SITE_LINKS.shops, SITE_LINKS.shopsMap] },
  { title: "Άνθρωποι & συμβουλή", links: [SITE_LINKS.advice, SITE_LINKS.askLocal] },
  { title: "Η εμπειρία αγοράς", links: [SITE_LINKS.howItWorks, SITE_LINKS.payments, SITE_LINKS.delivery, SITE_LINKS.returns] },
  { title: "Ιδιωτικότητα & πρόσβαση", links: [SITE_LINKS.privacyNotice, SITE_LINKS.cookies, SITE_LINKS.privacy, SITE_LINKS.accessibility] },
  { title: "Κανόνες & υποστήριξη", links: [SITE_LINKS.fairness, SITE_LINKS.help, SITE_LINKS.about] },
  { title: "Για επιχειρήσεις", links: [SITE_LINKS.join, SITE_LINKS.joinRequirements, SITE_LINKS.vendorApply] }
] as const;

export const ACCOUNT_UTILITY_NAVIGATION: ReadonlyArray<SiteLink> = [SITE_LINKS.login, SITE_LINKS.register];

export const PUBLIC_DYNAMIC_ROUTE_PATTERNS = ["/category/[slug]", "/product/[id]", "/vendor/[id]"] as const;

export const NON_INDEXABLE_PAGE_ROUTES = [
  "/cart",
  "/checkout",
  "/checkout/private-offer/[id]",
  "/checkout/failure",
  "/checkout/success",
  "/login",
  "/register",
  "/verify-email",
  "/confirm-email-change",
  "/forgot-password",
  "/reset-password",
  "/join/apply",
  "/account",
  "/account/ask-local",
  "/account/notifications",
  "/account/orders",
  "/account/orders/[id]",
  "/account/privacy",
  "/account/profile",
  "/account/security",
  "/account/saved",
  "/account/support",
  "/daily",
  "/daily/ask-local",
  "/daily/login",
  "/daily/notifications",
  "/daily/notifications/settings",
  "/daily/orders",
  "/daily/pickup",
  "/daily/push-bridge",
  "/daily/scan",
  "/vendor",
  "/vendor/login",
  "/vendor/advice",
  "/vendor/analytics",
  "/vendor/catalog",
  "/vendor/daily-access",
  "/vendor/finance",
  "/vendor/notifications",
  "/vendor/orders",
  "/vendor/pickup/scan",
  "/vendor/reports",
  "/vendor/returns",
  "/vendor/shipping",
  "/vendor/storefront",
  "/vendor/trust",
  "/admin",
  "/admin/login",
  "/admin/accessibility",
  "/admin/activation",
  "/admin/analytics",
  "/admin/ask-local",
  "/admin/categories",
  "/admin/content",
  "/admin/seo",
  "/admin/seo/crawl",
  "/admin/seo/search-console",
  "/admin/hero",
  "/admin/customers",
  "/admin/customers/[customerId]",
  "/admin/customers/[customerId]/manage",
  "/admin/customers/support",
  "/admin/email-lab",
  "/admin/fairness",
  "/admin/finance",
  "/admin/finance/agreements",
  "/admin/finance/agreements/sla",
  "/admin/finance/mydata",
  "/admin/finance/mydata/products",
  "/admin/finance/vendor-billing",
  "/admin/maintenance",
  "/admin/matching",
  "/admin/notifications",
  "/admin/operations",
  "/admin/orders",
  "/admin/orders/[id]",
  "/admin/partners",
  "/admin/partners/[id]",
  "/admin/partners/pipeline",
  "/admin/platform",
  "/admin/privacy",
  "/admin/prospects",
  "/admin/recalls",
  "/admin/reports",
  "/admin/research-vendors",
  "/admin/research-vendors/[id]",
  "/admin/reviews",
  "/admin/search",
  "/admin/shipping",
  "/admin/tax",
  "/admin/trust",
  "/admin/vendors",
  "/admin/work"
] as const;

// Legacy compatibility registry. robots.ts now uses the centralized visibility policy
// and keeps private HTML crawlable so crawlers can process explicit noindex signals.
export const ROBOTS_DISALLOW_PATHS = [
  "/account",
  "/admin",
  "/api",
  "/cart",
  "/checkout",
  "/daily",
  "/login",
  "/register",
  "/verify-email",
  "/confirm-email-change",
  "/forgot-password",
  "/reset-password",
  "/join/apply",
  "/vendor/login",
  "/vendor/advice",
  "/vendor/analytics",
  "/vendor/catalog",
  "/vendor/daily-access",
  "/vendor/finance",
  "/vendor/notifications",
  "/vendor/orders",
  "/vendor/pickup",
  "/vendor/reports",
  "/vendor/returns",
  "/vendor/shipping",
  "/vendor/storefront",
  "/vendor/trust"
] as const;
