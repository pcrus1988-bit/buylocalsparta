/**
 * Customer-facing Greek presentation for Paint & Build.
 *
 * Raw evidence and manufacturer records stay unchanged. This module only
 * localizes presentation text, preserving model names, regulatory codes and
 * technical acronyms where they are useful.
 */

const EXACT: Readonly<Record<string, string>> = {
  "Prepare sound substrate before coating.": "Προετοίμασε σταθερή, καθαρή και κατάλληλη επιφάνεια πριν από τη βαφή.",
  "Fill holes and cracks with Acrylic Putty.": "Γέμισε οπές και ρωγμές με Acrylic Putty.",
  "Fill cracks or holes with Acrylic Putty.": "Γέμισε ρωγμές ή οπές με Acrylic Putty.",
  "Fill cracks or holes with Acrylic Putty where required.": "Όπου χρειάζεται, γέμισε ρωγμές ή οπές με Acrylic Putty.",
  "Fill cracks/holes with Acrylic Putty.": "Γέμισε ρωγμές ή οπές με Acrylic Putty.",
  "Fill cracks or holes with Acrylic Putty or Visto.": "Γέμισε ρωγμές ή οπές με Acrylic Putty ή Visto.",
  "Fill cracks/holes with Acrylic Putty or Visto.": "Γέμισε ρωγμές ή οπές με Acrylic Putty ή Visto.",
  "Fill cracks or holes with Acrylic Putty, Visto or Light Acrylic Putty.": "Γέμισε ρωγμές ή οπές με Acrylic Putty, Visto ή Light Acrylic Putty.",
  "Fill cracks/holes with Visto or Acrylic Putty; wet sanding is recommended.": "Γέμισε ρωγμές ή οπές με Visto ή Acrylic Putty· συνιστάται υγρή λείανση.",
  "Acrylic Putty for holes and cracks": "Acrylic Putty για οπές και ρωγμές",
  "Acrylic Putty or Visto for cracks/holes.": "Acrylic Putty ή Visto για ρωγμές και οπές.",
  "Use Acrylic Putty for cracks and holes.": "Χρησιμοποίησε Acrylic Putty για ρωγμές και οπές.",
  "Clean and dry the surface.": "Καθάρισε και στέγνωσε την επιφάνεια.",
  "Remove dust, oils and loose material before filling.": "Αφαίρεσε σκόνη, λάδια και σαθρά υλικά πριν από το στοκάρισμα.",
  "Remove dust, grease and loose material before application": "Αφαίρεσε σκόνη, γράσα και σαθρά υλικά πριν από την εφαρμογή.",
  "Remove grease, dust and loose/flaking material before painting.": "Αφαίρεσε γράσα, σκόνη και σαθρά ή ξεφλουδισμένα υλικά πριν από τη βαφή.",
  "Best results are ensured by washing the surface before application.": "Για καλύτερο αποτέλεσμα, πλύνε την επιφάνεια πριν από την εφαρμογή.",
  "Clean the surface; best results are ensured by washing.": "Καθάρισε την επιφάνεια· για καλύτερο αποτέλεσμα συνιστάται πλύσιμο.",
  "Clean, dry and smooth the substrate.": "Καθάρισε, στέγνωσε και εξομάλυνε το υπόστρωμα.",
  "Surface must be dry.": "Η επιφάνεια πρέπει να είναι στεγνή.",
  "Stir well before use.": "Ανάδευσε καλά πριν από τη χρήση.",
  "Stir well before use": "Ανάδευσε καλά πριν από τη χρήση.",
  "Ready to use; do not dilute.": "Έτοιμο προς χρήση· μην το αραιώσεις.",
  "Do not dilute.": "Μην αραιώνεις το προϊόν.",
  "Sound existing paint may be coated directly.": "Σταθερή υπάρχουσα βαφή μπορεί να επαναβαφεί απευθείας.",
  "Old sound paint may be coated directly.": "Σταθερή παλιά βαφή μπορεί να επαναβαφεί απευθείας.",
  "Sound existing paint may be recoated directly.": "Σταθερή υπάρχουσα βαφή μπορεί να επαναβαφεί απευθείας.",
  "Sound existing paint may be coated directly after normal preparation.": "Σταθερή υπάρχουσα βαφή μπορεί να επαναβαφεί απευθείας μετά την κατάλληλη προετοιμασία.",
  "Sound existing paint may receive Vitex Classic directly after normal preparation.": "Σε σταθερή υπάρχουσα βαφή μπορεί να εφαρμοστεί Vitex Classic μετά την κατάλληλη προετοιμασία.",
  "New plaster/concrete must cure at least 30 days.": "Νέος σοβάς ή σκυρόδεμα πρέπει να ωριμάσει για τουλάχιστον 30 ημέρες.",
  "New plaster/concrete: cure at least 30 days.": "Νέος σοβάς ή σκυρόδεμα πρέπει να ωριμάσει για τουλάχιστον 30 ημέρες.",
  "New plaster/concrete: minimum 30-day cure before primer application.": "Σε νέο σοβά ή σκυρόδεμα απαιτούνται τουλάχιστον 30 ημέρες ωρίμανσης πριν από το αστάρωμα.",
  "Allow new concrete to cure at least 30 days": "Άφησε το νέο σκυρόδεμα να ωριμάσει για τουλάχιστον 30 ημέρες.",
  "Allow new concrete to cure at least 30 days before painting.": "Άφησε το νέο σκυρόδεμα να ωριμάσει για τουλάχιστον 30 ημέρες πριν από τη βαφή.",
  "New plaster/cement surfaces: allow at least 30 days to dry before painting.": "Σε νέες επιφάνειες σοβά ή τσιμέντου, άφησε τουλάχιστον 30 ημέρες να στεγνώσουν πριν από τη βαφή.",
  "wood: prepare and prime with Velatura Eco; Diaxyl Extra WB preservative where needed": "Ξύλο: κάνε την κατάλληλη προεργασία και αστάρωσε με Velatura Eco· όπου απαιτείται, χρησιμοποίησε συντηρητικό ξύλου Diaxyl Extra WB.",
  "new plaster/concrete/cement/plasterboard: prime with Acrylan Unco Eco": "Νέος σοβάς, σκυρόδεμα, τσιμεντοειδής επιφάνεια ή γυψοσανίδα: αστάρωσε με Acrylan Unco Eco.",
  "stained surfaces: prime with Blanco Eco": "Λεκιασμένες επιφάνειες: αστάρωσε με Blanco Eco.",
  "metal: anticorrosive primer; shiny metal: Velatura Eco": "Μεταλλικές επιφάνειες: χρησιμοποίησε αντισκωριακό αστάρι· σε λείες ή γυαλιστερές μεταλλικές επιφάνειες χρησιμοποίησε Velatura Eco.",
  "Prime documented new/old mineral substrates with Acrylan Unco Eco.": "Αστάρωσε τις τεκμηριωμένα κατάλληλες νέες ή παλιές ορυκτές επιφάνειες με Acrylan Unco Eco.",
  "Prime new plaster, concrete, cement and plasterboard with Acrylan Unco Eco or Durovit.": "Αστάρωσε νέο σοβά, σκυρόδεμα, τσιμεντοειδείς επιφάνειες και γυψοσανίδα με Acrylan Unco Eco ή Durovit.",
  "Prime new plaster, concrete, cement or plasterboard with Acrylan Unco Eco.": "Αστάρωσε νέο σοβά, σκυρόδεμα, τσιμεντοειδείς επιφάνειες ή γυψοσανίδα με Acrylan Unco Eco.",
  "Prime new plaster, concrete, cement or plasterboard with Durovit or Acrylan Unco Eco.": "Αστάρωσε νέο σοβά, σκυρόδεμα, τσιμεντοειδείς επιφάνειες ή γυψοσανίδα με Durovit ή Acrylan Unco Eco.",
  "Prime new plaster/concrete/cement/plasterboard with Primer 100% Acrylic or Acrylan Unco Eco.": "Αστάρωσε νέο σοβά, σκυρόδεμα, τσιμεντοειδείς επιφάνειες ή γυψοσανίδα με Primer 100% Acrylic ή Acrylan Unco Eco.",
  "Prime old surfaces case by case with Vitosin, Durovit or Acrylan Unco Eco.": "Αστάρωσε τις παλιές επιφάνειες, ανάλογα με την κατάστασή τους, με Vitosin, Durovit ή Acrylan Unco Eco.",
  "Prime old surfaces case-by-case with Vitosin, Durovit or Acrylan Unco Eco.": "Αστάρωσε τις παλιές επιφάνειες, ανάλογα με την κατάστασή τους, με Vitosin, Durovit ή Acrylan Unco Eco.",
  "Prime old silicate and silicone substrates with Acrylan MAX diluted 15% with water.": "Αστάρωσε παλιές επιφάνειες με πυριτικά ή σιλικονούχα χρώματα με Acrylan MAX αραιωμένο 15% με νερό.",
  "Prime old water-paint or distemper surfaces with Acrylan Unco Eco, Durovit or Vitosin.": "Αστάρωσε παλιές επιφάνειες με υδροχρώματα ή κόλλα με Acrylan Unco Eco, Durovit ή Vitosin.",
  "Prime old water-paint/distemper surfaces with Acrylan Unco Eco or Durovit.": "Αστάρωσε παλιές επιφάνειες με υδροχρώματα ή κόλλα με Acrylan Unco Eco ή Durovit.",
  "Prime old water-paint/distemper surfaces with Acrylan Unco Eco.": "Αστάρωσε παλιές επιφάνειες με υδροχρώματα ή κόλλα με Acrylan Unco Eco.",
  "Prime stained surfaces with Blanco Eco or Vitosin.": "Αστάρωσε λεκιασμένες επιφάνειες με Blanco Eco ή Vitosin.",
  "Prime smoke, graffiti, coffee or other stained surfaces with Blanco Eco.": "Αστάρωσε επιφάνειες με λεκέδες από καπνό, γκράφιτι, καφέ ή άλλους ρύπους με Blanco Eco.",
  "Cement plasters must be primed with Acrylan Unco Eco.": "Οι τσιμεντοειδείς σοβάδες πρέπει να ασταρώνονται με Acrylan Unco Eco.",
  "Apply directly to clean and good-condition organic plaster surfaces such as Granikot Acrylic or Granikot Silicone.": "Εφάρμοσε απευθείας σε καθαρές οργανικές επιφάνειες επιχρίσματος σε καλή κατάσταση, όπως Granikot Acrylic ή Granikot Silicone.",
  "For dark or intense final shades, PreColor Primer is recommended for maximum opacity.": "Για σκούρες ή έντονες τελικές αποχρώσεις συνιστάται PreColor Primer για μέγιστη καλυπτικότητα.",
  "For dark or intense final shades, one coat of suitably tinted PreColor Primer is recommended for maximum opacity.": "Για σκούρες ή έντονες τελικές αποχρώσεις συνιστάται μία στρώση κατάλληλα χρωματισμένου PreColor Primer για μέγιστη καλυπτικότητα.",
  "Do not apply below 5°C or above 35°C.": "Μην εφαρμόζεις το προϊόν σε θερμοκρασία κάτω από 5°C ή πάνω από 35°C.",
  "Do not apply at 80% RH or higher.": "Μην εφαρμόζεις το προϊόν όταν η σχετική υγρασία είναι 80% ή υψηλότερη.",
  "Do not apply at 70% RH or higher.": "Μην εφαρμόζεις το προϊόν όταν η σχετική υγρασία είναι 70% ή υψηλότερη.",
  "Do not apply if rain or frost is expected within 48 hours.": "Μην εφαρμόζεις το προϊόν αν αναμένεται βροχή ή παγετός μέσα στις επόμενες 48 ώρες.",
  "Do not apply if rain or frost is expected in the next 48 hours.": "Μην εφαρμόζεις το προϊόν αν αναμένεται βροχή ή παγετός μέσα στις επόμενες 48 ώρες.",
  "Do not apply if rain or frost is forecast within the next 48 hours.": "Μην εφαρμόζεις το προϊόν αν προβλέπεται βροχή ή παγετός μέσα στις επόμενες 48 ώρες.",
  "Do not apply when rain or frost is expected within 48 hours.": "Μην εφαρμόζεις το προϊόν όταν αναμένεται βροχή ή παγετός μέσα στις επόμενες 48 ώρες.",
  "Do not apply if rain/frost risk exists in the next 48 hours.": "Μην εφαρμόζεις το προϊόν αν υπάρχει κίνδυνος βροχής ή παγετού μέσα στις επόμενες 48 ώρες.",
  "Do not apply when rain/frost is expected within 48 hours.": "Μην εφαρμόζεις το προϊόν όταν αναμένεται βροχή ή παγετός μέσα στις επόμενες 48 ώρες.",
  "Do not apply over new plaster/concrete before at least 30 days of curing.": "Μην εφαρμόζεις πάνω σε νέο σοβά ή σκυρόδεμα πριν συμπληρωθούν τουλάχιστον 30 ημέρες ωρίμανσης.",
  "Do not coat new concrete before 30 days curing.": "Μην βάφεις νέο σκυρόδεμα πριν συμπληρωθούν 30 ημέρες ωρίμανσης.",
  "Do not coat new plaster or concrete before at least 30 days curing.": "Μην βάφεις νέο σοβά ή σκυρόδεμα πριν συμπληρωθούν τουλάχιστον 30 ημέρες ωρίμανσης.",
  "Do not coat new plaster/concrete before 30 days curing.": "Μην βάφεις νέο σοβά ή σκυρόδεμα πριν συμπληρωθούν 30 ημέρες ωρίμανσης.",
  "Do not tint outside the Vitex Coloring System.": "Μην χρωματίζεις το προϊόν εκτός του Συστήματος Δημιουργίας Αποχρώσεων Vitex.",
  "Do not tint outside the Vitex Coloring System for a tinted product.": "Για χρωματισμένο προϊόν, μην χρησιμοποιείς σύστημα χρωματισμού διαφορετικό από το Σύστημα Δημιουργίας Αποχρώσεων Vitex.",
  "Do not use a non-Vitex tinting system for tinted product.": "Για χρωματισμένο προϊόν, χρησιμοποίησε μόνο το Σύστημα Δημιουργίας Αποχρώσεων Vitex.",
  "Tint exclusively through Vitex Coloring System in the recommended base.": "Χρωμάτισε αποκλειστικά μέσω του Συστήματος Δημιουργίας Αποχρώσεων Vitex, στην προτεινόμενη βάση.",
  "Tint only through Vitex Coloring System in the recommended base.": "Χρωμάτισε μόνο μέσω του Συστήματος Δημιουργίας Αποχρώσεων Vitex, στην προτεινόμενη βάση.",
  "Tint only through Vitex Coloring System in recommended base.": "Χρωμάτισε μόνο μέσω του Συστήματος Δημιουργίας Αποχρώσεων Vitex, στην προτεινόμενη βάση.",
  "Tint only through Vitex Coloring System using the recommended base.": "Χρωμάτισε μόνο μέσω του Συστήματος Δημιουργίας Αποχρώσεων Vitex, χρησιμοποιώντας την προτεινόμενη βάση.",
  "Use only Vitex Coloring System in the recommended tint base.": "Χρησιμοποίησε μόνο το Σύστημα Δημιουργίας Αποχρώσεων Vitex στην προτεινόμενη βάση χρωματισμού.",
  "Do not wash newly painted surfaces before at least 3 weeks.": "Μην πλένεις τις φρεσκοβαμμένες επιφάνειες πριν περάσουν τουλάχιστον 3 εβδομάδες.",
  "Do not wash the newly painted surface before at least 3 weeks.": "Μην πλένεις τη φρεσκοβαμμένη επιφάνεια πριν περάσουν τουλάχιστον 3 εβδομάδες.",
  "Allow at least 3 weeks before cleaning and washing newly painted surfaces.": "Περίμενε τουλάχιστον 3 εβδομάδες πριν καθαρίσεις ή πλύνεις τις φρεσκοβαμμένες επιφάνειες.",
  "Allow at least 3 weeks before cleaning newly painted surfaces.": "Περίμενε τουλάχιστον 3 εβδομάδες πριν καθαρίσεις τις φρεσκοβαμμένες επιφάνειες.",
  "Allow at least 3 weeks before cleaning or washing newly painted surfaces.": "Περίμενε τουλάχιστον 3 εβδομάδες πριν καθαρίσεις ή πλύνεις τις φρεσκοβαμμένες επιφάνειες.",
  "Allow at least 3 weeks before cleaning/washing newly painted surfaces.": "Περίμενε τουλάχιστον 3 εβδομάδες πριν καθαρίσεις ή πλύνεις τις φρεσκοβαμμένες επιφάνειες.",
  "Allow at least 3 weeks before washing newly painted surfaces.": "Περίμενε τουλάχιστον 3 εβδομάδες πριν πλύνεις τις φρεσκοβαμμένες επιφάνειες.",
  "Wait at least 3 weeks before cleaning/washing.": "Περίμενε τουλάχιστον 3 εβδομάδες πριν από καθαρισμό ή πλύσιμο.",
  "Wait at least 3 weeks before washing newly painted surfaces": "Περίμενε τουλάχιστον 3 εβδομάδες πριν πλύνεις τις φρεσκοβαμμένες επιφάνειες.",
  "Wait at least 3 weeks before washing newly painted surfaces.": "Περίμενε τουλάχιστον 3 εβδομάδες πριν πλύνεις τις φρεσκοβαμμένες επιφάνειες.",
  "Wait at least 3 weeks before washing the newly painted surface.": "Περίμενε τουλάχιστον 3 εβδομάδες πριν πλύνεις τη φρεσκοβαμμένη επιφάνεια.",
  "Dilute up to 10% with water.": "Αραίωσε έως 10% με νερό.",
  "Dilute only the quantity needed for daily application and stir well before use.": "Αραίωσε μόνο την ποσότητα που χρειάζεσαι για την ημερήσια εφαρμογή και ανάδευσε καλά πριν από τη χρήση.",
  "Dilute with water as appropriate for substrate absorption and stir well before use.": "Αραίωσε με νερό ανάλογα με την απορροφητικότητα του υποστρώματος και ανάδευσε καλά πριν από τη χρήση.",
  "For brush/roller dilute 5-10% with water; for airless spray dilute 10-15%.": "Για εφαρμογή με πινέλο ή ρολό, αραίωσε 5-10% με νερό· για εφαρμογή με πιστόλι airless, αραίωσε 10-15%.",
  "First coat: 15-20% water": "Πρώτη στρώση: αραίωση 15-20% με νερό.",
  "Second and optional third coat: 5-10% water": "Δεύτερη και, αν χρειάζεται, τρίτη στρώση: αραίωση 5-10% με νερό.",
  "Complete hardening after 7 days": "Πλήρης σκλήρυνση μετά από 7 ημέρες.",
  "Sand after approximately 1-2 hours before painting.": "Τρίψε την επιφάνεια μετά από περίπου 1-2 ώρες, πριν από τη βαφή.",
  "Drying and recoat times depend on temperature, humidity, wind and film thickness.": "Οι χρόνοι στεγνώματος και επαναβαφής εξαρτώνται από τη θερμοκρασία, την υγρασία, τον άνεμο και το πάχος της στρώσης.",
  "Clean immediately with water.": "Καθάρισε αμέσως με νερό.",
  "Clean tools immediately with water.": "Καθάρισε τα εργαλεία αμέσως με νερό.",
  "Clean tools immediately after use with water; if needed use soapy water or detergent.": "Καθάρισε τα εργαλεία αμέσως μετά τη χρήση με νερό· αν χρειάζεται, χρησιμοποίησε σαπουνόνερο ή απορρυπαντικό.",
  "Clean tools immediately with water; use soap/detergent if needed.": "Καθάρισε τα εργαλεία αμέσως με νερό· αν χρειάζεται, χρησιμοποίησε σαπούνι ή απορρυπαντικό.",
  "Clean tools immediately with water; use soapy water or detergent if needed.": "Καθάρισε τα εργαλεία αμέσως με νερό· αν χρειάζεται, χρησιμοποίησε σαπουνόνερο ή απορρυπαντικό.",
  "Use soap or detergent if needed.": "Αν χρειάζεται, χρησιμοποίησε σαπούνι ή απορρυπαντικό.",
  "Use soapy water or detergent if needed.": "Αν χρειάζεται, χρησιμοποίησε σαπουνόνερο ή απορρυπαντικό.",
  "soap or detergent if needed": "σαπούνι ή απορρυπαντικό, αν χρειάζεται",
  "soapy water or detergent if needed": "σαπουνόνερο ή απορρυπαντικό, αν χρειάζεται",
  "water": "νερό",
  "brush": "πινέλο",
  "roller": "ρολό",
  "spatula": "σπάτουλα",
  "spray gun": "πιστόλι βαφής",
  "airless spray": "πιστόλι airless",
  "airless spray gun": "πιστόλι airless",
  "One-coat theoretical coverage; TDS also states 8-9 m²/L for two coats.": "Θεωρητική απόδοση μίας στρώσης· το τεχνικό δελτίο αναφέρει επίσης 8-9 m²/L για δύο στρώσεις.",
  "One-coat theoretical coverage; TDS also states 6-7 m²/L for two coats.": "Θεωρητική απόδοση μίας στρώσης· το τεχνικό δελτίο αναφέρει επίσης 6-7 m²/L για δύο στρώσεις.",
  "Manufacturer theoretical coverage for one coat; 6-8 m²/L for two coats": "Θεωρητική απόδοση κατασκευαστή για μία στρώση· 6-8 m²/L για δύο στρώσεις.",
  "Manufacturer theoretical coverage for one coat; 8-9 m²/L for two coats.": "Θεωρητική απόδοση κατασκευαστή για μία στρώση· 8-9 m²/L για δύο στρώσεις.",
  "Theoretical manufacturer coverage for one coat; TDS also declares 6-7 m²/L for two coats.": "Θεωρητική απόδοση κατασκευαστή για μία στρώση· το τεχνικό δελτίο αναφέρει επίσης 6-7 m²/L για δύο στρώσεις.",
  "Ensure effective workplace ventilation.": "Εξασφάλισε αποτελεσματικό αερισμό του χώρου εργασίας.",
  "Category III work gloves.": "Γάντια εργασίας κατηγορίας III.",
  "category III work gloves": "γάντια εργασίας κατηγορίας III",
  "Long-sleeved workwear and safety footwear.": "Μακρυμάνικη ενδυμασία εργασίας και υποδήματα ασφαλείας.",
  "long-sleeved workwear and safety footwear": "μακρυμάνικη ενδυμασία εργασίας και υποδήματα ασφαλείας",
  "Airtight protective goggles.": "Κλειστά προστατευτικά γυαλιά.",
  "airtight protective goggles": "κλειστά προστατευτικά γυαλιά",
  "Type A respiratory filter when engineering controls are insufficient.": "Φίλτρο αναπνευστικής προστασίας τύπου A όταν τα τεχνικά μέτρα δεν επαρκούν.",
  "type A respiratory filter when technical controls are insufficient": "φίλτρο αναπνευστικής προστασίας τύπου A όταν τα τεχνικά μέτρα δεν επαρκούν",
  "Type B respiratory filter when engineering controls are insufficient.": "Φίλτρο αναπνευστικής προστασίας τύπου B όταν τα τεχνικά μέτρα δεν επαρκούν.",
  "EUH208: may produce an allergic reaction": "EUH208: Μπορεί να προκαλέσει αλλεργική αντίδραση.",
  "EUH211: hazardous respirable droplets may form when sprayed; do not breathe spray or mist": "EUH211: Κατά τον ψεκασμό μπορεί να σχηματιστούν επικίνδυνα εισπνεύσιμα σταγονίδια· μην αναπνέεις το εκνέφωμα.",
  "Do not dispose liquid waste into groundwater.": "Μην απορρίπτεις υγρά απόβλητα στον υδροφόρο ορίζοντα.",
  "Do not dispose of liquid paint waste into groundwater.": "Μην απορρίπτεις υγρά απόβλητα χρώματος στον υδροφόρο ορίζοντα.",
  "Do not dispose of product into drains, surface water or groundwater.": "Μην απορρίπτεις το προϊόν σε αποχετεύσεις, επιφανειακά νερά ή στον υδροφόρο ορίζοντα."
};

