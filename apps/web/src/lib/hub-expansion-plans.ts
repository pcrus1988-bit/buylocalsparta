export const HUB_EXPANSION_PLANS = [
  {
    code: "claim",
    name: "CLAIM",
    eyebrow: "Δωρεάν καταχώριση",
    setupFeeCents: 0,
    annualFeeCents: 0,
    commissionBps: 0,
    setupLabel: "€0",
    recurringLabel: "€0",
    commissionLabel: "0%",
    summary: "Επαλήθευση και βασική παρουσία στον τοπικό κατάλογο του HUB.",
    bestFor: "Για επιχειρήσεις που θέλουν να κατοχυρώσουν δωρεάν την παρουσία τους πριν ενεργοποιηθεί η αγορά της πόλης.",
    features: ["Επαληθευμένη καταχώριση", "Βασικό προφίλ επιχείρησης", "Κατηγορίες & στοιχεία επικοινωνίας", "Προτεραιότητα ενημέρωσης για το HUB"],
    ecommerce: false,
    featured: false
  },
  {
    code: "presence",
    name: "PRESENCE",
    eyebrow: "Ενισχυμένη παρουσία",
    setupFeeCents: 4900,
    annualFeeCents: 9900,
    commissionBps: 0,
    setupLabel: "€49",
    recurringLabel: "€99 / έτος",
    commissionLabel: "0%",
    summary: "Πλουσιότερη ψηφιακή βιτρίνα χωρίς marketplace checkout.",
    bestFor: "Για καταστήματα που θέλουν ισχυρή τοπική ανακάλυψη, περιεχόμενο και αιτήματα πελατών χωρίς online πωλήσεις μέσω ΚΟΝΤΑ ΜΟΥ.",
    features: ["Όλα του CLAIM", "Πλούσιο προφίλ & media", "Περισσότερες κατηγορίες/περιεχόμενο", "Επικοινωνία & αιτήματα ενδιαφέροντος"],
    ecommerce: false,
    featured: false
  },
  {
    code: "shop",
    name: "SHOP",
    eyebrow: "Marketplace selling",
    setupFeeCents: 14900,
    annualFeeCents: 34900,
    commissionBps: 700,
    setupLabel: "€149",
    recurringLabel: "€349 / έτος",
    commissionLabel: "7%",
    summary: "Πλήρης συμμετοχή στο marketplace και δυνατότητα πώλησης προϊόντων.",
    bestFor: "Για καταστήματα που θέλουν να πουλούν μέσα από το ενιαίο checkout του τοπικού HUB.",
    features: ["Όλα του PRESENCE", "Marketplace προϊόντα", "Vendor workspace", "Παραγγελίες & fulfilment"],
    ecommerce: true,
    featured: true
  },
  {
    code: "growth",
    name: "GROWTH",
    eyebrow: "Για ανάπτυξη",
    setupFeeCents: 29900,
    annualFeeCents: 64900,
    commissionBps: 450,
    setupLabel: "€299",
    recurringLabel: "€649 / έτος",
    commissionLabel: "4,5%",
    summary: "Χαμηλότερη προμήθεια και περισσότερη υποστήριξη για ενεργούς πωλητές.",
    bestFor: "Για επιχειρήσεις με μεγαλύτερο κατάλογο και συστηματική εμπορική δραστηριότητα στο HUB.",
    features: ["Όλα του SHOP", "Χαμηλότερη προμήθεια", "Ενισχυμένο onboarding καταλόγου", "Περισσότερη εμπορική υποστήριξη"],
    ecommerce: true,
    featured: false
  },
  {
    code: "pro",
    name: "PRO",
    eyebrow: "Υψηλότερο επίπεδο υπηρεσίας",
    setupFeeCents: 59900,
    annualFeeCents: 119000,
    commissionBps: 250,
    setupLabel: "€599",
    recurringLabel: "€1.190 / έτος",
    commissionLabel: "2,5%",
    summary: "Η χαμηλότερη προμήθεια και το υψηλότερο επίπεδο υποστήριξης.",
    bestFor: "Για ώριμες επιχειρήσεις που θέλουν να αξιοποιήσουν το HUB ως σημαντικό κανάλι πωλήσεων.",
    features: ["Όλα του GROWTH", "Χαμηλότερη προμήθεια", "Προτεραιοποιημένη υποστήριξη", "Advanced εμπορική ενεργοποίηση"],
    ecommerce: true,
    featured: false
  }
] as const;

export type HubExpansionPlanCode = typeof HUB_EXPANSION_PLANS[number]["code"];
export type HubExpansionPlan = typeof HUB_EXPANSION_PLANS[number];

export function getHubExpansionPlan(code: string | undefined): HubExpansionPlan | undefined {
  return HUB_EXPANSION_PLANS.find((plan) => plan.code === code);
}

export function normalizeHubExpansionPlanCode(code: string | undefined): HubExpansionPlanCode {
  return getHubExpansionPlan(code)?.code ?? "claim";
}
