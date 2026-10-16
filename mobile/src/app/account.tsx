import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import Constants from "expo-constants";
import {Link,useFocusEffect} from "expo-router";
import {useCallback,useEffect,useRef,useState} from "react";
import {Alert,Linking,Pressable,ScrollView,StyleSheet,Text,View} from "react-native";
import {
  connectCompanion,disconnectCompanion,loadCompanionAccount,companionAuthorizedRequest,
  type CompanionAccount,type CompanionOrder
} from "../lib/companion-session";
import {theme} from "../theme";
import {validCanonicalPublicId} from "../lib/canonical-id";
import {clearCompanionLocalData,importAccountWishlist,getItems} from "../lib/companion-store";
import {orderStatusText,pickupBadge,pickupOrderPath} from "../lib/pickup-model";
import {openMarketplace} from "../lib/marketplace-navigation";

WebBrowser.maybeCompleteAuthSession();
const REDIRECT="kontamoucompanion://auth";
const discovery={authorizationEndpoint:"https://kontamou.site/account/companion-connect"};
const WEBSITE="https://kontamou.site";
const PREVIEW=Constants.expoConfig?.extra?.companionPreview===true;

function money(minor:number,currency:string){
 try{return new Intl.NumberFormat("el-GR",{style:"currency",currency:currency||"EUR"}).format(minor/100);}
 catch{return (minor/100).toFixed(2)+" €";}
}

