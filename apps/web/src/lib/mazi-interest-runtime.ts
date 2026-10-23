import {createHash} from "node:crypto";
import {PostgresFixedWindowRateLimiter} from "@buy-local-sparta/postgres-runtime";
import {getProductionPostgresRuntime,productionDatabaseConfigured} from "./postgres-runtime";
import {normalizeGreekAfm,resolveGemiCompanyByAfm} from "./gemi-runtime";

const globalStore=globalThis as typeof globalThis & {__maziInterestLimiter?:PostgresFixedWindowRateLimiter};
const limiter=()=>globalStore.__maziInterestLimiter??=
 new PostgresFixedWindowRateLimiter(getProductionPostgresRuntime().sqlPool);

export type MaziInterestInput=Readonly<{
 afm:string;representativeName:string;contactEmail:string;description:string;
 acceptProcessing:boolean;confirmAccuracy:boolean;
}>;

export class MaziInterestError extends Error {
 constructor(public readonly code:string, public readonly status:number, message:string){super(message);}
}
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function value(s:string,max:number){return s.trim().slice(0,max+1);}
export function validateMaziInterest(input:MaziInterestInput){
 const afm=normalizeGreekAfm(input.afm);
 const representative=value(input.representativeName,120);
 const contactEmail=value(input.contactEmail,254).toLowerCase();
 const description=value(input.description,1200);
 if(representative.length<3||representative.length>120)throw new MaziInterestError("invalid_representative",400,"Ελέγξτε το ονοματεπώνυμο.");
 if(contactEmail.length<5||contactEmail.length>254||!emailPattern.test(contactEmail))
   throw new MaziInterestError("invalid_contact",400,"Ελέγξτε το email.");
 if(description.length<20||description.length>1200)
   throw new MaziInterestError("invalid_description",400,"Περιγράψτε την επιχείρηση με 20–1.200 χαρακτήρες.");
 if(!input.acceptProcessing||!input.confirmAccuracy)
   throw new MaziInterestError("processing_notice_required",400,"Επιβεβαιώστε την ενημέρωση επεξεργασίας και την ακρίβεια των στοιχείων.");
 return {afm,representative,contactEmail,description};
}
export async function consumeMaziInterestLimit(visitorKey:string,ip:string,now:number){
 if(!productionDatabaseConfigured())return false;
 const ipFingerprint=createHash("sha256").update(ip).digest("hex");
 const [visitor,network]=await Promise.all([
  limiter().consume({route:"mazi-afm-interest-visitor",key:visitorKey,limit:4,windowMs:86400000,now}),
  limiter().consume({route:"mazi-afm-interest-network",key:ipFingerprint,limit:12,windowMs:86400000,now})
 ]);
 return visitor.allowed&&network.allowed;
}
export async function consumeMaziLookupPreviewLimit(visitorKey:string,ip:string,now:number){
 if(!productionDatabaseConfigured())return false;
 const ipFingerprint=createHash("sha256").update(ip).digest("hex");
 const [visitor,network]=await Promise.all([
  limiter().consume({route:"mazi-afm-preview-visitor",key:visitorKey,limit:10,windowMs:86400000,now}),
  limiter().consume({route:"mazi-afm-preview-network",key:ipFingerprint,limit:24,windowMs:86400000,now})
 ]);
 return visitor.allowed&&network.allowed;
}

export async function saveMaziInterest(input:MaziInterestInput){
 if(!productionDatabaseConfigured())throw new MaziInterestError("service_unavailable",503,"Η υπηρεσία αιτήσεων δεν είναι διαθέσιμη.");
 const candidate=validateMaziInterest(input);
 // Always resolve from the existing authorized official provider/cache;
 // checksum and registry hit never verify ownership or active legal status.
 const registry=await resolveGemiCompanyByAfm(candidate.afm);
 const matched=registry.lookupStatus==="matched";
 const db=getProductionPostgresRuntime().sqlPool;
 await db.query(`
  insert into public.mazi_interest_applications(
   tax_number,gemi_number,registry_legal_name,registry_company_status,
   registry_legal_type,registry_city,registry_checked_at,
   registry_lookup_status,registry_was_cached,representative_name,
   contact_email,application_note,processing_notice_version,
   accuracy_confirmed,status)
  values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
   'mazi-afm-interest-v1',true,$13)
  on conflict(tax_number,contact_email) do nothing
 `,[
  candidate.afm,
  matched?registry.gemiNumber:null,
  matched?registry.legalName:null,
  matched?registry.companyStatus??null:null,
  matched?registry.legalType??null:null,
  matched?registry.city??null:null,
  matched?new Date(registry.checkedAt):null,
  registry.lookupStatus,
  registry.fromCache,
  candidate.representative,candidate.contactEmail,candidate.description,
  matched?"pending_review":"registry_review_required"
 ]);
 // Do not reveal whether an ΑΦΜ is already in review, rejected or admitted.
 // No member auth user, marketing opt-in, payment or invitation is created.
 return {status:"received" as const};
}
