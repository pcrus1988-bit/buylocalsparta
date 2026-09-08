export const HUB_EXPANSION_PLANS = [
  {
    code: "claim",
    name: "CLAIM",
    eyebrow: "Δωρεάν καταχώριση",
    setupFeeCents: 0,
    monthlyFeeCents: 0,
    annualFeeCents: 0,
    commissionBps: 0,
    setupLabel: "€0",
    monthlyLabel: "€0",
    annualLabel: "€0",
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
    monthlyFeeCents: 990,
    annualFeeCents: 9900,
    commissionBps: 0,
    setupLabel: "€49",
    monthlyLabel: "€9,90 / μήνα",
    annualLabel: "€99 / έτος",
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
    monthlyFeeCents: 1900,
    annualFeeCents: 19000,
    commissionBps: 800,
    setupLabel: "€149",
    monthlyLabel: "€19 / μήνα",
    annualLabel: "€190 / έτος",
    commissionLabel: "8%",
    summary: "Πλήρης συμμετοχή στο marketplace με χαμηλό σταθερό κόστος και χρέωση όταν πραγματοποιούνται πωλήσεις.",
    bestFor: "Για καταστήματα που θέλουν να δοκιμάσουν πραγματικές online πωλήσεις μέσα από το ενιαίο checkout του τοπικού HUB.",
    features: ["Όλα του PRESENCE", "Marketplace προϊόντα", "Vendor workspace", "Παραγγελίες & fulfilment"],
    ecommerce: true,
    featured: true
  },
  {
    code: "growth",
    name: "GROWTH",
    eyebrow: "Καλύτερη ισορροπία",
    setupFeeCents: 29900,
    monthlyFeeCents: 3900,
    annualFeeCents: 39000,
    commissionBps: 500,
    setupLabel: "€299",
    monthlyLabel: "€39 / μήνα",
    annualLabel: "€390 / έτος",
    commissionLabel: "5%",
    summary: "Χαμηλότερη προμήθεια και περισσότερα εργαλεία για καταστήματα με συστηματικές πωλήσεις.",
    bestFor: "Για επιχειρήσεις με μεγαλύτερο κατάλογο και ουσιαστική εμπορική δραστηριότητα στο HUB.",
    features: ["Όλα του SHOP", "Χαμηλότερη προμήθεια", "Ενισχυμένο onboarding καταλόγου", "Περισσότερη εμπορική υποστήριξη"],
    ecommerce: true,
    featured: false
  },
  {
    code: "pro",
    name: "PRO",
    eyebrow: "Πλήρης κλίμακα",
    setupFeeCents: 49900,
    monthlyFeeCents: 9900,
    annualFeeCents: 99000,
    commissionBps: 300,
    setupLabel: "€499",
    monthlyLabel: "€99 / μήνα",
    annualLabel: "€990 / έτος",
    commissionLabel: "3%",
    summary: "Η χαμηλότερη προμήθεια και το υψηλότερο επίπεδο εργαλείων, αυτοματοποίησης και υποστήριξης.",
    bestFor: "Για ώριμες επιχειρήσεις που θέλουν να χρησιμοποιούν το KONTA MOY ως σημαντικό κανάλι online πωλήσεων.",
    features: ["Όλα του GROWTH", "Χαμηλότερη προμήθεια", "Προτεραιοποιημένη υποστήριξη", "Advanced εμπορική ενεργοποίηση"],
    ecommerce: true,
    featured: false
  }
] as const;

export type HubExpansionPlanCode = typeof HUB_EXPANSION_PLANS[number]["code"];
export type HubExpansionPlan = typeof HUB_EXPANSION_PLANS[number];
export type HubBillingCycle = "annual" | "monthly";

export function getHubExpansionPlan(code: string | undefined): HubExpansionPlan | undefined {
  return HUB_EXPANSION_PLANS.find((plan) => plan.code === code);
}

export function normalizeHubExpansionPlanCode(code: string | undefined): HubExpansionPlanCode {
  return getHubExpansionPlan(code)?.code ?? "claim";
}

export function normalizeHubBillingCycle(value: string | undefined): HubBillingCycle {
  return value === "monthly" ? "monthly" : "annual";
}

export function billingLabelForPlan(plan: HubExpansionPlan, billingCycle: HubBillingCycle): string {
  if (plan.code === "claim") return "€0";
  return billingCycle === "monthly" ? plan.monthlyLabel : plan.annualLabel;
}
