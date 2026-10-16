import {useFocusEffect} from "expo-router";
import {useCallback,useState} from "react";
import {Pressable,ScrollView,StyleSheet,Switch,Text,View} from "react-native";
import {companionPushStatus,disableCompanionPush,
 registerCompanionPush,sendCompanionTestPush} from "../lib/companion-push";
import {theme} from "../theme";

function errorMessage(error:unknown){
 const reason=error instanceof Error?error.message:"";
 if(reason==="LOGIN_REQUIRED")return "Συνδέσου πρώτα από τον λογαριασμό Companion.";
 if(reason==="NOT_ENABLED")return "Η υπηρεσία απομακρυσμένων ειδοποιήσεων δεν έχει ενεργοποιηθεί.";
 if(reason==="NOTIFICATION_PERMISSION_DENIED")return "Χρειάζεται άδεια ειδοποιήσεων στις ρυθμίσεις Android.";
 if(reason==="FCM_NOT_CONFIGURED")return "Η συσκευή δεν έχει συνδεθεί ακόμη με το Firebase του Companion.";
 return "Η ενέργεια δεν ολοκληρώθηκε. Έλεγξε τη σύνδεση ή τις ρυθμίσεις της συσκευής.";
}
export default function CompanionPushSettings(){
 const [enabled,setEnabled]=useState(false);
 const [orders,setOrders]=useState(false);
 const [saved,setSaved]=useState(false);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("Οι ειδοποιήσεις απενεργοποιούνται από προεπιλογή.");
 const refresh=useCallback(async()=>{
   try{
     const p=await companionPushStatus();
     setEnabled(p.enabled);setOrders(p.orderUpdates);setSaved(p.savedItems);
   }catch{/* Keep consent unchanged when offline or not signed in. */}
 },[]);
 useFocusEffect(useCallback(()=>{void refresh();},[refresh]));
 async function save(){
   if(busy)return;
   setBusy(true);
   try{
     if(!orders&&!saved){
       const p=await disableCompanionPush();
       setEnabled(p.enabled);setNotice("Οι απομακρυσμένες ενημερώσεις απενεργοποιήθηκαν.");
     }else{
       const p=await registerCompanionPush({
         orderUpdates:orders,savedItems:saved,vendorOffers:false
       });
       setEnabled(p.enabled);setOrders(p.orderUpdates);setSaved(p.savedItems);
       setNotice("Οι επιλεγμένες ειδοποιήσεις καταχωρήθηκαν για αυτή τη συσκευή.");
     }
   }catch(e){setNotice(errorMessage(e));await refresh();}
   finally{setBusy(false);}
 }
 async function disable(){
   if(busy)return;
   setBusy(true);
   try{
     const p=await disableCompanionPush();
     setEnabled(p.enabled);setOrders(false);setSaved(false);
     setNotice("Ανακλήθηκε η άδεια απομακρυσμένων ειδοποιήσεων αυτής της συσκευής.");
   }catch(e){setNotice(errorMessage(e));}
   finally{setBusy(false);}
 }
 async function test(){
   if(busy)return;
   setBusy(true);
   try{
     await sendCompanionTestPush();
     setNotice("Η δοκιμή υποβλήθηκε στο FCM. Η παράδοση στη συσκευή δεν έχει ακόμη επιβεβαιωθεί.");
   }catch(e){setNotice(errorMessage(e));}
   finally{setBusy(false);}
 }
 return <ScrollView contentContainerStyle={styles.screen}>
  <Text style={styles.kicker}>KONTA MOY COMPANION</Text>
  <Text style={styles.title}>Ειδοποιήσεις Android</Text>
  <Text style={styles.body}>Εσύ επιλέγεις ποιες ενημερώσεις θα φτάνουν στο κινητό σου. Η πρόσβαση στις ειδοποιήσεις δεν απαιτεί την τοποθεσία σου.</Text>
  <View style={styles.card}>
    <Text style={styles.heading}>Απομακρυσμένες ειδοποιήσεις FCM</Text>
    <Text style={styles.status}>{enabled?"Καταχωρημένη συσκευή":"Δεν υπάρχει ενεργή εγγραφή για αυτή τη συσκευή"}</Text>
    <View style={styles.option}>
      <View style={{flex:1}}>
        <Text style={styles.label}>Παραγγελίες και παραλαβές</Text>
        <Text style={styles.help}>Όταν η παραγγελία προχωρά ή είναι έτοιμη για παραλαβή.</Text>
      </View>
      <Switch disabled={busy} value={orders} onValueChange={setOrders} trackColor={{true:theme.gold}}/>
    </View>
    <View style={styles.line}/>
    <View style={styles.option}>
      <View style={{flex:1}}>
        <Text style={styles.label}>Wishlist και αποθηκευμένα είδη</Text>
        <Text style={styles.help}>Μόνο για προϊόντα που έχεις ζητήσει να παρακολουθείς.</Text>
      </View>
      <Switch disabled={busy} value={saved} onValueChange={setSaved} trackColor={{true:theme.gold}}/>
    </View>
    <Pressable accessibilityRole="button" disabled={busy}
      onPress={()=>void save()} style={[styles.primary,busy&&{opacity:0.5}]}>
      <Text style={styles.primaryText}>{busy?"Αποθήκευση…":"Αποθήκευση επιλογών"}</Text>
    </Pressable>
    <Pressable accessibilityRole="button" disabled={busy} onPress={()=>void disable()} style={styles.outline}>
      <Text style={styles.outlineText}>Απενεργοποίηση όλων στη συσκευή</Text>
    </Pressable>
    <Text style={styles.message} accessibilityLiveRegion="polite">{notice}</Text>
  </View>
  <View style={styles.card}>
    <Text style={styles.heading}>Έλεγχος ειδοποίησης</Text>
    <Text style={styles.help}>Μπορείς να ζητήσεις μία δοκιμαστική ειδοποίηση ανά ημέρα εφόσον η δοκιμή έχει ενεργοποιηθεί από τον διαχειριστή.</Text>
    <Pressable accessibilityRole="button" disabled={busy||!enabled} onPress={()=>void test()} style={styles.outline}>
      <Text style={styles.outlineText}>Αποστολή δοκιμαστικής ειδοποίησης</Text>
    </Pressable>
  </View>
  <View style={styles.card}>
    <Text style={styles.heading}>Αποκλειστικές προσφορές καταστημάτων</Text>
    <Text style={styles.help}>Οι προωθητικές ειδοποιήσεις είναι διαφορετική κατηγορία συναίνεσης. Δεν ενεργοποιούνται από τη ρύθμιση παραγγελιών ή wishlist και δεν αποστέλλονται ακόμη.</Text>
  </View>
  <Text style={styles.legal}>Το FCM λειτουργεί χωρίς καταγραφή GPS. Η ενεργοποίηση εδώ δεν επιτρέπει σε καταστήματα να δουν ποια προϊόντα έχεις στη λίστα σου ή τη θέση σου. Η πραγματική αποστολή ενημερώσεων παραγγελίας/wishlist απαιτεί ακόμη τον server-side dispatcher.</Text>
 </ScrollView>;
}
const styles=StyleSheet.create({
 screen:{padding:22,paddingBottom:65,gap:18},
 kicker:{fontWeight:"800",letterSpacing:2,fontSize:11,color:theme.gold},
 title:{fontWeight:"800",fontSize:31,lineHeight:40,color:theme.green},
 body:{fontSize:15,lineHeight:23,color:theme.muted},
 card:{padding:20,backgroundColor:theme.white,borderWidth:1,borderColor:theme.border,borderRadius:18,gap:15},
 heading:{fontSize:20,fontWeight:"800",color:theme.ink},
 status:{fontSize:13,fontWeight:"700",color:theme.green},
 option:{flexDirection:"row",alignItems:"center",gap:13},
 line:{height:1,backgroundColor:theme.border},
 label:{fontSize:15,fontWeight:"700",color:theme.ink},
 help:{fontSize:13,lineHeight:20,color:theme.muted},
 primary:{backgroundColor:theme.green,alignItems:"center",padding:16,borderRadius:13},
 primaryText:{fontSize:15,fontWeight:"800",color:theme.white},
 outline:{borderWidth:1,borderColor:theme.green,padding:15,borderRadius:13,alignItems:"center"},
 outlineText:{fontSize:14,fontWeight:"700",color:theme.green},
 message:{fontSize:14,color:theme.ink,lineHeight:20},
 legal:{fontSize:12,lineHeight:19,color:theme.muted}
});
