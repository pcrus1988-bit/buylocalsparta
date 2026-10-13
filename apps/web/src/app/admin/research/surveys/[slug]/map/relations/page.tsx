import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../../../../../components/AdminWorkspaceHeader";
import { GreeceResearchHeatmap } from "../../../../../../../components/GreeceResearchHeatmap";
import { ResearchRelationshipExplorer } from "../../../../../../../components/ResearchRelationshipExplorer";
import { ResearchSurveyAdminNav } from "../../../../../../../components/ResearchSurveyAdminNav";
import { WorkspaceSectionHeading } from "../../../../../../../components/WorkspacePagePrimitives";
import { hasAdminPermission } from "../../../../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../../../../lib/admin-session";
import { researchRelationshipMap, type RelationshipFilters } from "../../../../../../../lib/research-geographic-relations-runtime";
import type { SafeRelationshipCounts, SafeRelationshipRegion } from "../../../../../../../lib/research-geographic-relations-core";
import "../../../../../../research-map-relations.css";

export const metadata:Metadata={
  title:"Admin · Συσχετίσεις Ελληνικού Λιανεμπορίου",
  robots:{index:false,follow:false}
};
export const dynamic="force-dynamic";
const formatter=new Intl.NumberFormat("el-GR");
const value=(n:number|null)=>n===null?"<15":formatter.format(n);
const share=(n:number|null)=>n===null?"—":n.toLocaleString("el-GR",{maximumFractionDigits:0})+"%";

function Stats({label,data,caption}:{label:string;data:SafeRelationshipCounts;caption:string}){
  return <article className="research-relation-stat">
    <small>{label}</small>
    <strong>{share(data.percent)}</strong>
    <div className="research-relation-bar" role="img" aria-label={label+": "+(data.percent===null?"ανεπαρκής βάση":share(data.percent))}>
      <span style={{width:(data.percent??0)+"%"}} />
    </div>
    <small>Συγκρίσιμη βάση: {data.base===null?"λιγότερες από 15":formatter.format(data.base)} απαντήσεις και στις δύο ερωτήσεις.</small>
    <small>{caption}</small>
  </article>;
}

function Difference({a,b}:{a:SafeRelationshipCounts;b:SafeRelationshipCounts}){
  if(a.percent===null||b.percent===null)return <div className="research-relation-insight">
    <strong>Δεν υπάρχουν ακόμη ασφαλή συγκρίσιμα ποσοστά.</strong>
    Επιλέξτε αποθηκευμένες απαντήσεις, ευρύτερο κλάδο ή διαφορετική συσχέτιση.
    Οι μικρές βάσεις αποκρύπτονται αντί να εμφανίζονται ως 0%.
  </div>;
  const diff=a.percent-b.percent;
  return <div className="research-relation-insight">
    <strong>{diff===0?"Παρόμοια ποσοστά":diff>0?"Υψηλότερο ποσοστό στην ομάδα Α":"Χαμηλότερο ποσοστό στην ομάδα Α"} · {diff>0?"+":""}{diff} ποσοστιαίες μονάδες</strong>
    Η διαφορά αφορά δύο ομάδες με απαντήσεις και στις δύο ερωτήσεις, όχι όλες τις προσκλήσεις.
    Δεν αποδεικνύει αιτιώδη σχέση, ούτε αντιπροσωπευτικότητα.
  </div>;
}

function regionUrl(root:string,filters:RelationshipFilters,region:string){
  const p=new URLSearchParams();
  for(const [k,v] of Object.entries({...filters,region}))if(v)p.set(k,v);
  return root+"?"+p.toString();
}

