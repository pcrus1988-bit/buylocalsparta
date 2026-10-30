import "server-only";
// The detailed text is faithfully transcribed from the owner-supplied,
// 30 October 2026, three-page Greek editorial press release.
// Recreated as accessible PDF because direct binary repository upload
// is not available in this integration.
// @ts-ignore pdfmake's browser bundle does not consistently expose ESM declarations.
import pdfMakeModule from "pdfmake/build/pdfmake.js";
// @ts-ignore pdfmake's VFS bundle does not consistently expose ESM declarations.
import fontsModule from "pdfmake/build/vfs_fonts.js";

const make = ((pdfMakeModule as {default?:unknown}).default ?? pdfMakeModule) as {
  addVirtualFileSystem?: (vfs:Record<string,string>)=>void;
  vfs?: Record<string,string>;
  createPdf:(definition:unknown)=>{getBuffer:(callback:(value:Uint8Array)=>void)=>void};
};
const rawFonts = (fontsModule as {default?:unknown}).default ?? fontsModule;
const vfs = ((rawFonts as {pdfMake?:{vfs?:Record<string,string>};vfs?:Record<string,string>}).pdfMake?.vfs
  ?? (rawFonts as {vfs?:Record<string,string>}).vfs ?? rawFonts) as Record<string,string>;

const RESULTS = "https://kontamou.site/research/greek-retail-2026/results";
const METHOD = "https://kontamou.site/research/greek-retail-2026/methodology";
const VOICES = "https://kontamou.site/research/greek-retail-2026/results/voices";

function p(text:string,margin:[number,number,number,number]=[0,0,0,12]){
  return {text,style:"paragraph",margin};
}
function heading(text:string, margin:[number,number,number,number]=[0,12,0,15]){
  return {text,style:"heading",margin};
}
function stat(value:string,title:string,detail:string) {
  return {width:"*",stack:[
    {text:value,style:"statNumber",margin:[0,0,0,5]},
    {text:title,style:"statLabel",margin:[0,0,0,5]},
    {text:detail,style:"statDetail"}
  ]};
}
function bar(label:string,rate:number,ink:string){
  return {stack:[
    {columns:[{text:label,style:"barLabel"},{text:rate.toLocaleString("el-GR",{minimumFractionDigits:1,maximumFractionDigits:1})+"%",style:"barLabel",bold:true,alignment:"right",color:ink}],margin:[0,0,0,4]},
    {canvas:[
      {type:"rect",x:0,y:0,w:490,h:8,r:4,color:"#e1e8e2"},
      {type:"rect",x:0,y:0,w:490*rate/100,h:8,r:4,color:ink}
    ],margin:[0,0,0,9]}
  ]};
}
const solutions=[
  ["Μείωση πραγματικού λειτουργικού κόστους.","Κοινές προμήθειες, οικονομικότερες μεταφορές και στοχευμένη ενεργειακή εξοικονόμηση — με μέτρηση του ποσού που πραγματικά εξοικονομεί το κατάστημα."],
  ["Ψηφιακά εργαλεία για την επιχείρηση, όχι μόνο για την εφορία.","Υποστήριξη για ψηφιακούς καταλόγους, αποθέματα και παραγγελίες, μαζί με εγκατάσταση και εκπαίδευση — όχι απλώς επιδότηση αγοράς λογισμικού."],
  ["Λιγότερος χαμένος χρόνος στη γραφειοκρατία.","Απλούστερες διαδικασίες, λιγότερες επαναλαμβανόμενες καταχωρίσεις και προβλέψιμοι κανόνες, ώστε ο επαγγελματίας να ασχολείται με τους πελάτες του."],
  ["Ορατότητα και πελάτες για το μικρό κατάστημα.","Συνεργατική προβολή, κοινές υπηρεσίες παράδοσης και προσιτή σύνδεση φυσικών καταστημάτων με τις online πωλήσεις."],
  ["Πρόσβαση σε ρευστότητα όταν τη χρειάζεται η αγορά.","Μικρότερη χρηματοδότηση κεφαλαίου κίνησης με διαφανείς όρους και λύσεις προσαρμοσμένες στις καθημερινές ανάγκες των επιχειρήσεων."]
] as const;

