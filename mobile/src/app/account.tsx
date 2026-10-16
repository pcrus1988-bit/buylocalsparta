import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { theme } from "../theme";

const accountPages=[
 {label:"Ο λογαριασμός μου",path:"/account"},
 {label:"Οι παραγγελίες μου",path:"/account/orders"},
 {label:"Παραλαβές / QR",path:"/account/orders?view=pickup"},
 {label:"Wishlist λογαριασμού",path:"/account/wishlist"},
 {label:"Ειδοποιήσεις",path:"/account/notifications"},
] as const;

export default function Account() {
 return <ScrollView contentContainerStyle={styles.screen}>
   <Text style={styles.title}>KONTA MOY Companion · Ο λογαριασμός σου</Text>
   <Text style={styles.lead}>Παρακολούθησε τις παραγγελίες και άνοιξε τον ασφαλή κωδικό QR παραλαβής όταν είναι έτοιμη.</Text>
   <View style={styles.card}>
     {accountPages.map(p=><Pressable accessibilityRole="button" key={p.path} style={styles.link} onPress={()=>void Linking.openURL("https://kontamou.site"+p.path)}>
       <Text style={styles.linkText}>{p.label} ↗</Text>
     </Pressable>)}
   </View>
   <Text style={styles.note}>Σε αυτό το πρώτο native foundation οι συνδέσεις λογαριασμού ανοίγουν στον ιστότοπο. Δεν αποθηκεύονται κωδικοί ή web session cookies στο native app. Ακολουθεί ασφαλές mobile authentication και API.</Text>
 </ScrollView>;
}
const styles=StyleSheet.create({
 screen:{padding:24,gap:24,paddingBottom:60},
 title:{fontSize:30,fontWeight:"800",color:theme.green},
 lead:{fontSize:16,lineHeight:24,color:theme.muted},
 card:{backgroundColor:theme.white,borderWidth:1,borderColor:theme.border,borderRadius:20,overflow:"hidden"},
 link:{padding:22,borderBottomWidth:1,borderColor:theme.border},
 linkText:{color:theme.green,fontWeight:"700",fontSize:16},
 note:{fontSize:13,lineHeight:20,color:theme.muted}
});
