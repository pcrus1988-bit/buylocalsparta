import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import {Link} from "expo-router";
import {useCallback,useEffect,useRef,useState} from "react";
import {Linking,Pressable,ScrollView,StyleSheet,Text,View} from "react-native";
import {
  connectCompanion,disconnectCompanion,loadCompanionAccount,
  type CompanionAccount,type CompanionOrder
} from "../lib/companion-session";
import {theme} from "../theme";

WebBrowser.maybeCompleteAuthSession();
const REDIRECT="kontamoucompanion://auth";
const discovery={authorizationEndpoint:"https://kontamou.site/account/companion-connect"};
const WEBSITE="https://kontamou.site";

function money(minor:number,currency:string){
 try{return new Intl.NumberFormat("el-GR",{style:"currency",currency:currency||"EUR"}).format(minor/100);}
 catch{return (minor/100).toFixed(2)+" €";}
}
function orderStatus(order:CompanionOrder){
 return order.pickupReady?"Έτοιμη για παραλαβή":order.status;
}

export default function CompanionAccountScreen(){
 const [account,setAccount]=useState<CompanionAccount|null>(null);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const consumed=useRef("");
 const [request,response,promptAsync]=AuthSession.useAuthRequest({
   clientId:"kontamou-companion-android",
   redirectUri:REDIRECT,
   responseType:AuthSession.ResponseType.Code,
   usePKCE:true,
 },discovery);

 const refresh=useCallback(async()=>{
   setLoading(true);
   try{setAccount(await loadCompanionAccount());setError("");}
   catch{setError("Δεν έγινε ο συγχρονισμός. Έλεγξε τη σύνδεση και προσπάθησε ξανά.");}
   finally{setLoading(false);}
 },[]);
 useEffect(()=>{void refresh();},[refresh]);

 useEffect(()=>{
   if(!response || response.type!=="success" || !request?.codeVerifier)return;
   const {code,state}=response.params;
   // PKCE binds a stolen deep link to the original Android app's verifier.
   if(!code || state!==request.state || consumed.current===code)return;
   consumed.current=code;
   setBusy(true);setError("");
   void connectCompanion(code,request.codeVerifier).then(refresh).catch((err:unknown)=>{
     setError(err instanceof Error && err.message==="NOT_ENABLED"
       ?"Η ασφαλής σύνδεση Companion δεν έχει ενεργοποιηθεί ακόμη."
       :"Η σύνδεση δεν ολοκληρώθηκε. Δοκίμασε ξανά.");
   }).finally(()=>setBusy(false));
 },[request,response,refresh]);

 async function logout(){
   setBusy(true);setError("");
   try{await disconnectCompanion();setAccount(null);}
   catch{setAccount(null);setError("Η τοπική αποσύνδεση ολοκληρώθηκε· έλεγξε ξανά τη σύνδεσή σου.");}
   finally{setBusy(false);}
 }
 return <ScrollView contentContainerStyle={styles.screen}>
  <Text style={styles.kicker}>KONTA MOY COMPANION · ANDROID</Text>
  <Text style={styles.title}>Ο λογαριασμός μου</Text>
  <Text style={styles.lead}>Παρακολούθησε παραγγελίες και παραλαβές, και δες τα αγαπημένα σου από τον ίδιο λογαριασμό KONTA MOY.</Text>
  {loading && <Text style={styles.info} accessibilityLiveRegion="polite">Φόρτωση λογαριασμού…</Text>}
  {error!=="" && <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>}
  {!loading && !account &&
    <View style={styles.card}>
      <Text style={styles.heading}>Σύνδεση στον λογαριασμό σου</Text>
      <Text style={styles.help}>Άνοιξε την ασφαλή σελίδα σύνδεσης KONTA MOY. Δεν εισάγεις κωδικό στην εφαρμογή: μετά την έγκρισή σου επιστρέφεις εδώ.</Text>
      <Pressable accessibilityRole="button" disabled={!request||busy}
        onPress={()=>void promptAsync()} style={[styles.primary,(!request||busy)&&styles.disabled]}>
        <Text style={styles.primaryLabel}>{busy?"Σύνδεση…":"Σύνδεση KONTA MOY"}</Text>
      </Pressable>
      <Text style={styles.note}>Η λειτουργία απαιτεί πρώτα την ενεργοποίηση της υπηρεσίας Android Companion. Καμία άδεια τοποθεσίας δεν απαιτείται για σύνδεση.</Text>
    </View>}
  {account && <>
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={{flex:1}}>
          <Text style={styles.heading}>Συνδεδεμένος λογαριασμός</Text>
          <Text style={styles.info}>{account.account.email}</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={()=>void logout()} disabled={busy}>
          <Text style={styles.logout}>Αποσύνδεση</Text>
        </Pressable>
      </View>
      <Pressable accessibilityRole="button" onPress={()=>void refresh()} disabled={busy} style={styles.outline}>
        <Text style={styles.outlineText}>Ανανέωση παραγγελιών & wishlist</Text>
      </Pressable>
    </View>
    <Link href="/notifications" asChild><Pressable accessibilityRole="button" style={styles.outline}>
      <Text style={styles.outlineText}>Ειδοποιήσεις Android · FCM →</Text>
    </Pressable></Link>
    <View style={styles.card}>
      <Text style={styles.heading}>Οι παραγγελίες μου</Text>
      {account.orders.length===0?<Text style={styles.help}>Δεν υπάρχουν ακόμη παραγγελίες.</Text>:
       account.orders.map(order=><View style={styles.order} key={order.id}>
        <Text style={styles.orderTitle}>{order.reference}</Text>
        <Text style={styles.info}>{orderStatus(order)} · {money(order.totalMinor,order.currency)}</Text>
        {order.hasPickup&&<Text style={styles.pickup}>
          {order.pickupReady?"Το κατάστημα έχει δηλώσει έτοιμη την παραλαβή σου.":"Περιλαμβάνει παραλαβή από κατάστημα"}
        </Text>}
        <Pressable accessibilityRole="link" onPress={()=>void Linking.openURL(`${WEBSITE}/account/orders/${encodeURIComponent(order.id)}`)}>
          <Text style={styles.link}>Λεπτομέρειες / ασφαλές QR ↗</Text>
        </Pressable>
       </View>)}
      <Link href="/pickups" asChild><Pressable accessibilityRole="button" style={styles.outline}>
       <Text style={styles.outlineText}>Κέντρο παραλαβών →</Text>
      </Pressable></Link>
    </View>
    <View style={styles.card}>
      <Text style={styles.heading}>Η Wishlist του λογαριασμού μου</Text>
      {account.savedProducts.length===0?<Text style={styles.help}>Δεν έχεις αποθηκευμένα προϊόντα.</Text>:
       account.savedProducts.slice(0,30).map(product=><View key={product.id} style={styles.saved}>
         <Text style={styles.orderTitle}>{product.title}</Text>
         <Pressable accessibilityRole="link"
          onPress={()=>void Linking.openURL(`${WEBSITE}/shop?q=${encodeURIComponent(product.title)}`)}>
          <Text style={styles.link}>Δες προϊόν ↗</Text>
         </Pressable>
       </View>)}
      <Link href="/lists" asChild><Pressable accessibilityRole="button" style={styles.outline}>
       <Text style={styles.outlineText}>Οι τοπικές μου λίστες →</Text>
      </Pressable></Link>
      <Text style={styles.note}>Η τοπική Android λίστα παραμένει ξεχωριστή από την ιστοσελίδα. Ο συγχρονισμός διπλών εγγραφών απαιτεί ξεχωριστό έλεγχο.</Text>
    </View>
  </>}
  <View style={styles.card}>
    <Text style={styles.heading}>Και μέσω ιστότοπου</Text>
    <Pressable accessibilityRole="link" onPress={()=>void Linking.openURL(WEBSITE+"/account")}>
      <Text style={styles.link}>Ρυθμίσεις, ιδιωτικότητα και ασφάλεια ↗</Text>
    </Pressable>
  </View>
 </ScrollView>;
}