export async function renderResearchDetailedPressReleasePdf():Promise<Uint8Array>{
  if(!vfs||typeof vfs["Roboto-Regular.ttf"]!=="string")throw new Error("RESEARCH_PRESS_EDITORIAL_FONT_UNAVAILABLE");
  if(make.addVirtualFileSystem)make.addVirtualFileSystem(vfs);else make.vfs=vfs;
  const content:unknown[]=[
    {columns:[{text:"ΔΕΛΤΙΟ ΤΥΠΟΥ",style:"eyebrow"},{text:"Σπάρτη · 30 Οκτωβρίου 2026",style:"muted",alignment:"right"}],margin:[0,16,0,9]},
    {text:"Ψηφιακή επανάσταση\nστα χαρτιά. Αγώνας\nεπιβίωσης πίσω\nαπό τις βιτρίνες.",style:"hero",margin:[0,2,0,22]},
    {canvas:[{type:"line",x1:0,y1:0,x2:42,y2:0,lineWidth:3,lineColor:"#c64e3a"}],margin:[0,0,0,20]},
    {text:"8 στις 10 επιχειρήσεις δηλώνουν αύξηση λειτουργικού κόστους. Σχεδόν οι μισές βλέπουν την κερδοφορία τους να μειώνεται. Η φορολογία ψηφιοποιήθηκε — αλλά η καθημερινή λειτουργία πολλών καταστημάτων έμεινε πίσω.",style:"lead",margin:[0,0,0,22]},
    {table:{widths:["*","*","*"],body:[[
      {stack:[stat("82,2%","αύξηση","λειτουργικού κόστους")],fillColor:"#eaf3ec",margin:[8,11,8,10]},
      {stack:[stat("47,1%","μείωση","κερδοφορίας")],fillColor:"#eaf3ec",margin:[8,11,8,10]},
      {stack:[stat("23,6%","πλήρη ψηφιακό","συγχρονισμό αποθεμάτων")],fillColor:"#eaf3ec",margin:[8,11,8,10]}
    ]]},layout:"noBorders",margin:[0,0,0,14]},
    heading("Το κόστος ανεβαίνει. Η αντοχή έχει όρια."),
    p("Πίσω από τις βιτρίνες, η καθημερινή πραγματικότητα γίνεται ολοένα δυσκολότερη. Το 82,2% των επιχειρήσεων που συμμετείχαν στην έρευνα αναφέρει αύξηση λειτουργικού κόστους, το 65,4% πίεση από τη μειωμένη αγοραστική δύναμη και το 59,0% φορολογική πίεση. [1]"),
    p("Οι λογαριασμοί, οι προμήθειες και οι υποχρεώσεις τρέχουν, ακόμη κι όταν οι καταναλωτές περιορίζουν τις αγορές τους. Για τον επαγγελματία, το κρίσιμο ερώτημα δεν είναι πόσο πουλάει, αλλά τι του απομένει στο τέλος του μήνα."),
    p("Το 6,6% όσων απάντησαν στον σχετικό δείκτη δηλώνει μάλιστα αύξηση τζίρου αλλά μείωση κερδών. Ένα εύρημα που θυμίζει κάτι απλό: περισσότερες πωλήσεις δεν σημαίνουν απαραίτητα καλύτερη οικονομική κατάσταση. [1]"),
    {text:"ΤΟ ΜΕΓΑΛΟ ΠΑΡΑΔΟΞΟ",style:"eyebrow",pageBreak:"before",margin:[0,17,0,12]},
    heading("Ψηφιακή συμμόρφωση δεν σημαίνει ψηφιακή ανάπτυξη.",[0,0,0,21]),
    p("Το 81,8% δηλώνει πλήρως ψηφιακές φορολογικές διαδικασίες. Όμως μόλις το 23,6% αναφέρει πλήρη ψηφιακό συγχρονισμό αποθεμάτων, ενώ το 27,0% διαθέτει πλήρως ψηφιακό κατάλογο προϊόντων. [1]"),
    {stack:[
      bar("Φορολογικές διαδικασίες",81.8,"#176648"),
      bar("Συγχρονισμός αποθεμάτων",23.6,"#bd4d3a"),
      bar("Ψηφιακός κατάλογος",27,"#7f9186")
    ],fillColor:"#f6f8f5",margin:[0,6,0,20]},
    {text:"58,2 ποσοστιαίες μονάδες χωρίζουν τη φορολογική ψηφιοποίηση από τον πλήρη ψηφιακό συγχρονισμό αποθεμάτων. Η απόσταση αφορά διαφορετικούς δείκτες — όχι απαραίτητα τις ίδιες επιχειρήσεις.",style:"note",margin:[0,0,0,14]},
    p("Μπορεί μια επιχείρηση να διεκπεραιώνει ηλεκτρονικά τις φορολογικές της υποχρεώσεις, αλλά να μην έχει αντίστοιχα εργαλεία για τα προϊόντα της. Τελικά, ψηφιοποιούμε μόνο όσα οφείλει να δηλώνει ή και όσα χρειάζεται για να αναπτυχθεί; Η έρευνα καταγράφει το χάσμα, δεν αποδεικνύει τι το προκάλεσε."),
    heading("Η βιτρίνα της γειτονιάς ακόμη μετράει."),
    p("Η φυσική προσέλευση εξακολουθεί να αποτελεί πηγή πελατών για το 73,6% των συμμετεχόντων. Οι προσωπικές συστάσεις αναφέρονται από το 55,5% και η αναζήτηση Google από το 39,8%. [1]"),
    p("Το φυσικό κατάστημα δεν έχει τελειώσει. Το ζητούμενο δεν είναι να το αντικαταστήσουμε με ένα e-shop, αλλά να του δώσουμε πρόσβαση σε προβολή, τεχνολογία και νέους πελάτες χωρίς δυσανάλογο κόστος."),
    heading("541 ελεύθερες απαντήσεις. Τα ίδια βάρη, με ανθρώπινη φωνή."),
    p("Η μεγαλύτερη θεματική κατηγορία των εγκεκριμένων ανοικτών απαντήσεων αφορά το λειτουργικό κόστος και τις ανατιμήσεις (150 αναφορές). Ακολουθούν το ψηφιακό εμπόριο και η προβολή (56), η φορολογία (55), η ζήτηση, η ρευστότητα, οι προμήθειες και η γραφειοκρατία. [3]"),
    {text:"ΑΠΟ ΤΗ ΔΙΑΠΙΣΤΩΣΗ ΣΤΗΝ ΠΡΑΞΗ",style:"eyebrow",pageBreak:"before",margin:[0,16,0,12]},
    heading("Πέντε λύσεις αντί για άλλες πέντε υποσχέσεις.",[0,0,0,17]),
    p("Οι απαντήσεις των επιχειρήσεων δείχνουν πού χρειάζεται να στραφεί η συζήτηση. Οι παρακάτω προτάσεις είναι πρακτικές κατευθύνσεις για τα προβλήματα που καταγράφηκαν — όχι μέτρα των οποίων η αποτελεσματικότητα έχει ήδη αποδειχθεί.",[0,0,0,16]),
    ...solutions.map(([title,body],index)=>({
      columns:[
        {width:36,text:String(index+1).padStart(2,"0"),style:"solutionNumber"},
        {width:"*",text:[{text:title+" ",bold:true},{text:body}]}
      ],columnGap:8,style:"paragraph",margin:[0,0,0,15]
    })),
    {text:"Ας μετρήσουμε όσα έχουν σημασία. Πόσα καταστήματα μείωσαν τα έξοδά τους; Πόσα απέκτησαν λειτουργική ψηφιακή αποθήκη; Πόσα βρήκαν νέους πελάτες; Η στήριξη της αγοράς πρέπει να αποδεικνύεται στην πράξη.",style:"callout",margin:[0,4,0,14]},
    heading("Η έρευνα, με μια ματιά.",[0,0,0,8]),
    {text:"Η μελέτη βασίζεται σε 650 έγκυρα ερωτηματολόγια επιχειρήσεων μη διατροφικού λιανεμπορίου. Η συμμετοχή ήταν εθελοντική και τα δημοσιευμένα ποσοστά δεν αποτελούν αυτομάτως αντιπροσωπευτικές εκτιμήσεις για όλες τις επιχειρήσεις της χώρας. [2]",style:"muted",margin:[0,0,0,12]},
    {text:"ΠΗΓΕΣ ΚΑΙ ΠΛΗΡΗΣ ΜΕΛΕΤΗ",style:"eyebrow",margin:[0,8,0,7]},
    {text:"[1] Δημοσιευμένα αποτελέσματα",link:RESULTS,style:"link",margin:[0,0,0,5]},
    {text:"[2] Αναλυτική μεθοδολογία",link:METHOD,style:"link",margin:[0,0,0,5]},
    {text:"[3] Η φωνή της Ελλάδας",link:VOICES,style:"link",margin:[0,0,0,11]},
    {text:"ΕΠΙΚΟΙΝΩΝΙΑ ΜΜΕ   ·   KONTA MOY Research · SP BUSINESS LAB · Σπάρτη   ·   research@kontamou.site",style:"muted"}
  ];
  const doc={
    info:{title:"Ψηφιακή επανάσταση στα χαρτιά. Αγώνας επιβίωσης πίσω από τις βιτρίνες.",author:"KONTA MOY Research · SP BUSINESS LAB",
      subject:"Ελληνικό Λιανεμπόριο 2026 · Αναλυτικό Δελτίο Τύπου"},
    pageSize:"A4",pageMargins:[48,76,48,54],
    defaultStyle:{font:"Roboto",fontSize:9.6,color:"#1b342b",lineHeight:1.32},
    styles:{
      eyebrow:{fontSize:8.2,bold:true,color:"#176c4b",characterSpacing:.5},
      muted:{fontSize:8,color:"#5c7365"},
      hero:{fontSize:30,bold:true,lineHeight:1.15,color:"#173c2b"},
      lead:{fontSize:11.6,lineHeight:1.45,color:"#173c2b"},
      heading:{fontSize:17,bold:true,lineHeight:1.18,color:"#1a3a2d"},
      paragraph:{fontSize:9.5,color:"#1c3b2e",lineHeight:1.4},
      statNumber:{fontSize:23,bold:true,color:"#176648"},
      statLabel:{fontSize:9,bold:true,color:"#23563d"},
      statDetail:{fontSize:8,color:"#526b58"},
      barLabel:{fontSize:9.1,color:"#214839"},
      note:{fontSize:8.6,color:"#4f6957",lineHeight:1.35,margin:[14,0,0,0]},
      solutionNumber:{fontSize:15,bold:true,color:"#17684a"},
      callout:{fontSize:10.1,bold:true,color:"#24513a",lineHeight:1.5},
      link:{fontSize:8.6,color:"#176648"}
    },content,
    header:()=>({
      margin:[48,30,48,0],
      stack:[
        {columns:[{text:"KONTA MOY",fontSize:13,bold:true,color:"#176648"},{text:"RESEARCH",fontSize:8,color:"#52685a"},
          {text:"ΕΛΛΗΝΙΚΟ ΛΙΑΝΕΜΠΟΡΙΟ 2026",alignment:"right",fontSize:7,color:"#53685b"}]},
        {canvas:[{type:"line",x1:0,y1:9,x2:499,y2:9,lineWidth:.5,lineColor:"#d0ded3"}]}
      ]
    }),
    footer:(page:number,total:number)=>({
      margin:[48,10,48,15],
      stack:[
        {canvas:[{type:"line",x1:0,y1:0,x2:499,y2:0,lineWidth:.5,lineColor:"#d0ded3"}]},
        {columns:[{text:"KONTA MOY RESEARCH  ·  SP BUSINESS LAB",fontSize:7,color:"#576f60",margin:[0,8,0,0]},
          {text:String(page).padStart(2,"0")+" / "+String(total).padStart(2,"0"),alignment:"right",fontSize:7,bold:true,color:"#166445",margin:[0,8,0,0]}]}
      ]
    })
  };
  return await new Promise<Uint8Array>((resolve,reject)=>{
    try{make.createPdf(doc).getBuffer(buffer=>resolve(buffer));}catch(error){reject(error);}
  });
}
