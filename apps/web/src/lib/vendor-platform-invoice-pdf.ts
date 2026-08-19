import { KONTA_MOY_LEGAL_DETAILS } from "./vendor-agreement-pdf";
import type { VendorPlatformInvoicePdfData } from "./admin-vendor-billing";

const money=(minor:number,currency:string)=>new Intl.NumberFormat("el-GR",{style:"currency",currency}).format(minor/100);
const pct=(bps:number)=>`${(bps/100).toLocaleString("el-GR",{maximumFractionDigits:2})}%`;

export async function renderVendorPlatformInvoicePdf(doc:VendorPlatformInvoicePdfData):Promise<Buffer>{
  const body:any[]=[[{text:"Περιγραφή",bold:true},{text:"Καθαρή",bold:true},{text:"ΦΠΑ",bold:true},{text:"Σύνολο",bold:true}]];
  for(const item of doc.items)body.push([`${item.description}\nΦΠΑ ${pct(item.vatRateBps)}`,money(item.netMinor,doc.currency),money(item.taxMinor,doc.currency),money(item.grossMinor,doc.currency)]);
  const definition:any={pageSize:"A4",pageMargins:[42,48,42,52],defaultStyle:{font:"Roboto",fontSize:9},content:[
    {text:"KONTA MOY",fontSize:18,bold:true},
    {text:KONTA_MOY_LEGAL_DETAILS.legalName,bold:true},
    {text:`ΑΦΜ ${KONTA_MOY_LEGAL_DETAILS.taxNumber} · ΓΕΜΗ ${KONTA_MOY_LEGAL_DETAILS.gemiNumber}`},
    {text:KONTA_MOY_LEGAL_DETAILS.address},
    {text:"ΤΙΜΟΛΟΓΙΟ ΠΑΡΟΧΗΣ ΥΠΗΡΕΣΙΩΝ",fontSize:14,bold:true,margin:[0,18,0,4]},
    {text:`Αριθμός: ${doc.documentNumber}`},{text:`Ημερομηνία: ${new Date(`${doc.issueDate}T12:00:00+03:00`).toLocaleDateString("el-GR")}`},
    {text:"Λήπτης",bold:true,margin:[0,14,0,2]},{text:doc.vendorName,bold:true},{text:`ΑΦΜ ${doc.vendorTaxNumber}`},{text:doc.vendorAddress},
    {text:`Περίοδος υπηρεσιών: ${new Date(`${doc.periodStart}T12:00:00+03:00`).toLocaleDateString("el-GR")} – ${new Date(`${doc.periodEnd}T12:00:00+03:00`).toLocaleDateString("el-GR")}`,margin:[0,8,0,10]},
    {table:{headerRows:1,widths:["*",70,70,70],body},layout:"lightHorizontalLines"},
    {table:{widths:["*",110],body:[["Καθαρή αξία",money(doc.netMinor,doc.currency)],["ΦΠΑ",money(doc.taxMinor,doc.currency)],[{text:"Σύνολο",bold:true},{text:money(doc.grossMinor,doc.currency),bold:true}],["Ήδη συμψηφισμένο μέσω settlement",money(doc.offsetMinor,doc.currency)]]},layout:"lightHorizontalLines",margin:[0,16,0,16]},
    ...(doc.offsetMinor>0?[{text:"Σημείωση: το ποσό που εμφανίζεται ως ήδη συμψηφισμένο έχει αφαιρεθεί από τις αντίστοιχες εκκαθαρίσεις του vendor και δεν αποτελεί δεύτερη χρέωση.",fontSize:8,margin:[0,0,0,12]}]:[]),
    {text:"AADE / myDATA",bold:true},{table:{widths:[90,"*"],body:[["MARK",doc.mark],["UID",doc.uid??"—"]]},layout:"lightHorizontalLines",margin:[0,5,0,0]},
    ...(doc.qrUrl?[{text:"Επαλήθευση AADE",link:doc.qrUrl,decoration:"underline",margin:[0,8,0,0]}]:[])
  ]};
  const pdfMakeModule=await import("pdfmake/build/pdfmake.js");const fontsModule=await import("pdfmake/build/vfs_fonts.js");const pdfMake=(pdfMakeModule.default??pdfMakeModule) as any;const fonts=(fontsModule.default??fontsModule) as any;pdfMake.vfs=fonts.pdfMake?.vfs??fonts.vfs??fonts;pdfMake.fonts={Roboto:{normal:"Roboto-Regular.ttf",bold:"Roboto-Medium.ttf",italics:"Roboto-Italic.ttf",bolditalics:"Roboto-MediumItalic.ttf"}};
  return await new Promise<Buffer>((resolve,reject)=>{try{pdfMake.createPdf(definition).getBuffer((buffer:Uint8Array)=>resolve(Buffer.from(buffer)));}catch(error){reject(error);}});
}
