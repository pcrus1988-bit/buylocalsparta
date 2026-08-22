import Link from "next/link";
import type { CustomerAccountSetup } from "../lib/customer-account-onboarding";

function SetupStep({ complete, title, body, href, action }: {
  complete: boolean;
  title: string;
  body: string;
  href: string;
  action: string;
}) {
  return <Link className={complete ? "customer-setup-step is-complete" : "customer-setup-step is-pending"} href={href}>
    <span className="customer-setup-step-mark" aria-hidden="true">{complete ? "✓" : "→"}</span>
    <span className="customer-setup-step-copy"><strong>{title}</strong><small>{body}</small></span>
    <span className="customer-setup-step-state">{complete ? "Ολοκληρώθηκε" : action}</span>
  </Link>;
}

export function CustomerAccountSetupChecklist({ setup }: { setup: CustomerAccountSetup }) {
  if (setup.complete) return null;
  return <section className="shell customer-account-setup" aria-labelledby="customer-setup-title">
    <div className="customer-account-setup-head">
      <div><div className="eyebrow">Ξεκίνα από εδώ</div><h2 id="customer-setup-title">Ρύθμισε τα βασικά του λογαριασμού σου</h2><p>Δύο σύντομα βήματα αρκούν για να είναι ο λογαριασμός έτοιμος για παραγγελίες, παραλαβές και τιμολόγηση.</p></div>
      <div className="customer-setup-progress" aria-label={`${setup.completedCount} από ${setup.totalCount} βήματα ολοκληρώθηκαν`}><strong>{setup.completedCount}/{setup.totalCount}</strong><span>βήματα</span></div>
    </div>
    <progress className="customer-setup-meter" max={setup.totalCount} value={setup.completedCount}>{Math.round((setup.completedCount / setup.totalCount) * 100)}%</progress>
    <div className="customer-setup-grid">
      <SetupStep complete={setup.profileComplete} title="Προσωπικά στοιχεία" body="Συμπλήρωσε το όνομα και το επώνυμό σου." href="/account/profile" action="Συμπλήρωση" />
      <SetupStep complete={setup.addressComplete} title="Διεύθυνση" body="Πρόσθεσε τουλάχιστον μία διεύθυνση για παράδοση ή τιμολόγηση." href="/account/profile" action="Προσθήκη" />
    </div>
  </section>;
}
