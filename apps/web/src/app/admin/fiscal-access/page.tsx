import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "../../../lib/admin-session";
import { issueFiscalSsoTicket } from "../../../lib/fiscal-superadmin-sso";
export const dynamic="force-dynamic";
export const metadata={title:"KONTA MOY · Access Fiscal",robots:{index:false,follow:false}};
export default async function FiscalAccess(){
  if(process.env.FISCAL_STANDALONE_MODE==="true")redirect("/timologio-admin/login");
  const admin=await getAdminSession();
  if(!admin)redirect("/admin/login");
  if(!admin.roles.includes("super_admin")||admin.vendorId)
    return <main style={{padding:36}}><h1>Access denied</h1><p>Only KONTA MOY super administrators may authenticate to the Fiscal operator portal.</p><Link href="/admin">Return to Admin</Link></main>;
  let transfer:ReturnType<typeof issueFiscalSsoTicket>|undefined;
  try{transfer=issueFiscalSsoTicket({userId:admin.userId,email:admin.email});}catch{}
  return <main style={{padding:36,maxWidth:620,margin:"0 auto"}}>
    <h1>KONTA MOY → FISCAL</h1>
    <p>Use your existing super-admin account to access the independent KONTA MOY FISCAL administration workspace.</p>
    <p>Signed in as <strong>{admin.email}</strong>. Fiscal will create its own time-limited session; it will not share the marketplace database or browser login cookie.</p>
    {!transfer?<p>The separate Fiscal admin sign-in is not configured. FISCAL_SERVICE_BASE_URL and FISCAL_SUPERADMIN_SSO_SECRET are required.</p>:
      <form action={transfer.targetUrl} method="post">
        <input type="hidden" name="ticket" value={transfer.ticket}/>
        <button type="submit" style={{padding:"13px 20px",borderRadius:10,cursor:"pointer"}}>Continue to FISCAL Admin</button>
      </form>}
    <p><Link href="/admin">Return to KONTA MOY</Link></p>
  </main>;
}