const GENERIC: readonly [RegExp, string][] = [
  [/\bmanufacturer dataset\b/gi, "στοιχεία κατασκευαστή"],
  [/\bmanufacturer evidence\b/gi, "τεκμηρίωση κατασκευαστή"],
  [/\bmanufacturer system\b/gi, "σύστημα του κατασκευαστή"],
  [/\bmanufacturer values\b/gi, "τιμές του κατασκευαστή"],
  [/\buse case\b/gi, "περίπτωση εφαρμογής"],
  [/\bselected system\b/gi, "επιλεγμένο σύστημα"],
  [/\bprotective system\b/gi, "σύστημα προστασίας"],
  [/\brepair system\b/gi, "σύστημα επισκευής"],
  [/\bfinish system\b/gi, "σύστημα τελικού φινιρίσματος"],
  [/\binsulation system\b/gi, "σύστημα θερμομόνωσης"],
  [/\bwaterproofing system\b/gi, "σύστημα στεγανοποίησης"],
  [/\brendering system\b/gi, "σύστημα επιχρίσματος"],
  [/\bcorrosion-protection system\b/gi, "σύστημα αντιδιαβρωτικής προστασίας"],
  [/\broof build-up\b/gi, "διαστρωμάτωση δώματος"],
  [/\broof system\b/gi, "σύστημα δώματος"],
  [/\bbuild-up\b/gi, "διαστρωμάτωση"],
  [/\bworkflow\b/gi, "διαδικασία"],
  [/\bDIY\b/g, "DIY"],
  [/\bcoatings\b/gi, "βαφές"],
  [/\bcoating\b/gi, "βαφή"],
  [/\bfinish\b/gi, "φινίρισμα"],
  [/\bsealer\b/gi, "σφραγιστικό"],
  [/\bfiller\b/gi, "υλικό πλήρωσης"],
  [/\bdetail\b/gi, "λεπτομέρεια εφαρμογής"],
  [/\bjunction\b/gi, "κόμβος"],
  [/\bmoisture risk\b/gi, "κίνδυνος υγρασίας"],
  [/\bponding\b/gi, "λιμνάζοντα νερά"],
  [/\bbare metal spots\b/gi, "σημεία γυμνού μετάλλου"],
  [/\bbare spots\b/gi, "γυμνά σημεία"],
  [/\bbare metal\b/gi, "γυμνό μέταλλο"],
  [/\bcontamination\b/gi, "ρύπανση"],
  [/\bmill scale\b/gi, "εξελασμένη κρούστα"],
  [/\bsound substrate\b/gi, "σταθερό υπόστρωμα"],
  [/\bsound coating\b/gi, "σταθερή υπάρχουσα βαφή"],
  [/\bsound wood\b/gi, "σταθερό ξύλο"],
  [/\bsound base\b/gi, "σταθερή βάση"],
  [/\bweathered\b/gi, "ταλαιπωρημένες από τις καιρικές συνθήκες"],
  [/\bpowdery\b/gi, "σκονισμένη"],
  [/\bcompatible\b/gi, "συμβατό"],
  [/\bcompatibility\b/gi, "συμβατότητα"],
  [/\bPreparation\b/g, "Προετοιμασία"],
  [/\bLayer B\b/g, "οδηγίες κατασκευαστή"],
  [/\bmix-and-match\b/gi, "αυθαίρετη ανάμειξη στοιχείων διαφορετικών συστημάτων"],
  [/\bcrack bridging\b/gi, "γεφύρωση ρωγμών"],
  [/\bstain blocker\b/gi, "αστάρι απομόνωσης λεκέδων"],
  [/\bsteel-specific\b/gi, "ειδικό για χάλυβα"],
  [/\bexterior\b/gi, "εξωτερική χρήση"],
  [/\binterior\b/gi, "εσωτερική χρήση"],
  [/\bwood-compatible\b/gi, "συμβατό με ξύλο"],
  [/\bSDS\b/g, "Δελτίο Δεδομένων Ασφαλείας (SDS)"],
  [/\bTDS\b/g, "τεχνικό δελτίο (TDS)"],
  [/\bPPE\b/g, "μέσα ατομικής προστασίας"],
  [/\bRH\b/g, "σχετική υγρασία"],
  [/\bVOC\b/g, "ΠΟΕ"],
  [/\bcoverage\b/gi, "κάλυψη"],
  [/\broller\b/gi, "ρολό"],
  [/\bbrush\b/gi, "πινέλο"],
  [/\bspatula\b/gi, "σπάτουλα"],
  [/\bairless spray gun\b/gi, "πιστόλι airless"],
  [/\bairless spray\b/gi, "πιστόλι airless"],
  [/\bspray gun\b/gi, "πιστόλι βαφής"]
];

