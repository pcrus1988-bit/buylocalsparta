import type { Metadata } from "next";
import Link from "next/link";
import { ResearchPublicNavigation } from "../../../../../components/ResearchPublicNavigation";
import { SiteFooter } from "../../../../../components/SiteFooter";
import { ResearchVoiceOfGreece } from "../ResearchVoiceOfGreece";
import { getPublishedGreekRetailResults } from "../../../../../lib/research-survey-release";
import { publicVoiceDataFromRelease } from "../../../../../lib/research-public-voices-data";
import { loadApprovedGreekRetailQ18 } from "../../../../../lib/research-q18-approved-sidecar";

export const dynamic="force-dynamic";
export const metadata:Metadata={
 title:"Η φωνή της Ελλάδας · Ελληνικό Λιανεμπόριο 2026 · KONTA MOY",
 description:"Ανώνυμες εγκεκριμένες φωνές του ελληνικού λιανεμπορίου, οργανωμένες σε θεματικές.",
 robots:{index:false,follow:true},
};
export default async function GreeceVoicesPage(){
 const released=await getPublishedGreekRetailResults("greek-retail-2026");
 const voices=released?(publicVoiceDataFromRelease(released.methodology.q18PublicVoices) ?? await loadApprovedGreekRetailQ18(released.artifactSha256)):undefined;
 return <main style={{background:"#f3f6ef",minHeight:"100vh",overflowX:"hidden"}}>
  <ResearchPublicNavigation active="results" studySlug="greek-retail-2026"/>
  <div style={{maxWidth:1200,margin:"15px auto",padding:"10px 22px"}}>
   <Link href="/research/greek-retail-2026/results">← Πίσω στα αποτελέσματα</Link>
  </div>
  <ResearchVoiceOfGreece isDemo={false} data={voices}/>
  <SiteFooter/>
 </main>;
}
