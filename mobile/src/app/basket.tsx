import {Link,useFocusEffect} from "expo-router";
import {useCallback,useRef,useState} from "react";
import {ActivityIndicator,Alert,Pressable,ScrollView,StyleSheet,Text,View} from "react-native";
import {loadNativeCart,replaceNativeCart,cartItemsAfterChange,nextCartQuantity,type NativeCart,type NativeCartItem} from "../lib/companion-cart";
import {openMarketplace} from "../lib/marketplace-navigation";
import {theme} from "../theme";

function money(minor:number){
 return new Intl.NumberFormat("el-GR",{style:"currency",currency:"EUR"}).format(minor/100);
}
function errorText(code:string){
 return code==="CART_CHANGED"?"Το καλάθι ενημερώθηκε από άλλη συσκευή. Φορτώσαμε τη νέα έκδοση· δοκίμασε ξανά.":
  code==="LOGIN_REQUIRED"?"Συνδέσου στην εγγενή εφαρμογή για κοινό καλάθι με τον λογαριασμό σου.":
  code==="NOT_ENABLED"?"Το κοινό καλάθι Android δεν είναι ενεργό ακόμη σε αυτή την έκδοση.":
  code==="PRODUCT_UNAVAILABLE"?"Το προϊόν δεν είναι διαθέσιμο για αγορά. Έλεγξε τον κατάλογο και ανανέωσε το καλάθι.":
  code==="INVALID_QUANTITY"?"Η μέγιστη ποσότητα ανά προϊόν είναι 99.":
  "Δεν ήταν δυνατή η ασφαλής ενημέρωση του καλαθιού. Δεν άλλαξε η παραγγελία σου.";
}
export default function Basket(){
 const [cart,setCart]=useState<NativeCart|null>(null);
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [notice,setNotice]=useState("");
 const version=useRef(0);
 const refresh=useCallback(async(preserveNotice=false)=>{
  const current=++version.current;
  setLoading(true);
  try{const result=await loadNativeCart();if(current===version.current){setCart(result);if(!preserveNotice)setNotice("");}}
  catch(e){
   if(current===version.current){
    setCart(null);
    setNotice(errorText(e instanceof Error?e.message:""));
   }
  }finally{if(current===version.current)setLoading(false);}
 },[]);
 useFocusEffect(useCallback(()=>{
  void refresh();
  return()=>{version.current++;};
 },[refresh]));
 async function change(item:NativeCartItem,delta:number){
  if(!cart||busy)return;
  setBusy(true);setNotice("");
  try{
   const quantity=nextCartQuantity(cart.items,item.canonicalVariantId,delta);
   const next=cartItemsAfterChange(cart.items,item.canonicalVariantId,quantity);
   const result=await replaceNativeCart(cart,next);
   setCart(result);
   setNotice("Το κοινό καλάθι ενημερώθηκε.");
  }catch(e){
   const code=e instanceof Error?e.message:"";
   setNotice(errorText(code));
   if(code==="CART_CHANGED")await refresh(true);
  }finally{setBusy(false);}
 }
 function remove(item:NativeCartItem){
  Alert.alert("Αφαίρεση από καλάθι",`Να αφαιρεθεί το «${item.title}» από το κοινό καλάθι;`,[
   {text:"Άκυρο",style:"cancel"},
   {text:"Αφαίρεση",style:"destructive",onPress:()=>void change(item,-item.quantity)}
  ]);
 }
 async function checkout(){
  try{await openMarketplace({path:"/checkout"});}
  catch{setNotice("Δεν άνοιξε το ασφαλές checkout στον browser.");}
 }
 async function browserCart(){
  try{await openMarketplace({path:"/cart"});}
  catch{setNotice("Δεν άνοιξε το καλάθι στο KONTA MOY.");}
 }
 const subtotal=cart?.items.reduce((sum,item)=>sum+item.priceMinor*item.quantity,0)??0;
 const canCheckout=Boolean(cart&&cart.items.length&&cart.items.every(item=>item.available));
 return <ScrollView contentContainerStyle={styles.screen}>
  <Text style={styles.kicker}>KONTA MOY COMPANION · ΚΑΛΑΘΙ</Text>
  <Text style={styles.title}>Το καλάθι μου</Text>
  <Text style={styles.intro}>Τα προϊόντα σου αποθηκεύονται στο ίδιο καλάθι του λογαριασμού KONTA MOY. Η ολοκλήρωση της αγοράς χρησιμοποιεί το ασφαλές checkout.</Text>
  <View style={styles.header}>
   <Text style={styles.heading}>Κοινό καλάθι λογαριασμού</Text>
   <Pressable accessibilityRole="button" disabled={busy||loading}
     style={styles.refresh} onPress={()=>void refresh()}>
     <Text style={styles.link}>Ανανέωση</Text>
   </Pressable>
  </View>
  {(loading||busy)&&<ActivityIndicator color={theme.green} accessibilityLabel="Ενημέρωση καλαθιού"/>}
  {notice!==""&&<Text style={styles.notice} accessibilityLiveRegion="polite">{notice}</Text>}
  {cart===null&&!loading&&<View style={styles.card}>
    <Text style={styles.body}>Η offline λίστα αγορών σου παραμένει στη συσκευή. Το κοινό καλάθι απαιτεί ενεργή ασφαλή σύνδεση Android, διαφορετικά μπορείς να συνεχίσεις από τον ιστότοπο.</Text>
    <Link href="/account" asChild><Pressable style={styles.outline} accessibilityRole="button">
     <Text style={styles.outlineText}>Ο λογαριασμός μου →</Text>
    </Pressable></Link>
  </View>}
  {cart&&<>
   {cart.items.length===0?<View style={styles.card}>
    <Text style={styles.heading}>Το καλάθι είναι άδειο</Text>
    <Text style={styles.body}>Αναζήτησε πραγματικά προϊόντα και πρόσθεσέ τα απευθείας στο κοινό σου καλάθι.</Text>
    <Link href="/shop" asChild><Pressable style={styles.outline} accessibilityRole="button">
      <Text style={styles.outlineText}>Αναζήτηση προϊόντων →</Text>
    </Pressable></Link>
   </View>:<>
    {cart.items.map(item=><View key={item.canonicalVariantId} style={styles.card}>
      <Text style={styles.itemTitle}>{item.title}</Text>
      <Text style={styles.body}>{money(item.priceMinor)} / τεμ.</Text>
      <Text style={[styles.availability,!item.available&&styles.unavailable]}>{item.available?"Διαθεσιμότητα καταλόγου: πιθανή":"Απαιτείται νέα επιβεβαίωση αποθέματος"}</Text>
      <View style={styles.controls}>
       <Pressable accessibilityRole="button" accessibilityLabel={`Μείωση ποσότητας ${item.title}`}
        disabled={busy} onPress={()=>void change(item,-1)} style={styles.qtyButton}>
        <Text style={styles.qtyText}>−</Text>
       </Pressable>
       <Text style={styles.qty}>{item.quantity}</Text>
       <Pressable accessibilityRole="button" accessibilityLabel={`Αύξηση ποσότητας ${item.title}`}
        disabled={busy||item.quantity>=99} onPress={()=>void change(item,1)} style={styles.qtyButton}>
        <Text style={styles.qtyText}>+</Text>
       </Pressable>
       <Pressable accessibilityRole="button" disabled={busy} onPress={()=>remove(item)}>
        <Text style={styles.remove}>Αφαίρεση</Text>
       </Pressable>
      </View>
     </View>)}
    <View style={styles.summary}>
     <Text style={styles.summaryTitle}>Ενδεικτικό σύνολο προϊόντων</Text>
     <Text style={styles.total}>{money(subtotal)}</Text>
     <Text style={styles.body}>Οι τελικές τιμές, τυχόν ειδικές προσφορές, τα μεταφορικά και η πραγματική διαθεσιμότητα υπολογίζονται εκ νέου πριν από την πληρωμή.</Text>
    </View>
   </>}
  </>}
  <Pressable accessibilityRole="link" style={[styles.primary,!canCheckout&&styles.disabled]}
    disabled={!canCheckout||busy||loading} onPress={()=>void checkout()}>
    <Text style={styles.primaryText}>Συνέχεια στο ασφαλές checkout ↗</Text>
  </Pressable>
  <Pressable accessibilityRole="link" style={styles.outline} onPress={()=>void browserCart()}>
   <Text style={styles.outlineText}>Άνοιγμα καλαθιού στον ιστότοπο ↗</Text>
  </Pressable>
  <Link href="/shop" asChild><Pressable style={styles.outline} accessibilityRole="button">
   <Text style={styles.outlineText}>Συνέχεια αγορών →</Text>
  </Pressable></Link>
  <Text style={styles.note}>Χρησιμοποιεί το καλάθι του συνδεδεμένου λογαριασμού, όχι το ανώνυμο καλάθι άλλου browser. Για ολοκλήρωση αγοράς πρέπει να έχεις συνδεθεί στον ιστότοπο με τον ίδιο λογαριασμό. Δεν αποθηκεύουμε στοιχεία κάρτας, payment tokens ή QR στην εφαρμογή, και δεν δημιουργείται παραγγελία πριν από την επιβεβαίωση στο checkout.</Text>
 </ScrollView>;
}
const styles=StyleSheet.create({
 screen:{padding:20,gap:15,paddingBottom:42},
 kicker:{fontSize:11,color:theme.gold,letterSpacing:1.5,fontWeight:"800"},
 title:{fontSize:32,fontWeight:"800",color:theme.green,lineHeight:39},
 intro:{fontSize:14,lineHeight:22,color:theme.muted},
 heading:{color:theme.ink,fontWeight:"800",fontSize:17,flexShrink:1},
 header:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",gap:8},
 refresh:{padding:9,borderWidth:1,borderColor:theme.border,borderRadius:10},
 link:{color:theme.green,fontWeight:"800",fontSize:13},
 card:{backgroundColor:theme.white,borderWidth:1,borderColor:theme.border,borderRadius:17,padding:16,gap:10},
 itemTitle:{fontSize:16,color:theme.ink,fontWeight:"800"},
 body:{color:theme.muted,fontSize:13,lineHeight:20},
 availability:{color:theme.green,fontSize:12,fontWeight:"700"},
 unavailable:{color:"#A54536"},
 controls:{flexDirection:"row",alignItems:"center",gap:12,flexWrap:"wrap"},
 qtyButton:{padding:12,borderRadius:12,backgroundColor:theme.cream,minWidth:42,alignItems:"center"},
 qtyText:{fontSize:20,color:theme.green,fontWeight:"800"},
 qty:{fontSize:16,color:theme.ink,fontWeight:"800"},
 remove:{fontSize:13,fontWeight:"800",color:"#A54536",padding:8},
 summary:{backgroundColor:theme.white,borderWidth:1,borderColor:theme.border,borderRadius:18,padding:18,gap:9},
 summaryTitle:{fontSize:14,color:theme.muted,fontWeight:"700"},
 total:{fontSize:27,color:theme.ink,fontWeight:"800"},
 primary:{backgroundColor:theme.green,borderRadius:13,padding:16,alignItems:"center"},
 primaryText:{fontSize:15,fontWeight:"800",color:theme.white},
 disabled:{opacity:.48},
 outline:{borderWidth:1,borderColor:theme.green,padding:14,borderRadius:13,alignItems:"center"},
 outlineText:{fontSize:14,fontWeight:"800",color:theme.green},
 notice:{fontSize:13,color:theme.ink,lineHeight:20},
 note:{fontSize:12,color:theme.muted,lineHeight:19}
});
