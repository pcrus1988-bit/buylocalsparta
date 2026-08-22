import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountSectionNavigation } from "../../../components/AccountSectionNavigation";
import { CustomerAppointmentsClient } from "../../../components/CustomerAppointmentsClient";
import { CustomerHowItWorks } from "../../../components/CustomerAccountPrimitives";
import { SiteHeader } from "../../../components/SiteHeader";
import { getAccountSession } from "../../../lib/account-session";
import { customerAppointmentAdvisers, customerAppointments } from "../../../lib/customer-appointments-runtime";

export const metadata: Metadata = { title: "Ραντεβού · Ο λογαριασμός μου", robots: { index: false, follow: false } };
type Props = Readonly<{ searchParams: Promise<{ vendor?: string }> }>;

export default async function AccountAppointmentsPage({ searchParams }: Props) {
  const principal = await getAccountSession();
  if (!principal) redirect("/login?next=/account/appointments");
  const params = await searchParams;
  const [appointments, advisers] = await Promise.all([customerAppointments(principal), customerAppointmentAdvisers(principal)]);
  return <main className="account-app">
    <div className="announcement">Ραντεβού · κλείσε ιδιωτική επαφή με ενεργό σύμβουλο τοπικού καταστήματος.</div>
    <SiteHeader compact />
    <AccountSectionNavigation />
    <section className="shell customer-account-page" style={{ paddingBottom: 18 }}>
      <div className="customer-page-heading"><div><div className="eyebrow">Local advice</div><h1>Ραντεβού με τοπικό σύμβουλο</h1></div><p>Διάλεξε ενεργό σύμβουλο, ώρα και τρόπο επικοινωνίας. Το σύστημα δεσμεύει την ώρα με έλεγχο σύγκρουσης και κρατά την πορεία μόνο στον λογαριασμό σου και στο αντίστοιχο κατάστημα.</p></div>
      <CustomerHowItWorks><p>Η online κράτηση επιβεβαιώνεται άμεσα μέσα στο ΚΟΝΤΑ ΜΟΥ. Μπορείς να αλλάξεις ώρα ή να ακυρώσεις όσο το ραντεβού είναι ενεργό. Προς το παρόν υποστηρίζονται ραντεβού στο κατάστημα και τηλεφωνικά· δεν δημιουργείται αυτόματα εξωτερικό meeting link.</p></CustomerHowItWorks>
    </section>
    <CustomerAppointmentsClient csrfToken={principal.csrfToken} initial={appointments} advisers={advisers} preferredVendorId={typeof params.vendor === "string" ? params.vendor : undefined} />
  </main>;
}
