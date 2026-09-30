import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminProductsControl } from "../../../components/AdminProductsControl";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { getAdminSession } from "../../../lib/admin-session";
import { hasAdminPermission } from "../../../lib/admin-runtime";

export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Admin · Products & Categories",robots:{index:false,follow:false}};

export default async function Page({searchParams}:{searchParams:Promise<{view?:string}>}){
  const principal=await getAdminSession();
  if(!principal)redirect("/admin/login");
  const canWrite=hasAdminPermission(principal,"catalog.write");
  const params=await searchParams;
  const initialView=params.view==="categories"?"categories":"products";
  return <main className="vendor-app admin-app admin-products-control-centre">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel="Products & Categories" />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Catalogue · operator control centre</div>
        <h1>Products &amp; Categories</h1>
        <p className="lead">Fast product triage, category governance and catalogue quality from one place. Products load first in bounded, indexed slices; summary metrics and category choices fill in progressively so supplier imports cannot freeze the Admin UI.</p>
      </div>
    </section>
    <AdminProductsControl csrfToken={principal.csrfToken} initialView={initialView} canWrite={canWrite} />
  </main>;
}