const PRODUCT_DESCRIPTORS: Readonly<Record<string, string>> = {
  "acrylan": "100% ακρυλικό χρώμα εξωτερικής χρήσης",
  "acrylan elastic": "ελαστομερές στεγανωτικό ακρυλικό χρώμα",
  "acrylan max": "νανοακρυλικό χρώμα εξωτερικής τοιχοποιίας",
  "acrylan silicon": "σιλικονούχο ακρυλικό χρώμα εξωτερικής τοιχοποιίας",
  "acrylan unco eco": "οικολογικό μικρονιζέ αστάρι νερού",
  "aquavit eco": "οικολογικό πολυουρεθανικό βερνικόχρωμα νερού",
  "cement paint": "ακρυλικό χρώμα νερού για τσιμεντοειδείς επιφάνειες",
  "floorguard hybrid pu": "ακρυλικό-πολυουρεθανικό χρώμα νερού για δάπεδα",
  "granikot refresh": "νανοακρυλικό χρώμα ανανέωσης συστήματος ETICS",
  "light acrylic putty": "ελαφρύς έτοιμος ακρυλικός στόκος",
  "vista acrylic": "ακρυλικό χρώμα εξωτερικής χρήσης",
  "vitex care": "υψηλής ποιότητας ματ πλαστικό χρώμα",
  "vitex care eggshell": "υψηλής ποιότητας βελούτε ματ πλαστικό χρώμα",
  "vitex classic": "υψηλής ποιότητας ματ πλαστικό χρώμα",
  "vitex eco": "οικολογικό πλαστικό χρώμα",
  "vitex kitchen & bath": "ματ χρώμα για κουζίνες και μπάνια",
  "vitex with vairo": "βελούτε ματ αντιιικό και αντιβακτηριδιακό πλαστικό χρώμα"
};

