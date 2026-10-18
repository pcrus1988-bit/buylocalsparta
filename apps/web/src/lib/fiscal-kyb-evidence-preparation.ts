/**
 * M29 – merchant-side evidence PREPARATION ONLY, not submission.
 * Never contains or accepts document contents, identifiers, dates of birth,
 * addresses, owner identities, certificate numbers or text notes.
 */
import {fiscalKybChecks} from "./fiscal-kyb-checks.ts";
import type {FiscalKybCheck} from "./fiscal-kyb-checks.ts";

export type FiscalKybPreparationEntry=Readonly<{
 id:FiscalKybCheck;
 title:string;
 preparation:string;
 privacy:string;
}>;

const guidance:Readonly<Record<FiscalKybCheck,Omit<FiscalKybPreparationEntry,"id">>>={
 business_registration:{
  title:"Εγγραφή της επιχείρησης",
  preparation:"Εντοπίστε το επίσημο έγγραφο σύστασης ή την πρόσφατη εγγραφή στο αρμόδιο μητρώο.",
  privacy:"Μην καταχωρίζετε αριθμούς ή αντίγραφα μητρώου σε φόρμες συνομιλίας."
 },
 vat_identity:{
  title:"Ταυτοποίηση φορολογικών στοιχείων",
  preparation:"Ελέγξτε ότι η επωνυμία και τα φορολογικά στοιχεία της επιχείρησης συμφωνούν με την επίσημη καταχώρισή της.",
  privacy:"Μην εισάγετε αποδεικτικά φορολογικής ταυτότητας σε μη εγκεκριμένα κανάλια."
 },
 registered_address:{
  title:"Έδρα και επαγγελματική διεύθυνση",
  preparation:"Ετοιμάστε ενημερωμένο αποδεικτικό έδρας, εφόσον ζητηθεί από εξουσιοδοτημένο χειριστή.",
  privacy:"Μη συμπεριλάβετε προσωπικές διευθύνσεις που δεν απαιτούνται για τον έλεγχο."
 },
 legal_representation:{
  title:"Νόμιμη εκπροσώπηση",
  preparation:"Εντοπίστε τα ισχύοντα εταιρικά στοιχεία που τεκμηριώνουν τον νόμιμο εκπρόσωπο.",
  privacy:"Μη διαβιβάσετε στοιχεία ταυτότητας ή προσωπικά έγγραφα χωρίς ασφαλές εγκεκριμένο κανάλι."
 },
 beneficial_ownership:{
  title:"Πραγματικοί δικαιούχοι",
  preparation:"Ελέγξτε αν υπάρχει ισχύουσα επίσημη καταχώριση πραγματικών δικαιούχων.",
  privacy:"Τα προσωπικά στοιχεία δικαιούχων χρειάζονται περιορισμένη πρόσβαση και ελάχιστη αναγκαία συλλογή."
 },
 signing_authority:{
  title:"Δικαίωμα υπογραφής",
  preparation:"Εντοπίστε τυχόν τρέχουσα απόφαση εξουσιοδότησης ή σχετικό εταιρικό έγγραφο.",
  privacy:"Αποφύγετε κοινοποίηση δειγμάτων υπογραφής ή προσωπικών ταυτοποιητικών στοιχείων."
 },
 service_agreement:{
  title:"Σύμβαση υπηρεσίας FISCAL",
  preparation:"Διαβάστε τις εφαρμοστέες συμβατικές απαιτήσεις όταν διατεθούν επίσημα. Καμία συμφωνία δεν συνάπτεται σε αυτό το βήμα.",
  privacy:"Μην κοινοποιείτε υπογεγραμμένα συμβατικά έγγραφα εκτός εγκεκριμένης διαδικασίας."
 }
};

export const fiscalKybPreparationEntries:readonly FiscalKybPreparationEntry[]=
 Object.freeze(fiscalKybChecks.map(id=>Object.freeze({id,...guidance[id]})));

export type FiscalKybPreparationSummary=Readonly<{
 total:7;
 locallyMarked:number;
 unmarked:number;
 submitted:false;
 persisted:false;
 legalApproval:false;
 fiscalIssuanceEnabled:false;
}>;

export function summarizeFiscalKybLocalPreparation(
 selected:readonly FiscalKybCheck[]
):FiscalKybPreparationSummary{
 if(!Array.isArray(selected)||selected.length>fiscalKybChecks.length||
   selected.some(id=>!fiscalKybChecks.includes(id)))
  throw new Error("KYB_PREPARATION_INVALID");
 const locallyMarked=new Set(selected).size;
 return Object.freeze({
  total:7 as const,locallyMarked,
  unmarked:fiscalKybChecks.length-locallyMarked,
  submitted:false as const,persisted:false as const,
  legalApproval:false as const,fiscalIssuanceEnabled:false as const
 });
}