const styles=StyleSheet.create({
 screen:{padding:22,paddingBottom:64,gap:18},
 kicker:{fontSize:11,fontWeight:"800",letterSpacing:2,color:theme.gold},
 title:{fontSize:31,fontWeight:"800",color:theme.green},
 lead:{fontSize:15,lineHeight:23,color:theme.muted},
 card:{backgroundColor:theme.white,padding:19,borderWidth:1,borderColor:theme.border,borderRadius:18,gap:13},
 cardHeader:{flexDirection:"row",alignItems:"center",gap:14},
 heading:{fontSize:20,fontWeight:"800",color:theme.ink},
 info:{fontSize:14,lineHeight:21,color:theme.muted},
 help:{fontSize:14,lineHeight:22,color:theme.muted},
 note:{fontSize:12,lineHeight:18,color:theme.muted},
 primary:{backgroundColor:theme.green,borderRadius:13,padding:16,alignItems:"center"},
 primaryLabel:{color:theme.white,fontSize:16,fontWeight:"800"},
 disabled:{opacity:0.55},
 outline:{padding:14,borderRadius:12,borderWidth:1,borderColor:theme.green,alignItems:"center"},
 outlineText:{color:theme.green,fontWeight:"700"},
 logout:{color:"#A3453A",fontWeight:"700"},
 order:{paddingVertical:12,borderBottomWidth:1,borderColor:theme.border,gap:5},
 orderTitle:{fontSize:15,color:theme.ink,fontWeight:"700"},
 pickup:{fontSize:13,color:theme.green,fontWeight:"700"},
 link:{color:theme.green,fontSize:14,fontWeight:"800",marginTop:3},
 saved:{paddingVertical:8,borderBottomWidth:1,borderColor:theme.border,gap:3},
 error:{fontSize:14,color:"#A3453A",lineHeight:20}
});
