import * as Location from "expo-location";
import {Link,useFocusEffect} from "expo-router";
import {useCallback,useState} from "react";
import {Linking,Pressable,ScrollView,StyleSheet,Switch,Text,View} from "react-native";
import {getPreferences,setPreference} from "../lib/companion-store";
import {scanVerifiedNearbyStock} from "../lib/nearby-client";
import {requestCompanionNotifications} from "../lib/companion-notifications";
import type {MatchedProduct} from "../lib/nearby-matching";
import {theme} from "../theme";

export default function NearbyScreen(){
 const [busy,setBusy]=useState(false);
 const [reminders,setReminders]=useState(false);
 const [offers,setOffers]=useState(false);
 const [matches,setMatches]=useState<MatchedProduct[]>([]);
 const [status,setStatus]=useState("Η εύρεση θέσης ξεκινά μόνο μετά από δική σου επιλογή.");
 const [accuracy,setAccuracy]=useState<number|null>(null);
 useFocusEffect(useCallback(()=>{let live=true;void getPreferences().then(p=>{
   if(live){setReminders(p.shoppingReminders);setOffers(p.vendorOffers);}
 }).catch(()=>undefined);return()=>{live=false;};},[]));

 async function changeReminders(next:boolean){
  if(busy)return;
  setBusy(true);
  try{
    if(next){
      const notification=await requestCompanionNotifications();
      if(!notification){setStatus("Χρειάζεται άδεια ειδοποιήσεων για υπενθυμίσεις.");return;}
      const permission=await Location.requestForegroundPermissionsAsync();
      if(permission.status!=="granted"){setStatus("Χρειάζεται άδεια τοποθεσίας μόνο κατά τη χρήση της εφαρμογής.");return;}
    }
    await setPreference("shoppingReminders",next);setReminders(next);
    setStatus(next?"Υπενθυμίσεις λίστας ενεργές όσο χρησιμοποιείς το Companion.":"Υπενθυμίσεις λίστας απενεργοποιήθηκαν.");
  }catch{setStatus("Δεν αποθηκεύτηκαν οι ρυθμίσεις.");}
  finally{setBusy(false);}
 }
 async function changeOffers(next:boolean){
  if(busy)return;
  try{
    // Stored independently, but no remote campaigns or vendor push are processed
    // until authenticated API + signed vendor campaign and marketing consent.
    await setPreference("vendorOffers",next);setOffers(next);
    setStatus(next?"Καταχωρήθηκε η προτίμηση. Οι προσφορές καταστημάτων δεν αποστέλλονται ακόμη στην πιλοτική έκδοση.":"Απενεργοποιήθηκαν οι προωθητικές ενημερώσεις.");
  }catch{setStatus("Δεν αποθηκεύτηκαν οι ρυθμίσεις.");}
 }

 async function locate(){
  if(busy)return;
  setBusy(true);setMatches([]);setAccuracy(null);
  try{
    const permission=await Location.requestForegroundPermissionsAsync();
    if(permission.status!=="granted"){setStatus("Δεν δόθηκε πρόσβαση στην τοποθεσία.");return;}
    setStatus("Ελέγχουμε πραγματικά διαθέσιμα είδη κοντά σου…");
    const result=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced});
    const accuracy=result.coords.accuracy??Infinity;
    if(accuracy>200){setStatus("Η θέση δεν είναι αρκετά ακριβής (απαιτείται καλύτερη από ±200 μ.).");return;}
    setAccuracy(Math.round(accuracy));
    const {matches,products}=await scanVerifiedNearbyStock(result.coords);
    setMatches(matches);
    setStatus(matches.length?`Βρέθηκαν ${matches.length} πιθανά σχετικά είδη σε επιβεβαιωμένα καταστήματα.`
      :products.length?"Υπάρχουν κοντινά προϊόντα αλλά δεν ταιριάζουν με τις λίστες σου."
      :"Δεν υπάρχουν ακόμη επιβεβαιωμένες διαθέσιμες επιλογές σε ακτίνα 500 μ.");
  }catch(e){
    const msg=e instanceof Error?e.message:"";
    setStatus(msg==="RATE_LIMITED"?"Πολλοί έλεγχοι. Προσπάθησε σε λίγο.":msg==="LOCATION_NOT_ACCURATE"?"Ανεπαρκής ακρίβεια GPS.":"Η υπηρεσία κοντινών προϊόντων δεν είναι διαθέσιμη.");
  }finally{setBusy(false);}
 }
 return <ScrollView contentContainerStyle={styles.screen}>
  <Text style={styles.kicker}>COMPANION · ΚΟΝΤΑ ΣΟΥ</Text>
  <Text style={styles.title}>Θυμάται τι χρειάζεσαι, εκεί που περπατάς.</Text>
  <Text style={styles.body}>Σύνδεσε τη λίστα αγορών ή τη wishlist με επιβεβαιωμένα φυσικά καταστήματα. Δεν μοιραζόμαστε τα στοιχεία των λιστών σου με τους εμπόρους.</Text>
  <View style={styles.card}>
   <Text style={styles.heading}>Οι προσωπικές μου υπενθυμίσεις</Text>
   <View style={styles.row}>
    <View style={{flex:1,gap:5}}>
     <Text style={styles.label}>Υπενθύμιση από τη δική μου λίστα</Text>
     <Text style={styles.help}>Τοπική ειδοποίηση μόνο όταν η εφαρμογή είναι ανοιχτή, και έχει βρεθεί πιθανή αντιστοίχιση με ελεγμένο απόθεμα.</Text>
    </View>
    <Switch value={reminders} disabled={busy} onValueChange={v=>void changeReminders(v)} trackColor={{true:theme.gold}}/>
   </View>
   <View style={styles.divider}/>
   <View style={styles.row}>
    <View style={{flex:1,gap:5}}>
     <Text style={styles.label}>Αποκλειστικές προσφορές συνεργατών</Text>
     <Text style={styles.help}>Ξεχωριστή προτίμηση για προσφορές κοντινών καταστημάτων. Οι εξατομικευμένες προωθητικές push δεν έχουν ενεργοποιηθεί ακόμη.</Text>
    </View>
    <Switch value={offers} disabled={busy} onValueChange={v=>void changeOffers(v)} trackColor={{true:theme.gold}}/>
   </View>
  </View>
  <View style={styles.card}>
   <Text style={styles.heading}>Τι υπάρχει εδώ κοντά;</Text>
   <Text style={styles.help}>Ένας χειροκίνητος έλεγχος με τη δική σου έγκριση. Δεν διατηρούμε ιστορικό διαδρομών ή ακριβείς συντεταγμένες στον λογαριασμό σου.</Text>
   <Pressable onPress={()=>void locate()} accessibilityRole="button" disabled={busy} style={[styles.primary,busy&&{opacity:.65}]}>
    <Text style={styles.primaryText}>{busy?"Έλεγχος…":"Έλεγχος κοντινών ειδών"}</Text>
   </Pressable>
   <Text style={styles.status} accessibilityLiveRegion="polite">{status}</Text>
   {accuracy!==null&&<Text style={styles.help}>Εκτιμώμενη ακρίβεια συσκευής: ±{accuracy} μ.</Text>}
   {matches.map(m=><View key={m.itemId+":"+m.vendorId+":"+m.variantId} style={styles.match}>
      <Text style={styles.label}>{m.itemTitle} → {m.productTitle}</Text>
      <Text style={styles.help}>{m.vendorName} · {m.vendorLocality} · περίπου {m.distanceM} μ.</Text>
      <Pressable accessibilityRole="link" onPress={()=>void Linking.openURL(m.productUrl)}>
        <Text style={styles.link}>Έλεγξε το προϊόν και τη διαθεσιμότητα ↗</Text>
      </Pressable>
    </View>)}
  </View>
  <Link href="/lists" asChild><Pressable style={styles.outline} accessibilityRole="button">
   <Text style={styles.outlineText}>Διαχείριση wishlist & λίστας αγορών →</Text>
  </Pressable></Link>
  <Text style={styles.legal}>Για την έκδοση Android δεν ζητάμε πρόσβαση θέσης όταν η εφαρμογή είναι κλειστή. Οι ειδοποιήσεις για δικά σου είδη δημιουργούνται τοπικά στη συσκευή, δεν αποτελούν ακόμη απομακρυσμένες push από FCM. Η καταλληλότητα background geofencing θα εξεταστεί χωριστά βάσει πολιτικής Google Play.</Text>
 </ScrollView>;
}
const styles=StyleSheet.create({
 screen:{padding:22,paddingBottom:55,gap:18},
 kicker:{fontSize:11,letterSpacing:2,color:theme.gold,fontWeight:"800"},
 title:{fontSize:31,lineHeight:39,fontWeight:"800",color:theme.green},
 body:{fontSize:15,lineHeight:24,color:theme.muted},
 card:{padding:20,borderRadius:19,borderWidth:1,borderColor:theme.border,backgroundColor:theme.white,gap:15},
 heading:{fontSize:21,color:theme.ink,fontWeight:"800"},
 row:{flexDirection:"row",alignItems:"center",gap:14},
 label:{color:theme.ink,fontWeight:"700",fontSize:15},
 help:{color:theme.muted,fontSize:13,lineHeight:19},
 divider:{height:1,backgroundColor:theme.border},
 primary:{backgroundColor:theme.green,borderRadius:14,padding:15,alignItems:"center"},
 primaryText:{color:theme.white,fontWeight:"800",fontSize:15},
 status:{fontSize:14,color:theme.ink,lineHeight:22},
 match:{padding:14,borderRadius:13,backgroundColor:theme.cream,gap:7},
 link:{color:theme.green,fontWeight:"700",fontSize:13},
 outline:{padding:16,borderWidth:1,borderColor:theme.green,borderRadius:14,alignItems:"center"},
 outlineText:{color:theme.green,fontSize:14,fontWeight:"700"},
 legal:{fontSize:12,lineHeight:19,color:theme.muted}
});
