/**
 * Dedicated non-marketing reminder for respondents who reached Q27 but have
 * not formally submitted. This is NOT the broad no-response reminder.
 *
 * Consent for results notices, marketing and thank-you codes must be obtained
 * explicitly on the participant's final confirmation screen, never inferred.
 */
export const ABANDONED_RESEARCH_FOLLOWUP_SUBJECT =
  "Μένουν λίγα λεπτά για να ολοκληρώσετε την έρευνα «{{study_title}}»";

export const ABANDONED_RESEARCH_FOLLOWUP_BODY = `{{company_greeting}}

Σας ευχαριστούμε που αφιερώσατε χρόνο και ξεκινήσατε το ερωτηματολόγιο της έρευνας «{{study_title}}» του KONTA MOY.

Οι απαντήσεις σας έχουν αποθηκευτεί, ωστόσο δεν έχει καταγραφεί ακόμη η οριστική υποβολή του ερωτηματολογίου σας. Θα χαρούμε να επιστρέψετε για λίγα λεπτά, να ελέγξετε τυχόν ερωτήσεις που απομένουν και να πατήσετε «Ολοκλήρωση έρευνας».

Μόνο μετά την οριστική υποβολή η συμμετοχή σας θα καταμετρηθεί στις ολοκληρωμένες απαντήσεις της μελέτης.

Συνεχίστε με τον προσωπικό σας σύνδεσμο, από εκεί που σταματήσατε:
{{survey_url}}

Μετά την ολοκλήρωση θα μπορείτε προαιρετικά να δηλώσετε, με χωριστές επιλογές, αν επιθυμείτε ενημέρωση για τη δημοσίευση των αποτελεσμάτων ή κωδικό ευχαριστίας. Δεν θεωρούμε ότι έχετε συμφωνήσει σε οποιαδήποτε εμπορική ενημέρωση.

Η συμμετοχή είναι απολύτως προαιρετική και οι απαντήσεις δημοσιεύονται μόνο συγκεντρωτικά.

Μεθοδολογία και προστασία δεδομένων: {{methodology_url}}

Σας ευχαριστούμε για τη συμβολή σας στην κατανόηση του ελληνικού λιανεμπορίου.

Η ομάδα του KONTA MOY Research`;

export const ABANDONED_FOLLOWUP_MODE = "abandoned_q27" as const;
