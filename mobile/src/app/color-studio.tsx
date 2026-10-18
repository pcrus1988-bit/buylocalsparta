import {useLocalSearchParams,useRouter} from "expo-router";
import {useCallback,useEffect,useRef,useState} from "react";
import {ActivityIndicator,Image,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from "react-native";
import {COLOR_PRESETS,hexToHsv,normalizeColorHex,studioForKey,tuneColor,type ColorStudioKey} from "../lib/color-studios";
import {fetchColorStudioMatches,studioImageUrl,type ColorStudioProduct} from "../lib/color-studio-catalog";
import {addCatalogItem} from "../lib/companion-store";
import {addNativeCartVariant} from "../lib/companion-cart";
import {openMarketplace} from "../lib/marketplace-navigation";
import {theme} from "../theme";

function money(value:number){return new Intl.NumberFormat("el-GR",{style:"currency",currency:"EUR"}).format(value/100);}
function precisionText(value:ColorStudioProduct["profilePrecision"]){
 return value==="exact"?"Τεκμηριωμένη απόχρωση":value==="canonicalized"?"Χρωματική αντιστοίχιση":
 value==="family_estimate"?"Εκτίμηση χρωματικής οικογένειας":"Απόχρωση καταλόγου";
}
export default function NativeColorStudio(){
 const params=useLocalSearchParams<{studio?:string;color?:string}>();
 const studio=studioForKey(params.studio);
 const router=useRouter();
 const [hex,setHex]=useState(studio?.defaultHex??"#B52E2E");
 const [hexDraft,setHexDraft]=useState(studio?.defaultHex??"#B52E2E");
 const [results,setResults]=useState<ColorStudioProduct[]>([]);
 const [loading,setLoading]=useState(false);
 const [notice,setNotice]=useState("");
 const [busyId,setBusyId]=useState<string|null>(null);
 const requestId=useRef(0);

 const run=useCallback(async(key:ColorStudioKey,color:string)=>{
  const request=++requestId.current;
  setLoading(true);setResults([]);setNotice("");
  try{
   const response=await fetchColorStudioMatches(key,color);
   if(request!==requestId.current)return;
   setResults(response.products);
   if(!response.products.length)
    setNotice(response.degraded
     ?"Ο κατάλογος χρωμάτων δεν είναι διαθέσιμος αυτή τη στιγμή. Δοκίμασε την πλήρη έκδοση."
     :"Δεν βρέθηκαν προϊόντα με τεκμηριωμένο κοντινό χρώμα. Δοκίμασε άλλη απόχρωση.");
  }catch{
   if(request===requestId.current)setNotice("Δεν φορτώθηκαν οι αντιστοιχίσεις. Έλεγξε τη σύνδεσή σου.");
  }finally{if(request===requestId.current)setLoading(false);}
 },[]);
 useEffect(()=>{
  const initial=normalizeColorHex(params.color)??studio?.defaultHex??"#B52E2E";
  setHex(initial);setHexDraft(initial);
  if(studio)void run(studio.key,initial);
  return()=>{requestId.current++;};
 },[studio?.key,params.color,run]);
 function setColor(next:string){
  const value=normalizeColorHex(next);
  if(!value)return;
  setHex(value);setHexDraft(value);
  requestId.current++;setLoading(false);setResults([]);setNotice("");
 }
 function updateHex(){
  const color=normalizeColorHex(hexDraft);
  if(!color){setNotice("Χρησιμοποίησε κωδικό HEX όπως #B52E2E.");return;}
  setColor(color);
 }
 async function saveWish(product:ColorStudioProduct){
  if(busyId)return;
  setBusyId(product.variantId);
  try{await addCatalogItem("wishlist",product);
   setNotice("Το προϊόν αποθηκεύτηκε στην offline wishlist.");}
  catch{setNotice("Δεν αποθηκεύτηκε το προϊόν στη wishlist.");}
  finally{setBusyId(null);}
 }
 async function addBasket(product:ColorStudioProduct){
  if(busyId)return;
  setBusyId(product.variantId);
  try{await addNativeCartVariant(product.variantId);
   setNotice("Το προϊόν προστέθηκε στο κοινό καλάθι του λογαριασμού σου.");}
  catch(e){const error=e instanceof Error?e.message:"";
   setNotice(error==="NOT_ENABLED"?"Το καλάθι Android δεν είναι ενεργό ακόμη. Άνοιξε το προϊόν στον ιστότοπο.":
    error==="LOGIN_REQUIRED"?"Συνδέσου στο Companion για κοινό καλάθι.":
    "Δεν προστέθηκε στο καλάθι. Μπορείς να συνεχίσεις από τον ιστότοπο.");}
  finally{setBusyId(null);}
 }
 async function openPhoto(){
  if(!studio)return;
  try{await openMarketplace({path:"/color-finder",query:{
    category:studio.categoryCode,color:hex
  }});}catch{setNotice("Δεν άνοιξε το Photo Color Picker του KONTA MOY.");}
 }
 if(!studio)return <View style={styles.root}><Text style={styles.title}>Studio μη διαθέσιμο</Text>
  <Pressable onPress={()=>router.replace("/color-studios")} style={styles.outline}>
   <Text style={styles.link}>Πίσω στα Studios →</Text></Pressable></View>;
 const hsv=hexToHsv(hex);
 return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.root}>
  <Pressable accessibilityRole="button" onPress={()=>router.push("/color-studios")}>
   <Text style={styles.link}>← Όλα τα Color Studios</Text>
  </Pressable>
  <Text style={styles.eyebrow}>KONTA MOY · {studio.english}</Text>
  <Text style={styles.title}>{studio.title}</Text>
  <Text style={styles.intro}>{studio.description}. Διάλεξε απόχρωση και ανακάλυψε πραγματικές αντιστοιχίσεις χρώματος στον κατάλογό μας.</Text>
  <View style={styles.board}>
   <Text style={styles.sectionTitle}>Η επιλεγμένη απόχρωση</Text>
   <View style={[styles.bigSwatch,{backgroundColor:hex}]} accessibilityLabel={"Επιλεγμένο χρώμα "+hex}/>
   <View style={styles.hexRow}>
    <TextInput value={hexDraft} onChangeText={setHexDraft}
      accessibilityLabel="Κωδικός χρώματος HEX" autoCapitalize="characters" maxLength={7}
      style={styles.hexInput} placeholder="#B52E2E"/>
    <Pressable accessibilityRole="button" onPress={updateHex} style={styles.smallPrimary}>
     <Text style={styles.primaryText}>Εφαρμογή</Text>
    </Pressable>
   </View>
   <Text style={styles.caption}>HEX {hex} · H {Math.round(hsv.h)}° · S {Math.round(hsv.s)}% · V {Math.round(hsv.v)}%</Text>
   <Text style={styles.sectionTitle}>Τοίχος αποχρώσεων</Text>
   <View style={styles.palette}>
    {COLOR_PRESETS.map(p=><Pressable key={p.hex}
       accessibilityRole="button" accessibilityLabel={p.label+" "+p.hex}
       accessibilityState={{selected:p.hex===hex}}
       onPress={()=>setColor(p.hex)}
       style={[styles.paletteItem,{borderColor:p.hex===hex?theme.green:theme.border}]}>
       <View style={[styles.palettePaint,{backgroundColor:p.hex}]}/>
       <Text style={styles.paletteLabel}>{p.label}</Text>
      </Pressable>)}
   </View>
   <Text style={styles.sectionTitle}>Λεπτή ρύθμιση</Text>
   {([
    ["h","Απόχρωση",10],["s","Κορεσμός",10],["v","Φωτεινότητα",10]
   ] as const).map(([channel,label,step])=><View key={channel} style={styles.adjustRow}>
    <Text style={styles.adjustLabel}>{label}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={"Μείωση "+label}
     onPress={()=>setColor(tuneColor(hex,channel,-step))} style={styles.step}>
     <Text style={styles.stepText}>−</Text></Pressable>
    <Text style={styles.adjustValue}>{Math.round(hsv[channel])}{channel==="h"?"°":"%"}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={"Αύξηση "+label}
     onPress={()=>setColor(tuneColor(hex,channel,step))} style={styles.step}>
     <Text style={styles.stepText}>＋</Text></Pressable>
   </View>)}
   <Pressable accessibilityRole="button" onPress={()=>void openPhoto()} style={styles.outline}>
    <Text style={styles.link}>◎ Πάρε χρώμα από φωτογραφία ↗</Text>
   </Pressable>
   <Text style={styles.caption}>Η επιλογή από φωτογραφία χρησιμοποιεί το υπάρχον ιδιωτικό Photo Color Picker του KONTA MOY μέσω ασφαλούς browser. Η φωτογραφία δεν μεταφέρεται στο Companion.</Text>
   <Pressable accessibilityRole="button" onPress={()=>void run(studio.key,hex)}
      disabled={loading} style={[styles.primary,loading&&styles.disabled]}>
    <Text style={styles.primaryText}>{loading?"Αναζήτηση…":"Βρες πραγματικά προϊόντα στο χρώμα μου →"}</Text>
   </Pressable>
  </View>
  {loading&&<ActivityIndicator color={theme.green} size="large"/>}
  {notice!==""&&<Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>}
  <View style={styles.resultsHeader}>
   <Text style={styles.sectionTitle}>Αντιστοιχίσεις καταλόγου</Text>
   <Text style={styles.count}>{results.length} προϊόντα</Text>
  </View>
  <Text style={styles.caption}>Κατάταξη με βάση τη χρωματική εγγύτητα του Color Finder. Οι εκτιμώμενες αποχρώσεις επισημαίνονται. Τιμές και αποθέματα επιβεβαιώνονται πριν την αγορά.</Text>
  {results.map(product=><View style={styles.product} key={product.variantId}>
   <View style={styles.productTop}>
    {studioImageUrl(product.imagePath)
     ?<Image source={{uri:studioImageUrl(product.imagePath)!}} style={styles.productImage} resizeMode="contain"/>
     :<View style={[styles.productImage,{backgroundColor:product.colorHex}]}/>}
    <View style={styles.productInfo}>
     <Text style={styles.productTitle}>{product.title}</Text>
     {product.brand!==""&&<Text style={styles.brand}>{product.brand}</Text>}
     <Text style={styles.productMeta}>{precisionText(product.profilePrecision)}</Text>
     <View style={styles.colorRow}>
      <View style={[styles.dot,{backgroundColor:product.colorHex}]}/>
      <Text style={styles.caption}>{product.colorLabel} · {product.colorHex}</Text>
     </View>
     <Text style={styles.price}>{money(product.priceMinor)}</Text>
    </View>
   </View>
   <View style={styles.productActions}>
    <Pressable disabled={busyId!==null} onPress={()=>void saveWish(product)} style={styles.lightButton}>
     <Text style={styles.link}>♡ Wishlist</Text></Pressable>
    <Pressable disabled={busyId!==null} onPress={()=>void addBasket(product)} style={styles.lightButton}>
     <Text style={styles.link}>＋ Καλάθι</Text></Pressable>
    <Pressable onPress={()=>void openMarketplace({path:"/product/"+product.variantId}).catch(()=>setNotice("Δεν άνοιξε το προϊόν."))} style={styles.lightButton}>
     <Text style={styles.link}>Δες προϊόν ↗</Text></Pressable>
   </View>
  </View>)}
 </ScrollView>;
}
const styles=StyleSheet.create({
 root:{padding:19,gap:14,paddingBottom:44},
 eyebrow:{fontSize:11,color:theme.gold,fontWeight:"800",letterSpacing:1.2},
 title:{fontSize:32,color:theme.green,fontWeight:"900"},
 intro:{fontSize:14,lineHeight:22,color:theme.muted},
 link:{color:theme.green,fontWeight:"800",fontSize:13},
 board:{padding:16,borderRadius:20,backgroundColor:theme.white,borderWidth:1,borderColor:theme.border,gap:13},
 sectionTitle:{fontSize:17,fontWeight:"800",color:theme.ink},
 bigSwatch:{height:143,borderRadius:14,borderWidth:1,borderColor:theme.border},
 hexRow:{flexDirection:"row",gap:8},hexInput:{flex:1,borderColor:theme.border,borderWidth:1,borderRadius:11,padding:10,fontSize:16,color:theme.ink},
 smallPrimary:{backgroundColor:theme.green,padding:12,borderRadius:10,justifyContent:"center"},
 primary:{backgroundColor:theme.green,padding:16,borderRadius:13,alignItems:"center"},
 primaryText:{color:theme.white,fontWeight:"800",fontSize:14},
 disabled:{opacity:.5},
 caption:{fontSize:11,color:theme.muted,lineHeight:17},
 palette:{flexDirection:"row",flexWrap:"wrap",gap:9},
 paletteItem:{alignItems:"center",width:"22%",padding:5,borderWidth:2,borderRadius:11,gap:5},
 palettePaint:{width:"100%",height:44,borderRadius:8},
 paletteLabel:{fontSize:10,color:theme.ink},
 adjustRow:{flexDirection:"row",alignItems:"center",gap:9},
 adjustLabel:{fontSize:13,color:theme.ink,fontWeight:"700",flex:1},
 adjustValue:{width:48,textAlign:"center",fontSize:13,color:theme.ink,fontWeight:"800"},
 step:{width:42,height:38,borderWidth:1,borderColor:theme.border,backgroundColor:theme.cream,borderRadius:11,alignItems:"center",justifyContent:"center"},
 stepText:{fontWeight:"900",fontSize:19,color:theme.green},
 outline:{borderColor:theme.green,borderWidth:1,borderRadius:12,padding:13,alignItems:"center"},
 notice:{fontSize:13,color:theme.ink,lineHeight:20},
 resultsHeader:{flexDirection:"row",alignItems:"center",justifyContent:"space-between"},
 count:{color:theme.muted,fontSize:12},
 product:{padding:13,borderRadius:17,backgroundColor:theme.white,borderWidth:1,borderColor:theme.border,gap:13},
 productTop:{flexDirection:"row",gap:12},
 productImage:{height:96,width:96,borderRadius:11,backgroundColor:theme.cream},
 productInfo:{flex:1,gap:5},
 productTitle:{fontSize:15,color:theme.ink,fontWeight:"800"},
 brand:{fontSize:12,color:theme.green,fontWeight:"700"},
 productMeta:{fontSize:11,color:theme.muted},
 colorRow:{flexDirection:"row",alignItems:"center",gap:6},
 dot:{height:17,width:17,borderRadius:10,borderWidth:1,borderColor:theme.border},
 price:{fontSize:16,color:theme.green,fontWeight:"800"},
 productActions:{flexDirection:"row",flexWrap:"wrap",gap:9},
 lightButton:{padding:10,borderRadius:11,backgroundColor:theme.cream,borderWidth:1,borderColor:theme.border}
});
