import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { canReadResearchResultsPreview } from "../../../../../../lib/research-preview-authorization";
import { RESEARCH_PREVIEW_EMAIL, RESEARCH_PREVIEW_PATH } from "../../../../../../lib/research-preview-access";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Ασφαλής είσοδος · Προεπισκόπηση Ελληνικό Λιανεμπόριο 2026",
  robots: { index: false, follow: false, nocache: true }
};

export default async function ResearchPreviewLogin({
  searchParams
}: { searchParams: Promise<{ error?: string }> }) {
  if (await canReadResearchResultsPreview()) redirect(RESEARCH_PREVIEW_PATH);
  const { error } = await searchParams;
  return <main style={{minHeight:"100vh",background:"#102e25",color:"#f8fbf5",display:"grid",placeItems:"center",padding:24}}>
    <div style={{maxWidth:490,width:"100%",padding:"44px 38px",border:"1px solid #5d806c",borderRadius:22,background:"#183d30",boxShadow:"0 30px 80px #061b1599"}}>
      <div style={{fontSize:12,fontWeight:700,letterSpacing:"0.17em",color:"#c2d4b7",marginBottom:18}}>KONTA MOY · RESEARCH / 2026</div>
      <h1 style={{fontSize:"clamp(27px,5vw,40px)",lineHeight:1.15,margin:"0 0 18px"}}>Προεπισκόπηση αποτελεσμάτων</h1>
      <p style={{color:"#d3e0d4",lineHeight:1.7,marginBottom:30}}>Προσωρινή, εμπιστευτική πρόσβαση στα ζωντανά συγκεντρωτικά ευρήματα της έρευνας «Ελληνικό Λιανεμπόριο 2026».</p>
      <form action="/api/research/greek-retail-2026/results-preview-login" method="POST" style={{display:"grid",gap:14}}>
        <label htmlFor="research-preview-email">Email</label>
        <input id="research-preview-email" name="email" type="email" required autoComplete="username"
          defaultValue={RESEARCH_PREVIEW_EMAIL} maxLength={254}
          style={{padding:"13px 15px",borderRadius:9,border:"1px solid #93b09a",color:"#142c23",background:"#fff",fontSize:16}} />
        <label htmlFor="research-preview-password">Κωδικός πρόσβασης</label>
        <input id="research-preview-password" name="password" type="password" required autoComplete="current-password"
          style={{padding:"13px 15px",borderRadius:9,border:"1px solid #93b09a",color:"#142c23",background:"#fff",fontSize:16}} />
        {error && <p role="alert" style={{color:"#ffdbb6",margin:"4px 0"}}>{error==="unavailable"?"Η υπηρεσία εισόδου δεν είναι διαθέσιμη αυτή τη στιγμή.":"Δεν ήταν δυνατή η σύνδεση. Ελέγξτε τα στοιχεία και δοκιμάστε ξανά."}</p>}
        <button type="submit" style={{padding:"15px 18px",marginTop:14,border:0,borderRadius:10,background:"#e1f1bc",color:"#163a2b",fontWeight:800,fontSize:16,cursor:"pointer"}}>Είσοδος στην προεπισκόπηση</button>
      </form>
      <p style={{fontSize:12,color:"#b9d0bc",lineHeight:1.6,marginTop:22}}>
        Η πρόσβαση περιορίζεται στα συγκεντρωτικά στοιχεία της προεπισκόπησης. Δεν παρέχει πρόσβαση στη διαχείριση της έρευνας, σε ατομικές απαντήσεις ή στο εμπιστευτικό αρχείο Q18.
      </p>
    </div>
  </main>;
}
