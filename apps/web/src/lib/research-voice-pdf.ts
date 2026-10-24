import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
// The browser bundle and VFS also run in Node; this is the same tested runtime as privacy PDF exports.
// @ts-ignore pdfmake's browser bundle does not consistently ship ESM declarations.
import pdfMakeModule from "pdfmake/build/pdfmake.js";
// @ts-ignore pdfmake's virtual-font bundle does not consistently ship ESM declarations.
import fontsModule from "pdfmake/build/vfs_fonts.js";

export type ResearchPdfAnswer = Readonly<{ text: string; categories: readonly string[] }>;
export type ResearchPdfCategory = Readonly<{ key: string; label: string; count: number }>;

const SOURCE = "https://kontamou.site/research/greek-retail-2026/results/voices";
const LOGO = "https://kontamou.site/brand/kontamou-logo.svg";

/** Use the exact permanent logo asset served by kontamou.site.
 * It contains an embedded WebP; pdfmake needs a PNG instead of the SVG image wrapper.
 */
async function officialLogoPng(): Promise<string> {
  let svg = "";
  for (const file of [
    join(process.cwd(), "public/brand/kontamou-logo.svg"),
    join(process.cwd(), "apps/web/public/brand/kontamou-logo.svg")
  ]) {
    try { svg = await readFile(file, "utf8"); break; } catch { /* deployed asset can be remote */ }
  }
  if (!svg) {
    const response = await fetch(LOGO, { signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!response.ok) throw new Error("OFFICIAL_RESEARCH_LOGO_UNAVAILABLE");
    svg = await response.text();
  }
  // Restrict to the single official asset's embedded image; never download third-party logo URLs.
  const base64 = /href="data:image\/webp;base64,([A-Za-z0-9+/=]+)"/.exec(svg)?.[1];
  if (!base64) throw new Error("OFFICIAL_RESEARCH_LOGO_INVALID");
  const image = Buffer.from(base64, "base64");
  const cropped = await sharp(image).extract({left:70,top:18,width:360,height:242}).png().toBuffer();
  return "data:image/png;base64," + cropped.toString("base64");
}

const pdfMake = ((pdfMakeModule as {default?:unknown}).default ?? pdfMakeModule) as {
  addVirtualFileSystem?: (vfs: Record<string,string>)=>void;
  vfs?: Record<string,string>;
  createPdf: (definition: unknown)=>{getBuffer:(callback:(value:Uint8Array)=>void)=>void};
};
const rawFonts = (fontsModule as {default?:unknown}).default ?? fontsModule;
const vfs = ((rawFonts as {pdfMake?:{vfs?:Record<string,string>};vfs?:Record<string,string>}).pdfMake?.vfs
  ?? (rawFonts as {vfs?:Record<string,string>}).vfs
  ?? rawFonts) as Record<string,string>;

export async function renderResearchVoicesPdf(input: {
  answers: readonly ResearchPdfAnswer[];
  categories: readonly ResearchPdfCategory[];
  internal: boolean;
  taxonomyVersion: string;
}): Promise<Uint8Array> {
  if (!vfs || typeof vfs["Roboto-Regular.ttf"] !== "string") {
    throw new Error("RESEARCH_PDF_FONT_NOT_AVAILABLE");
  }
  if (pdfMake.addVirtualFileSystem) pdfMake.addVirtualFileSystem(vfs);
  else pdfMake.vfs = vfs;
  const logo = await officialLogoPng();
  const labelByKey = new Map(input.categories.map(category => [category.key, category.label]));
  const created = new Date().toLocaleDateString("el-GR", {timeZone:"Europe/Athens",day:"2-digit",month:"long",year:"numeric"});
  const content: unknown[] = [
    {image:logo,fit:[122,82],margin:[0,0,0,13]},
    {text:"KONTA MOY RESEARCH  /  ΕΛΛΗΝΙΚΟ ΛΙΑΝΕΜΠΟΡΙΟ 2026",style:"eyebrow"},
    {text:"Η φωνή της Ελλάδας",style:"title",margin:[0,8,0,6]},
    {text:"We asked one question. You answered. We listened. And decided to give your voice a place.",style:"lead",margin:[0,0,0,18]},
    {text:input.internal ? "ΕΣΩΤΕΡΙΚΟ ΕΓΓΡΑΦΟ · ΜΗ ΕΓΚΕΚΡΙΜΕΝΟ ΓΙΑ ΔΗΜΟΣΙΕΥΣΗ"
          : "ΔΗΜΟΣΙΑ ΕΚΔΟΣΗ · ΜΟΝΟ ΕΓΚΕΚΡΙΜΕΝΑ ΑΝΩΝΥΜΟΠΟΙΗΜΕΝΑ ΑΠΟΣΠΑΣΜΑΤΑ",
     style:input.internal?"alert":"status",margin:[0,0,0,12]},
    {columns:[
      {text:"Απαντήσεις: " + input.answers.length.toLocaleString("el-GR"),bold:true},
      {text:"Ημερομηνία: " + created,alignment:"right"}
    ],margin:[0,0,0,12]},
    {text:"Οι θεματικές ετικέτες είναι μη αποκλειστικές, αυτόματες και διερευνητικές, όχι σταθμισμένα ποσοστά ή δημογραφικά στοιχεία. Μία απάντηση μπορεί να ανήκει σε περισσότερες ενότητες. Δεν περιλαμβάνονται ατομικές γεωγραφικές ή επιχειρησιακές ταυτότητες.",style:"method"},
    {text:"Θεματικές ενότητες",style:"section",margin:[0,17,0,8]},
    ...input.categories.filter(category=>category.count>0).map(category=>({
      text:category.label+"  ·  "+category.count.toLocaleString("el-GR")+" αναφορές",style:"categorySummary",margin:[0,0,0,4]
    })),
    {text:"Απαντήσεις",style:"section",margin:[0,20,0,11]}
  ];

  for (const [index, item] of input.answers.entries()) {
    const names = [...new Set(item.categories)].map(key=>labelByKey.get(key)??key).join(" · ");
    content.push({
      unbreakable:false,
      stack:[
        {text:(index+1).toLocaleString("el-GR")+"  /  "+(names||"Λοιπά"),style:"answerTag",margin:[0,0,0,5]},
        {text:item.text,style:"answer"},
        {text:"",margin:[0,0,0,12]}
      ],margin:[0,0,0,13]
    });
  }
  content.push({
    text: input.internal
      ? "ΠΡΟΣΟΧΗ: Εσωτερικό υλικό εργασίας. Οι εγγραφές δεν έχουν ατομική ανθρώπινη έγκριση για δημόσια αναπαραγωγή. Να μη δημοσιευθεί ούτε να προωθηθεί εκτός εξουσιοδοτημένης ομάδας."
      : "Σημείωση: Το κείμενο των συμμετεχόντων διατηρείται ως εγκεκριμένο ανώνυμο απόσπασμα. Η θεματική ταξινόμηση είναι βοηθητική ερμηνεία και όχι δήλωση ταυτότητας ή επίσημη απάντηση εκ μέρους συμμετέχοντος.",
    style:"method",margin:[0,12,0,10]
  });

  const docDefinition = {
    info:{title:"Η φωνή της Ελλάδας | KONTA MOY Research",author:"KONTA MOY · SP BUSINESS LAB",
      subject:"Ελληνικό Λιανεμπόριο 2026 · Q18"},
    pageSize:"A4",
    pageMargins:[42,46,42,75],
    defaultStyle:{font:"Roboto",fontSize:10,color:"#21392c",lineHeight:1.27},
    styles:{
      eyebrow:{fontSize:8,bold:true,color:"#426d4e",characterSpacing:1.2},
      title:{fontSize:27,bold:true,color:"#193f2d"},
      lead:{fontSize:11,italics:true,color:"#536956"},
      status:{fontSize:9,bold:true,color:"#2f6d49"},
      alert:{fontSize:9,bold:true,color:"#9a3e2f"},
      method:{fontSize:8.5,color:"#66776b",lineHeight:1.4},
      section:{fontSize:15,bold:true,color:"#1d5034"},
      categorySummary:{fontSize:9,color:"#365c42"},
      answerTag:{fontSize:8,bold:true,color:"#4c7956"},
      answer:{fontSize:10.5,color:"#243a2a"}
    },
    content,
    footer:(page:number,total:number)=>({
      margin:[42,8,42,18],
      stack:[
        {canvas:[{type:"line",x1:0,y1:0,x2:510,y2:0,lineWidth:0.5,lineColor:"#bfd0bc"}]},
        {text:"Πηγή: KONTA MOY Research · Ελληνικό Λιανεμπόριο 2026 · "+SOURCE,
          fontSize:7.2,color:"#365c43",margin:[0,5,0,2]},
        {text:input.internal
           ? "Χρήση: εμπιστευτικό, μόνο για εσωτερική επιστημονική αξιολόγηση. Απαγορεύεται η δημόσια διανομή χωρίς ατομικό έλεγχο και έγκριση."
           : "Χρήση/αναφορά: παραθέστε την πηγή και τον ενεργό σύνδεσμο. Τηρήστε τα δικαιώματα των δημιουργών των κειμένων, το απόρρητο και την προστασία προσωπικών δεδομένων. Όχι αναγνώριση συμμετεχόντων.",
          fontSize:7.1,color:"#687b69"},
        {text:page+" / "+total,alignment:"right",fontSize:7,color:"#819286",margin:[0,2,0,0]}
      ]
    })
  };
  return new Promise<Uint8Array>((resolve,reject)=>{
    try{pdfMake.createPdf(docDefinition).getBuffer(value=>resolve(value));}
    catch(error){reject(error);}
  });
}
