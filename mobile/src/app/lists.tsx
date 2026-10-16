import { useFocusEffect } from "expo-router";
import { useCallback,useState } from "react";
import { Alert, Pressable,ScrollView,StyleSheet,Text,TextInput,View } from "react-native";
import {addItem,getItems,removeItem,setItemCompleted,importAccountWishlist,type ListItem,type ListKind} from "../lib/companion-store";
import {theme} from "../theme";
import {openMarketplace} from "../lib/marketplace-navigation";
import {searchCompanionCatalog,type CompanionCatalogProduct} from "../lib/companion-catalog";

export default function CompanionListsScreen(){
 const [kind,setKind]=useState<ListKind>("shopping");
 const [items,setItems]=useState<ListItem[]>([]);
 const [title,setTitle]=useState("");
 const [quantity,setQuantity]=useState("1");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [catalogQuery,setCatalogQuery]=useState("");
 const [catalogResults,setCatalogResults]=useState<CompanionCatalogProduct[]>([]);
 const [catalogSearching,setCatalogSearching]=useState(false);
 const [catalogNotice,setCatalogNotice]=useState("");
 const refresh=useCallback(async()=>{try{setItems(await getItems());}catch{setError("Δεν κατέστη δυνατή η φόρτωση των λιστών.");}},[]);
 useFocusEffect(useCallback(()=>{void refresh();},[refresh]));
 const visible=items.filter(i=>i.kind===kind);
 async function create(){
  if(busy)return;
  setBusy(true);setError("");
  try{
   await addItem(kind,title,Number(quantity));setTitle("");setQuantity("1");await refresh();
  }catch{setError("Συμπλήρωσε ένα όνομα και ποσότητα 1–99.");}
  finally{setBusy(false);}
 }
 async function toggle(item:ListItem){
  try{await setItemCompleted(item.id,!item.completed);await refresh();}
  catch{setError("Δεν αποθηκεύτηκε η αλλαγή.");}
 }
 async function searchCatalog(){
  if(catalogSearching||busy)return;
  setCatalogSearching(true);setCatalogResults([]);setCatalogNotice("");
  try{
   const products=await searchCompanionCatalog(catalogQuery);
   setCatalogResults(products);
   if(!products.length)setCatalogNotice("Δεν βρέθηκαν προϊόντα. Μπορείς να προσθέσεις μια ελεύθερη σημείωση.");
  }catch(e){
   const code=e instanceof Error?e.message:"";
   setCatalogNotice(code==="RATE_LIMITED"?"Έγιναν πολλοί έλεγχοι. Δοκίμασε σε λίγο.":
     code==="INVALID_SEARCH"?"Γράψε 2–72 χαρακτήρες για αναζήτηση.":
     "Η αναζήτηση καταλόγου δεν είναι διαθέσιμη. Η offline λίστα συνεχίζει να λειτουργεί.");
  }finally{setCatalogSearching(false);}
 }
 async function addCatalogProduct(product:CompanionCatalogProduct){
  if(busy)return;
  setBusy(true);setCatalogNotice("");
  try{
   const added=await importAccountWishlist([{variantId:product.variantId,title:product.title}]);
   await refresh();
   setCatalogNotice(added?"Το προϊόν προστέθηκε στη wishlist με το ακριβές αναγνωριστικό καταλόγου.":"Αυτό το προϊόν υπάρχει ήδη στη wishlist.");
  }catch{setCatalogNotice("Δεν έγινε η αποθήκευση στη συσκευή.");}
  finally{setBusy(false);}
 }
 function confirmRemove(item:ListItem){
  Alert.alert("Αφαίρεση",`Να αφαιρεθεί το «${item.title}»;`,[
   {text:"Άκυρο",style:"cancel"},
   {text:"Αφαίρεση",style:"destructive",onPress:()=>void removeItem(item.id).then(refresh).catch(()=>setError("Δεν ολοκληρώθηκε η αφαίρεση."))}
  ]);
 }
 return <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
  <Text style={styles.kicker}>KONTA MOY COMPANION</Text>
  <Text style={styles.title}>Οι λίστες μου</Text>
  <Text style={styles.sub}>Οργάνωσε όσα θέλεις να αγοράσεις. Οι λίστες αποθηκεύονται στη συσκευή σου και δεν κοινοποιούνται σε καταστήματα.</Text>
  <View style={styles.tabs}>
   {([["shopping","Λίστα αγορών"],["wishlist","Wishlist"]] as const).map(([key,label])=>
    <Pressable key={key} accessibilityRole="button" accessibilityState={{selected:kind===key}} onPress={()=>setKind(key)} style={[styles.tab,kind===key&&styles.tabActive]}>
     <Text style={[styles.tabLabel,kind===key&&styles.tabLabelActive]}>{label}</Text>
    </Pressable>)}
  </View>
  <View style={styles.card}>
   <Text style={styles.heading}>{kind==="shopping"?"Πρόσθεσε κάτι στη λίστα":"Τι θέλεις να αποκτήσεις;"}</Text>
   <TextInput placeholder="π.χ. Παπούτσια για τρέξιμο" value={title} onChangeText={setTitle} maxLength={120} style={styles.input}
    accessibilityLabel="Όνομα προϊόντος"/>
   <View style={styles.addRow}>
    <TextInput value={quantity} onChangeText={setQuantity} keyboardType="number-pad" maxLength={2} style={[styles.input,styles.quantity]} accessibilityLabel="Ποσότητα"/>
    <Pressable accessibilityRole="button" onPress={()=>void create()} disabled={busy||title.trim().length<2} style={[styles.add,busy&&{opacity:.6}]}>
     <Text style={styles.addText}>+ Προσθήκη</Text>
    </Pressable>
   </View>
  </View>
  {kind==="wishlist" && <View style={styles.card}>
    <Text style={styles.heading}>Αναζήτηση πραγματικών προϊόντων KONTA MOY</Text>
    <Text style={styles.sub}>Διάλεξε συγκεκριμένη παραλλαγή από τον κατάλογο. Η τιμή και η διαθεσιμότητα ελέγχονται χωριστά.</Text>
    <TextInput placeholder="π.χ. παπούτσια τρεξίματος" value={catalogQuery}
      onChangeText={setCatalogQuery} style={styles.input} maxLength={72}
      autoCapitalize="none" returnKeyType="search" onSubmitEditing={()=>void searchCatalog()}
      accessibilityLabel="Αναζήτηση καταλόγου KONTA MOY"/>
    <Pressable accessibilityRole="button" disabled={catalogSearching||busy||catalogQuery.trim().length<2}
      onPress={()=>void searchCatalog()} style={[styles.add,(catalogSearching||busy)&&{opacity:.6}]}>
      <Text style={styles.addText}>{catalogSearching?"Αναζήτηση…":"Αναζήτηση στον κατάλογο"}</Text>
    </Pressable>
    {catalogNotice!==""&&<Text style={styles.sub} accessibilityLiveRegion="polite">{catalogNotice}</Text>}
    {catalogResults.map(product=><View key={product.variantId} style={styles.catalogProduct}>
      <View style={{flex:1,gap:4}}>
        <Text style={styles.itemTitle}>{product.title}</Text>
        {product.brand!==""&&<Text style={styles.itemMeta}>{product.brand}</Text>}
        <Text style={styles.itemMeta}>Διαθεσιμότητα: έλεγχος στον ιστότοπο</Text>
      </View>
      <Pressable accessibilityRole="button" disabled={busy}
        accessibilityLabel={`Προσθήκη ${product.title} στη wishlist`}
        onPress={()=>void addCatalogProduct(product)}
        style={[styles.catalogSave,busy&&{opacity:.6}]}>
        <Text style={styles.catalogSaveText}>+ Wishlist</Text>
      </Pressable>
    </View>)}
  </View>}
  {error?<Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>:null}
  <Text style={styles.count}>{visible.filter(i=>!i.completed).length} εκκρεμή · {visible.length} συνολικά</Text>
  <View style={styles.list}>
   {visible.length===0?<View style={styles.empty}><Text style={styles.emptyTitle}>Η λίστα είναι ακόμη άδεια.</Text><Text style={styles.sub}>Πρόσθεσε το πρώτο σου προϊόν.</Text></View>:
    visible.map(item=><View key={item.id} style={styles.item}>
     <Pressable accessibilityRole="checkbox" accessibilityState={{checked:item.completed}} style={styles.itemPrimary} onPress={()=>void toggle(item)}>
      <Text style={styles.check}>{item.completed?"☑":"☐"}</Text>
      <View style={{flex:1}}><Text style={[styles.itemTitle,item.completed&&styles.completed]}>{item.title}</Text>
        <Text style={styles.itemMeta}>Ποσότητα: {item.quantity}</Text>
      {item.variantId&&<Pressable accessibilityRole="link"
        onPress={()=>void openMarketplace({path:"/product/"+item.variantId})}>
        <Text style={styles.catalogLink}>Δες το ακριβές προϊόν ↗</Text>
      </Pressable>}</View>
     </Pressable>
     <Pressable accessibilityRole="button" accessibilityLabel={`Αφαίρεση ${item.title}`} onPress={()=>confirmRemove(item)} style={styles.delete}><Text style={styles.deleteText}>×</Text></Pressable>
    </View>)
   }
  </View>
  <Text style={styles.note}>Η τοπική λίστα είναι ξεχωριστή από την υπάρχουσα wishlist του λογαριασμού σου μέχρι να ολοκληρωθεί η ασφαλής σύνδεση και ο συγχρονισμός. Οι υπενθυμίσεις για πραγματικά διαθέσιμα είδη θα απαιτούν επιβεβαιωμένο σημείο πώλησης.</Text>
 </ScrollView>;
}
const styles=StyleSheet.create({
 screen:{padding:22,gap:18,paddingBottom:60},
 kicker:{color:theme.gold,fontSize:11,letterSpacing:2,fontWeight:"800"},
 title:{color:theme.green,fontSize:34,fontWeight:"800"},
 sub:{color:theme.muted,fontSize:14,lineHeight:22},
 tabs:{backgroundColor:"#E6ECE6",padding:5,flexDirection:"row",borderRadius:15},
 tab:{flex:1,padding:13,borderRadius:12,alignItems:"center"},
 tabActive:{backgroundColor:theme.white},
 tabLabel:{color:theme.muted,fontWeight:"700"},
 tabLabelActive:{color:theme.green},
 card:{backgroundColor:theme.white,borderRadius:18,padding:18,gap:12,borderWidth:1,borderColor:theme.border},
 heading:{fontSize:18,color:theme.ink,fontWeight:"800"},
 input:{height:50,borderWidth:1,borderColor:theme.border,borderRadius:12,paddingHorizontal:14,fontSize:16,color:theme.ink,backgroundColor:theme.white},
 addRow:{flexDirection:"row",gap:10},
 quantity:{width:75},
 add:{flex:1,backgroundColor:theme.green,padding:14,borderRadius:12,alignItems:"center",justifyContent:"center"},
 addText:{color:theme.white,fontWeight:"800"},
 count:{fontSize:14,color:theme.muted,fontWeight:"700"},
 list:{gap:10},
 item:{backgroundColor:theme.white,borderRadius:15,borderWidth:1,borderColor:theme.border,flexDirection:"row",alignItems:"center"},
 itemPrimary:{flex:1,flexDirection:"row",alignItems:"center",gap:13,padding:15},
 check:{fontSize:28,color:theme.green},
 itemTitle:{fontSize:16,fontWeight:"700",color:theme.ink},
 completed:{textDecorationLine:"line-through",color:theme.muted},
 itemMeta:{fontSize:12,color:theme.muted,marginTop:4},
 delete:{padding:16},
 deleteText:{fontSize:24,color:"#A54536"},
 empty:{padding:22,backgroundColor:theme.white,borderRadius:15},
 emptyTitle:{color:theme.green,fontWeight:"700",fontSize:17},
 catalogProduct:{flexDirection:"row",alignItems:"center",paddingVertical:10,gap:9,borderTopWidth:1,borderTopColor:theme.border},
 catalogSave:{borderRadius:10,paddingVertical:11,paddingHorizontal:12,backgroundColor:theme.green},
 catalogSaveText:{color:theme.white,fontWeight:"800",fontSize:12},
 catalogLink:{fontSize:12,color:theme.green,fontWeight:"700",marginTop:6},
 note:{fontSize:12,lineHeight:19,color:theme.muted},
 error:{color:"#A54536"}
});
