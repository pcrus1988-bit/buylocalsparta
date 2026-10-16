import {useState} from "react";
import {Linking,Pressable,ScrollView,StyleSheet,Text,View} from "react-native";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import {getItems} from "../lib/companion-store";
import {searchCompanionCatalog} from "../lib/companion-catalog";
import {loadCompanionAccount} from "../lib/companion-session";
import {theme} from "../theme";

type Check={name:string;state:"ok"|"limited"|"unavailable";detail:string};
export default function CompanionDiagnostics(){
 const [running,setRunning]=useState(false);
 const [checks,setChecks]=useState<Check[]>([]);
 async function run(){
  if(running)return;
  setRunning(true);setChecks([]);
  const result:Check[]=[];
  try{
   const items=await getItems();
   result.push({name:"Τοπική βάση λιστών",state:"ok",
    detail:`Η offline βάση διαβάζεται κανονικά. Αποθηκευμένες καταχωρήσεις: ${items.length}.`});
  }catch{result.push({name:"Τοπική βάση λιστών",state:"unavailable",detail:"Δεν ήταν δυνατή η ανάγνωση της τοπικής βάσης."});}
  try{
   const location=await Location.getForegroundPermissionsAsync();
   result.push({name:"Άδεια τοποθεσίας",state:location.granted?"ok":"limited",
    detail:location.granted?"Επιτρέπεται μόνο όταν χρησιμοποιείς την εφαρμογή.":"Δεν έχει δοθεί άδεια. Η λίστα λειτουργεί και χωρίς αυτήν."});
  }catch{result.push({name:"Άδεια τοποθεσίας",state:"unavailable",detail:"Δεν ήταν δυνατός ο έλεγχος αδειών."});}
  try{
   const notification=await Notifications.getPermissionsAsync();
   result.push({name:"Άδεια ειδοποιήσεων",state:notification.granted?"ok":"limited",
    detail:notification.granted?"Η συσκευή επιτρέπει ειδοποιήσεις.":"Δεν έχει δοθεί άδεια. Δεν στέλνουμε ειδοποιήσεις χωρίς έγκριση."});
  }catch{result.push({name:"Άδεια ειδοποιήσεων",state:"unavailable",detail:"Δεν ήταν δυνατός ο έλεγχος αδειών."});}
  try{
   const products=await searchCompanionCatalog("παπούτσια");
   result.push({name:"Πραγματικός κατάλογος KONTA MOY",state:"ok",
     detail:`Ο online κατάλογος απάντησε με ${products.length} πραγματικές εγγραφές. Δεν υπονοείται διαθεσιμότητα σε φυσικό κατάστημα.`});
  }catch{result.push({name:"Πραγματικός κατάλογος KONTA MOY",state:"limited",
    detail:"Η σύνδεση με τον κατάλογο δεν λειτουργεί ακόμη. Οι χειροκίνητες λίστες παραμένουν διαθέσιμες."});}
  try{
   const account=await loadCompanionAccount();
   result.push({name:"Εγγενής σύνδεση λογαριασμού",state:account?"ok":"limited",
    detail:account?"Υπάρχει ενεργή συνεδρία Companion.":"Δεν υπάρχει ενεργή εγγενής συνεδρία. Μπορείς να χρησιμοποιήσεις τον λογαριασμό μέσω browser."});
  }catch{result.push({name:"Εγγενής σύνδεση λογαριασμού",state:"limited",
    detail:"Η εγγενής συνεδρία δεν είναι διαθέσιμη αυτή τη στιγμή."});}
  setChecks(result);setRunning(false);
 }
 return <ScrollView contentContainerStyle={styles.screen}>
   <Text style={styles.kicker}>COMPANION · ΈΛΕΓΧΟΣ</Text>
   <Text style={styles.title}>Έλεγχος λειτουργίας</Text>
   <Text style={styles.body}>Έλεγξε τις δυνατότητες της συσκευής χωρίς αποστολή GPS, περιεχομένων λίστας ή προσωπικών δεδομένων. Δεν ζητάμε νέες άδειες.</Text>
   <Pressable accessibilityRole="button" disabled={running} style={styles.primary} onPress={()=>void run()}>
     <Text style={styles.primaryText}>{running?"Έλεγχος…":"Έλεγχος τώρα"}</Text>
   </Pressable>
   {checks.map(c=><View key={c.name} style={styles.card}>
      <Text style={styles.name}>{c.state==="ok"?"✓":c.state==="limited"?"○":"!"} {c.name}</Text>
      <Text style={styles.body}>{c.detail}</Text>
    </View>)}
   <Pressable accessibilityRole="link" style={styles.outline}
     onPress={()=>void Linking.openURL("https://kontamou.site/account")}>
     <Text style={styles.outlineText}>Άνοιγμα λογαριασμού KONTA MOY ↗</Text>
   </Pressable>
   <Text style={styles.note}>Το «✓» βεβαιώνει μόνο τον συγκεκριμένο έλεγχο, όχι πλήρη δοκιμή παραγγελιών, πληρωμών ή ειδοποιήσεων FCM. Οι ειδοποιήσεις και οι πραγματικές παραλαβές απαιτούν ρητή ενεργοποίηση και έλεγχο server.</Text>
 </ScrollView>;
}
const styles=StyleSheet.create({
 screen:{padding:22,gap:16,paddingBottom:60},
 kicker:{fontSize:11,color:theme.gold,letterSpacing:2,fontWeight:"800"},
 title:{fontSize:31,fontWeight:"800",color:theme.green},
 body:{fontSize:14,lineHeight:22,color:theme.muted},
 primary:{backgroundColor:theme.green,padding:16,borderRadius:14,alignItems:"center"},
 primaryText:{color:theme.white,fontSize:15,fontWeight:"800"},
 card:{backgroundColor:theme.white,padding:17,borderWidth:1,borderColor:theme.border,borderRadius:15,gap:8},
 name:{fontSize:16,fontWeight:"800",color:theme.ink},
 outline:{padding:15,borderRadius:14,borderColor:theme.green,borderWidth:1,alignItems:"center"},
 outlineText:{color:theme.green,fontWeight:"800"},
 note:{fontSize:12,lineHeight:18,color:theme.muted}
});
