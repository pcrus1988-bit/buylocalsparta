import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ResearchPublicNavigation } from "../../../../../../components/ResearchPublicNavigation";
import { SiteFooter } from "../../../../../../components/SiteFooter";
import { getAdminSession } from "../../../../../../lib/admin-session";
import { hasAdminPermission } from "../../../../../../lib/admin-runtime";
import { rawResearchAnswerAccess } from "../../../../../../lib/research-survey-response-admin";
import { getLiveGreekRetailVoices, type LiveResearchVoices } from "../../../../../../lib/research-live-voices-preview";
import { LiveVoicesPreview } from "./LiveVoicesPreview";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const metadata:Metadata={
 title:"Ζωντανή προεπισκόπηση · Η φωνή της Ελλάδας · KONTA MOY Research",
 description:"Εσωτερική, προστατευμένη προεπισκόπηση ζωντανών Q18 απαντήσεων. Δεν αποτελούν εγκεκριμένες δημόσιες μαρτυρίες.",
 robots:{index:false,follow:false,nocache:true},
};

export default async function GreeceVoicesPreviewPage(){
 const principal=await getAdminSession();
 if(!principal || !hasAdminPermission(principal,"research.read")
     || !rawResearchAnswerAccess(principal)) notFound();

 let initial:LiveResearchVoices|null=null;
 try {
   initial=await getLiveGreekRetailVoices(principal);
 } catch(error) {
   console.error("research_q18_preview_initial_failed",error instanceof Error?error.name:"UnknownError");
 }
 return <main style={{background:"#f3f6ef",minHeight:"100vh",overflowX:"hidden"}}>
  <ResearchPublicNavigation active="results" studySlug="greek-retail-2026"/>
  <div style={{maxWidth:1200,margin:"15px auto",padding:"10px 22px"}}>
   <Link href="/research/greek-retail-2026/results/Preview">← Πίσω στην προεπισκόπηση</Link>
  </div>
  <LiveVoicesPreview initial={initial}/>
  <SiteFooter/>
 </main>;
}
