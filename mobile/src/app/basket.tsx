import {Link} from "expo-router";
import {Pressable,ScrollView,StyleSheet,Text,View} from "react-native";
import {openMarketplace} from "../lib/marketplace-navigation";
import {theme} from "../theme";

export default function Basket(){
 return <ScrollView contentContainerStyle={styles.screen}>
   <Text style={styles.kicker}>KONTA MOY · ΚΑΛΑΘΙ</Text>
   <Text style={styles.title}>Ένα καλάθι, μία ολοκλήρωση.</Text>
   <Text style={styles.intro}>Τα προϊόντα από διαφορετικά καταστήματα ενώνονται στο υπάρχον ασφαλές marketplace checkout του KONTA MOY.</Text>
   <View style={styles.card}>
     <Text style={styles.heading}>Το πραγματικό σου καλάθι</Text>
     <Text style={styles.body}>Για να μην χαθεί το καλάθι, οι πληρωμές, η παραλαβή και η παράδοση ολοκληρώνονται στον επίσημο ιστότοπο, με τη συνεδρία του browser σου.</Text>
     <Pressable accessibilityRole="link" onPress={()=>void openMarketplace({path:"/cart"})} style={styles.primary}>
      <Text style={styles.primaryText}>Άνοιγμα του καλαθιού μου ↗</Text>
     </Pressable>
     <Pressable accessibilityRole="link" onPress={()=>void openMarketplace({path:"/checkout"})} style={styles.outline}>
      <Text style={styles.outlineText}>Συνέχεια στο ασφαλές checkout ↗</Text>
     </Pressable>
     <Text style={styles.note}>Αν ο browser δεν έχει ήδη προϊόντα, το καλάθι εμφανίζεται άδειο. Η offline wishlist δεν μετατρέπεται αυτόματα σε παραγγελία.</Text>
   </View>
   <View style={styles.steps}>
    <Text style={styles.heading}>Πώς λειτουργεί</Text>
    <Text style={styles.step}>1. Βρες πραγματικά προϊόντα στον κατάλογο.</Text>
    <Text style={styles.step}>2. Πρόσθεσέ τα στο καλάθι της ιστοσελίδας.</Text>
    <Text style={styles.step}>3. Διάλεξε παράδοση ή φυσική παραλαβή και ολοκλήρωσε τη συναλλαγή με τις υπάρχουσες ασφαλείς υπηρεσίες.</Text>
   </View>
   <View style={styles.options}>
    <Pressable accessibilityRole="link" style={styles.option}
      onPress={()=>void openMarketplace({path:"/delivery-pickup"})}>
     <Text style={styles.optionText}>Παράδοση & QR παραλαβής ↗</Text>
    </Pressable>
    <Pressable accessibilityRole="link" style={styles.option}
      onPress={()=>void openMarketplace({path:"/payments-security"})}>
     <Text style={styles.optionText}>Πληρωμές & ασφάλεια ↗</Text>
    </Pressable>
    <Link href="/shop" asChild><Pressable accessibilityRole="button" style={styles.option}>
      <Text style={styles.optionText}>Συνέχεια αναζήτησης προϊόντων →</Text>
    </Pressable></Link>
   </View>
   <Text style={styles.note}>Η εφαρμογή δεν αντιγράφει κάρτες, κωδικούς ή cookies πληρωμών στη συσκευή. Αυτό το στάδιο είναι ενσωμάτωση με ασφαλή browser, όχι διαφορετικός μηχανισμός checkout.</Text>
 </ScrollView>;
}
const styles=StyleSheet.create({
 screen:{padding:20,gap:16,paddingBottom:45},
 kicker:{fontSize:11,fontWeight:"800",letterSpacing:1.5,color:theme.gold},
 title:{fontSize:32,lineHeight:40,fontWeight:"800",color:theme.green},
 intro:{fontSize:15,lineHeight:23,color:theme.muted},
 card:{backgroundColor:theme.white,borderWidth:1,borderColor:theme.border,borderRadius:19,padding:20,gap:13},
 heading:{fontSize:19,fontWeight:"800",color:theme.ink},
 body:{fontSize:14,lineHeight:22,color:theme.muted},
 primary:{backgroundColor:theme.green,borderRadius:13,padding:16,alignItems:"center"},
 primaryText:{fontSize:15,fontWeight:"800",color:theme.white},
 outline:{borderWidth:1,borderColor:theme.green,padding:15,borderRadius:13,alignItems:"center"},
 outlineText:{fontSize:14,fontWeight:"800",color:theme.green},
 note:{fontSize:12,lineHeight:19,color:theme.muted},
 steps:{backgroundColor:"#E7EDE5",padding:20,borderRadius:17,gap:12},
 step:{fontSize:14,lineHeight:22,color:theme.ink},
 options:{gap:10},
 option:{borderWidth:1,borderColor:theme.border,backgroundColor:theme.white,
   padding:15,borderRadius:13},
 optionText:{color:theme.green,fontSize:14,fontWeight:"700"}
});
