import Link from "next/link";
import {FiscalMarketplaceConfirmation} from "../../../components/FiscalMarketplaceConfirmation";
import {getVendorSession,getVendorImpersonationSession} from "../../../lib/vendor-session";
import {isVendorTrialPrincipal} from "../../../lib/vendor-trial-runtime";
export const dynamic="force-dynamic";
export default async function MarketplaceLink(){
 const impersonated=Boolean(await getVendorImpersonationSession());
 const principal=await getVendorSession();
 const allowed=Boolean(principal?.vendorId&&principal.roles.includes("vendor_owner")&&!impersonated&&!isVendorTrialPrincipal(principal));
 return <main className="fiscal-shell"><div className="fiscal-wrap">
  <header className="fiscal-topbar"><Link href="/timologio" className="fiscal-brand">KONTA MOY <span>FISCAL</span></Link><nav><Link href="/timologio/developers">Developer Console</Link></nav></header>
  <section className="fiscal-hero"><div className="fiscal-kicker">Marketplace account linking</div>
   <h1>Σύνδεση με το KONTA MOY Marketplace</h1>
   <p>Απαιτούνται δύο ανεξάρτητες εγκρίσεις: ο επαληθευμένος κάτοχος FISCAL δημιουργεί προσωρινό κωδικό και ο ενεργός ιδιοκτήτης της ίδιας επιχείρησης στο marketplace επιβεβαιώνει.</p>
  </section>
  <section className="fiscal-panel" style={{maxWidth:680}}>
   <h2>Επιβεβαίωση καταστήματος</h2>
   {allowed&&principal?<><p>Είστε συνδεδεμένος ως <strong>{principal.email}</strong>.</p>
    <FiscalMarketplaceConfirmation csrfToken={principal.csrfToken}/></>:
    <><p className="fiscal-alert">{impersonated?"Η λειτουργία απαγορεύεται μέσω διαχείρισης/impersonation.":"Συνδεθείτε ως ενεργός, επαληθευμένος ιδιοκτήτης καταστήματος για να εγκρίνετε τη σύνδεση."}</p>
      <Link className="fiscal-button" href="/vendor/login">Είσοδος ιδιοκτήτη καταστήματος</Link></>}
   <p className="fiscal-muted">Δεν αλλάζει ο εκδότης παραστατικών ή η νομική ευθύνη πώλησης του marketplace. Η διασύνδεση παραμένει ανενεργή για φορολογική έκδοση μέχρι την ολοκλήρωση της πιστοποίησης.</p>
  </section></div></main>;
}
