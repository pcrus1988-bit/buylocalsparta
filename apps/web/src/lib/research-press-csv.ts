/** Strict, locale-aware, RFC4180-style CSV import shared by the browser preview and server. */
export type PressLanguage = "el" | "en";
export type PressCsvContact = Readonly<{ email: string; language: PressLanguage; outlet?: string; name?: string }>;
export type PressCsvResult = Readonly<{
  contacts: PressCsvContact[]; duplicateCount: number; counts: { el: number; en: number };
}>;
export const MAX_PRESS_CONTACTS = 500;
export const MAX_PRESS_CSV_BYTES = 1024 * 1024;
const EMAIL_RE = /^[A-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+$/i;

export function normalizePressLanguage(value: string): PressLanguage | null {
  switch(value.trim().toLowerCase().normalize("NFC")) {
    case "el": case "el-gr": case "gr": case "greek": case "ελληνικά": case "ελληνικα": return "el";
    case "en": case "en-gb": case "en-us": case "english": case "αγγλικά": case "αγγλικα": return "en";
    default: return null;
  }
}
export function validatePressEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email) || /[\x00-\x1f\x7f]/.test(email))
    throw new Error("Invalid recipient email: " + value.slice(0,70));
  return email;
}
function csvRows(value: string): string[][] {
  const text = value.replace(/^\uFEFF/, "");
  const firstLine = text.split(/\r?\n/,1)[0] || "";
  const delimiter = (firstLine.match(/;/g)||[]).length > (firstLine.match(/,/g)||[]).length ? ";" : ",";
  const rows: string[][] = []; let row: string[] = []; let field = ""; let quoted = false;
  for (let i=0;i<text.length;i++) {
    const ch=text[i];
    if (quoted) {
      if (ch==='"' && text[i+1]==='"') { field+='"'; i++; }
      else if (ch==='"') quoted=false;
      else field+=ch;
      continue;
    }
    if (ch==='"') {
      if (field.length) throw new Error("Unexpected quote in CSV row " + (rows.length+1));
      quoted=true;
    } else if(ch===delimiter) {row.push(field);field="";}
    else if(ch==="\n" || ch==="\r") {
      if (ch==="\r" && text[i+1]==="\n") i++;
      row.push(field);rows.push(row);row=[];field="";
    } else field+=ch;
  }
  if(quoted)throw new Error("Unclosed quoted field in CSV.");
  if(field!=="" || row.length) {row.push(field);rows.push(row);}
  return rows.filter(r=>r.some(v=>v.trim()));
}
export function parsePressCsv(text: string): PressCsvResult {
  if(!text.trim())throw new Error("CSV file is empty.");
  if(text.includes("\uFFFD")) throw new Error("CSV contains unreadable characters. Export as UTF-8 CSV.");
  const rows = csvRows(text);
  if(rows.length<2)throw new Error("CSV requires a header row and at least one contact.");
  const headers=rows[0].map(v=>v.trim().toLowerCase().replace(/\s+/g,"_"));
  const emailIndex=headers.findIndex(v=>["email","e-mail","email_address","mail"].includes(v));
  const languageIndex=headers.findIndex(v=>["language","lang","γλώσσα","γλωσσα"].includes(v));
  const outletIndex=headers.findIndex(v=>["outlet","media","publication","medium"].includes(v));
  const nameIndex=headers.findIndex(v=>["name","contact_name","contact"].includes(v));
  if(emailIndex<0 || languageIndex<0 || emailIndex===languageIndex)
    throw new Error("CSV must contain email and language columns.");
  if(new Set(headers).size!==headers.length)throw new Error("Duplicate CSV headers are not allowed.");
  if(rows.length>MAX_PRESS_CONTACTS+1)throw new Error("CSV has more than 500 rows. Split large distribution lists.");
  const seen=new Map<string,PressCsvContact>(); let duplicateCount=0;
  rows.slice(1).forEach((cells,i)=>{
    const n=i+2;
    if(cells.length!==headers.length)throw new Error("CSV row "+n+" has "+cells.length+" columns; expected "+headers.length+".");
    let email: string;
    try{ email=validatePressEmail(cells[emailIndex]); }
    catch{throw new Error("CSV row "+n+" has an invalid email address.");}
    const language=normalizePressLanguage(cells[languageIndex]);
    if(!language)throw new Error("CSV row "+n+" must explicitly use language el or en (Greek/English).");
    const contact:PressCsvContact = {
      email,language,
      ...(outletIndex>=0 && cells[outletIndex].trim()?{outlet:cells[outletIndex].trim().slice(0,160)}:{}),
      ...(nameIndex>=0 && cells[nameIndex].trim()?{name:cells[nameIndex].trim().slice(0,160)}:{})
    };
    const prior=seen.get(email);
    if(prior){
      if(prior.language!==language) throw new Error("CSV row "+n+": "+email+" has conflicting Greek/English assignments.");
      duplicateCount++;
    } else seen.set(email,contact);
  });
  if(seen.size>MAX_PRESS_CONTACTS)throw new Error("Maximum 500 unique contacts.");
  const contacts=[...seen.values()];
  return {contacts,duplicateCount,counts:{
    el:contacts.filter(c=>c.language==="el").length,
    en:contacts.filter(c=>c.language==="en").length
  }};
}
export function combinePressContacts(
  original: readonly PressCsvContact[], incoming: readonly PressCsvContact[], mode:"append"|"replace"="replace"
): PressCsvContact[] {
  const result=new Map<string,PressCsvContact>();
  for(const contact of (mode==="append"?original:[])) result.set(validatePressEmail(contact.email),contact);
  for(const contact of incoming) {
    const email=validatePressEmail(contact.email);
    const prior=result.get(email);
    if(prior && prior.language!==contact.language) {
      throw new Error("Conflicting languages for "+email+". Correct the CSV or replace the existing list.");
    }
    result.set(email,contact);
  }
  if(result.size>MAX_PRESS_CONTACTS)throw new Error("Combined recipient list exceeds 500 contacts.");
  return [...result.values()];
}
export function contactsFromLanguages(recipients:readonly string[], langs:Record<string,PressLanguage>):PressCsvContact[] {
  return recipients.map(email=>{
    const language=langs[email];
    if(language!=="el" && language!=="en")throw new Error("Recipient "+email+" is missing an explicit language.");
    return {email:validatePressEmail(email),language};
  });
}
