import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AdminWorkspaceHeader } from "../../../../../components/AdminWorkspaceHeader";
import { ProductTaxProfileManager } from "../../../../../components/ProductTaxProfileManager";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../../../components/WorkspacePagePrimitives";
import { getAdminSession } from "../../../../../lib/admin-session";
import { adminProductTaxWorkspace } from "../../../../../lib/admin-product-tax-runtime";

export const metadata:Metadata={title:"Admin · Product VAT profiles",robots:{index:false,follow:false}};

export default async function Page(){
  const principal=await getAdminSession();if(!principal)redirect("/admin/login");
  const data=await adminProductTaxWorkspace(principal);if(!data)redirect("/admin/tax");
  const approved=data.variants.filter(v=>v.profile?.approved).length;const proposed=data.variants.filter(v=>v.profile&&!v.profile.approved).length;const missing=data.variants.length-approved-proposed;
  return <main className="vendor-app admin-app"><AdminWorkspaceHeader csrfToken={principal.csrfToken}/>
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">Accounting Mapping · VAT governance</div><h1>Product tax profiles</h1><p className="lead">AADE vatCategory και exemption reason εγκρίνονται ανά canonical variant. Το commerce tax rate εμφανίζεται μόνο ως hint και δεν γίνεται αυτόματο tax mapping.</p></div></section>
    <WorkspaceMetricStrip items={[{label:"Active variants",value:data.variants.length},{label:"Approved",value:approved,tone:missing||proposed?"default":"positive"},{label:"Proposed",value:proposed,tone:proposed?"attention":"default"},{label:"Missing",value:missing,tone:missing?"attention":"positive"}]} />
    <section className="shell vendor-section"><WorkspaceSectionHeading eyebrow="Immutable profiles" title="Propose → approve → supersede" note="Η έγκριση κλειδώνει category/rate/exemption/effective date σε hashed profile. Νέα φορολογική μεταχείριση δημιουργεί νέο effective profile." />
      <ProductTaxProfileManager variants={data.variants} vatCategories={data.vatCategories} csrfToken={principal.csrfToken} defaultEffectiveFrom={athensDate(Date.now())}/>
    </section>
  </main>;
}
function athensDate(now:number){const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Athens",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(now));const m=Object.fromEntries(parts.filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));return `${m.year}-${m.month}-${m.day}`;}
