/**
 * FISCAL M26 — read-only operator release gates.
 *
 * Diagnostic status is not a deployment authorization, merchant KYB decision,
 * provider accreditation, accounting approval, or permission to issue.
 * No combination of internal settings can make statutory issuance available.
 */
export type FiscalReleaseGateState="safe"|"pending"|"blocked";
export type FiscalReleaseGate=Readonly<{
  id:string;
  title:string;
  detail:string;
  state:FiscalReleaseGateState;
}>;

export type FiscalReleaseInputs=Readonly<{
  standalone:boolean;
  databaseConfigured:boolean;
  databaseReachable:boolean;
  baselineSchema:boolean;
  mfaSchema:boolean;
  recoverySchema:boolean;
  alertSchema:boolean;
  receiptSchema:boolean;
  reconcileSchema:boolean;
  certificationSchema:boolean;
  registrationEnabled:boolean;
  liveMarketplaceSyncEnabled:boolean;
  issuanceFlagEnabled:boolean;
  mfaSetupEnabled:boolean;
  mfaEnforced:boolean;
  recoveryEnabled:boolean;
  alertDeliveryEnabled:boolean;
  alertWebhookEnabled:boolean;
  alertReconciliationEnabled:boolean;
  emailVerificationEnabled:boolean;
}>;

export type FiscalReleaseSummary=Readonly<{
  kind:"fiscal_read_only_release_diagnostics";
  foundationOperational:boolean;
  configurationHasUnsafeOverrides:boolean;
  externalRegulatoryApprovalConfirmed:false;
  legalIssuanceEnabled:false;
  releaseAuthorized:false;
  gates:readonly FiscalReleaseGate[];
}>;

const gate=(id:string,title:string,detail:string,state:FiscalReleaseGateState):FiscalReleaseGate=>
  Object.freeze({id,title,detail,state});

