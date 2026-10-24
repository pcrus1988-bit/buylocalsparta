import type { Metadata } from "next";
import Link from "next/link";
import { ResearchPublicNavigation } from "../../../../../../components/ResearchPublicNavigation";
import { SiteFooter } from "../../../../../../components/SiteFooter";
import { ResearchVoiceOfGreece } from "../../ResearchVoiceOfGreece";

export const metadata:Metadata={
 title:"Προεπισκόπηση · Η φωνή της Ελλάδας · KONTA MOY Research",
 robots:{index:false,follow:false,nocache:true},
};
export default function GreeceVoicesPreviewPage(){
 return <main style={{background:"#f3f6ef",minHeight:"100vh",overflowX:"hidden"}}>
  <ResearchPublicNavigation active="results" studySlug="greek-retail-2026"/>
  <div style={{maxWidth:1200,margin:"15px auto",padding:"10px 22px"}}>
   <Link href="/research/greek-retail-2026/results/Preview">← Πίσω στην προεπισκόπηση</Link>
  </div>
  <ResearchVoiceOfGreece isDemo/>
  <SiteFooter/>
 </main>;
}