function RegionDetails({root,filters,regions}:{root:string;filters:RelationshipFilters;regions:readonly SafeRelationshipRegion[]}){
  const focus=regions.find(x=>x.key===filters.region);
  return <section className="workspace-queue-card">
    <div className="workspace-action-bar" style={{gap:10,flexWrap:"wrap"}}>
      <strong>{focus?focus.label:"Συγκρίσεις Περιφερειών"}</strong>
      {focus&&<Link prefetch={false} className="button button-secondary"
        href={regionUrl(root,filters,"")}>Όλη η Ελλάδα</Link>}
    </div>
    {focus?<div style={{display:"grid",gap:12,marginTop:14}}>
      <Stats label="Ομάδα Α στην Περιφέρεια" data={focus.segment} caption="Με βάση τη συγκεκριμένη γεωγραφική κατανομή." />
      <Stats label="Λοιπές επιχειρήσεις στην Περιφέρεια" data={focus.other} caption="Απαντήσεις που δεν πληρούν την ομάδα Α." />
      <Difference a={focus.segment} b={focus.other} />
    </div>:
    <div className="research-relation-list" style={{marginTop:12}}>
      {regions.map(r=><div className="research-relation-row" key={r.key}>
        <span><Link href={regionUrl(root,filters,r.key)} prefetch={false}>{r.label}</Link>
          <small>Ομάδα Α · {r.segment.base===null?"n<15":"n="+r.segment.base}</small>
        </span>
        <strong>{share(r.segment.percent)}</strong>
      </div>)}
    </div>}
  </section>;
}

