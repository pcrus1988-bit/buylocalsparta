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
  "Do not dispose of product into drains, surface water or groundwater.": "Μην απορρίπτεις το προϊόν σε αποχετεύσεις, επιφανειακά νερά ή στον υδροφόρο ορίζοντα.",
  "smooth, clean and dry; free from grease, dust and loose/flaking paint": "Η επιφάνεια πρέπει να είναι λεία, καθαρή και στεγνή, χωρίς γράσα, σκόνη και σαθρές ή ξεφλουδισμένες βαφές.",
  "Smooth, clean and dry; free from grease, dust and loose/flaking paint.": "Η επιφάνεια πρέπει να είναι λεία, καθαρή και στεγνή, χωρίς γράσα, σκόνη και σαθρές ή ξεφλουδισμένες βαφές.",
  "smooth, clean and dry; free from grease, dust and loose or flaking paint": "Η επιφάνεια πρέπει να είναι λεία, καθαρή και στεγνή, χωρίς γράσα, σκόνη και σαθρές ή ξεφλουδισμένες βαφές.",
  "Surfaces must be smooth, clean and dry, free from grease, dust, loose or flaking paint.": "Οι επιφάνειες πρέπει να είναι λείες, καθαρές και στεγνές, χωρίς γράσα, σκόνη και σαθρές ή ξεφλουδισμένες βαφές.",
  "smooth, clean, dry, degreased, dust-free and sanded": "Η επιφάνεια πρέπει να είναι λεία, καθαρή, στεγνή, απολιπασμένη, χωρίς σκόνη και κατάλληλα τριμμένη.",
  "clean, dry and smooth; free from dust, oils and loose materials": "Η επιφάνεια πρέπει να είναι καθαρή, στεγνή και λεία, χωρίς σκόνη, λάδια και σαθρά υλικά.",
  "clean, dry and smooth; free from dust, oils and loose material": "Η επιφάνεια πρέπει να είναι καθαρή, στεγνή και λεία, χωρίς σκόνη, λάδια και σαθρά υλικά.",
  "Smooth, clean and dry; free from grease, dust and loose or flaking material.": "Η επιφάνεια πρέπει να είναι λεία, καθαρή και στεγνή, χωρίς γράσα, σκόνη και σαθρά ή αποκολλημένα υλικά.",
  "Surfaces must be clean and dry, free from grease, dust, mold, salts, loose or flaking paint.": "Οι επιφάνειες πρέπει να είναι καθαρές και στεγνές, χωρίς γράσα, σκόνη, μούχλα, άλατα και σαθρές ή ξεφλουδισμένες βαφές.",
  "One coat 10-12 m²/L; two coats 5-6 m²/L.": "Θεωρητική απόδοση: 10-12 m²/L για μία στρώση και 5-6 m²/L για δύο στρώσεις.",
  "One coat 13-15 m²/L; documented two-coat rate 7-8 m²/L.": "Θεωρητική απόδοση: 13-15 m²/L για μία στρώση και τεκμηριωμένη απόδοση 7-8 m²/L για δύο στρώσεις.",
  "One coat 15-18 m²/L; documented two-coat rate 8-9 m²/L.": "Θεωρητική απόδοση: 15-18 m²/L για μία στρώση και τεκμηριωμένη απόδοση 8-9 m²/L για δύο στρώσεις.",
  "One coat 15-18 m²/L; manufacturer also publishes 8-9 m²/L for two coats.": "Θεωρητική απόδοση: 15-18 m²/L για μία στρώση· ο κατασκευαστής αναφέρει επίσης 8-9 m²/L για δύο στρώσεις.",
  "One coat. Dilution is substrate-absorption-dependent; manufacturer statements include a general up-to-50% value, up to 100% for low-absorbing surfaces, and undiluted use for highly absorbing surfaces.": "Μία στρώση. Η αραίωση εξαρτάται από την απορροφητικότητα του υποστρώματος: ο κατασκευαστής αναφέρει γενικά έως 50%, έως 100% για επιφάνειες χαμηλής απορροφητικότητας και εφαρμογή χωρίς αραίωση σε πολύ απορροφητικές επιφάνειες.",
  "Manufacturer theoretical one-coat spreading rate. TDS also states 8-9 m²/L for two coats.": "Θεωρητική απόδοση κατασκευαστή για μία στρώση· το τεχνικό δελτίο (TDS) αναφέρει επίσης 8-9 m²/L για δύο στρώσεις.",
  "Manufacturer theoretical one-coat spreading rate. TDS also states 7-9 m²/L for two coats.": "Θεωρητική απόδοση κατασκευαστή για μία στρώση· το τεχνικό δελτίο (TDS) αναφέρει επίσης 7-9 m²/L για δύο στρώσεις.",
  "One-coat theoretical coverage; TDS also states 8-9 m²/L for two coats. Keep coat-specific manufacturer values separate.": "Θεωρητική απόδοση μίας στρώσης· το τεχνικό δελτίο (TDS) αναφέρει επίσης 8-9 m²/L για δύο στρώσεις. Οι τιμές ανά αριθμό στρώσεων διατηρούνται χωριστά.",
  "5-38°C; closed container in cool, dry area": "Αποθήκευση στους 5-38°C, σε κλειστό δοχείο, σε δροσερό και ξηρό χώρο.",
  "5-38°C; keep closed in a shaded place away from sunlight": "Αποθήκευση στους 5-38°C, σε κλειστό δοχείο, σε σκιερό μέρος μακριά από την ηλιακή ακτινοβολία.",
  "5°C-38°C; keep containers closed in a cool and dry area.": "Αποθήκευση στους 5-38°C, με τα δοχεία κλειστά, σε δροσερό και ξηρό χώρο.",
  "5°C-38°C; keep containers closed in a cool and dry/shaded place.": "Αποθήκευση στους 5-38°C, με τα δοχεία κλειστά, σε δροσερό, ξηρό και σκιερό χώρο.",
  "Keep containers closed in a cool and dry area at 5°C-38°C.": "Διατήρησε τα δοχεία κλειστά σε δροσερό και ξηρό χώρο, στους 5-38°C.",
  "5-38°C storage; keep closed and protected from direct sunlight.": "Αποθήκευση στους 5-38°C, σε κλειστό δοχείο και προστατευμένο από την άμεση ηλιακή ακτινοβολία.",
  "Store at 5°C-38°C in a sealed container away from direct sunlight; documented shelf life 12 months.": "Αποθήκευσε στους 5-38°C, σε σφραγισμένο δοχείο μακριά από άμεση ηλιακή ακτινοβολία. Η τεκμηριωμένη διάρκεια αποθήκευσης είναι 12 μήνες.",
  "TDS: store closed in a cool, dry area at 5-38°C. SDS: keep in original closed container, well ventilated and away from direct sunlight.": "Τεχνικό δελτίο (TDS): φύλαξη σε κλειστό δοχείο, σε δροσερό και ξηρό χώρο στους 5-38°C. Δελτίο Δεδομένων Ασφαλείας (SDS): φύλαξη στο αρχικό κλειστό δοχείο, σε καλά αεριζόμενο χώρο και μακριά από άμεση ηλιακή ακτινοβολία.",
  "Maximum VOC content <80 g/L ready to use": "Μέγιστη περιεκτικότητα σε ΠΟΕ: <80 g/L, έτοιμο προς χρήση.",
  "Maximum VOC content <1 g/L ready for use.": "Μέγιστη περιεκτικότητα σε ΠΟΕ: <1 g/L, έτοιμο προς χρήση.",
  "Maximum VOC content 10 g/L ready for use.": "Μέγιστη περιεκτικότητα σε ΠΟΕ: 10 g/L, έτοιμο προς χρήση.",
  "Maximum VOC content 24 g/L ready for use.": "Μέγιστη περιεκτικότητα σε ΠΟΕ: 24 g/L, έτοιμο προς χρήση.",
  "Maximum VOC content 29 g/L ready for use.": "Μέγιστη περιεκτικότητα σε ΠΟΕ: 29 g/L, έτοιμο προς χρήση.",
  "Maximum VOC content 39 g/L ready for use.": "Μέγιστη περιεκτικότητα σε ΠΟΕ: 39 g/L, έτοιμο προς χρήση.",
  "Exterior mineral-substrate category limit 40 g/L; maximum product VOC 20 g/L ready for use.": "Για εξωτερικές ορυκτές επιφάνειες, το όριο ΠΟΕ είναι 40 g/L· το προϊόν περιέχει έως 20 g/L ΠΟΕ έτοιμο προς χρήση.",
  "Exterior walls of mineral substrate: VOC limit 40 g/L; maximum ready-for-use product VOC 9 g/L.": "Για εξωτερικούς τοίχους ορυκτού υποστρώματος, το όριο ΠΟΕ είναι 40 g/L· το προϊόν περιέχει έως 9 g/L ΠΟΕ έτοιμο προς χρήση.",
  "Exterior walls of mineral substrate: VOC limit 40 g/L; maximum ready-for-use product VOC 15 g/L.": "Για εξωτερικούς τοίχους ορυκτού υποστρώματος, το όριο ΠΟΕ είναι 40 g/L· το προϊόν περιέχει έως 15 g/L ΠΟΕ έτοιμο προς χρήση.",
  "Interior matt walls/ceilings category limit 30 g/L; maximum product VOC <1 g/L ready for use.": "Για ματ εσωτερικούς τοίχους και οροφές, το όριο ΠΟΕ είναι 30 g/L· το προϊόν περιέχει <1 g/L ΠΟΕ έτοιμο προς χρήση.",
  "One-pack performance coatings: limit 140 g/L; maximum ready-to-use VOC 79 g/L.": "Για επιστρώσεις απόδοσης ενός συστατικού, το όριο ΠΟΕ είναι 140 g/L· το προϊόν περιέχει έως 79 g/L ΠΟΕ έτοιμο προς χρήση.",
  "At 25°C and 50% RH, the TDS states touch dry in 30-45 minutes and recoat in 1-2 hours.": "Στους 25°C και 50% σχετική υγρασία, το τεχνικό δελτίο (TDS) αναφέρει στέγνωμα στην αφή σε 30-45 λεπτά και επαναβαφή σε 1-2 ώρες.",
  "The general product table states touch dry in 30-60 minutes and recoat in 3-4 hours; both contexts are retained.": "Ο γενικός πίνακας προϊόντος αναφέρει στέγνωμα στην αφή σε 30-60 λεπτά και επαναβαφή σε 3-4 ώρες· διατηρούνται και τα δύο τεκμηριωμένα πλαίσια.",
  "Apply at least 0.135 L/m² (180 g/m²) to obtain the documented antiviral and antibacterial activity.": "Εφάρμοσε τουλάχιστον 0,135 L/m² (180 g/m²) για την τεκμηριωμένη αντιιική και αντιβακτηριδιακή δράση.",
  "If paint-film integrity is damaged, reapply to recover documented antiviral/antibacterial activity.": "Αν καταστραφεί η ακεραιότητα της μεμβράνης βαφής, επανάλαβε την εφαρμογή για να αποκατασταθεί η τεκμηριωμένη αντιιική και αντιβακτηριδιακή δράση.",
  "Use biocidal products safely; read label and product information before use.": "Χρησιμοποίησε τα βιοκτόνα με ασφάλεια· διάβασε την ετικέτα και τις πληροφορίες του προϊόντος πριν από τη χρήση.",
  "finish κατάλληλο για το use case": "Φινίρισμα κατάλληλο για τη συγκεκριμένη περίπτωση εφαρμογής.",
  "Σύμφωνα με σκόνη/φινίρισμα/SDS.": "Σύμφωνα με τον κίνδυνο σκόνης, το φινίρισμα και το Δελτίο Δεδομένων Ασφαλείας (SDS).",
  "Περιοδική συντήρηση ανάλογα με έκθεση και manufacturer system": "Περιοδική συντήρηση ανάλογα με την έκθεση και το σύστημα του κατασκευαστή.",
  "After 20-24 h sand, remove loose dust, then apply a compatible metal enamel.": "Μετά από 20-24 ώρες, τρίψε την επιφάνεια, αφαίρεσε τη σκόνη και εφάρμοσε συμβατό βερνικόχρωμα μετάλλου.",
  "Do not collapse the manufacturer dilution statements into one universal dilution percentage.": "Μην ενοποιείς τις διαφορετικές οδηγίες αραίωσης του κατασκευαστή σε ένα γενικό ποσοστό αραίωσης.",
  "Exterior: apply below 70% RH.": "Για εξωτερική εφαρμογή, η σχετική υγρασία πρέπει να είναι κάτω από 70%.",
  "Interior: apply below 80% RH.": "Για εσωτερική εφαρμογή, η σχετική υγρασία πρέπει να είναι κάτω από 80%.",
  "For dark/intense final shades, one coat of suitably tinted PreColor Primer is recommended for maximum opacity.": "Για σκούρες ή έντονες τελικές αποχρώσεις συνιστάται μία στρώση κατάλληλα χρωματισμένου PreColor Primer για μέγιστη καλυπτικότητα.",
  "For dark/intense final shades, one tinted PreColor Primer coat is recommended for maximum opacity.": "Για σκούρες ή έντονες τελικές αποχρώσεις συνιστάται μία χρωματισμένη στρώση PreColor Primer για μέγιστη καλυπτικότητα.",
  "For darker final coats, Blanco Eco may be used white or slightly tinted through Vitex Coloring System toward the final shade.": "Για πιο σκούρες τελικές αποχρώσεις, το Blanco Eco μπορεί να χρησιμοποιηθεί λευκό ή ελαφρά χρωματισμένο μέσω του Συστήματος Δημιουργίας Αποχρώσεων Vitex προς την τελική απόχρωση.",
  "For tough stains, the TDS advises topcoating after 24 h.": "Για επίμονους λεκέδες, το τεχνικό δελτίο (TDS) συνιστά εφαρμογή τελικής βαφής μετά από 24 ώρες.",
  "New plaster or concrete must cure at least 30 days.": "Νέος σοβάς ή σκυρόδεμα πρέπει να ωριμάσει για τουλάχιστον 30 ημέρες.",
  "New plaster/concrete must cure at least 30 days before painting.": "Νέος σοβάς ή σκυρόδεμα πρέπει να ωριμάσει για τουλάχιστον 30 ημέρες πριν από τη βαφή.",
  "Prime old limewash/distemper and new plaster/concrete/cement/plasterboard or puttied surfaces with Acrylan Unco Eco.": "Αστάρωσε παλιές επιφάνειες με ασβέστη ή κόλλα, καθώς και νέο σοβά, σκυρόδεμα, τσιμεντοειδείς επιφάνειες, γυψοσανίδα ή στοκαρισμένες επιφάνειες με Acrylan Unco Eco.",
  "Prime smoke/graffiti/coffee/other stained surfaces with Blanco Eco.": "Αστάρωσε επιφάνειες με λεκέδες από καπνό, γκράφιτι, καφέ ή άλλους ρύπους με Blanco Eco.",
  "Recommended exterior top coats include Acrylan MAX, Acrylan, Acrylan Elastic, Cement Paint and Vitacryl.": "Στα προτεινόμενα τελικά χρώματα εξωτερικής χρήσης περιλαμβάνονται τα Acrylan MAX, Acrylan, Acrylan Elastic, Cement Paint και Vitacryl.",
  "Recommended interior top coats include Vitex Classic and Vitex Eco.": "Στα προτεινόμενα τελικά χρώματα εσωτερικής χρήσης περιλαμβάνονται τα Vitex Classic και Vitex Eco.",
  "TDS contains an unresolved timing conflict: front table states topcoat after 2-3 h, application section states 4-6 h. No executable topcoat timing rule is published until review.": "Το τεχνικό δελτίο (TDS) περιέχει μη επιλυμένη διαφορά χρόνου: ο αρχικός πίνακας αναφέρει τελική βαφή μετά από 2-3 ώρες, ενώ η ενότητα εφαρμογής αναφέρει 4-6 ώρες. Δεν χρησιμοποιείται αυτόματος κανόνας χρόνου μέχρι να ολοκληρωθεί ο έλεγχος.",
  "Water-based top coats may be applied after 4-6 hours.": "Τελικές βαφές νερού μπορούν να εφαρμοστούν μετά από 4-6 ώρες.",
  "Clean mould/fungi/stains first with Kitchen & Bath Cleaner.": "Καθάρισε πρώτα μούχλα, μύκητες και λεκέδες με Kitchen & Bath Cleaner.",
  "Fill cracks/holes before priming.": "Γέμισε ρωγμές και οπές πριν από το αστάρωμα.",
  "Fill cracks/holes with Acrylic Putty, Visto or Light Acrylic Putty (recommended).": "Γέμισε ρωγμές ή οπές με Acrylic Putty, Visto ή Light Acrylic Putty (συνιστώμενο).",
  "Use Visto or Acrylic Putty for cracks or holes.": "Χρησιμοποίησε Visto ή Acrylic Putty για ρωγμές ή οπές.",
  "Clean with Brush Solvent T300 before application.": "Καθάρισε με Brush Solvent T300 πριν από την εφαρμογή.",
  "Fill holes and cracks with Acrylic Putty when present": "Όπου υπάρχουν οπές ή ρωγμές, γέμισέ τες με Acrylic Putty.",
  "If an ETICS surface has been repaired and mold or dirt remains after washing, apply Granikot Primer diluted 10-15% v/v.": "Αν έχει επισκευαστεί επιφάνεια ETICS και μετά το πλύσιμο παραμένουν μούχλα ή ρύποι, εφάρμοσε Granikot Primer αραιωμένο 10-15% κατ’ όγκο.",
  "Wet sanding is recommended for surface preparation.": "Για την προετοιμασία της επιφάνειας συνιστάται υγρή λείανση.",
  "Do not apply a water-based top coat before 4 hours.": "Μην εφαρμόζεις τελική βαφή νερού πριν περάσουν 4 ώρες.",
  "For exterior use, do not apply when rain or frost is expected within 48 hours.": "Για εξωτερική εφαρμογή, μην εφαρμόζεις το προϊόν αν αναμένεται βροχή ή παγετός μέσα στις επόμενες 48 ώρες.",
  "For exterior use, do not apply when rain/frost is expected within 48 hours.": "Για εξωτερική εφαρμογή, μην εφαρμόζεις το προϊόν αν αναμένεται βροχή ή παγετός μέσα στις επόμενες 48 ώρες.",
  "For exterior use, do not apply if rain or frost is expected within 48 hours.": "Για εξωτερική εφαρμογή, μην εφαρμόζεις το προϊόν αν αναμένεται βροχή ή παγετός μέσα στις επόμενες 48 ώρες.",
  "For exterior use, do not apply if rain or frost is expected within the next 48 hours.": "Για εξωτερική εφαρμογή, μην εφαρμόζεις το προϊόν αν αναμένεται βροχή ή παγετός μέσα στις επόμενες 48 ώρες.",
  "Roof coating application: dilute 30% with Brush Solvent T300.": "Για εφαρμογή σε δώμα, αραίωσε 30% με Brush Solvent T300.",
  "Wall paint application: dilute 50-100% with Brush Solvent T300.": "Για εφαρμογή σε τοίχο, αραίωσε 50-100% με Brush Solvent T300.",
  "Manufacturer-published one-coat spreading rate.": "Θεωρητική απόδοση μίας στρώσης όπως δημοσιεύεται από τον κατασκευαστή.",
  "One coat; dilution differs by application method.": "Μία στρώση· η αραίωση διαφέρει ανάλογα με τη μέθοδο εφαρμογής.",
  "One-coat theoretical coverage; 6-7 m²/L for two coats.": "Θεωρητική απόδοση μίας στρώσης· 6-7 m²/L για δύο στρώσεις.",
  "One-coat theoretical coverage.": "Θεωρητική απόδοση μίας στρώσης.",
  "Application may be completed 30-60 minutes before rain or dew depending on shade under the documented conditions.": "Υπό τις τεκμηριωμένες συνθήκες, η εφαρμογή μπορεί να ολοκληρωθεί 30-60 λεπτά πριν από βροχή ή δρόσο, ανάλογα με την απόχρωση.",
  "Application may be completed 30-60 minutes before rain or dew depending on shade, from 5°C and relative humidity 50-70%; cooler temperatures or higher humidity increase rain-readiness time.": "Ανάλογα με την απόχρωση, η εφαρμογή μπορεί να ολοκληρωθεί 30-60 λεπτά πριν από βροχή ή δρόσο από 5°C και με σχετική υγρασία 50-70%· χαμηλότερη θερμοκρασία ή υψηλότερη υγρασία αυξάνει τον απαιτούμενο χρόνο πριν από έκθεση σε βροχή.",
  "smooth and dry; free from dust, grease and rust; sanded": "Η επιφάνεια πρέπει να είναι λεία και στεγνή, χωρίς σκόνη, γράσα και σκουριά, και κατάλληλα τριμμένη.",
  "Binding primers category limit 750 g/L; maximum product VOC 730 g/L ready for use.": "Για συνδετικά αστάρια, το όριο ΠΟΕ είναι 750 g/L· το προϊόν περιέχει έως 730 g/L ΠΟΕ έτοιμο προς χρήση.",
  "Maximum VOC content 449 g/L ready for use.": "Μέγιστη περιεκτικότητα σε ΠΟΕ: 449 g/L, έτοιμο προς χρήση.",
  "Store at 5°C-38°C in closed containers in a cool, dry area away from direct sunlight; manufacturer states maximum storage time 5 years from production date for sufficient antiviral action.": "Αποθήκευσε στους 5-38°C, σε κλειστά δοχεία, σε δροσερό και ξηρό χώρο μακριά από άμεση ηλιακή ακτινοβολία· ο κατασκευαστής αναφέρει μέγιστο χρόνο αποθήκευσης 5 έτη από την ημερομηνία παραγωγής για επαρκή αντιιική δράση.",
  "Brush Solvent T300 then soapy water/detergent": "Καθάρισε πρώτα με Brush Solvent T300 και στη συνέχεια με σαπουνόνερο ή απορρυπαντικό.",
  "Brush/roller: Brush Solvent T300 then soapy water or detergent.": "Για πινέλο ή ρολό: καθάρισε πρώτα με Brush Solvent T300 και στη συνέχεια με σαπουνόνερο ή απορρυπαντικό.",
  "Spray Gun Solvent T350 for spray guns": "Για πιστόλια βαφής χρησιμοποίησε Spray Gun Solvent T350.",
  "Spray gun: Spray Gun Solvent T350.": "Για πιστόλι βαφής: Spray Gun Solvent T350.",
  "H226 Flammable liquid and vapour.": "H226: Εύφλεκτο υγρό και ατμοί.",
  "H336 May cause drowsiness or dizziness.": "H336: Μπορεί να προκαλέσει υπνηλία ή ζάλη.",
  "H373 May cause damage to organs through prolonged or repeated exposure.": "H373: Μπορεί να προκαλέσει βλάβες στα όργανα ύστερα από παρατεταμένη ή επανειλημμένη έκθεση.",
  "H412 Harmful to aquatic life with long lasting effects.": "H412: Επιβλαβές για τους υδρόβιους οργανισμούς, με μακροχρόνιες επιπτώσεις.",
  "Smooth, clean and dry; free from grease, dust, loose or flaking paint.": "Η επιφάνεια πρέπει να είναι λεία, καθαρή και στεγνή, χωρίς γράσα, σκόνη και σαθρές ή ξεφλουδισμένες βαφές.",
  "smooth, clean and dry; free from grease, dust, loose or flaking paint": "Η επιφάνεια πρέπει να είναι λεία, καθαρή και στεγνή, χωρίς γράσα, σκόνη και σαθρές ή ξεφλουδισμένες βαφές.",
  "Brush Solvent T300 for brush; Spray Gun Solvent T350 for spray": "Για πινέλο: Brush Solvent T300· για ψεκασμό: Spray Gun Solvent T350.",
  "Air, surface and material temperature: 5°C to 45°C at the documented reference condition of 50% RH.": "Θερμοκρασία αέρα, επιφάνειας και υλικού: 5°C έως 45°C, στην τεκμηριωμένη συνθήκη αναφοράς σχετικής υγρασίας 50%.",
  "Fill cracks or holes with Visto or Acrylic Putty.": "Γέμισε ρωγμές ή οπές με Visto ή Acrylic Putty."
};

