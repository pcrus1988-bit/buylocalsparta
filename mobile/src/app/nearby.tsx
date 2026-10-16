import * as Location from "expo-location";
import { useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { theme } from "../theme";

export default function NearbyScreen() {
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("Η τοποθεσία σου είναι απενεργοποιημένη μέχρι να πατήσεις το κουμπί.");
  const [accuracy,setAccuracy]=useState<number|null>(null);

  async function locate(){
    if(busy)return;
    setBusy(true);setAccuracy(null);
    try {
      const {status,canAskAgain}=await Location.requestForegroundPermissionsAsync();
      if(status!=="granted"){
        setMessage(canAskAgain?"Δεν δόθηκε πρόσβαση. Μπορείς να δοκιμάσεις ξανά.":"Η άδεια τοποθεσίας μπορεί να ενεργοποιηθεί από τις ρυθμίσεις της συσκευής.");
        return;
      }
      setMessage("Ελέγχουμε τη θέση σου...");
      const result=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced});
      if(!Number.isFinite(result.coords.accuracy) || result.coords.accuracy>200){
        setMessage("Η θέση δεν είναι αρκετά ακριβής για προσφορές καταστημάτων. Δοκίμασε ξανά.");
        return;
      }
      setAccuracy(Math.round(result.coords.accuracy));
      setMessage("Η συσκευή εντόπισε τη θέση σου. Τα δεδομένα θέσης δεν στάλθηκαν στο KONTA MOY ή σε κατάστημα.");
    }catch{
      setMessage("Δεν κατέστη δυνατή η λήψη τοποθεσίας. Έλεγξε τις ρυθμίσεις GPS.");
    }finally{setBusy(false);}
  }

  return <ScrollView contentContainerStyle={styles.screen}>
    <Text style={styles.kicker}>KONTA MOY NEARBY</Text>
    <Text style={styles.title}>Προσφορές όπου βρίσκεσαι.</Text>
    <Text style={styles.body}>Ανακάλυψε προνόμια από φυσικά καταστήματα όταν βρίσκεσαι κοντά τους. Η παρακολούθηση θέσης στο παρασκήνιο είναι ανενεργή σε αυτή την έκδοση.</Text>
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Έλεγχος κοντινών καταστημάτων</Text>
      <Text style={styles.body}>Η εφαρμογή θα ζητήσει πρόσβαση στη θέση σου μόνο αφού πατήσεις το κουμπί. Δεν αποθηκεύει συντεταγμένες.</Text>
      <Pressable accessibilityRole="button" onPress={()=>void locate()} disabled={busy} style={[styles.button,busy&&styles.disabled]}>
        <Text style={styles.buttonText}>{busy?"Εντοπισμός…":"Έλεγχος τοποθεσίας"}</Text>
      </Pressable>
      <Text accessibilityLiveRegion="polite" style={styles.status}>{message}</Text>
      {accuracy!==null&&<Text style={styles.accuracy}>Εκτιμώμενη ακρίβεια: ±{accuracy} μέτρα</Text>}
    </View>
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Κοντινές προσφορές</Text>
      <Text style={styles.body}>Η σύνδεση με τις επιβεβαιωμένες προσφορές του λογαριασμού σου απαιτεί το ασφαλές native authentication API. Δεν εμφανίζουμε δοκιμαστικές ή ανύπαρκτες προσφορές.</Text>
      <Pressable accessibilityRole="button" onPress={()=>void Linking.openURL("https://kontamou.site/account/nearby-offers")} style={styles.outline}>
        <Text style={styles.outlineText}>Ρυθμίσεις προσφορών στον ιστότοπο ↗</Text>
      </Pressable>
    </View>
    <Text style={styles.foot}>Η έκδοση αυτή δεν ενεργοποιεί την άδεια τοποθεσίας όταν η εφαρμογή είναι κλειστή, ούτε διαφημιστικό geofencing.</Text>
  </ScrollView>;
}
const styles=StyleSheet.create({
 screen:{padding:24,paddingBottom:60,gap:20},
 kicker:{fontSize:11,fontWeight:"700",letterSpacing:2,color:theme.gold},
 title:{fontSize:33,fontWeight:"800",color:theme.green,lineHeight:41},
 body:{fontSize:15,color:theme.muted,lineHeight:24},
 card:{borderRadius:20,backgroundColor:theme.white,borderWidth:1,borderColor:theme.border,padding:22,gap:15},
 cardTitle:{fontSize:21,fontWeight:"800",color:theme.ink},
 button:{padding:16,backgroundColor:theme.green,borderRadius:14,alignItems:"center"},
 buttonText:{fontSize:15,color:theme.white,fontWeight:"800"},
 disabled:{opacity:0.5},
 outline:{padding:15,borderRadius:14,borderColor:theme.green,borderWidth:1,alignItems:"center"},
 outlineText:{color:theme.green,fontWeight:"700",textAlign:"center"},
 status:{fontSize:14,color:theme.ink,lineHeight:21},
 accuracy:{fontSize:13,color:theme.green,fontWeight:"700"},
 foot:{fontSize:12,color:theme.muted,lineHeight:18},
});
