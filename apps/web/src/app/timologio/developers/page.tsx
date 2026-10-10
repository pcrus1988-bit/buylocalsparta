import Link from "next/link";
import {redirect} from "next/navigation";
import {FiscalDeveloperConsole} from "../../../components/FiscalDeveloperConsole";
import {FiscalMarketplaceLinkConsole} from "../../../components/FiscalMarketplaceLinkConsole";
import {fiscalCsrfValue,fiscalMerchantAccounts,getFiscalActor} from "../../../lib/fiscal-auth";
import {listFiscalClients} from "../../../lib/fiscal-api-clients";
import {listMarketplaceLinks} from "../../../lib/fiscal-marketplace-links";
export const dynamic="force-dynamic";
export default async function Developers({searchParams}:{searchParams:Promise<{organizationId?:string}>}){
 const actor=await getFiscalActor();
 if(!actor)redirect("/timologio/login");
 if(actor.role!=="merchant")redirect("/timologio-admin");
 const [accounts,csrf,params]=await Promise.all([fiscalMerchantAccounts(actor),fiscalCsrfValue(),searchParams]);
 const owned=accounts.filter(a=>a.role==="owner"&&!["rejected","suspended"].includes(a.status));
 const account=owned.find(a=>a.id===params.organizationId)??owned[0];
 const [clients,links]=account?await Promise.all([listFiscalClients(actor,account.id),listMarketplaceLinks(actor,account.id)]):[[],[]];
 return <main className="fiscal-shell"><div className="fiscal-wrap">
  <header className="fiscal-topbar"><Link href="/timologio" className="fiscal-brand">KONTA MOY <span>FISCAL</span></Link><nav><Link href="/timologio/dashboard">Η επιχείρησή μου</Link><Link href="/timologio">Αρχική</Link></nav></header>
  <section className="fiscal-hero"><div className="fiscal-kicker">Developer integrations</div>
   <h1>Διασυνδέσεις και API</h1><p>Σύνδεση εξωτερικών εφαρμογών χωρίς πρόσβαση στη βάση του marketplace. Ξεχωριστά test credentials για κάθε επιχείρηση.</p></section>
  <section className="fiscal-panel">
   <p className="fiscal-alert">Αυτή η διεπαφή δημιουργεί ΜΟΝΟ προσωρινά, μη φορολογικά drafts. Δεν αντικαθιστά πιστοποιημένο πάροχο τιμολόγησης ή οποιαδήποτε νόμιμη έκδοση.</p>
   {account&&csrf?<><form method="get" className="fiscal-form">
    <label>Επιχείρηση
     <select name="organizationId" defaultValue={account.id}>{owned.map(a=><option value={a.id} key={a.id}>{a.legal_name} · {a.vat_number}</option>)}</select>
    </label><button className="fiscal-button" type="submit">Επιλογή</button>
   </form>
   <FiscalMarketplaceLinkConsole key={account.id+":marketplace"} organizationId={account.id} csrfToken={csrf} verified={account.status==="approved"}
    marketplaceLinkUrl={(process.env.FISCAL_MARKETPLACE_BASE_URL||"https://kontamou.site").replace(/\/$/,"")+"/timologio/marketplace-link"}
    initialLinks={links.map(link=>({id:link.id,marketplace_vendor_public_id:link.marketplace_vendor_public_id,issuer_vat_number:link.issuer_vat_number,
      linked_at:String(link.linked_at),revoked_at:link.revoked_at?String(link.revoked_at):null}))}/>
   <hr style={{margin:"26px 0",borderColor:"#dce9e5"}}/>
   <FiscalDeveloperConsole key={account.id} organizationId={account.id} csrfToken={csrf}
    initialClients={clients.map(c=>({id:c.id,label:c.label,kind:c.kind,tokenHint:c.token_hint,expiresAt:String(c.expires_at),revokedAt:c.revoked_at?String(c.revoked_at):null}))}/></>:
   <p className="fiscal-muted">Απαιτείται λογαριασμός ιδιοκτήτη επιχείρησης FISCAL για να δημιουργηθούν test API keys.</p>}
  </section>
  <section className="fiscal-panel" style={{marginTop:20}}>
   <h2>Draft API v1</h2>
   <p>POST /timologio/api/v1/drafts · GET /timologio/api/v1/drafts · GET /timologio/api/v1/drafts/:id</p>
   <pre style={{overflowX:"auto",background:"#0f2933",color:"#dcf0e7",padding:18,borderRadius:12,fontSize:".84rem"}}>{JSON.stringify({lane:"b2b",externalId:"ERP-ORDER-000001",reference:"Customer reference",currency:"EUR",grossMinor:12500,issuerVatNumber:account?.vat_number??"123456789"},null,2)}</pre>
   <p className="fiscal-muted">Header: Authorization: Bearer kmf_test_… · Απαιτείται μοναδικό externalId ανά επιχείρηση και προέλευση. Διαφορετικό payload με το ίδιο ID απορρίπτεται.</p>
  </section>
 </div></main>;
}
