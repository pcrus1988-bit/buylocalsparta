/**
 * Browser-only tools for Greek hospitality POS onboarding preparation.
 * No network, credentials, orders, prices, payment events or DB writes.
 */
export type PosSetupPath="cloud"|"local_bridge"|"vendor_assisted";
export type PosCsvItem={externalItemId:string;name:string};
export type DrinkStockMenuItem={id:string;name:string};
export type PosItemMapping={externalItemId:string;productId:string};
export class PosOnboardingError extends Error{
 readonly code:string;
 constructor(code:string){super(code);this.code=code;}
}
export const MAX_POS_CSV_CHARS=512_000;
export const MAX_POS_CSV_ITEMS=500;
export const posSetupPath=(approach:string):PosSetupPath=>
 approach==="documented_api_provisioning"?"cloud":
 approach==="vendor_local_bridge"?"local_bridge":"vendor_assisted";

function normalizeHeader(v:string):string{
 return v.trim().toLocaleLowerCase("el-GR").normalize("NFD")
  .replace(/[\u0300-\u036f]/g,"").replace(/[\s_\-]+/g,"");
}
export function normalizedDrinkName(v:string):string{
 return v.normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toLocaleLowerCase("el-GR").replace(/ς/g,"σ")
  .replace(/[^\p{L}\p{N}]+/gu," ").trim().replace(/\s+/g," ");
}
function csvRecords(text:string,delimiter:string):string[][]{
 const rows:string[][]=[];let row:string[]=[],cell="",inQuotes=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'){
   if(inQuotes&&text[i+1]==='"'){cell+='"';i++;}
   else if(inQuotes){inQuotes=false;}
   else if(cell===""){inQuotes=true;}
   else throw new PosOnboardingError("CSV_INVALID_QUOTES");
  }else if(!inQuotes&&c===delimiter){row.push(cell);cell="";}
  else if(!inQuotes&&(c==="\n"||c==="\r")){
   if(c==="\r"&&text[i+1]==="\n")i++;
   row.push(cell);cell="";
   if(row.some(x=>x.trim()))rows.push(row);
   row=[];
   if(rows.length>MAX_POS_CSV_ITEMS+1)throw new PosOnboardingError("CSV_TOO_MANY_ROWS");
  }else{cell+=c;}
 }
 if(inQuotes)throw new PosOnboardingError("CSV_INVALID_QUOTES");
 row.push(cell);
 if(row.some(x=>x.trim()))rows.push(row);
 return rows;
}
function chooseDelimiter(header:string):string{
 let comma=0,semicolon=0,tab=0,quoted=false;
 for(let i=0;i<header.length;i++){
  const c=header[i];
  if(c==='"'){if(quoted&&header[i+1]==='"')i++;else quoted=!quoted;}
  else if(!quoted){if(c===",")comma++;else if(c===";")semicolon++;else if(c==="\t")tab++;}
 }
 return semicolon>=comma&&semicolon>=tab&&semicolon>0?";":
 tab>comma?"\t":",";
}
/** Only code and item name are loaded; never upload or parse fiscal/customer data. */
export function parsePosMenuCsv(text:string):PosCsvItem[]{
 if(!text||text.length>MAX_POS_CSV_CHARS)throw new PosOnboardingError("CSV_FILE_TOO_LARGE");
 const clean=text.replace(/^\uFEFF/,"");
 const headerLine=clean.split(/\r?\n/,1)[0]??"";
 const rows=csvRecords(clean,chooseDelimiter(headerLine));
 if(!rows.length)throw new PosOnboardingError("CSV_EMPTY");
 const fields=rows[0].map(normalizeHeader);
 const ids=new Set(["sku","code","id","itemid","productid","κωδικοσ","κωδ","κωδικος"]);
 const names=new Set(["name","title","description","productname","itemname","περιγραφη","προιον","ειδοσ","ειδος"]);
 const codeIndex=fields.findIndex(x=>ids.has(x));
 const nameIndex=fields.findIndex(x=>names.has(x));
 if(codeIndex<0||nameIndex<0||codeIndex===nameIndex)
  throw new PosOnboardingError("CSV_NEEDS_CODE_AND_NAME");
 const used=new Set<string>();
 const items:PosCsvItem[]=[];
 for(const row of rows.slice(1)){
  const id=(row[codeIndex]??"").trim(),name=(row[nameIndex]??"").trim();
  if(!id||!name||id.length>160||name.length>200||
   /[\u0000-\u001f\u007f]/.test(id)||/[\u0000-\u001f\u007f]/.test(name))
   throw new PosOnboardingError("CSV_INVALID_ITEM");
  if(used.has(id))throw new PosOnboardingError("CSV_DUPLICATE_CODE");
  used.add(id);items.push({externalItemId:id,name});
 }
 if(!items.length)throw new PosOnboardingError("CSV_EMPTY");
 return items;
}
/** Suggest exact normalized names only: never silently approve a guess. */
export function proposeExactMatches(items:readonly PosCsvItem[],drinks:readonly DrinkStockMenuItem[]):PosItemMapping[]{
 const index=new Map<string,string[]>();
 for(const drink of drinks){
  const key=normalizedDrinkName(drink.name),group=index.get(key)??[];
  group.push(drink.id);index.set(key,group);
 }
 return items.map(item=>{
  const group=index.get(normalizedDrinkName(item.name))??[];
  return {externalItemId:item.externalItemId,productId:group.length===1?group[0]:""};
 });
}
function safeCsvCell(raw:string):string{
 // Protect spreadsheet users against formula injection on exported untrusted
 // POS item names, codes or user-created drink names.
 const value=/^[\t\r\n\s]*[=+@\-]/.test(raw)?"'"+raw:raw;
 return '"'+value.replace(/"/g,'""')+'"';
}
export function buildMappingCsv(items:readonly PosCsvItem[],maps:readonly PosItemMapping[],drinks:readonly DrinkStockMenuItem[]):string{
 const byCode=new Map(maps.map(m=>[m.externalItemId,m.productId]));
 const byDrink=new Map(drinks.map(d=>[d.id,d.name]));
 const lines=[["pos_code","pos_name","drinkstock_product_id","drinkstock_name","review_status"]];
 for(const item of items){
  const id=byCode.get(item.externalItemId)??"";
  const matched=id&&byDrink.has(id);
  lines.push([item.externalItemId,item.name,matched?id:"",matched?byDrink.get(id)!:"",
   matched?"TO_REVIEW":"UNMAPPED"]);
 }
 return "\uFEFF"+lines.map(row=>row.map(safeCsvCell).join(";")).join("\r\n")+"\r\n";
}
export function posCsvTemplate():string{
 return "\uFEFF"+["code;name","BEER-001;Μπύρα βαρέλι 500ml","COCKTAIL-001;Mojito"].join("\r\n")+"\r\n";
}
export function buildVendorRequest(providerName:string,venueName:string,path:PosSetupPath):string{
 const mode=path==="cloud"?"εγκεκριμένου Cloud API / OAuth":
 path==="local_bridge"?"εγκεκριμένου τοπικού connector (Windows/POS)":
 "εγκεκριμένης τεχνικής διασύνδεσης";
 return [
  "Θέμα: Αίτημα διασύνδεσης "+providerName+" με DrinkStock",
  "",
  "Καλησπέρα σας,",
  "Χρησιμοποιούμε το POS "+providerName+" στον χώρο "+venueName+".",
  "Θα θέλαμε να εξετάσουμε ασφαλή διασύνδεση με την εφαρμογή DrinkStock μέσω "+mode+".",
  "Παρακαλούμε ενημερώστε μας αν υποστηρίζονται:",
  "• Ανάγνωση καταλόγου και σταθερών κωδικών προϊόντων (SKU).",
  "• Ενημέρωση για τελικές, εξοφλημένες πωλήσεις ανά είδος, ακυρώσεις και επιστροφές.",
  "• Αποστολή παραγγελιών και συγχρονισμός τιμών, εφόσον διατίθενται επίσημα.",
  "• Δοκιμαστικό περιβάλλον, άδεια διασύνδεσης και τεχνική τεκμηρίωση.",
  "",
  "Δεν ζητούμε κωδικούς πρόσβασης, φορολογικά παραστατικά ή προσωπικά στοιχεία πελατών μέσω email.",
  "Η υπάρχουσα νόμιμη λειτουργία POS / ΑΑΔΕ πρέπει να παραμείνει αμετάβλητη.",
  "Ευχαριστούμε."
 ].join("\n");
}