const GENERAL_EXACT: Readonly<Record<string, string>> = {
  "Είναι γνωστή ή δοκιμασμένη η συμβατότητα του νέου coating με το παλιό;": "Είναι γνωστή ή δοκιμασμένη η συμβατότητα της νέας βαφής με την παλιά;",
  "Υπάρχει ενεργή διαρροή ή βρεγμένο roof build-up;": "Υπάρχει ενεργή διαρροή ή βρεγμένη διαστρωμάτωση δώματος;",
  "Υπάρχουν λάδια, γράσα, mill scale ή σκουριά;": "Υπάρχουν λάδια, γράσα, εξελασμένη κρούστα ή σκουριά;",
  "Compatible over retained sound coating/bare repaired spots.": "Συμβατό πάνω σε σταθερή υπάρχουσα βαφή και σε επισκευασμένα γυμνά σημεία.",
  "Finish κατάλληλο για exterior wood/exposure.": "Φινίρισμα κατάλληλο για ξύλο εξωτερικής χρήσης και τις πραγματικές συνθήκες έκθεσης.",
  "PPE ανά κίνδυνο και SDS.": "Μέσα ατομικής προστασίας ανάλογα με τον κίνδυνο και το Δελτίο Δεδομένων Ασφαλείας (SDS).",
  "PPE για σκόνη/εργασία και χημικό PPE σύμφωνα με το SDS του επιλεγμένου προϊόντος.": "Μέσα ατομικής προστασίας για σκόνη και εργασία, καθώς και χημική προστασία σύμφωνα με το Δελτίο Δεδομένων Ασφαλείας (SDS) του επιλεγμένου προϊόντος.",
  "Protective finish for the actual exposure.": "Προστατευτικό φινίρισμα κατάλληλο για τις πραγματικές συνθήκες έκθεσης.",
  "Αν αποτελεί μέρος του συγκεκριμένου kit.": "Αν αποτελεί μέρος του συγκεκριμένου σετ υλικών.",
  "Αν η αιτία του ponding είναι κλίση/απορροή, προηγείται τεχνική διόρθωση.": "Αν η αιτία των λιμναζόντων νερών είναι η κλίση ή η απορροή, προηγείται τεχνική διόρθωση.",
  "Ανάλογα με inverted/warm roof και χρήση.": "Ανάλογα με τον τύπο ανεστραμμένου ή θερμού δώματος και τη χρήση του.",
  "Για bare metal spots where required by system.": "Για σημεία γυμνού μετάλλου, όπου το απαιτεί το σύστημα.",
  "Για bare spots ή όπου το selected system το απαιτεί.": "Για γυμνά σημεία ή όπου το απαιτεί το επιλεγμένο σύστημα.",
  "Για contamination removal before preparation/coating.": "Για αφαίρεση ρύπων πριν από την προετοιμασία και τη βαφή.",
  "Για joints/penetrations/upstands μόνο όπως ορίζει το σύστημα.": "Για αρμούς, διελεύσεις και ανασηκώσεις μόνο όπως ορίζει το σύστημα.",
  "Για recurring/progressive/displaced cracks ή συναφή συμπτώματα.": "Για επαναλαμβανόμενες ή εξελισσόμενες ρωγμές, ρωγμές με μετατόπιση ή συναφή συμπτώματα.",
  "Για αρμούς/ανοίγματα μόνο ως μέρος τεκμηριωμένης detail λύσης.": "Για αρμούς και ανοίγματα μόνο ως μέρος τεκμηριωμένης λύσης λεπτομέρειας εφαρμογής.",
  "Για αρμούς/διεισδύσεις/λεπτομέρειες όταν το system το προβλέπει.": "Για αρμούς, διεισδύσεις και λεπτομέρειες όταν το προβλέπει το σύστημα.",
  "Για επιφανειακούς ρύπους πριν το coating.": "Για επιφανειακούς ρύπους πριν από τη βαφή.",
  "Για κρουστική εργασία, σκόνη και SDS επισκευαστικών.": "Για κρουστική εργασία και σκόνη, σύμφωνα και με τα Δελτία Δεδομένων Ασφαλείας (SDS) των επισκευαστικών υλικών.",
  "Για μηχανική προετοιμασία και coating SDS.": "Για μηχανική προετοιμασία και σύμφωνα με το Δελτίο Δεδομένων Ασφαλείας (SDS) της βαφής.",
  "Για τοπικές ατέλειες μόνο με wood-compatible repair.": "Για τοπικές ατέλειες μόνο με επισκευή συμβατή με ξύλο.",
  "Για τοπικές επισκευές μόνο όταν το wood παραμένει sound.": "Για τοπικές επισκευές μόνο όταν το ξύλο παραμένει σταθερό και υγιές.",
  "Δεν υποκαθιστά αφαίρεση σαθρών· μόνο όπου τεκμηριώνεται για τη sound βάση.": "Δεν υποκαθιστά την αφαίρεση σαθρών υλικών· χρησιμοποιείται μόνο όπου τεκμηριώνεται για τη σταθερή βάση.",
  "Εξαρτάται από έκταση μούχλας, καθαρισμό και SDS.": "Εξαρτάται από την έκταση της μούχλας, τον απαιτούμενο καθαρισμό και το Δελτίο Δεδομένων Ασφαλείας (SDS).",
  "Η απαιτούμενη προστασία προκύπτει από SDS και εργασία προετοιμασίας.": "Η απαιτούμενη προστασία προκύπτει από το Δελτίο Δεδομένων Ασφαλείας (SDS) και την εργασία προετοιμασίας.",
  "Η διάβρωση και οι αστοχίες παλιάς βαφής χρειάζονται προετοιμασία πριν από coating.": "Η διάβρωση και οι αστοχίες της παλιάς βαφής χρειάζονται προετοιμασία πριν από τη νέα βαφή.",
  "Η λεπτομέρεια πρέπει να ανήκει σε τεκμηριωμένο waterproofing system.": "Η λεπτομέρεια πρέπει να ανήκει σε τεκμηριωμένο σύστημα στεγανοποίησης.",
  "Η μέθοδος εφαρμογής προκύπτει από το συγκεκριμένο kit.": "Η μέθοδος εφαρμογής προκύπτει από το συγκεκριμένο σετ υλικών.",
  "Η μόνωση επιλέγεται ως μέρος συγκεκριμένου roof build-up.": "Η μόνωση επιλέγεται ως μέρος συγκεκριμένης διαστρωμάτωσης δώματος.",
  "Κόλλα/βασική στρώση όπως ορίζει το ETICS.": "Κόλλα και βασική στρώση όπως ορίζει το σύστημα ETICS.",
  "Κύριο εξωτερικό coating.": "Κύρια εξωτερική βαφή.",
  "Κύριο υλικό του επαληθευμένου συστήματος · ποσότητα από VITEX coverage + στρώσεις.": "Κύριο υλικό του επαληθευμένου συστήματος · ποσότητα από επαληθευμένη κάλυψη VITEX και αριθμό στρώσεων.",
  "Μέθοδος εφαρμογής βάσει TDS.": "Μέθοδος εφαρμογής βάσει του τεχνικού δελτίου (TDS).",
  "Μέρος του rendering/reinforcement system.": "Μέρος του συστήματος επιχρίσματος και οπλισμού.",
  "Μετά από τεχνικό σχεδιασμό junction και moisture risk.": "Μετά από τεχνικό σχεδιασμό του κόμβου και αξιολόγηση του κινδύνου υγρασίας.",
  "Μετά την αξιολόγηση ponding χρησιμοποιείται μόνο kit κατάλληλο για τις πραγματικές συνθήκες.": "Μετά την αξιολόγηση των λιμναζόντων νερών χρησιμοποιείται μόνο σετ υλικών κατάλληλο για τις πραγματικές συνθήκες.",
  "Μετά την αφαίρεση ασταθών υλικών και μόνο σε sound substrate.": "Μετά την αφαίρεση ασταθών υλικών και μόνο σε σταθερό υπόστρωμα.",
  "Μετά την ολοκλήρωση repair/curing.": "Μετά την ολοκλήρωση της επισκευής και της απαιτούμενης ωρίμανσης.",
  "Μόνο αν ανήκει στο επιλεγμένο finish system.": "Μόνο αν ανήκει στο επιλεγμένο σύστημα τελικού φινιρίσματος.",
  "Μόνο αν απαιτείται από repair/finish system.": "Μόνο αν απαιτείται από το σύστημα επισκευής ή τελικού φινιρίσματος.",
  "Μόνο αν απαιτείται από επιλεγμένο protective system.": "Μόνο αν απαιτείται από το επιλεγμένο σύστημα προστασίας.",
  "Μόνο αν παραμένει powdery βάση και το system το προβλέπει.": "Μόνο αν η βάση παραμένει σκονισμένη και το προβλέπει το σύστημα.",
  "Μόνο αν προβλέπεται από το protective system.": "Μόνο αν προβλέπεται από το σύστημα προστασίας.",
  "Μόνο αν το kit το απαιτεί.": "Μόνο αν το απαιτεί το συγκεκριμένο σετ υλικών.",
  "Μόνο αν το repair system το απαιτεί.": "Μόνο αν το απαιτεί το σύστημα επισκευής.",
  "Μόνο αν το selected system το απαιτεί.": "Μόνο αν το απαιτεί το επιλεγμένο σύστημα.",
  "Μόνο όπου το repaired substrate/finish system το απαιτεί.": "Μόνο όπου το απαιτεί το επισκευασμένο υπόστρωμα ή το σύστημα τελικού φινιρίσματος.",
  "Μόνο όταν είναι κατάλληλο/αναγκαίο για το use case και συμβατό με το finish.": "Μόνο όταν είναι κατάλληλο και αναγκαίο για τη συγκεκριμένη περίπτωση εφαρμογής και συμβατό με το τελικό φινίρισμα.",
  "Μόνο όταν προβλέπεται από τον συγκεκριμένο τύπο roof system.": "Μόνο όταν προβλέπεται από τον συγκεκριμένο τύπο συστήματος δώματος.",
  "Μονωτικό προϊόν του ETICS.": "Μονωτικό προϊόν του συστήματος ETICS.",
  "Όπου απαιτείται για oil/grease contamination.": "Όπου απαιτείται για απομάκρυνση λαδιών ή γράσων.",
  "Όπου απαιτούνται από system/design.": "Όπου απαιτούνται από το τεκμηριωμένο σύστημα και τον σχεδιασμό.",
  "Όπου τεκμηριώνεται για το repair system.": "Όπου τεκμηριώνεται για το σύστημα επισκευής.",
  "Όπου το ορίζει το επιλεγμένο detail.": "Όπου το ορίζει η επιλεγμένη λεπτομέρεια εφαρμογής.",
  "Όπως ορίζει το επιλεγμένο corrosion-protection system.": "Όπως ορίζει το επιλεγμένο σύστημα αντιδιαβρωτικής προστασίας.",
  "Όταν η αιτία υγρασίας ή το junction είναι σύνθετο.": "Όταν η αιτία της υγρασίας ή ο κατασκευαστικός κόμβος είναι σύνθετος.",
  "Σε λεπτομέρειες ή γενικά όταν το kit το απαιτεί.": "Σε λεπτομέρειες ή γενικά όταν το απαιτεί το συγκεκριμένο σετ υλικών.",
  "Στεγάνωση και μόνωση συντονίζονται στο ίδιο build-up.": "Στεγάνωση και μόνωση συντονίζονται στην ίδια διαστρωμάτωση.",
  "Συμβατό με το επιλεγμένο insulation system.": "Συμβατό με το επιλεγμένο σύστημα θερμομόνωσης.",
  "Σύμφωνα με SDS καθαριστικού/ασταριού/χρώματος.": "Σύμφωνα με τα Δελτία Δεδομένων Ασφαλείας (SDS) του καθαριστικού, του ασταριού και του χρώματος.",
  "Σύμφωνα με SDS και εργασίες σκόνης/λείανσης.": "Σύμφωνα με το Δελτίο Δεδομένων Ασφαλείας (SDS) και τους κινδύνους από σκόνη ή λείανση.",
  "Σύμφωνα με TDS και επιφάνεια.": "Σύμφωνα με το τεχνικό δελτίο (TDS) και την επιφάνεια.",
  "Σύμφωνα με το kit.": "Σύμφωνα με το συγκεκριμένο σετ υλικών.",
  "Σύμφωνα με το repair/coating system.": "Σύμφωνα με το σύστημα επισκευής και βαφής.",
  "Τελικό compatible wood finish.": "Τελικό φινίρισμα συμβατό με το ξύλο.",
  "Τελικό exterior coating.": "Τελική εξωτερική βαφή.",
  "Τελικό rendering system του ETICS.": "Τελικό σύστημα επιχρίσματος του ETICS.",
  "Τελικό εσωτερικό φινίρισμα συμβατό με το insulation system.": "Τελικό εσωτερικό φινίρισμα συμβατό με το σύστημα θερμομόνωσης.",
  "Το primer αποτελεί μέρος του συγκεκριμένου protective system.": "Το αστάρι αποτελεί μέρος του συγκεκριμένου συστήματος προστασίας.",
  "Το έργο αγοράζεται/σχεδιάζεται ως πλήρες ETICS.": "Το έργο αγοράζεται και σχεδιάζεται ως πλήρες σύστημα ETICS.",
  "Το κύριο προϊόν είναι το τεκμηριωμένο waterproofing kit/system, όχι ανεξάρτητη τυχαία μεμβράνη.": "Το κύριο προϊόν είναι το τεκμηριωμένο σύστημα στεγανοποίησης και όχι μια ανεξάρτητη τυχαία μεμβράνη.",
  "Το τελικό εξωτερικό coating επιλέγεται μόνο αφού επιβεβαιωθεί η καταλληλότητά του για νέο τσιμεντοειδή σοβά.": "Η τελική εξωτερική βαφή επιλέγεται μόνο αφού επιβεβαιωθεί η καταλληλότητά της για νέο τσιμεντοειδή σοβά.",
  "Η θερμοπρόσοψη είναι ενιαίο σύστημα, όχι λίστα τυχαίων υλικών. Οι πλάκες, η κόλλα, τα βύσματα όπου απαιτούνται και το σύστημα επιχρίσματος πρέπει να προκύπτουν από το συγκεκριμένο ETICS.": "Η θερμοπρόσοψη είναι ενιαίο σύστημα, όχι λίστα τυχαίων υλικών. Οι πλάκες, η κόλλα, τα βύσματα όπου απαιτούνται και το σύστημα επιχρίσματος πρέπει να προκύπτουν από το συγκεκριμένο σύστημα ETICS.",
  "Ο ήλιος, το νερό και ο καιρός μπορούν να αποδυναμώσουν την επιφάνεια του ξύλου. Πριν από νέο φινίρισμα αφαιρούνται οι σαθρές ίνες και τα αποτυχημένα coatings μέχρι να υπάρχει σταθερή, στεγνή βάση.": "Ο ήλιος, το νερό και ο καιρός μπορούν να αποδυναμώσουν την επιφάνεια του ξύλου. Πριν από νέο φινίρισμα αφαιρούνται οι σαθρές ίνες και οι αποτυχημένες βαφές μέχρι να υπάρχει σταθερή, στεγνή βάση.",
  "ETICS = ολοκληρωμένο σύστημα με τεκμηριωμένα εξαρτήματα.": "ETICS = ολοκληρωμένο σύστημα εξωτερικής θερμομόνωσης με τεκμηριωμένα εξαρτήματα.",
  "Η ταλαιπωρημένη επιφάνεια πρέπει να επανέλθει σε σταθερή βάση πριν από νέο finish.": "Η ταλαιπωρημένη επιφάνεια πρέπει να επανέλθει σε σταθερή βάση πριν από νέο φινίρισμα.",
  "Σταθερή βάση + σωστό παράθυρο καιρού + TDS.": "Σταθερή βάση, κατάλληλες καιρικές συνθήκες και εφαρμογή σύμφωνα με το τεχνικό δελτίο (TDS).",
  "Αν δεν γνωρίζουμε το παλιό finish, επιβεβαιώνουμε συμβατότητα πριν από γενική εφαρμογή.": "Αν δεν γνωρίζουμε το παλιό φινίρισμα, επιβεβαιώνουμε τη συμβατότητα πριν από γενική εφαρμογή.",
  "Η υγρή στεγανοποίηση ταράτσας είναι σύστημα. Το αν χρειάζεται αστάρι, ενίσχυση ή τελική προστασία καθορίζεται από το συγκεκριμένο kit.": "Η υγρή στεγανοποίηση ταράτσας είναι σύστημα. Το αν χρειάζεται αστάρι, ενίσχυση ή τελική προστασία καθορίζεται από το συγκεκριμένο σετ υλικών.",
  "Κόλλα, πλάκες, βύσματα, υαλόπλεγμα και επίχρισμα δεν αλλάζουν αυθαίρετα μεταξύ συστημάτων. Ακολουθούμε το συγκεκριμένο ETICS και τις οδηγίες του.": "Κόλλα, πλάκες, βύσματα, υαλόπλεγμα και επίχρισμα δεν αλλάζουν αυθαίρετα μεταξύ συστημάτων. Ακολουθούμε το συγκεκριμένο σύστημα ETICS και τις οδηγίες του.",
  "Κρατάμε το παλιό finish μόνο όπου είναι σταθερό· ό,τι ξεφλουδίζει αφαιρείται.": "Κρατάμε το παλιό φινίρισμα μόνο όπου είναι σταθερό· ό,τι ξεφλουδίζει αφαιρείται.",
  "Οι χαλαρές, υποβαθμισμένες ίνες από καιρική έκθεση αφαιρούνται πριν από νέο finish.": "Οι χαλαρές, υποβαθμισμένες ίνες από καιρική έκθεση αφαιρούνται πριν από νέο φινίρισμα.",
  "Στο ήδη βαμμένο μέταλλο αφαιρούμε χαλαρή βαφή, σκουριά και ρύπους και κρατάμε μόνο σταθερό coating.": "Στο ήδη βαμμένο μέταλλο αφαιρούμε χαλαρή βαφή, σκουριά και ρύπους και κρατάμε μόνο τη σταθερή υπάρχουσα βαφή.",
  "Τα ακριβή όρια θερμοκρασίας, υγρασίας, ήλιου, βροχής και επαναβαφής δεν τα μαντεύουμε. Τα παίρνουμε από το TDS του προϊόντος.": "Τα ακριβή όρια θερμοκρασίας, υγρασίας, ήλιου, βροχής και επαναβαφής δεν τα μαντεύουμε. Τα παίρνουμε από το τεχνικό δελτίο (TDS) του προϊόντος.",
  "Το αν χρειάζεται αστάρι, συντηρητικό, sealer ή συγκεκριμένο βερνίκι/χρώμα εξαρτάται από το ξύλο, τη χρήση και το σύστημα.": "Το αν χρειάζεται αστάρι, συντηρητικό, σφραγιστικό ή συγκεκριμένο βερνίκι ή χρώμα εξαρτάται από το ξύλο, τη χρήση και το σύστημα.",
  "Το πόσο μεγάλη ρωγμή μπορεί να γεμίσει ένα υλικό, πόση κίνηση αντέχει και πότε μπορεί να βαφτεί προκύπτει από το TDS του.": "Το πόσο μεγάλη ρωγμή μπορεί να γεμίσει ένα υλικό, πόση κίνηση αντέχει και πότε μπορεί να βαφτεί προκύπτει από το τεχνικό δελτίο (TDS) του.",
  "Crack bridging μόνο με τεκμηρίωση συστήματος.": "Γεφύρωση ρωγμών μόνο με τεκμηρίωση του συστήματος.",
  "ETICS = ολοκληρωμένο σύστημα.": "ETICS = ολοκληρωμένο σύστημα εξωτερικής θερμομόνωσης.",
  "Preparation ανά κατάσταση και σύστημα.": "Προετοιμασία ανάλογα με την κατάσταση και το σύστημα.",
  "Sound wood before finishing.": "Σταθερό και υγιές ξύλο πριν από το τελικό φινίρισμα.",
  "Αντοχή σε ponding μόνο από manufacturer evidence.": "Αντοχή σε λιμνάζοντα νερά μόνο με τεκμηρίωση του κατασκευαστή.",
  "Δεν κάνουμε mix-and-match σε ETICS χωρίς τεκμηρίωση.": "Δεν αναμειγνύουμε αυθαίρετα στοιχεία διαφορετικών συστημάτων ETICS χωρίς τεκμηρίωση.",
  "Έλεγχος συμβατότητας άγνωστου finish.": "Έλεγχος συμβατότητας άγνωστου φινιρίσματος.",
  "Μόνο sound coating παραμένει.": "Παραμένει μόνο σταθερή υπάρχουσα βαφή.",
  "Μόνο σταθερό παλιό finish παραμένει.": "Παραμένει μόνο σταθερό παλιό φινίρισμα.",
  "Οι ακριβείς οδηγίες είναι Layer B.": "Οι ακριβείς οδηγίες προέρχονται από τις επαληθευμένες οδηγίες του κατασκευαστή.",
  "Όρια ρωγμής και χρόνοι μόνο από το repair product.": "Όρια ρωγμής και χρόνοι μόνο από το συγκεκριμένο επισκευαστικό προϊόν.",
  "Ποσότητα μόνο από πραγματικά manufacturer values.": "Ποσότητα μόνο από πραγματικές, επαληθευμένες τιμές του κατασκευαστή.",
  "Πρώτα η αιτία, μετά το coating.": "Πρώτα αντιμετωπίζεται η αιτία και μετά εφαρμόζεται η βαφή.",
  "Σταθερή και καθαρή βάση πριν το filler.": "Σταθερή και καθαρή βάση πριν από το υλικό πλήρωσης.",
  "Τα αριθμητικά όρια καιρού έρχονται από το TDS.": "Τα αριθμητικά όρια καιρού προέρχονται από το τεχνικό δελτίο (TDS).",
  "Το stain blocker πρέπει να τεκμηριώνεται από το προϊόν.": "Το αστάρι απομόνωσης λεκέδων πρέπει να τεκμηριώνεται από το προϊόν.",
  "Αν υπάρχει ενεργή υγρασία, σταμάτα το workflow βαφής και βρες πρώτα την αιτία.": "Αν υπάρχει ενεργή υγρασία, σταμάτα τη διαδικασία βαφής και βρες πρώτα την αιτία.",
  "Αφαίρεσε αποτυχημένο finish και χαλαρές weathered ίνες.": "Αφαίρεσε το αποτυχημένο φινίρισμα και τις χαλαρές ίνες που έχουν υποβαθμιστεί από τις καιρικές συνθήκες.",
  "Αφαίρεσε χαλαρό finish και αποκατάστησε τυχόν υποβαθμισμένο ξύλο.": "Αφαίρεσε το χαλαρό φινίρισμα και αποκατάστησε τυχόν υποβαθμισμένο ξύλο.",
  "Βάλε αστάρι μόνο αν ανήκει ή επιτρέπεται από το συγκεκριμένο kit.": "Βάλε αστάρι μόνο αν ανήκει ή επιτρέπεται από το συγκεκριμένο σετ υλικών.",
  "Βάλε αστάρι, sealer ή συντηρητικό μόνο αν το απαιτεί το σύστημα.": "Βάλε αστάρι, σφραγιστικό ή συντηρητικό μόνο αν το απαιτεί το σύστημα.",
  "Έλεγξε λάδια, σκουριά, mill scale και άλλους ρύπους.": "Έλεγξε λάδια, σκουριά, εξελασμένη κρούστα και άλλους ρύπους.",
  "Έλεγξε πρόσφυση παλιού finish, κατάσταση ξύλου/υγρασία και συμβατότητα.": "Έλεγξε την πρόσφυση του παλιού φινιρίσματος, την κατάσταση και την υγρασία του ξύλου και τη συμβατότητα.",
  "Εφάρμοσε το συμβατό coating σύμφωνα με τον κατασκευαστή.": "Εφάρμοσε τη συμβατή βαφή σύμφωνα με τις οδηγίες του κατασκευαστή.",
  "Εφάρμοσε το συμβατό finish σύμφωνα με τον κατασκευαστή.": "Εφάρμοσε το συμβατό φινίρισμα σύμφωνα με τις οδηγίες του κατασκευαστή.",
  "Καθάρισε και προετοίμασε το σταθερό παλιό finish.": "Καθάρισε και προετοίμασε το σταθερό παλιό φινίρισμα.",
  "Μετά την ωρίμανση έλεγξε συνέχεια coating και σημεία πρώιμης σκουριάς.": "Μετά την ωρίμανση έλεγξε τη συνέχεια της βαφής και τυχόν σημεία πρώιμης σκουριάς.",
  "Τοποθέτησε ενίσχυση ή ειδικές στρώσεις μόνο όπως ορίζει το kit.": "Τοποθέτησε ενίσχυση ή ειδικές στρώσεις μόνο όπως ορίζει το συγκεκριμένο σετ υλικών.",
  "Αξιολόγησε και επισκεύασε/αντικατάστησε το υποβαθμισμένο ξύλο πριν από finishing.": "Αξιολόγησε και επισκεύασε ή αντικατάστησε το υποβαθμισμένο ξύλο πριν από το τελικό φινίρισμα.",
  "Απαιτείται τεχνική επιλογή detail/system πριν από εφαρμογή.": "Απαιτείται τεχνική επιλογή της λεπτομέρειας και του συστήματος πριν από την εφαρμογή.",
  "Διερεύνησε βροχή, αρμούς/ρωγμές, απορροές και άλλες πιθανές πηγές πριν από coating.": "Διερεύνησε βροχή, αρμούς, ρωγμές, απορροές και άλλες πιθανές πηγές πριν από τη βαφή.",
  "Κατέγραψε/επιβεβαίωσε το roof build-up πριν επιλεγεί νέα μόνωση.": "Κατέγραψε και επιβεβαίωσε τη διαστρωμάτωση του δώματος πριν επιλεγεί νέα μόνωση.",
  "Μην κρύψεις το πρόβλημα με coating. Χρειάζεται αξιολόγηση και αποκατάσταση του ξύλου.": "Μην κρύψεις το πρόβλημα με νέα βαφή. Χρειάζεται αξιολόγηση και αποκατάσταση του ξύλου.",
  "Μην προχωρήσεις ως DIY workflow. Οργάνωσε ασφαλή πρόσβαση και κατάλληλα μέτρα/εξοπλισμό από αρμόδιο άτομο.": "Μην προχωρήσεις ως εργασία χωρίς επαγγελματία (DIY). Οργάνωσε ασφαλή πρόσβαση και κατάλληλα μέτρα ή εξοπλισμό από αρμόδιο άτομο.",
  "Μην συνεχίσεις με απλό repair/paint workflow. Χρειάζεται τεχνική αξιολόγηση.": "Μην συνεχίσεις με απλή διαδικασία επισκευής και βαφής. Χρειάζεται τεχνική αξιολόγηση.",
  "Ταυτοποίησε το μέταλλο πριν εφαρμοστεί steel-specific primer/coating workflow.": "Ταυτοποίησε το μέταλλο πριν εφαρμοστεί διαδικασία ασταρώματος και βαφής ειδική για χάλυβα.",
  "Χρησιμοποίησε workflow μεγάλης επισκευής και έλεγξε αν χρειάζεται τεχνική αξιολόγηση πριν αγοραστούν υλικά.": "Χρησιμοποίησε διαδικασία μεγάλης επισκευής και έλεγξε αν χρειάζεται τεχνική αξιολόγηση πριν αγοραστούν υλικά.",
  "Η σημαντική υγρασία έχει αβέβαιη αιτία. Δεν είναι ασφαλές να επιλεγεί τελικό coating μόνο από το ορατό σύμπτωμα.": "Η σημαντική υγρασία έχει αβέβαιη αιτία. Δεν είναι ασφαλές να επιλεγεί τελική βαφή μόνο από το ορατό σύμπτωμα."
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
  "acrylan unco eco": "οικολογικό σιλικονούχο μικρονιζέ ακρυλικό αστάρι νερού",
  "anti-rust primer": "αντισκωριακό αστάρι",
  "blanco eco": "οικολογικό ακρυλικό αστάρι νερού απομόνωσης λεκέδων",
  "durovit": "αδιάβροχο ακρυλικό αστάρι διαλύτου",
  "primer 100% acrylic": "100% ακρυλικό αδιάβροχο αστάρι νερού",
  "aquavit eco": "οικολογικό πολυουρεθανικό ακρυλικό βερνικόχρωμα νερού",
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


const VITEX_SUBCATEGORY_DESCRIPTORS: Readonly<Record<string, string>> = {
  "premium mat emulsion paint": "υψηλής ποιότητας ματ πλαστικό χρώμα",
  "premium eggshell emulsion paint": "υψηλής ποιότητας βελούτε ματ πλαστικό χρώμα",
  "ecological emulsion paint": "οικολογικό πλαστικό χρώμα",
  "antiviral antibacterial eggshell emulsion paint": "βελούτε ματ αντιιικό και αντιβακτηριδιακό πλαστικό χρώμα",
  "humidity/fungi-protection coating": "ματ χρώμα προστασίας από υγρασία και ανάπτυξη μυκήτων",
  "100% acrylic paint": "100% ακρυλικό χρώμα",
  "acrylic paint for general use": "ακρυλικό χρώμα γενικής χρήσης",
  "elastomeric acrylic paint": "ελαστομερές ακρυλικό χρώμα",
  "etics renewal nano-acrylic paint": "νανοακρυλικό χρώμα ανανέωσης συστήματος ETICS",
  "nano-acrylic masonry paint": "νανοακρυλικό χρώμα τοιχοποιίας",
  "silicone acrylic paint": "σιλικονούχο ακρυλικό χρώμα",
  "acrylic water-based paint for cement surfaces": "ακρυλικό χρώμα νερού για τσιμεντοειδείς επιφάνειες",
  "water-based polyurethane enamel": "πολυουρεθανικό ακρυλικό βερνικόχρωμα νερού",
  "water-based acrylic polyurethane floor paint": "ακρυλικό-πολυουρεθανικό χρώμα νερού για δάπεδα",
  "anticorrosive primer": "αντισκωριακό αστάρι",
  "solvent-based waterproof acrylic primer": "αδιάβροχο ακρυλικό αστάρι διαλύτου",
  "water-based 100% acrylic waterproofing primer": "100% ακρυλικό αδιάβροχο αστάρι νερού",
  "lightweight ready-to-use acrylic putty": "ελαφρύς έτοιμος ακρυλικός στόκος",
  "ecological silicone acrylic micronized water-based primer": "οικολογικό μικρονιζέ σιλικονούχο ακρυλικό αστάρι νερού",
  "ecological stain-blocking acrylic water-based primer": "οικολογικό ακρυλικό αστάρι νερού απομόνωσης λεκέδων"
};

const VITEX_SUBSTRATE_LABELS: Readonly<Record<string, string>> = {
  "concrete": "σκυρόδεμα",
  "plaster": "σοβά",
  "cement": "τσιμεντοειδείς επιφάνειες",
  "cement surface": "τσιμεντοειδείς επιφάνειες",
  "brick": "τούβλο",
  "gypsum board": "γυψοσανίδα",
  "plasterboard": "γυψοσανίδα",
  "sound old paint": "σταθερές παλιές βαμμένες επιφάνειες",
  "old painted surfaces": "παλιές βαμμένες επιφάνειες σε καλή κατάσταση",
  "wood": "ξύλο",
  "metal": "μέταλλο",
  "steel": "χάλυβα",
  "iron": "σίδηρο",
  "masonry": "τοιχοποιία",
  "organic plaster": "οργανικό επίχρισμα",
  "etics": "σύστημα εξωτερικής θερμομόνωσης ETICS"
};

function greekList(values: readonly string[]): string {
  if (values.length <= 1) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} και ${values[1]}`;
  return `${values.slice(0, -1).join(", ")} και ${values[values.length - 1]}`;
}

function sentenceCaseGreek(value: string): string {
  if (!value) return value;
  return value.charAt(0).toLocaleUpperCase("el-GR") + value.slice(1);
}

/**
 * Builds customer-facing product copy only from verified manufacturer fields.
 * It does not invent performance claims, coverage, substrates or system roles.
 */
export function paintBuildManufacturerDescription(input: Readonly<{
  productName: string;
  productCategory?: string | null;
  subcategory?: string | null;
  interiorExterior?: string | null;
  substrateTypes?: readonly string[] | null;
}>): string {
  const productKey = input.productName.trim().toLocaleLowerCase("en");
  const subcategoryKey = input.subcategory?.trim().toLocaleLowerCase("en") ?? "";
  const descriptor = VITEX_SUBCATEGORY_DESCRIPTORS[subcategoryKey]
    ?? PRODUCT_DESCRIPTORS[productKey]
    ?? paintBuildCategoryLabel(input.productCategory)
    ?? "προϊόν VITEX";

  const useKey = input.interiorExterior?.trim().toLocaleLowerCase("en");
  const useLabel = useKey === "interior"
    ? "εσωτερική χρήση"
    : useKey === "exterior"
      ? "εξωτερική χρήση"
      : useKey === "both"
        ? "εσωτερική και εξωτερική χρήση"
        : undefined;
  const descriptorLower = descriptor.toLocaleLowerCase("el-GR");
  const alreadyStatesUse = useLabel
    ? descriptorLower.includes(useLabel.toLocaleLowerCase("el-GR"))
    : false;

  const first = sentenceCaseGreek(descriptor)
    + (useLabel && !alreadyStatesUse ? ` για ${useLabel}` : "")
    + ".";

  const substrates = [...new Set((input.substrateTypes ?? [])
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => VITEX_SUBSTRATE_LABELS[value.toLocaleLowerCase("en")] ?? paintBuildGreekText(value))
  )];

  if (!substrates.length) {
    return `${first} Η περιγραφή προέρχεται από τα επαληθευμένα στοιχεία προϊόντος της VITEX.`;
  }

  return `${first} Σύμφωνα με τα επαληθευμένα στοιχεία της VITEX, προορίζεται για εφαρμογή σε ${greekList(substrates)}.`;
}

export function paintBuildGreekText(value: string): string {
  const normalized = value.trim();
  if (!normalized) return normalized;
  const exact = EXACT[normalized] ?? GENERAL_EXACT[normalized];
  if (exact) return exact;

  const documentedRepaint = normalized.match(
    /^(.+?) is documented for sound old paint and the reviewed (interior|exterior) repaint pathway; current manufacturer preparation requirements still apply\.?$/i
  );
  if (documentedRepaint) {
    const use = documentedRepaint[2].toLocaleLowerCase("en") === "interior"
      ? "εσωτερικού χώρου"
      : "εξωτερικού χώρου";
    return `${documentedRepaint[1]} έχει τεκμηριωμένη εφαρμογή από τη VITEX πάνω σε σταθερή παλιά βαφή για το συγκεκριμένο ελεγμένο σενάριο επαναβαφής ${use}. Εξακολουθούν να ισχύουν οι απαιτήσεις προετοιμασίας του κατασκευαστή.`;
  }

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

export function paintBuildPackageLabel(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  return value.trim()
    .replace(/(\d)\s*ml\b/gi, "$1 mL")
    .replace(/(\d)\s*l\b/gi, "$1 L")
    .replace(/(\d)\s*kg\b/gi, "$1 kg")
    .replace(/(\d)\s*g\b/gi, "$1 g");
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
    .replace(/\bMAT\b/gi, "ματ")
    .replace(/\bSATIN\b/gi, "σατινέ")
    .replace(/\bGLOSS\b/gi, "γυαλιστερό")
    .replace(/\bEGGSHELL\b/gi, "βελούτε ματ")
    .replace(/\bWHITE\b/gi, "λευκό")
    .replace(/\bTRANSPARENT\b/gi, "διάφανο")
    .replace(/(\d)\s*ml\b/gi, "$1 mL")
    .replace(/(\d)\s*l\b/gi, "$1 L")
    .replace(/\bβάση\s+(ματ|σατινέ|γυαλιστερό)\s+βάση\b/gi, "$1 βάση")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function variantFacts(value: string): string[] {
  const normalized = cleanVariantWords(value);
  const facts: string[] = [];
  const size = normalized.match(/\b\d+(?:[.,]\d+)?\s*(?:mL|L|kg|g)\b/i)?.[0];
  if (size) facts.push(size.replace(/ml$/i, "mL").replace(/l$/i, "L"));
  const base = normalized.match(/\b(?:TR|W|M)\b/i)?.[0]?.toUpperCase();
  if (base) facts.push("βάση " + base);
  const finish = normalized.match(/\b(?:ματ|σατινέ|γυαλιστερό|βελούτε ματ)\b/i)?.[0];
  if (finish) facts.push(finish.toLocaleLowerCase("el"));
  const shade = normalized.match(/(?:λευκ(?:ό|ή|ές|η)?|ανοιχτ(?:ή|ές|ων)?\s+αποχρώσ(?:εις|εων)|μεσαί(?:α|ες)\s+αποχρώσ(?:εις|εων)|σκούρ(?:α|ες)\s+αποχρώσ(?:εις|εων))/i)?.[0];
  if (shade) facts.push(shade);
  return [...new Set(facts.map((fact) => fact.trim()).filter(Boolean))];
}

export function paintBuildProductTitle(value: string, manufacturerProductName?: string): string {
  const title = cleanVariantWords(value);
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
      : key === "acrylan silicon" ? "Acrylan Silicon"
        : key === "acrylan elastic" ? "Acrylan Elastic"
          : key === "acrylan unco eco" ? "Acrylan Unco Eco"
            : key === "vitex with vairo" ? "Vitex with VAIRO"
              : model;

  const facts = variantFacts(title);
  return "VITEX " + displayModel + " - " + descriptor + (facts.length ? " · " + facts.join(" · ") : "");
}

export function paintBuildCategoryLabel(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  const key = value.trim().toLocaleLowerCase("en");
  const labels: Readonly<Record<string, string>> = {
    "exterior wall paint": "Χρώμα εξωτερικής τοιχοποιίας",
    "interior wall paint": "Χρώμα εσωτερικών τοίχων",
    "surface preparation primer": "Αστάρι προετοιμασίας επιφάνειας",
    "metal primer": "Αστάρι μετάλλου",
    "primer": "Αστάρι",
    "enamel paint": "Βερνικόχρωμα",
    "exterior cement paint": "Χρώμα τσιμεντοειδών επιφανειών",
    "floor_coating": "Χρώμα δαπέδου",
    "repair putty": "Στόκος επισκευής"
  };
  return labels[key] ?? paintBuildGreekText(value);
}