export function evaluateFiscalReleaseGates(input:FiscalReleaseInputs):FiscalReleaseSummary{
  // A schema, environment variable or internally entered compliance marker is
  // not independent legal or provider certification. There is no "approve" path.
  const standalone=input.standalone;
  const foundation=standalone && input.databaseConfigured &&
    input.databaseReachable && input.baselineSchema && input.mfaSchema &&
    input.certificationSchema;
  const unsafe=Boolean(
    input.issuanceFlagEnabled || input.registrationEnabled ||
    input.liveMarketplaceSyncEnabled ||
    (input.mfaEnforced&&!input.mfaSchema) ||
    (input.recoveryEnabled&&(!input.recoverySchema||!input.mfaEnforced)) ||
    (input.alertDeliveryEnabled&&(!input.alertSchema||!input.receiptSchema)) ||
    (input.alertWebhookEnabled&&(!input.alertSchema||!input.receiptSchema)) ||
    (input.alertReconciliationEnabled&&(!input.reconcileSchema||!input.receiptSchema))
  );
  const gates=[
    gate("isolation","Ανεξάρτητη εφαρμογή",
      standalone?"Η εφαρμογή λειτουργεί σε ανεξάρτητη διαδρομή FISCAL.":"Δεν επαληθεύεται η ανεξάρτητη λειτουργία FISCAL.",
      standalone?"safe":"blocked"),
    gate("database","Ειδική βάση δεδομένων",
      !input.databaseConfigured?"Δεν έχει ρυθμιστεί ανεξάρτητη βάση FISCAL.":
      !input.databaseReachable?"Δεν ήταν δυνατό να επαληθευτεί η ασφαλής σύνδεση της ανεξάρτητης βάσης.":
      "Η σύνδεση στη βάση FISCAL επαληθεύτηκε. Η πρόσβαση αυτή δεν πιστοποιεί διαθεσιμότητα παρόχου.",
      input.databaseConfigured&&input.databaseReachable?"safe":"blocked"),
    gate("baseline","Βασικές μεταβάσεις σχήματος",
      input.baselineSchema?"Οι βασικοί πίνακες και οι αντίστοιχες καταχωρίσεις migration βρέθηκαν.":
      "Λείπουν ή δεν μπορούν να επαληθευτούν πίνακες ή καταχωρίσεις της βασικής FISCAL εγκατάστασης.",
      input.baselineSchema?"safe":"blocked"),
    gate("operator_mfa","Σχήμα MFA χειριστών",
      input.mfaSchema?"Η migration 0017 και οι πίνακες MFA βρέθηκαν. Δεν έχει επαληθευτεί ανεξάρτητη εγγραφή χειριστών.":
      "Η migration 0017 ή οι πίνακες MFA λείπουν. Απαιτούνται ανεξάρτητοι έλεγχοι πριν από enforcement.",
      input.mfaSchema?"safe":"pending"),
    gate("certification_inventory","Μητρώο απαιτήσεων πιστοποίησης",
      input.certificationSchema?"Υπάρχει μητρώο εσωτερικών απαιτήσεων. Δεν ισοδυναμεί με έγκριση αρμόδιας αρχής.":
      "Δεν μπορεί να επαληθευτεί το μητρώο απαιτήσεων πιστοποίησης.",
      input.certificationSchema?"safe":"pending"),
    gate("registration","Ανοικτή εγγραφή επιχειρήσεων",
      input.registrationEnabled?"Ασφαλιστική δικλείδα: η δημόσια εγγραφή ενεργοποιήθηκε χωρίς ολοκληρωμένη πιστοποίηση.":
      "Η δημόσια εγγραφή παραμένει κλειστή. Ισχύουν οι ελεγχόμενες προσκλήσεις.",
      input.registrationEnabled?"blocked":"safe"),
    gate("marketplace_sync","Ζωντανή διαβίβαση από marketplace",
      input.liveMarketplaceSyncEnabled?"Η ζωντανή διασύνδεση ενεργοποιήθηκε πριν από πλήρη πιστοποίηση.":
      "Η ζωντανή διασύνδεση παραμένει ανενεργή.",
      input.liveMarketplaceSyncEnabled?"blocked":"safe"),
    gate("issuance_flag","Σημαία φορολογικής έκδοσης",
      input.issuanceFlagEnabled?"ΜΗ ΑΣΦΑΛΗΣ ΡΥΘΜΙΣΗ: η σημαία έκδοσης έχει ενεργοποιηθεί, αλλά η νόμιμη έκδοση εξακολουθεί να απαγορεύεται.":
      "Η σημαία φορολογικής έκδοσης παραμένει ανενεργή.",
      input.issuanceFlagEnabled?"blocked":"safe"),
    gate("mfa_enforcement","Επιβολή MFA χειριστών",
      input.mfaEnforced&&!input.mfaSchema?"Η επιβολή MFA ζητείται χωρίς επαληθευμένο schema.":
      input.mfaEnforced?"Η ρύθμιση επιβολής MFA είναι ενεργή. Δεν πιστοποιούνται εδώ προσωπικές εγγραφές ή διαδικασίες ανάκτησης.":
      input.mfaSetupEnabled?"Η εγκατάσταση authenticator επιτρέπεται, αλλά το υποχρεωτικό MFA δεν ενεργοποιήθηκε.":
      "Η εγκατάσταση και η επιβολή MFA δεν ενεργοποιήθηκαν. Απαιτείται ελεγχόμενο rollout.",
      input.mfaEnforced&&!input.mfaSchema?"blocked":input.mfaEnforced?"safe":"pending"),
    gate("recovery","Διαδικασία ανάκτησης MFA",
      input.recoveryEnabled&&(!input.recoverySchema||!input.mfaEnforced)
       ?"Η ανάκτηση είναι ενεργή χωρίς πλήρη προϋποθέσεις schema και υποχρεωτικού MFA.":
      input.recoveryEnabled?"Η ανάκτηση ενεργοποιήθηκε. Αυτό δεν αποδεικνύει ανεξαρτησία εγκρινόντων ή δοκιμή παράδοσης.":
      input.recoverySchema?"Το σχήμα ανάκτησης υπάρχει, αλλά η διαδικασία παραμένει ανενεργή.":
      "Εκκρεμεί η ελεγχόμενη migration 0018 και οι ανεξάρτητες εγκρίσεις.",
      input.recoveryEnabled&&(!input.recoverySchema||!input.mfaEnforced)?"blocked":"pending"),
    gate("security_alerts","Ειδοποιήσεις και αποδείξεις παρόχου",
      (input.alertDeliveryEnabled||input.alertWebhookEnabled)&&(!input.alertSchema||!input.receiptSchema)
       ?"Ενεργοποιημένη αποστολή ή webhook χωρίς ολοκληρωμένο σχήμα συμβάντων.":
      input.alertSchema&&input.receiptSchema
       ?"Οι πίνακες ειδοποιήσεων και αποδείξεων υπάρχουν. Η αποδοχή από πάροχο δεν αποδεικνύει παραλαβή email.":
       "Εκκρεμούν οι ελεγχόμενες migrations 0019–0020 και δοκιμή πραγματικής παράδοσης.",
      (input.alertDeliveryEnabled||input.alertWebhookEnabled)&&(!input.alertSchema||!input.receiptSchema)
       ?"blocked":"pending"),
    gate("reconciliation","Συμφωνία κατάστασης ειδοποιήσεων",
      input.alertReconciliationEnabled&&(!input.reconcileSchema||!input.receiptSchema)
       ?"Έχει ενεργοποιηθεί συμφωνία παρόχου χωρίς πλήρες schema.":
      input.reconcileSchema?"Ο πίνακας συμφωνίας υπάρχει. Δεν έχει επαληθευτεί λειτουργική παράδοση ή αντιστοίχιση με πάροχο.":
      "Εκκρεμεί η ελεγχόμενη migration 0021 και δοκιμή end-to-end.",
      input.alertReconciliationEnabled&&(!input.reconcileSchema||!input.receiptSchema)
       ?"blocked":"pending"),
    gate("email_verification","Επαλήθευση ιδιοκτησίας email",
      input.emailVerificationEnabled?"Η ροή επαλήθευσης email είναι ενεργή. Δεν αποτελεί έλεγχο KYB.":
      "Η αποστολή email επαλήθευσης είναι απενεργοποιημένη.",
      input.emailVerificationEnabled?"safe":"pending"),
    gate("legal_clearance","Εξωτερική άδεια και πραγματική έκδοση",
      "Η νόμιμη έκδοση δεν πιστοποιείται από τη βάση, το CI, το dashboard ή τις ρυθμίσεις. Εκκρεμούν ξεχωριστές τεχνικές, νομικές και κανονιστικές εγκρίσεις.",
      "blocked")
  ];
  return Object.freeze({
    kind:"fiscal_read_only_release_diagnostics" as const,
    foundationOperational:foundation,
    configurationHasUnsafeOverrides:unsafe,
    externalRegulatoryApprovalConfirmed:false as const,
    legalIssuanceEnabled:false as const,
    releaseAuthorized:false as const,
    gates:Object.freeze(gates)
  });
}
