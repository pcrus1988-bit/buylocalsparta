import pdfMakeModule from "pdfmake/build/pdfmake.js";
import fontsModule from "pdfmake/build/vfs_fonts.js";

const pdfMake=pdfMakeModule?.default??pdfMakeModule;
const rawFonts=fontsModule?.default??fontsModule;
const vfs=rawFonts?.pdfMake?.vfs??rawFonts;
if(!vfs || typeof vfs["Roboto-Regular.ttf"]!=="string") throw new Error("PDF VFS smoke test: Roboto-Regular.ttf missing");
if(typeof pdfMake.addVirtualFileSystem==="function") pdfMake.addVirtualFileSystem(vfs);
else pdfMake.vfs=vfs;

const buffer=await new Promise((resolve,reject)=>{
  try{
    pdfMake.createPdf({
      defaultStyle:{font:"Roboto"},
      content:[
        {text:"ΚΟΝΤΑ ΜΟΥ · GDPR"},
        {text:"Δοκιμή ελληνικού PDF · Αναφορά προσωπικών δεδομένων"}
      ]
    }).getBuffer(resolve);
  }catch(error){reject(error);}
});
const bytes=Buffer.from(buffer);
if(bytes.length<500 || bytes.subarray(0,5).toString("ascii")!=="%PDF-") throw new Error("PDF VFS smoke test did not produce a valid PDF");
console.log(`Privacy PDF VFS smoke test passed (${bytes.length} bytes, Greek text included).`);
