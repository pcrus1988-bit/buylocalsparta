import {createHash} from "node:crypto";
import {MAZI_LEGAL_V31_ARCHIVE} from "./archive/v31";
import {type LegalRecord,type LegalSlug} from "../legal-documents";

/** Read-only historical legal corpus; not a list of terms individually accepted by any member. */
export const MAZI_ARCHIVED_VERSION=MAZI_LEGAL_V31_ARCHIVE.version;
export const MAZI_ARCHIVED_DATE=MAZI_LEGAL_V31_ARCHIVE.publicationDate;
export const MAZI_ARCHIVE_BASE="/legal/archive";
export function archivedRecord(version:string, slug:string):LegalRecord|null {
 if(version!==MAZI_ARCHIVED_VERSION || !Object.prototype.hasOwnProperty.call(MAZI_LEGAL_V31_ARCHIVE.documents,slug))return null;
 return MAZI_LEGAL_V31_ARCHIVE.documents[slug as LegalSlug];
}
export function archivedDigest(doc:LegalRecord){
 return createHash("sha256").update(JSON.stringify(doc),"utf8").digest("hex");
}
export function archivePageUrl(slug:LegalSlug){
 return `${MAZI_ARCHIVE_BASE}/${MAZI_ARCHIVED_VERSION}/${slug}`;
}
export function archiveExportUrl(slug:LegalSlug){
 return `/legal/export/${MAZI_ARCHIVED_VERSION}/${slug}`;
}
export function archivedText(slug:LegalSlug,doc:LegalRecord){
 const parts=[
  "ΜΑΖΙ · ΙΣΤΟΡΙΚΟ ΝΟΜΙΚΟ ΚΕΙΜΕΝΟ",
  doc.title,
  "Έκδοση: "+MAZI_ARCHIVED_VERSION,
  "Ημερομηνία: "+MAZI_ARCHIVED_DATE,
  "SHA-256 (JSON περιεχομένου): "+archivedDigest(doc),
  "Είδος: "+(doc.status==="current"?"Ισχύων κατά τη δημοσίευση":"Προτεινόμενος / ειδική αποδοχή πριν από ενεργοποίηση"),
  "",
  "Το έγγραφο καταγράφει το δημοσιευμένο νομικό κείμενο της έκδοσης.",
  "Η λήψη ή ανάγνωση δεν αποδεικνύει ατομική συμβατική αποδοχή.",
  "Η τρέχουσα έκδοση μπορεί να έχει αλλάξει· έλεγχος στο https://mazi.kontamou.site/legal.",
  ""
 ];
 for(const section of doc.sections){
  parts.push(section.heading,"");
  for(const p of section.paragraphs)parts.push(p,"");
 }
 return parts.join("\n");
}