export default function CompanionAccountScreen(){
 const [account,setAccount]=useState<CompanionAccount|null>(null);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [importNotice,setImportNotice]=useState("");
 const consumed=useRef("");
 const requestVersion=useRef(0);
 const [request,response,promptAsync]=AuthSession.useAuthRequest({
   clientId:"kontamou-companion-android",
   redirectUri:REDIRECT,
   responseType:AuthSession.ResponseType.Code,
   usePKCE:true,
 },discovery);

 const refresh=useCallback(async()=>{
   const version=++requestVersion.current;
   setLoading(true);
   try{
     const snapshot=await loadCompanionAccount();
     if(version===requestVersion.current){setAccount(snapshot);setError("");}
   }catch{
     if(version===requestVersion.current){
       setAccount(null);
       setError("Δεν έγινε ο συγχρονισμός. Έλεγξε τη σύνδεση και προσπάθησε ξανά.");
     }
   }finally{
     if(version===requestVersion.current)setLoading(false);
   }
 },[]);
 useFocusEffect(useCallback(()=>{
   void refresh();
   return()=>{requestVersion.current++;};
 },[refresh]));

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

 async function importWishlist(){
   if(!account ||busy)return;
   setBusy(true);
   try {
     const count=await importAccountWishlist(account.savedProducts);
     setImportNotice(count?`Προστέθηκαν ${count} νέα είδη στην offline wishlist σου.`:"Όλα τα είδη υπάρχουν ήδη στην τοπική wishlist σου.");
   }catch{setImportNotice("Η εισαγωγή απέτυχε. Τα αποθηκευμένα είδη στον λογαριασμό δεν άλλαξαν.");}
   finally{setBusy(false);}
 }
 async function uploadWishlist(){
   if(!account||busy)return;
   setBusy(true);setImportNotice("");
   try{
     const local=await getItems("wishlist");
     const ids=[...new Set(local.filter(x=>!x.completed && x.variantId
       && validCanonicalPublicId(x.variantId))
       .map(x=>x.variantId as string))].slice(0,50);
     if(!ids.length){
       setImportNotice("Δεν υπάρχουν στην τοπική wishlist επιβεβαιωμένα είδη KONTA MOY για συγχρονισμό.");
       return;
     }
     const outcome=await companionAuthorizedRequest<{added:number;submitted:number;skipped:number}>(
       "/wishlist/import","POST",{variantIds:ids}
     );
     setImportNotice(outcome.added
       ? `Αποθηκεύτηκαν ${outcome.added} νέα είδη στο λογαριασμό σου. ${outcome.skipped} ήταν ήδη αποθηκευμένα ή μη επιλέξιμα.`
       : "Δεν προστέθηκαν νέα είδη: υπάρχουν ήδη ή δεν είναι διαθέσιμα στον κατάλογο.");
     setAccount(await loadCompanionAccount());
   }catch{
     setImportNotice("Δεν ολοκληρώθηκε ο συγχρονισμός στον λογαριασμό.");
   }finally{setBusy(false);}
 }
 async function logout(){
   requestVersion.current++;
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
      <Pressable accessibilityRole="button" disabled={!request||busy||PREVIEW}
        onPress={()=>void promptAsync()} style={[styles.primary,(!request||busy)&&styles.disabled]}>
        <Text style={styles.primaryLabel}>{PREVIEW?"Σύνδεση μέσω browser στην πιλοτική έκδοση":busy?"Σύνδεση…":"Σύνδεση KONTA MOY"}</Text>
      </Pressable>
      <Pressable accessibilityRole="link" style={styles.outline}
        onPress={()=>void Linking.openURL(WEBSITE+"/account")}>
        <Text style={styles.outlineText}>Άνοιγμα λογαριασμού στον ιστότοπο ↗</Text>
      </Pressable>
      <Text style={styles.note}>Μέχρι την ενεργοποίηση της εγγενούς σύνδεσης Companion, μπορείς να χρησιμοποιείς τον υπάρχοντα λογαριασμό KONTA MOY μέσω browser. Η πρόσβαση στο browser δεν μεταφέρει cookies στην εφαρμογή.</Text>
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
       account.orders.slice(0,5).map(order=><View style={styles.order} key={order.id}>
        <Text style={styles.orderTitle}>{order.reference}</Text>
        <Text style={styles.info}>{orderStatusText(order)} · {money(order.totalMinor,order.currency)}</Text>
        {order.hasPickup&&<Text style={styles.pickup}>
          {pickupBadge(order)==="ready"?"Το κατάστημα έχει δηλώσει έτοιμη την παραλαβή σου.":"Περιλαμβάνει παραλαβή από κατάστημα"}
        </Text>}
        <Pressable accessibilityRole="link" onPress={()=>void openMarketplace({path:pickupOrderPath(order.id)}).catch(()=>setError("Δεν άνοιξε η ασφαλής παραγγελία."))}>
          <Text style={styles.link}>Λεπτομέρειες / ασφαλές QR ↗</Text>
        </Pressable>
       </View>)}
      <Link href="/orders" asChild><Pressable accessibilityRole="button" style={styles.outline}>
       <Text style={styles.outlineText}>Όλες οι παραγγελίες · φίλτρα & καταστάσεις →</Text>
      </Pressable></Link>
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
      <Pressable accessibilityRole="button" disabled={busy||account.savedProducts.length===0}
        onPress={()=>void importWishlist()} style={[styles.outline,(busy||!account.savedProducts.length)&&styles.disabled]}>
        <Text style={styles.outlineText}>Εισαγωγή wishlist στον Android Companion</Text>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={busy}
        onPress={()=>void uploadWishlist()} style={[styles.outline,busy&&styles.disabled]}>
        <Text style={styles.outlineText}>Αποθήκευση Android wishlist στον λογαριασμό →</Text>
      </Pressable>
      {importNotice!==""&&<Text style={styles.info} accessibilityLiveRegion="polite">{importNotice}</Text>}
      <Link href="/lists" asChild><Pressable accessibilityRole="button" style={styles.outline}>
       <Text style={styles.outlineText}>Οι τοπικές μου λίστες →</Text>
      </Pressable></Link>
      <Text style={styles.note}>Οι δύο ενέργειες αντιγράφουν μόνο επιβεβαιωμένα προϊόντα χωρίς διαγραφές. Ελεύθερες σημειώσεις λίστας παραμένουν ιδιωτικές στη συσκευή.</Text>
    </View>
  </>}
  <View style={styles.card}>
    <Text style={styles.heading}>Δεδομένα αποθηκευμένα σε αυτό το τηλέφωνο</Text>
    <Text style={styles.help}>Διαγράφει μόνο τις offline λίστες, τις τοπικές υπενθυμίσεις και τις προτιμήσεις αυτής της συσκευής. Τα αγαπημένα, οι παραγγελίες και ο λογαριασμός σου στον ιστότοπο δεν επηρεάζονται.</Text>
    <Pressable accessibilityRole="button" disabled={busy} style={styles.outline}
      onPress={()=>Alert.alert("Διαγραφή τοπικών δεδομένων",
       "Να διαγραφούν οι λίστες και οι προτιμήσεις μόνο από το Android Companion;",
       [{text:"Ακύρωση",style:"cancel"},
        {text:"Διαγραφή",style:"destructive",onPress:()=>void clearCompanionLocalData()
           .then(()=>Alert.alert("Ολοκληρώθηκε","Τα τοπικά δεδομένα διαγράφηκαν."))
           .catch(()=>Alert.alert("Σφάλμα","Η διαγραφή τοπικών δεδομένων απέτυχε."))}])}>
      <Text style={styles.logout}>Διαγραφή τοπικών λιστών και ρυθμίσεων</Text>
    </Pressable>
  </View>
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
