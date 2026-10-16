import {Link,useFocusEffect} from "expo-router";
import {useCallback,useState} from "react";
import {ActivityIndicator,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from "react-native";
import {searchCompanionCatalog,type CompanionCatalogProduct} from "../lib/companion-catalog";
import {getItems,importAccountWishlist} from "../lib/companion-store";
import {openMarketplace} from "../lib/marketplace-navigation";
import {theme} from "../theme";

const SUGGESTIONS=["Παπούτσια","Καλλυντικά","Ρούχα","Εργαλεία","Αθλητικά"];
export default function NativeStorefront(){
 const [query,setQuery]=useState("");
 const [results,setResults]=useState<CompanionCatalogProduct[]>([]);
 const [saved,setSaved]=useState<Set<string>>(new Set());
 const [busy,setBusy]=useState(false);
 const [saving,setSaving]=useState<string|null>(null);
 const [notice,setNotice]=useState("");
 const refresh=useCallback(async()=>{
  try{const items=await getItems("wishlist");
    setSaved(new Set(items.filter(x=>x.variantId).map(x=>x.variantId as string)));
  }catch{/* Local offline wallet may still be initializing. */}
 },[]);
 useFocusEffect(useCallback(()=>{void refresh();},[refresh]));
 async function search(text=query){
  if(busy)return;
  setBusy(true);setNotice("");setResults([]);
  setQuery(text);
  try{
   const found=await searchCompanionCatalog(text);
   setResults(found);
   if(!found.length)setNotice("Δεν βρέθηκαν αποτελέσματα. Δοκίμασε άλλη λέξη ή άνοιξε τον πλήρη κατάλογο.");
  }catch(e){
   const code=e instanceof Error?e.message:"";
   setNotice(code==="INVALID_SEARCH"?"Γράψε τουλάχιστον δύο γράμματα για αναζήτηση.":
     code==="RATE_LIMITED"?"Έγιναν πολλές αναζητήσεις. Δοκίμασε λίγο αργότερα.":
     "Η αναζήτηση χρειάζεται internet. Οι offline λίστες σου παραμένουν διαθέσιμες.");
  }finally{setBusy(false);}
 }
 async function save(product:CompanionCatalogProduct){
  if(saving)return;
  setSaving(product.variantId);setNotice("");
  try{
   const inserted=await importAccountWishlist([{
    variantId:product.variantId,title:product.title
   }]);
   await refresh();
   setNotice(inserted?"Το προϊόν αποθηκεύτηκε στην offline wishlist με την ακριβή παραλλαγή του.":
    "Αυτό το προϊόν υπάρχει ήδη στην wishlist σου.");
  }catch{setNotice("Δεν ήταν δυνατή η αποθήκευση στη συσκευή.");}
  finally{setSaving(null);}
 }
 return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.screen}>
  <Text style={styles.kicker}>KONTA MOY · ΑΓΟΡΕΣ</Text>
  <Text style={styles.title}>Βρες αυτό που χρειάζεσαι.</Text>
  <Text style={styles.lead}>Αναζήτησε πραγματικά προϊόντα KONTA MOY και κράτησέ τα στη wishlist. Οι τιμές, η παράδοση και το απόθεμα επιβεβαιώνονται στον επίσημο κατάλογο.</Text>
  <View style={styles.searchCard}>
   <TextInput value={query} onChangeText={setQuery} maxLength={72}
     accessibilityLabel="Αναζήτηση προϊόντων"
     placeholder="Αναζήτηση προϊόντων, π.χ. αθλητικά"
     returnKeyType="search" onSubmitEditing={()=>void search()}
     style={styles.input}/>
   <Pressable accessibilityRole="button" disabled={busy||query.trim().length<2}
     onPress={()=>void search()} style={[styles.primary,(busy||query.trim().length<2)&&styles.disabled]}>
    <Text style={styles.primaryText}>{busy?"Αναζήτηση…":"Αναζήτηση στον κατάλογο"}</Text>
   </Pressable>
   <View style={styles.chips}>
    {SUGGESTIONS.map(term=><Pressable key={term} accessibilityRole="button"
       disabled={busy} onPress={()=>void search(term)} style={styles.chip}>
      <Text style={styles.chipText}>{term}</Text>
    </Pressable>)}
   </View>
  </View>
  {busy&&<ActivityIndicator color={theme.green} size="large" accessibilityLabel="Η αναζήτηση βρίσκεται σε εξέλιξη"/>}
  {notice!==""&&<Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>}
  {results.length>0&&<>
   <Text style={styles.section}>Πραγματικές παραλλαγές · {results.length}</Text>
   <Text style={styles.disclaimer}>Δεν πρόκειται για επιβεβαίωση διαθεσιμότητας ή προσφορά συγκεκριμένου καταστήματος.</Text>
   {results.map(product=><View key={product.variantId} style={styles.product}>
     <View style={styles.avatar}><Text style={styles.avatarText}>{(product.brand||product.title).slice(0,1).toUpperCase()}</Text></View>
     <View style={styles.productCopy}>
      <Text style={styles.productTitle}>{product.title}</Text>
      {product.brand!==""&&<Text style={styles.brand}>{product.brand}</Text>}
      <Text style={styles.meta}>Ελεγμένο αναγνωριστικό παραλλαγής</Text>
      <View style={styles.productActions}>
       <Pressable accessibilityRole="button" disabled={saving!==null}
          style={[styles.save,saved.has(product.variantId)&&styles.saved]}
          onPress={()=>void save(product)}>
         <Text style={styles.saveText}>{saved.has(product.variantId)?"✓ Στη wishlist":"♡ Αποθήκευση"}</Text>
       </Pressable>
       <Pressable accessibilityRole="link"
          onPress={()=>void openMarketplace({path:"/shop",query:{q:product.title}})}>
        <Text style={styles.openText}>Στο κατάστημα ↗</Text>
       </Pressable>
      </View>
     </View>
   </View>)}
  </>}
  <View style={styles.quick}>
   <Text style={styles.quickTitle}>Συνέχισε τις αγορές σου</Text>
   <Pressable accessibilityRole="link" style={styles.quickButton}
     onPress={()=>void openMarketplace({path:"/shop"})}>
      <Text style={styles.quickButtonText}>Πλήρης κατάλογος και προσφορές ↗</Text>
   </Pressable>
   <Link href="/stores" asChild><Pressable accessibilityRole="button" style={styles.quickButton}>
      <Text style={styles.quickButtonText}>Τοπικά καταστήματα →</Text>
   </Pressable></Link>
   <Link href="/basket" asChild><Pressable accessibilityRole="button" style={styles.quickButton}>
      <Text style={styles.quickButtonText}>Καλάθι & checkout →</Text>
   </Pressable></Link>
  </View>
  <Text style={styles.footnote}>Τα προϊόντα που προστίθενται εδώ φυλάσσονται στη συσκευή και δεν εισάγονται αυτόματα στο καλάθι αγοράς. Το checkout χρησιμοποιεί το πραγματικό καλάθι της ιστοσελίδας KONTA MOY.</Text>
 </ScrollView>;
}
const styles=StyleSheet.create({
 screen:{padding:20,gap:14,paddingBottom:35},
 kicker:{fontSize:11,color:theme.gold,letterSpacing:1.5,fontWeight:"800"},
 title:{fontSize:32,fontWeight:"800",color:theme.green,lineHeight:39},
 lead:{color:theme.muted,fontSize:14,lineHeight:22},
 searchCard:{padding:17,backgroundColor:theme.white,borderWidth:1,borderColor:theme.border,borderRadius:20,gap:12},
 input:{height:53,borderRadius:12,borderWidth:1,borderColor:theme.border,paddingHorizontal:13,fontSize:16,color:theme.ink},
 primary:{backgroundColor:theme.green,padding:15,borderRadius:12,alignItems:"center"},
 primaryText:{fontWeight:"800",color:theme.white,fontSize:15},
 disabled:{opacity:.5},
 chips:{flexDirection:"row",flexWrap:"wrap",gap:7},
 chip:{paddingVertical:9,paddingHorizontal:11,backgroundColor:theme.cream,borderRadius:20},
 chipText:{fontSize:12,color:theme.green,fontWeight:"700"},
 notice:{color:theme.ink,fontSize:13,lineHeight:20,paddingVertical:4},
 section:{fontSize:17,color:theme.ink,fontWeight:"800",marginTop:6},
 disclaimer:{fontSize:12,color:theme.muted,lineHeight:18},
 product:{padding:15,borderWidth:1,borderColor:theme.border,backgroundColor:theme.white,
     borderRadius:17,flexDirection:"row",gap:12},
 avatar:{height:47,width:47,borderRadius:12,backgroundColor:"#E6ECE6",
    alignItems:"center",justifyContent:"center"},
 avatarText:{fontWeight:"800",fontSize:22,color:theme.green},
 productCopy:{flex:1,gap:4},
 productTitle:{fontSize:15,fontWeight:"800",color:theme.ink,lineHeight:21},
 brand:{fontSize:12,color:theme.green,fontWeight:"700"},
 meta:{fontSize:11,color:theme.muted},
 productActions:{flexDirection:"row",flexWrap:"wrap",alignItems:"center",gap:12,marginTop:8},
 save:{paddingVertical:9,paddingHorizontal:10,borderRadius:10,backgroundColor:theme.green},
 saved:{backgroundColor:"#497263"},
 saveText:{fontWeight:"800",color:theme.white,fontSize:12},
 openText:{fontWeight:"700",color:theme.green,fontSize:12},
 quick:{borderRadius:17,borderWidth:1,borderColor:theme.border,
    backgroundColor:theme.white,padding:18,gap:11},
 quickTitle:{fontWeight:"800",fontSize:18,color:theme.ink},
 quickButton:{padding:12,borderRadius:11,borderWidth:1,borderColor:theme.border},
 quickButtonText:{color:theme.green,fontSize:14,fontWeight:"700"},
 footnote:{fontSize:11,color:theme.muted,lineHeight:18}
});
