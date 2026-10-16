import { Link } from "expo-router";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { theme } from "../theme";

const WEB = "https://kontamou.site";
function External({label,href}:{label:string;href:string}) {
  return <Pressable style={styles.action} accessibilityRole="button" onPress={()=>void Linking.openURL(WEB+href)}>
    <Text style={styles.actionText}>{label} ↗</Text>
  </Pressable>;
}
export default function Home() {
  return <ScrollView contentContainerStyle={styles.screen}>
    <Text style={styles.kicker}>DEVELOPED IN SPARTA FOR GREECE</Text>
    <Text style={styles.title}>Η τοπική αγορά σου, πάντα κοντά.</Text>
    <Text style={styles.lead}>Γνώρισε καταστήματα της περιοχής, ανακάλυψε προϊόντα και διάλεξε τι πραγματικά σε ενδιαφέρει.</Text>
    <View style={styles.hero}>
      <Text style={styles.heroLabel}>KONTA MOY COMPANION</Text>
      <Text style={styles.heroTitle}>Η λίστα σου ξέρει τη γειτονιά.</Text>
      <Text style={styles.heroText}>Λίστα αγορών, wishlist και υπενθυμίσεις κοντά σε φυσικά καταστήματα, πάντα με επιλογή σου.</Text>
      <Link href="/nearby" asChild>
        <Pressable style={styles.primary} accessibilityRole="button">
          <Text style={styles.primaryText}>Ανακάλυψε τι είναι κοντά σου →</Text>
        </Pressable>
      </Link>
    </View>
    <Link href="/lists" asChild><Pressable accessibilityRole="button" style={styles.secondary}><Text style={styles.secondaryText}>Λίστα αγορών & Wishlist →</Text></Pressable></Link>
    <Link href="/notifications" asChild><Pressable accessibilityRole="button" style={styles.secondary}><Text style={styles.secondaryText}>Ειδοποιήσεις Android →</Text></Pressable></Link>
    <Link href="/pickups" asChild><Pressable accessibilityRole="button" style={styles.secondary}><Text style={styles.secondaryText}>Παραλαβές & QR παραγγελίας →</Text></Pressable></Link>
    <View style={styles.row}>
      <View style={styles.tile}>
        <Text style={styles.tileTitle}>Αγορές</Text>
        <Text style={styles.tileText}>Προϊόντα και πραγματική διαθεσιμότητα.</Text>
        <External label="Άνοιγμα καταλόγου" href="/shop"/>
      </View>
      <View style={styles.tile}>
        <Text style={styles.tileTitle}>Καταστήματα</Text>
        <Text style={styles.tileText}>Οι άνθρωποι πίσω από τα προϊόντα.</Text>
        <External label="Δες τα καταστήματα" href="/shops"/>
      </View>
    </View>
    <Link href="/account" asChild>
      <Pressable accessibilityRole="button" style={styles.secondary}>
        <Text style={styles.secondaryText}>Ο λογαριασμός μου →</Text>
      </Pressable>
    </Link>
    <Text style={styles.note}>Έκδοση ανάπτυξης Android: οι τοπικές λίστες αποθηκεύονται στη συσκευή. Παραγγελίες και παραλαβές ανοίγουν με ασφάλεια στον υπάρχοντα ιστότοπο μέχρι να ολοκληρωθεί το native login.</Text>
  </ScrollView>;
}
const styles=StyleSheet.create({
  screen:{padding:24,gap:22,paddingBottom:50},
  kicker:{fontSize:11,color:theme.green,letterSpacing:2,fontWeight:"700"},
  title:{fontSize:35,lineHeight:42,fontWeight:"800",color:theme.ink},
  lead:{fontSize:16,lineHeight:25,color:theme.muted},
  hero:{backgroundColor:theme.green,borderRadius:24,padding:24,gap:15},
  heroLabel:{fontSize:11,color:"#D7C68C",letterSpacing:1.7,fontWeight:"700"},
  heroTitle:{fontSize:27,lineHeight:34,color:theme.white,fontWeight:"800"},
  heroText:{fontSize:15,lineHeight:23,color:"#E5EEE8"},
  primary:{backgroundColor:theme.gold,borderRadius:14,padding:15,alignItems:"center"},
  primaryText:{color:theme.ink,fontSize:15,fontWeight:"800"},
  row:{flexDirection:"row",gap:12},
  tile:{backgroundColor:theme.white,flex:1,borderRadius:18,borderColor:theme.border,borderWidth:1,padding:15,gap:12},
  tileTitle:{color:theme.green,fontSize:19,fontWeight:"800"},
  tileText:{color:theme.muted,fontSize:13,lineHeight:19,minHeight:60},
  action:{paddingVertical:6},
  actionText:{color:theme.green,fontWeight:"700",fontSize:13},
  secondary:{borderWidth:1,borderColor:theme.green,padding:16,borderRadius:14,alignItems:"center"},
  secondaryText:{color:theme.green,fontWeight:"700"},
  note:{fontSize:12,color:theme.muted,lineHeight:18}
});
