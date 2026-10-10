/**
 * FISCAL sandbox data-integrity review. NOT issuance eligibility or a tax-law checklist.
 * This pure read-only evaluator must NEVER imply an approved fiscal document.
 */
import {calculateFiscalPreview} from "./fiscal-preview-calculator.ts";

export type FiscalSandboxCheckCode =
  |"DRAFT_REFERENCE_MISSING"|"DRAFT_AMOUNT_MISSING"|"DRAFT_AMOUNT_INVALID"
  |"DRAFT_ITEMS_MISSING"|"DRAFT_ITEMS_INVALID"|"DRAFT_LINES_CHANGED"
  |"DRAFT_LINE_TOTAL_MISMATCH"|"DRAFT_GROSS_MISMATCH"|"DRAFT_SUBTOTAL_MISMATCH"
  |"DRAFT_COUNTERPARTY_MISSING"|"DRAFT_COUNTERPARTY_KIND_MISMATCH"
  |"DRAFT_COUNTERPARTY_UNVERIFIED"|"DRAFT_COUNTERPARTY_UNEXPECTED"
  |"DRAFT_ORGANIZATION_UNAPPROVED";
export type FiscalSandboxCheck=Readonly<{
 code:FiscalSandboxCheckCode;level:"missing"|"conflict"|"unverified";message:string;
}>;
export type FiscalSandboxReport=Readonly<{
 kind:"sandbox_data_integrity";
 status:"consistent_test_data"|"incomplete_test_data"|"conflicting_test_data";
 checks:FiscalSandboxCheck[];
 fiscalIssuanceAllowed:false;
 taxClassificationVerified:false;
 identityVerified:false;
 legalReviewCompleted:false;
}>;
type SandboxParty={kind:unknown;vatNumber:unknown;verificationStatus:unknown;legalName:unknown}|null;
export type FiscalSandboxInput={
 lane:unknown;reference:unknown;grossMinor:unknown;
 netMinor?:unknown;vatMinor?:unknown;discountMinor?:unknown;
 calculationKind?:unknown;lines:unknown;counterparty?:unknown;organizationStatus?:unknown;
};
const moneyInt=(v:unknown):number|null=>{
 if(typeof v==="number"&&Number.isSafeInteger(v)&&v>=0&&v<=1e12)return v;
 if(typeof v==="string"&&/^\d{1,13}$/.test(v)){
  const n=Number(v);if(Number.isSafeInteger(n)&&n<=1e12)return n;
 }
 return null;
};
const isLane=(value:unknown):value is "b2c"|"pos"|"b2b"|"b2g"=>
 value==="b2c"||value==="pos"||value==="b2b"||value==="b2g";
const missing=(code:FiscalSandboxCheckCode,message:string):FiscalSandboxCheck=>
 ({code,level:"missing",message});
const conflict=(code:FiscalSandboxCheckCode,message:string):FiscalSandboxCheck=>
 ({code,level:"conflict",message});
const unverified=(code:FiscalSandboxCheckCode,message:string):FiscalSandboxCheck=>
 ({code,level:"unverified",message});

