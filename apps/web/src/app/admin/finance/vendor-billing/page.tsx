import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { VendorBillingClient } from "../../../../components/VendorBillingClient";
import { WorkspaceMetricStrip } from "../../../../components/WorkspacePagePrimitives";
import { getAdminSession } from "../../../../lib/admin-session";
import { adminVendorBillingWorkspace } from "../../../../lib/admin-vendor-billing";

export const metadata:Metadata={title:"Admin · Vendor invoicing",robots:{index:false,follow:false}};

export default async function VendorBillingPage(){
  const principal=await getAdminSession();if(!principal)redirect("/admin/login");
  const data=await adminVendorBillingWorkspace(principal).catch(()=>undefined);if(!data)redirect("/admin");
  const eligible=data.vendors.reduce((n,v)=>n+v.eligibleCommissionMinor,0),issued=data.invoices.filter(x=>x.status==="issued").length,ready=data.invoices.filter(x=>x.status==="prepared").length,outstanding=data.invoices.reduce((n,x)=>n+Math.max(0,x.grossMinor-x.offsetMinor),0);
  return <main className="vendor-app admin-app"><AdminWorkspaceHeader csrfToken={principal.csrfToken}/>
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">Finance · platform services · commissions</div><h1>Vendor invoicing</h1><p className="lead">Έκδοση τιμολογίων από KONTA MOY προς vendors για commissions, listing και recurring fees. Κάθε invoice συνδέεται με immutable settlement sources και με το ίδιο ελεγχόμενο AADE/myDATA lifecycle.</p></div></section>
    <WorkspaceMetricStrip items={[
      {label:"Uninvoiced commission",value:new Intl.NumberFormat("el-GR",{style:"currency",currency:"EUR"}).format(eligible/100),tone:eligible?"attention":"positive"},
      {label:"Prepared for AADE",value:ready},
      {label:"Issued / MARK",value:issued,tone:issued?"positive":"default"},
      {label:"Non-offset balance",value:new Intl.NumberFormat("el-GR",{style:"currency",currency:"EUR"}).format(outstanding/100)},
      {label:"Accounting policy",value:data.policy?`v${data.policy.version} · ${data.policy.status}`:"missing",tone:data.policy?.status==="approved"?"positive":"attention"},
      {label:"Vendor service mapping",value:data.policy?.mappingStatus??"missing",tone:data.policy?.mappingStatus==="approved"?"positive":"attention"}
    ]}/>
    <section className="shell vendor-section"><div className="workspace-callout"><strong>Accounting boundary</strong><span>Η δημιουργία draft δεν αποτελεί έκδοση φορολογικού στοιχείου. Preparation/AADE transmission παραμένει blocked μέχρι να υπάρχει approved Accounting Policy, approved platform_vendor_service mapping, approved payment mapping και έγκυρη φορολογική ταυτότητα vendor.</span></div></section>
    <VendorBillingClient initial={data} csrfToken={principal.csrfToken}/>
  </main>;
}
