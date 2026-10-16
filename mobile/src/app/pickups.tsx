import {Linking,Pressable,ScrollView,StyleSheet,Text,View} from "react-native";
import {theme} from "../theme";
const WEBSITE="https://kontamou.site";
export default function CompanionPickups(){
 return <ScrollView contentContainerStyle={styles.screen}>
   <Text style={styles.kicker}>COMPANION · ΠΑΡΑΛΑΒΕΣ</Text>
   <Text style={styles.title}>Παραλαβές χωρίς αναμονή.</Text>
   <Text style={styles.copy}>Η παραγγελία σου και το QR παραλαβής παραμένουν στον ασφαλή λογαριασμό KONTA MOY. Δεν δημιουργούμε νέο, μη επαληθευμένο QR στην εφαρμογή.</Text>
   <View style={styles.card}>
    <Text style={styles.heading}>Οδηγός παραλαβής</Text>
    <Text style={styles.step}>1. Έλεγξε ότι η παραγγελία είναι «Έτοιμη για παραλαβή».</Text>
    <Text style={styles.step}>2. Άνοιξε τον κωδικό ή QR από τα στοιχεία της παραγγελίας.</Text>
    <Text style={styles.step}>3. Παρουσίασε τον κωδικό στον συνεργάτη στο φυσικό κατάστημα.</Text>
    <Pressable accessibilityRole="button" style={styles.primary} onPress={()=>void Linking.openURL(WEBSITE+"/account/orders?view=pickup")}>
      <Text style={styles.primaryText}>Οι παραλαβές μου →</Text>
    </Pressable>
   </View>
   <View style={styles.card}>
    <Text style={styles.heading}>Όλες οι παραγγελίες</Text>
    <Text style={styles.copy}>Παρακολούθησε πληρωμή, προετοιμασία, αποστολή, παραλαβή και επιστροφές.</Text>
    <Pressable accessibilityRole="button" style={styles.secondary} onPress={()=>void Linking.openURL(WEBSITE+"/account/orders")}>
      <Text style={styles.secondaryText}>Προβολή παραγγελιών ↗</Text>
    </Pressable>
   </View>
   <Text style={styles.note}>Η εγγενής εμφάνιση QR και αυτόματος συγχρονισμός κατάστασης θα ενσωματωθούν μετά το ασφαλές Android sign-in. Δεν μοιραζόμαστε την παραγγελία με άλλη εφαρμογή.</Text>
 </ScrollView>;
}
const styles=StyleSheet.create({
 screen:{padding:24,paddingBottom:55,gap:20},
 kicker:{color:theme.gold,fontWeight:"800",letterSpacing:2,fontSize:11},
 title:{color:theme.green,fontWeight:"800",fontSize:32,lineHeight:40},
 copy:{color:theme.muted,fontSize:15,lineHeight:24},
 card:{backgroundColor:theme.white,borderWidth:1,borderColor:theme.border,borderRadius:20,padding:20,gap:14},
 heading:{color:theme.green,fontSize:20,fontWeight:"800"},
 step:{color:theme.ink,fontSize:15,lineHeight:23},
 primary:{padding:16,borderRadius:14,backgroundColor:theme.green,alignItems:"center"},
 primaryText:{color:theme.white,fontWeight:"800",fontSize:15},
 secondary:{padding:15,borderRadius:14,borderColor:theme.green,borderWidth:1,alignItems:"center"},
 secondaryText:{color:theme.green,fontWeight:"800"},
 note:{fontSize:12,lineHeight:19,color:theme.muted}
});