/** Reviews persisted data only. No DB access, side effects or network calls. */
export function reviewFiscalSandboxDraft(input:FiscalSandboxInput):FiscalSandboxReport{
 const checks:FiscalSandboxCheck[]=[];
 const add=(value:FiscalSandboxCheck)=>checks.push(value);
 if(typeof input.reference!=="string"||!input.reference.trim())
  add(missing("DRAFT_REFERENCE_MISSING","Λείπει η αναφορά δοκιμής."));
 const gross=moneyInt(input.grossMinor);
 if(input.grossMinor===null||input.grossMinor===undefined)
  add(missing("DRAFT_AMOUNT_MISSING","Δεν έχει καταχωριστεί συνολικό δοκιμαστικό ποσό."));
 else if(gross===null)
  add(conflict("DRAFT_AMOUNT_INVALID","Το συνολικό ποσό δεν έχει έγκυρη ακέραιη μορφή λεπτών EUR."));
 if(input.organizationStatus!==undefined&&input.organizationStatus!=="approved")
  add(missing("DRAFT_ORGANIZATION_UNAPPROVED","Η επιχείρηση δεν εμφανίζεται ως εγκεκριμένη για δοκιμές."));
 const lane=isLane(input.lane)?input.lane:null;
 if(!lane)add(conflict("DRAFT_ITEMS_INVALID","Μη αναγνωρισμένη κατηγορία δοκιμής."));
 const party=(input.counterparty&&typeof input.counterparty==="object"&&!Array.isArray(input.counterparty)
  ?input.counterparty as SandboxParty:null);
 if(lane==="b2b"||lane==="b2g"){
  if(!party)add(missing("DRAFT_COUNTERPARTY_MISSING",
   "Λείπει αντισυμβαλλόμενος B2B/B2G από το δοκιμαστικό draft."));
  else{
   const expected=lane==="b2b"?"business":"public_body";
   if(party.kind!==expected||typeof party.legalName!=="string"||
    party.legalName.trim().length<2||typeof party.vatNumber!=="string"||
    !/^[0-9]{9}$/.test(party.vatNumber))
    add(conflict("DRAFT_COUNTERPARTY_KIND_MISMATCH",
     "Η ταυτότητα ή η κατηγορία του αποθηκευμένου αντισυμβαλλομένου δεν συμφωνεί με το draft."));
   // Unverified in our test registry even if a future external field claims otherwise.
   add(unverified("DRAFT_COUNTERPARTY_UNVERIFIED",
    "Η ταυτότητα και το ΑΦΜ του αντισυμβαλλομένου δεν έχουν επαληθευτεί σε επίσημο μητρώο."));
  }
 }else if(party)add(conflict("DRAFT_COUNTERPARTY_UNEXPECTED",
  "Η κατηγορία B2C/POS δεν δέχεται συνδεδεμένη δοκιμαστική επιχείρηση/δημόσιο φορέα."));
 if(!Array.isArray(input.lines)||input.lines.length===0){
  add(missing("DRAFT_ITEMS_MISSING","Δεν υπάρχουν αναλυτικές γραμμές για επανυπολογισμό."));
 }else if(input.lines.length>30||!lane){
  add(conflict("DRAFT_ITEMS_INVALID","Το πλήθος γραμμών ή η κατηγορία είναι άκυρα."));
 }else{
  try{
   const raw=input.lines.map((line:unknown)=>{
    if(!line||typeof line!=="object"||Array.isArray(line))
     throw new Error("INVALID_LINE");
    const d=line as Record<string,unknown>;
    return {description:d.description,quantityMilli:d.quantityMilli,
     unitPriceMinor:d.unitPriceMinor,vatRateBps:d.vatRateBps,discountBps:d.discountBps};
   });
   const recomputed=calculateFiscalPreview({lane,items:raw});
   if(input.calculationKind!=="non_fiscal_test_preview")
    add(conflict("DRAFT_ITEMS_INVALID","Λείπει ο αποδεκτός δείκτης μη φορολογικού υπολογισμού."));
   for(let i=0;i<recomputed.items.length;i++){
    const saved=input.lines[i] as Record<string,unknown>;
    const expected=recomputed.items[i];
    const fields=["beforeDiscountMinor","discountMinor","netMinor","vatMinor","grossMinor"] as const;
    if(fields.some(k=>moneyInt(saved[k])!==expected[k])){
     add(conflict("DRAFT_LINES_CHANGED",
      "Οι αποθηκευμένες τιμές κάποιας γραμμής δεν συμφωνούν με ανεξάρτητο επανυπολογισμό."));
     break;
    }
   }
   if(gross!==null&&gross!==recomputed.totals.grossMinor)
    add(conflict("DRAFT_GROSS_MISMATCH","Το συνολικό δοκιμαστικό ποσό δεν συμφωνεί με το άθροισμα γραμμών."));
   if(moneyInt(input.netMinor)!==recomputed.totals.netMinor||
    moneyInt(input.vatMinor)!==recomputed.totals.vatMinor||
    moneyInt(input.discountMinor)!==recomputed.totals.discountMinor)
    add(conflict("DRAFT_SUBTOTAL_MISMATCH","Καθαρή αξία, έκπτωση ή ενδεικτικός ΦΠΑ δεν συμφωνούν με τα αναλυτικά ποσά."));
  }catch{
   add(conflict("DRAFT_ITEMS_INVALID","Οι γραμμές δεν μπορούν να επανυπολογιστούν με τους κανόνες της δοκιμής."));
  }
 }
 const status=checks.some(x=>x.level==="conflict")?"conflicting_test_data":
  checks.some(x=>x.level==="missing")?"incomplete_test_data":"consistent_test_data";
 return {
  kind:"sandbox_data_integrity",status,checks,
  fiscalIssuanceAllowed:false,taxClassificationVerified:false,
  identityVerified:false,legalReviewCompleted:false
 };
}
