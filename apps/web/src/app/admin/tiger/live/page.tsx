import type {Metadata} from "next";
import {redirect} from "next/navigation";
import {AdminWorkspaceHeader} from "../../../../components/AdminWorkspaceHeader";
import {TigerLiveControlRoom} from "../../../../components/TigerLiveControlRoom";
import {getAdminSession} from "../../../../lib/admin-session";
import {hasAdminPermission} from "../../../../lib/admin-runtime";
import {getTigerLiveSnapshot} from "../../../../lib/tiger-live";
import "../../../admin-tiger-live.css";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"TIGER LIVE · Engineering Headquarters",robots:{index:false,follow:false,nocache:true}};
export default async function TigerLivePage(){
  const principal=await getAdminSession();
  if(!principal)redirect("/admin/login");
  if(!hasAdminPermission(principal,"admin.audit.read"))redirect("/admin");
  const initial=await getTigerLiveSnapshot();
  return <main className="vendor-app admin-app tiger-live-root">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken}/>
    <TigerLiveControlRoom initial={initial}/>
  </main>;
}
