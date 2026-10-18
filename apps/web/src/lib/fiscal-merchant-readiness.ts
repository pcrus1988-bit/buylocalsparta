/**
 * Read-only onboarding guidance built only from an authenticated merchant's
 * already scoped organization memberships and their own email status.
 *
 * This does not evaluate KYB evidence, registry validity, tax compliance,
 * external provider certification or the right to issue legal documents.
 */
export type FiscalMerchantOrgStatus=
  "pending_review"|"under_review"|"approved"|"rejected"|"suspended";

export type FiscalReadinessAccount=Readonly<{
  id:string;
  legal_name:string;
  vat_number:string;
  status:string;
  role:string;
}>;

export type FiscalReadinessStep=Readonly<{
  id:"email"|"organization"|"test_access"|"issuance";
  label:string;
  detail:string;
  state:"complete"|"pending"|"unavailable"|"restricted";
}>;

export type FiscalMerchantReadiness=Readonly<{
  organizationStatus:string;
  organizationDetail:string;
  testDraftWritesAllowed:boolean;
  testJournalWritesAllowed:boolean;
  syntheticCreditLabAvailable:true;
  legalIssuanceEnabled:false;
  steps:readonly FiscalReadinessStep[];
}>;

const statuses:Readonly<Record<FiscalMerchantOrgStatus,Readonly<{label:string;detail:string;state:"complete"|"pending"|"restricted"}>>>={
  pending_review:{
    label:"Αναμονή ελέγχου",
    detail:"Η επιχείρηση καταχωρίστηκε και αναμένει ανεξάρτητη εξέταση από εξουσιοδοτημένο χειριστή.",
    state:"pending"
  },
  under_review:{
    label:"Σε έλεγχο",
    detail:"Η αίτηση εξετάζεται από χειριστή. Τα εταιρικά στοιχεία και η εκπροσώπηση δεν θεωρούνται ακόμη επαληθευμένα.",
    state:"pending"
  },
  approved:{
    label:"Εγκρίθηκε για δοκιμαστική χρήση",
    detail:"Η επιχείρηση έχει εγκριθεί στο εσωτερικό μη φορολογικό περιβάλλον. Αυτό δεν αποτελεί φορολογική πιστοποίηση ή άδεια έκδοσης.",
    state:"complete"
  },
  rejected:{
    label:"Η αίτηση απορρίφθηκε",
    detail:"Δεν επιτρέπεται αποθήκευση νέων δοκιμαστικών εγγραφών. Για επανεξέταση απαιτείται επικοινωνία μέσω εγκεκριμένου καναλιού.",
    state:"restricted"
  },
  suspended:{
    label:"Η πρόσβαση ανεστάλη",
    detail:"Δεν επιτρέπεται αποθήκευση νέων δοκιμαστικών εγγραφών. Η άρση της αναστολής απαιτεί εξουσιοδοτημένη επανεξέταση.",
    state:"restricted"
  }
};

export function fiscalMerchantReadiness(
  account:FiscalReadinessAccount,
  email:{verified:boolean;verificationEnabled:boolean}
):FiscalMerchantReadiness {
  if(!account || typeof account!=="object" || typeof account.status!=="string" ||
    typeof account.role!=="string" || typeof email?.verified!=="boolean" ||
    typeof email?.verificationEnabled!=="boolean")
    throw new Error("FISCAL_READINESS_INPUT_INVALID");
  const state=Object.hasOwn(statuses,account.status)
    ?statuses[account.status as FiscalMerchantOrgStatus]
    :{
       label:"Η κατάσταση χρειάζεται επιβεβαίωση",
       detail:"Δεν υπάρχει αναγνωρισμένη κατάσταση επιχείρησης. Η δοκιμαστική καταχώριση δεν είναι διαθέσιμη.",
       state:"restricted" as const
     };
  // Identical gates to the existing test draft and journal server pages.
  // Never infer eligibility from email possession or from a visual label.
  const writeAllowed=account.status==="approved"&&
    (account.role==="owner"||account.role==="accountant");
  const emailState=email.verified?"complete" as const:
    email.verificationEnabled?"pending" as const:"unavailable" as const;

  return Object.freeze({
    organizationStatus:state.label,
    organizationDetail:state.detail,
    testDraftWritesAllowed:writeAllowed,
    testJournalWritesAllowed:writeAllowed,
    syntheticCreditLabAvailable:true as const,
    legalIssuanceEnabled:false as const,
    steps:Object.freeze([
      Object.freeze({
        id:"email" as const,label:"Κατοχή διεύθυνσης email",
        detail:email.verified
          ?"Έχει επιβεβαιωθεί η πρόσβαση στο email. Δεν αποτελεί ταυτοποίηση της επιχείρησης."
          :email.verificationEnabled
            ?"Εκκρεμεί επιβεβαίωση της διεύθυνσης του λογαριασμού."
            :"Η λειτουργία αποστολής email επαλήθευσης δεν έχει ενεργοποιηθεί.",
        state:emailState
      }),
      Object.freeze({
        id:"organization" as const,label:"Έλεγχος επιχείρησης",
        detail:state.detail,state:state.state
      }),
      Object.freeze({
        id:"test_access" as const,label:"Εσωτερικά δοκιμαστικά εργαλεία",
        detail:writeAllowed
          ?"Επιτρέπεται η καταχώριση μη φορολογικών δοκιμών ως ιδιοκτήτης ή λογιστής."
          :"Η δημιουργία αποθηκευμένων δοκιμών απαιτεί εγκεκριμένη επιχείρηση και ρόλο ιδιοκτήτη ή λογιστή. Το εργαστήριο συνθετικών πιστώσεων παραμένει διαθέσιμο.",
        state:writeAllowed?"complete" as const:"restricted" as const
      }),
      Object.freeze({
        id:"issuance" as const,label:"Επίσημη φορολογική έκδοση",
        detail:"Δεν υποστηρίζεται. Απαιτούνται ανεξάρτητοι νομικοί, τεχνικοί και κανονιστικοί έλεγχοι πριν από κάθε ενεργοποίηση.",
        state:"unavailable" as const
      })
    ])
  });
}
