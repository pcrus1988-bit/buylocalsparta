import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VendorWorkspaceHeader } from "../../../components/VendorWorkspaceHeader";
import { WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { getVendorSession, vendorOperatingContextForPrincipal } from "../../../lib/vendor-session";

export const metadata: Metadata = { title: "Ρυθμίσεις συνεργάτη", robots: { index: false, follow: false } };

type SettingsCard = Readonly<{ title: string; body: string; href: string; action: string }>;

export default async function VendorSettingsPage() {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");
  const context = await vendorOperatingContextForPrincipal(principal);
  const capabilities = new Set(context.capabilities);

  const core: SettingsCard[] = [
    {
      title: "Επιχείρηση & δημόσιο προφίλ",
      body: "Περιγραφή, εμφάνιση, λογότυπο, φωτογραφίες και Instagram του καταστήματός σου.",
      href: "/vendor/storefront",
      action: "Ρύθμιση προφίλ"
    },
    {
      title: "Προεπισκόπηση καταστήματος",
      body: "Δες ιδιωτικά το κατάστημά σου πριν ή μετά τη δημοσίευση, όπως το βλέπει ο πελάτης.",
      href: "/vendor/preview",
      action: "Άνοιγμα προεπισκόπησης"
    },
    {
      title: "Πληρωμές & παραστατικά",
      body: "Οικονομική πορεία, παραστατικά που χρειάζονται ενέργεια, πληρωμές και εκκαθαρίσεις.",
      href: "/vendor/finance",
      action: "Άνοιγμα οικονομικών"
    }
  ];

  if (context.roles.includes("vendor_owner") && capabilities.has("staff.manage")) core.push({
    title: "Πρόσβαση ομάδας",
    body: "Διαχειρίσου ποιος μπορεί να χρησιμοποιεί το KONTA MOY Daily για τις καθημερινές εργασίες.",
    href: "/vendor/daily-access",
    action: "Διαχείριση πρόσβασης"
  });

  const hub: SettingsCard[] = [];
  if (capabilities.has("local_delivery.manage")) hub.push({
    title: "Τοπικές παραδόσεις",
    body: "Όρισε την περιοχή εξυπηρέτησης του καταστήματός σου με ταχυδρομικούς κώδικες.",
    href: "/vendor/settings/delivery",
    action: "Ρύθμιση παραδόσεων"
  });
  if (capabilities.has("aade.manage")) hub.push({
    title: "Φορολογικά & AADE",
    body: "Δες την κατάσταση myDATA και υπέβαλε ασφαλή αιτήματα ελέγχου ή συμφωνίας.",
    href: "/vendor/settings/aade",
    action: "Άνοιγμα AADE"
  });
  if (capabilities.has("promotions.manage")) hub.push({
    title: "Προωθητικές ενέργειες",
    body: "Πρότεινε προωθητικές τιμές με διαφανή έλεγχο πριν από τη δημόσια ενεργοποίηση.",
    href: "/vendor/settings/promotions",
    action: "Διαχείριση προωθήσεων"
  });
  if (capabilities.has("seo.source_data.manage")) hub.push({
    title: "SEO καταστήματος",
    body: "Ρύθμισε το περιεχόμενο που περιγράφει την επιχείρησή σου στις μηχανές αναζήτησης.",
    href: "/vendor/settings/seo",
    action: "Ρύθμιση SEO"
  });
  if (capabilities.has("subscription.manage")) hub.push({
    title: "Πλάνο συνεργασίας",
    body: "Δες το τρέχον πλάνο και υπέβαλε αίτημα αλλαγής όταν υπάρχει διαθέσιμη επιλογή.",
    href: "/vendor/settings/subscription",
    action: "Διαχείριση πλάνου"
  });

  return <main className="vendor-app">
    <VendorWorkspaceHeader />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Ρυθμίσεις</div>
        <h1>Όλα τα βασικά του καταστήματός σου σε ένα σημείο</h1>
        <p className="lead">Βρες γρήγορα τι θέλεις να αλλάξεις χωρίς να χρειάζεται να γνωρίζεις πώς είναι οργανωμένο τεχνικά το ΚΟΝΤΑ ΜΟΥ.</p>
      </div>
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Κατάστημα" title="Βασικές ρυθμίσεις" note="Οι καθημερινές εργασίες παραμένουν στις αντίστοιχες ενότητες. Εδώ συγκεντρώνονται οι επιλογές που αλλάζεις περιστασιακά." />
      <div className="workspace-dual-grid">
        {core.map((item) => <article className="workspace-queue-card" key={item.href}>
          <strong>{item.title}</strong>
          <p className="workspace-queue-summary">{item.body}</p>
          <div className="workspace-action-bar"><span> </span><Link className="button button-secondary" href={item.href}>{item.action} →</Link></div>
        </article>)}
      </div>
    </section>

    {hub.length > 0 && <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="HUB" title="Ρυθμίσεις που διαχειρίζεσαι εσύ" note="Εμφανίζονται μόνο οι δυνατότητες που ανήκουν στον δικό σου τύπο συνεργασίας και στο δικό σου HUB." />
      <div className="workspace-dual-grid">
        {hub.map((item) => <article className="workspace-queue-card" key={item.href}>
          <strong>{item.title}</strong>
          <p className="workspace-queue-summary">{item.body}</p>
          <div className="workspace-action-bar"><span> </span><Link className="button button-secondary" href={item.href}>{item.action} →</Link></div>
        </article>)}
      </div>
    </div></section>}
  </main>;
}
