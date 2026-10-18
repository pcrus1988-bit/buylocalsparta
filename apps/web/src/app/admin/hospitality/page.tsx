import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { HospitalityAdminProvisioning } from "../../../components/HospitalityAdminProvisioning";
import { hasAdminPermission } from "../../../lib/admin-runtime";
import { getAdminSession } from "../../../lib/admin-session";
import { hospitalityAdminPartners } from "../../../lib/hospitality-admin-service";

export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Admin · Hospitality",robots:{index:false,follow:false}};

export default async function HospitalityAdminPage() {
  const principal=await getAdminSession();
  if(!principal) redirect("/admin/login");
  if(!hasAdminPermission(principal,"vendor.manage")) redirect("/admin");
  const partners=await hospitalityAdminPartners(principal).catch(()=>undefined);
  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken}/>
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div className="eyebrow">KONTA MOY / Hospitality</div>
      <h1>Hospitality partner management</h1>
      <p className="lead">Κάθε συνεργάτης αποκτά ανεξάρτητους χρήστες, καταστήματα και ενεργοποίηση εφαρμογών. Δεν υπάρχει δημόσια αυτοεγγραφή.</p>
      <Link href="https://hospitality.kontamou.site/drinkStock" target="_blank">Προβολή DrinkStock ↗</Link>
    </section>
    <section className="shell vendor-section">
      <h2>Νέος συνεργάτης</h2>
      <p>Ο χρήστης πρέπει να έχει ήδη επαληθευμένο λογαριασμό KONTA MOY. Η δημιουργία γίνεται μόνο από εξουσιοδοτημένο διαχειριστή.</p>
      <HospitalityAdminProvisioning csrfToken={principal.csrfToken}/>
    </section>
    <section className="shell vendor-section">
      <h2>Εγγεγραμμένοι συνεργάτες</h2>
      {!partners ? <p role="alert">Δεν ήταν δυνατή η φόρτωση των συνεργατών. Δεν εμφανίζονται υποθετικά δεδομένα.</p> :
        !partners.length ? <p>Δεν έχουν ενεργοποιηθεί ακόμη συνεργάτες Hospitality.</p> :
        <div className="admin-insight-table" role="table" aria-label="Hospitality partners">
          <div className="admin-insight-head" role="row"><span>Συνεργάτης</span><span>Χώροι / χρήστες</span><span>DrinkStock</span></div>
          {partners.map(p=><div className="admin-insight-row" role="row" key={p.id}>
            <span><strong>{p.name}</strong><small>{p.slug} · {p.status}</small></span>
            <span><strong>{p.venues} / {p.members}</strong></span>
            <span><strong>{p.drinkStockEnabled?"Ενεργό":"Ανενεργό"}</strong></span>
          </div>)}
        </div>}
    </section>
  </main>;
}