export function paintBuildGreekText(value: string): string {
  const normalized = value.trim();
  if (!normalized) return normalized;
  const exact = EXACT[normalized];
  if (exact) return exact;

  let result = normalized;
  for (const [pattern, replacement] of GENERIC) result = result.replace(pattern, replacement);

  return result
    .replace(/\bmat\b/gi, "ματ")
    .replace(/\bsatin\b/gi, "σατινέ")
    .replace(/\bgloss\b/gi, "γυαλιστερό")
    .replace(/\beggshell\b/gi, "βελούτε ματ")
    .replace(/\bwhite\b/gi, "λευκό")
    .replace(/\btransparent\b/gi, "διάφανο")
    .replace(/\bwater\b/gi, "νερό")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function paintBuildFinishLabel(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  return paintBuildGreekText(value).replace(/\s*\/\s*/g, " / ").trim();
}

export function paintBuildTintBaseLabel(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  const normalized = value.trim().toUpperCase();
  if (normalized === "W") return "W (λευκή βάση)";
  if (normalized === "M") return "M (μεσαία βάση)";
  if (normalized === "TR") return "TR (διάφανη βάση)";
  if (normalized === "WHITE") return "Λευκό";
  if (normalized === "SEMI-TRANSPARENT") return "Ημιδιάφανο";
  return paintBuildGreekText(value);
}

function cleanVariantWords(value: string): string {
  return value
    .replace(/\bΡιπολίνη\s+νερού\b/gi, "βερνικόχρωμα νερού")
    .replace(/\bΡιπολίνη\s+διαλύτου\b/gi, "βερνικόχρωμα διαλύτου")
    .replace(/\bΡιπολίνη\b/gi, "βερνικόχρωμα")
    .replace(/\bΧρώμα\s+μηχανής\b/gi, "χρώμα βάσης χρωματισμού")
    .replace(/\bβαση\b/gi, "βάση")
    .replace(/\bMAT\b/g, "ματ")
    .replace(/\bSATIN\b/g, "σατινέ")
    .replace(/\bGLOSS\b/g, "γυαλιστερό")
    .replace(/\bWHITE\b/g, "λευκό")
    .replace(/(\d)\s*ml\b/gi, "$1 mL")
    .replace(/(\d)\s*l\b/gi, "$1 L")
    .replace(/\bβάση\s+(ματ|σατινέ|γυαλιστερό)\s+βάση\b/gi, "$1 βάση")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function paintBuildProductTitle(value: string, manufacturerProductName?: string): string {
  let title = cleanVariantWords(value);
  const inferred = Object.keys(PRODUCT_DESCRIPTORS)
    .sort((a, b) => b.length - a.length)
    .find((name) => title.toLocaleLowerCase("en").includes(name));
  const model = manufacturerProductName?.trim() || inferred;
  if (!model) return title;

  const key = model.toLocaleLowerCase("en");
  const descriptor = PRODUCT_DESCRIPTORS[key];
  if (!descriptor) return title;

  const displayModel = key === "aquavit eco" ? "Aquavit Eco"
    : key === "acrylan max" ? "Acrylan MAX"
      : key === "vitex with vairo" ? "Vitex with VAIRO"
        : model;
  const modelLower = model.toLocaleLowerCase("en");
  const titleLower = title.toLocaleLowerCase("en");
  const hasModel = titleLower.includes(modelLower);
  const start = hasModel ? titleLower.indexOf(modelLower) : -1;
  let suffix = start >= 0 ? title.slice(start + model.length).replace(/^\s*[-–—:]?\s*/, "").trim() : "";
  suffix = suffix
    .replace(/^\s*(?:ματ|σατινέ|γυαλιστερό)?\s*βάση\s*/i, "")
    .replace(/^\s*(?:βάση\s*)+/i, "")
    .trim();

  if (key === "aquavit eco") {
    return "VITEX " + displayModel + " - " + descriptor + (suffix ? " · " + suffix : "");
  }

  if (!hasModel) return "VITEX " + displayModel + " - " + descriptor + " · " + title;

  if (/χρώμα\s+(?:μηχανής|βάσης χρωματισμού)/i.test(value)) {
    return "VITEX " + displayModel + " - " + descriptor + (suffix ? " · " + suffix : "");
  }

  return title;
}

export function paintBuildCategoryLabel(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  const key = value.trim().toLocaleLowerCase("en");
  const labels: Readonly<Record<string, string>> = {
    "exterior wall paint": "Χρώμα εξωτερικής τοιχοποιίας",
    "interior wall paint": "Χρώμα εσωτερικών τοίχων",
    "surface preparation primer": "Αστάρι προετοιμασίας επιφάνειας",
    "enamel paint": "Βερνικόχρωμα",
    "exterior cement paint": "Χρώμα τσιμεντοειδών επιφανειών",
    "floor_coating": "Χρώμα δαπέδου",
    "repair putty": "Στόκος επισκευής"
  };
  return labels[key] ?? paintBuildGreekText(value);
}
