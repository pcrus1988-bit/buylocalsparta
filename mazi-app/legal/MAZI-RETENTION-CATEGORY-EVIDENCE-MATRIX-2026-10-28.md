# ΜΑΖΙ · Ρητό μητρώο διατήρησης και υπευθυνότητας επεξεργασίας
**Έκδοση:** 28.10.2026 · **Φορέας:** SP BUSINESS LAB / ΚΟΝΤΑ ΜΟΥ · **Κατάσταση:** απογραφή προς τεκμηρίωση, όχι εγκεκριμένη εντολή διαγραφής.

## Νομική αρχή
- Άρθρα 5(1)(γ,ε), 5(2), 6, 13(2)(α), 17–21, 25, 28–30, 32 και 44–49 Κανονισμού (ΕΕ) 2016/679.
- Εφαρμόζεται η αρχή ελαχιστοποίησης, ειδικός σκοπός, αφετηρία λήξης και πραγματική αναγκαιότητα ανά κατηγορία — όχι ενιαία «διατήρηση όλου του MAZI».
- Κάθε υπαρκτό εξωτερικό σύστημα, συμπεριλαμβανομένων Supabase Auth, Vercel, Resend, αντικειμενοαποθήκευσης, logs, τρίτων subprocessors, exports και backups, απαιτεί χωριστή απογραφή και επιβεβαίωση των όρων επεξεργασίας και των γεωγραφικών διαβιβάσεων.

## Απογραφή (ταυτίζεται με πραγματικές δημόσιες PostgreSQL πηγές)
| Domain | Κύριες πηγές | Κριτήρια πριν από ενεργοποίηση διαγραφής |
| --- | --- | --- |
| interest_intake | mazi_interest_applications, mazi_interest_events, mazi_interest_registry_rechecks | λήξη/απόρριψη, νόμιμη βάση επανελέγχου ΓΕΜΗ, ενστάσεις |
| invitations_acceptance | mazi_invitations, mazi_invitation_acceptances, mazi_passwordless_email_attempts | λήξη μη χρησιμοποιημένων διακριτικών, αποδεικτικά σύμβασης, ασφάλεια |
| members_identity | mazi_members, mazi_membership_applications, mazi_application_followups | οριστικό κλείσιμο, έλεγχος εκπροσώπησης, αξιώσεις |
| community_content | mazi_chat_messages, mazi_forum_threads, mazi_forum_replies, mazi_inquiry_messages | προστασία λοιπών μερών, απόσυρση ή ανωνυμοποίηση |
| marketplace_listings | mazi_marketplace_listings, mazi_listing_inquiries, mazi_goods_terms_acceptances | ληγμένες καταχωρίσεις, ανοιχτές διαφορές, B2B αποδοχές |
| moderation | mazi_community_reports | οριστικό κλείσιμο αναφοράς, προστασία καταγγέλλοντος |
| marketing | mazi_marketing_preferences, mazi_marketing_briefs, mazi_marketing_creative_invitations, mazi_marketing_creative_events | αντιρρήσεις, ανάκληση ειδικής έγκρισης, δικαιώματα σημάτων |
| services | mazi_service_requests, mazi_service_messages, mazi_service_events, mazi_service_order_acceptances | ολοκλήρωση παροχής, παραστατικά, εκκρεμείς διορθώσεις |
| finance | mazi_service_periods, mazi_fund_ledger, mazi_grant_award_offers, mazi_fund_reconciliations | άρθρο 7 ν. 4308/2014 εφόσον αποτελεί λογιστικό αρχείο, αξιώσεις |
| votes_governance | mazi_votes, mazi_fund_ballots, mazi_vote_conflicts, mazi_fund_electorate | αδιαβλητότητα κύκλου, μυστικότητα ψήφου, ένσταση |
| audit_and_rights | mazi_privacy_requests, mazi_privacy_request_events, mazi_audit_events, mazi_launch_gate_reviews | ελάχιστο αναγκαίο ελεγκτικό ίχνος· αμεταβλητότητα ≠ απεριόριστη διατήρηση |
| infrastructure_processors | σύστημα Auth, logs, storage, email providers, backups, third-party processors, cookies | πραγματικά DPA, υποεκτελούντες, μηχανισμοί διαβιβάσεων και δοκιμές απόσυρσης |

## Αναγκαίες εγγραφές ανά κατηγορία
Μόνο όταν ο υπεύθυνος και ο αρμόδιος σύμβουλος έχουν **όντως** ελέγξει πηγές, νόμιμη βάση, χρονική αφετηρία, μέγιστη περίοδο, μηχανισμό διαγραφής/ανωνυμοποίησης, legal holds, backups, DPAs και ενδεχόμενες μεταφορές, επιτρέπεται η ανθρώπινη καταχώριση `evidence_recorded` με εσωτερική αναφορά. Μην βάζετε ονόματα, email, ΑΦΜ, tokens, φωτογραφίες εγγράφων ή ευαίσθητες σημειώσεις στο μητρώο. Χρησιμοποιήστε κωδικούς εσωτερικών φακέλων.

Η καταχώριση είναι **ανθρώπινη δήλωση**, όχι υπογραφή συμβούλου από το λογισμικό ούτε αυτόματη πιστοποίηση. Η ανάκληση/επανέναρξη αφήνει το ιστορικό αναλλοίωτο, αλλά ακυρώνει την τρέχουσα πληρότητα της κατηγορίας. Η γενική πύλη `legal_and_retention` αποτυγχάνει ασφαλώς όσο υπάρχει ατεκμηρίωτη ή επανενεργοποιημένη κατηγορία.

## Πολιτική εκκαθάρισης
**Καμία εργασία cron, DELETE, UPDATE προσωπικών πηγών ή anonymization δεν ενεργοποιείται από αυτή την υλοποίηση.** Πριν από εργασίες εκκαθάρισης απαιτούνται εγκριμένη κατηγορική πολιτική, ανεξάρτητες συμβατικές υποχρεώσεις, νόμιμες εξαιρέσεις, χαρτογράφηση εξαρτήσεων, stage-test με μη πραγματικά δεδομένα, δοκιμή ανάκτησης και παρακολούθηση αποτελέσματος.

## Οριστική εκκρεμότητα για συμμόρφωση
- Επιβεβαίωση της πραγματικής λήψης και εμπρόθεσμης διεκπεραίωσης DSAR στο info@kontamou.site.
- Συμβάσεις του άρθρου 28 και μηχανισμοί άρθρων 44–49 με ακριβείς πραγματικές εκδόσεις.
- Ονομαστική απογραφή cookies και χειροκίνητος/τεχνικός έλεγχος συγκατάθεσης.
- Πρακτικές δοκιμές deletion, holds, backups, access control, περιστατικών (άρθρα 32–34).
- Συγκεκριμένος νομικός έλεγχος για διατήρηση εκάστοτε δεδομένων, υποχρεώσεις λογιστικών αρχείων και περιορισμούς άσκησης δικαιωμάτων.