export default async function ResearchRelationshipMapPage({params,searchParams}:{
  params:Promise<{slug:string}>;
  searchParams:Promise<Record<string,string|undefined>>;
}){
  const principal=await getAdminSession();
  if(!principal)redirect("/admin/login");
  if(!hasAdminPermission(principal,"research.read"))redirect("/admin");
  const {slug}=await params;
  const query=await searchParams;
  const root="/admin/research/surveys/"+encodeURIComponent(slug);
  const link=root+"/map/relations";
  let data:Awaited<ReturnType<typeof researchRelationshipMap>>;
  let unavailable=false;
  try{data=await researchRelationshipMap(principal,slug,query);}
  catch(err){
    unavailable=true;
    console.error(JSON.stringify({event:"research.geographic_relations.unavailable",
      errorName:err instanceof Error?err.name:"UnknownError"}));
  }
  if(!data&&!unavailable)notFound();
  const focus=data?.regions.find(r=>r.key===data?.filters.region);
  const mapCells=(data?.regions??[]).map(r=>({
    key:r.key,label:r.label,
    respondents:r.segment.base,answered:r.segment.base,selected:null,
    ratioPercent:r.segment.percent
  }));
  const mapFilters=data?{...data.filters,metric:"share" as const,question:data.pair.b,answer:data.pair.bv.join(","),
    kad:"",prefecture:"",municipality:""}:undefined;
  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel="Research · Interactive Relationships" />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">KONTA MOY · Retail Observatory</div>
        <h1>Διαδραστικός Χάρτης Συσχετίσεων</h1>
        <p className="lead">Δείτε πώς συνδέονται το μέγεθος, η τοπική πελατεία, οι ψηφιακές πωλήσεις, τα κόστη και οι προοπτικές των επιχειρήσεων ανά Περιφέρεια.</p>
        <div className="hero-actions">
          <Link prefetch={false} className="button button-secondary" href={root+"/map"}>Απλός χάρτης / αναλυτικά φίλτρα</Link>
          <Link prefetch={false} className="button button-secondary" href={root+"/barometer"}>Ζωντανό Βαρόμετρο</Link>
        </div>
      </div>
    </section>
    <ResearchSurveyAdminNav slug={slug} current="map" />
    <div className="research-relation-shell">
      {unavailable?<section className="shell vendor-section" role="alert">
        <WorkspaceSectionHeading eyebrow="Χάρτης" title="Τα στατιστικά δεν είναι διαθέσιμα"
          note="Δεν εμφανίζονται φανταστικά δεδομένα. Μπορείτε να δοκιμάσετε ξανά." />
        <Link prefetch={false} className="button" href={link}>Επανάληψη</Link>
      </section>:data&&mapFilters&&<>
        <section className="shell vendor-section">
          <WorkspaceSectionHeading eyebrow="Συνδυαστική ανάλυση" title="Εξερευνήστε την πραγματική σχέση δύο απαντήσεων"
            note="Δεν αντιστοιχίζουμε επιχειρήσεις μεταξύ τους: κάθε σχέση βασίζεται στις δύο απαντήσεις του ίδιου ερωτηματολογίου." />
          <ResearchRelationshipExplorer root={link} filters={data.filters} questions={data.questions} sectors={data.sectors} />
        </section>
        <section className="shell vendor-section">
          <WorkspaceSectionHeading eyebrow="Η ερώτηση που εξετάζουμε" title={data.pair.insight}
            note="Ομάδα Α → το ποσοστό της ομάδας που έδωσε την απάντηση Β." />
          <div className="workspace-inline-note" style={{marginBottom:16}}>
            <strong>Ομάδα Α:</strong> {data.pair.aLabel} <span aria-hidden="true"> → </span>
            <strong>Αποτέλεσμα Β:</strong> {data.pair.bLabel}
          </div>
          <div className="research-relation-statgrid">
            <Stats label="Ομάδα Α" data={data.nationalSegment}
              caption={"Πόσοι από όσους ανήκουν στην ομάδα Α δηλώνουν: "+data.pair.bLabel} />
            <Stats label="Λοιπές επιχειρήσεις" data={data.nationalOther}
              caption="Σύγκριση με τις υπόλοιπες επιχειρήσεις που απάντησαν και στις δύο ερωτήσεις." />
          </div>
          <div style={{marginTop:12}}><Difference a={data.nationalSegment} b={data.nationalOther} /></div>
          <p className="research-relation-small-note" style={{marginTop:12}}>
            Κοινή βάση ερωτήσεων: {data.totalMatchedBase===null?"n<15":formatter.format(data.totalMatchedBase)} ερωτηματολόγια.
            Οι άγνωστες ή παραλειφθείσες απαντήσεις δεν προσμετρώνται στους παρονομαστές.
          </p>
        </section>
        <section className="shell vendor-section">
          <WorkspaceSectionHeading eyebrow="Γεωγραφική αποτύπωση" title="Πού εμφανίζεται ισχυρότερα η σχέση;"
            note="Κάθε περιοχή χρωματίζεται με το ποσοστό της απάντησης Β μέσα στην ομάδα Α. Όχι με τον αριθμό επιχειρήσεων." />
          <div className="research-relation-layout">
            <GreeceResearchHeatmap cells={mapCells} filters={mapFilters} root={link} />
            <RegionDetails root={link} filters={data.filters} regions={data.regions} />
          </div>
          {focus&&<p className="research-relation-small-note">Επιλεγμένη Περιφέρεια: <strong>{focus.label}</strong>.
            Τα πανελλαδικά ποσοστά παραμένουν επάνω για σύγκριση.</p>}
          <div className="workspace-inline-note" style={{marginTop:16}}>
            <strong>Ερμηνεία και προστασία δεδομένων.</strong> Μόνο εσωτερική, μη σταθμισμένη περιγραφική ανάλυση.
            Απαντήσεις σε εξέλιξη και οριστικά υποβληθείσες παραμένουν χωριστές.
            Η γεωγραφία αναφέρεται στην έδρα της επιχείρησης στο GEMI, όχι στην τοποθεσία του συμμετέχοντος.
            Εμφανίζονται ποσοστά μόνο με βάση τουλάχιστον 15 απαντήσεων και τουλάχιστον 5 περιπτώσεις
            σε καθεμία από τις δύο εκβάσεις. Μικρές ομάδες δεν μεταφέρονται σε κώδικα του χάρτη.
            Καμία σχέση δεν τεκμηριώνει αιτιότητα ή στατιστική σημαντικότητα.
          </div>
        </section>
      </>}
    </div>
  </main>;
}
