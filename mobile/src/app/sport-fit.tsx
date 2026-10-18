import {useRouter} from "expo-router";
import {useEffect,useRef,useState} from "react";
import {ActivityIndicator,Animated,Easing,Image,Pressable,ScrollView,StyleSheet,Text,TextInput,View,useWindowDimensions} from "react-native";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {applySportAnswer,sportQuestion,sportQuestionSequence,type SportAnswers} from "../lib/sport-fit-questions";
import {getSportFitResults,type SportFitPreview,type SportFitResult} from "../lib/sport-fit-client";
import {openMarketplace} from "../lib/marketplace-navigation";
import {theme} from "../theme";
function money(value:number){return new Intl.NumberFormat("el-GR",{style:"currency",currency:"EUR"}).format(value/100);}
type ChoiceButtonProps={label:string;onPress:()=>void;selected?:boolean;description?:string};
function Choice({label,onPress,selected,description}:ChoiceButtonProps){
 return <Pressable accessibilityRole="button" accessibilityState={{selected:selected===true}}
   onPress={onPress} style={[styles.choice,selected&&styles.choiceSelected]}>
   <Text style={[styles.choiceLabel,selected&&styles.choiceSelectedText]}>{label}</Text>
   {description&&<Text style={styles.choiceDescription}>{description}</Text>}
   <Text style={[styles.arrow,selected&&styles.choiceSelectedText]}>→</Text>
 </Pressable>;
}
function ProductUniverse({products,selectedId,onSelect}:{products:SportFitPreview[];selectedId?:string;onSelect:(x:SportFitPreview)=>void}){
 const {width}=useWindowDimensions();
 const size=Math.min(width-36,355);
 const motion=useRef(new Animated.Value(0)).current;
 useEffect(()=>{
  const looping=Animated.loop(Animated.sequence([
   Animated.timing(motion,{toValue:1,duration:2800,easing:Easing.inOut(Easing.sin),useNativeDriver:true}),
   Animated.timing(motion,{toValue:0,duration:2800,easing:Easing.inOut(Easing.sin),useNativeDriver:true})
  ]));
  looping.start();return()=>looping.stop();
 },[motion]);
 const visible=products.slice(0,11);
 return <View style={[styles.universe,{height:size,width:size}]} accessibilityLabel="Σύμπαν επιλέξιμων προϊόντων">
  <View style={[styles.ring,{top:size*.12,left:size*.12,width:size*.76,height:size*.76}]}/>
  <View style={[styles.ring,{top:size*.25,left:size*.25,width:size*.5,height:size*.5}]}/>
  <View style={[styles.central,{top:size*.43,left:size*.36,width:size*.28}]}>
   <Text style={styles.centerCount}>{products.length}</Text>
   <Text style={styles.centerCaption}>matches</Text>
  </View>
  {visible.map((product,i)=>{
   const radius=i<5?size*.27:size*.42;
   const angle=(-Math.PI/2)+2*Math.PI*(i<5?i/5:(i-5)/Math.max(1,visible.length-5));
   const diameter=i<5?66:53;
   const x=size/2+Math.cos(angle)*radius-diameter/2;
   const y=size/2+Math.sin(angle)*radius-diameter/2;
   const scale=motion.interpolate({inputRange:[0,1],outputRange:[1,1+(i%3)*.025+.02]});
   const selected=selectedId===product.id;
   return <Animated.View key={product.id}
     style={{position:"absolute",left:x,top:y,transform:[{scale}],zIndex:selected?3:2}}>
    <Pressable onPress={()=>onSelect(product)} accessibilityRole="button"
     accessibilityLabel={product.title+" — "+product.technicalScore+" τεχνική συμβατότητα"}
     accessibilityState={{selected}}
     style={[styles.orb,{width:diameter,height:diameter,borderRadius:diameter/2},selected&&styles.orbActive]}>
      {product.previewImageSrc&&/^(https:\/\/|\/api\/)/.test(product.previewImageSrc)
       ?<Image source={{uri:product.previewImageSrc.startsWith("/")?"https://kontamou.site"+product.previewImageSrc:product.previewImageSrc}}
          style={{width:diameter-9,height:diameter-9,borderRadius:diameter/2}} resizeMode="contain"/>
       :<Text style={{color:theme.green,fontWeight:"900",fontSize:21}}>{product.brand.slice(0,1)||"◉"}</Text>}
    </Pressable>
   </Animated.View>;
  })}
 </View>;
}
export default function SportFitStudio(){
 const router=useRouter();
 const insets=useSafeAreaInsets();
 const [answers,setAnswers]=useState<SportAnswers>({activity:"running",audience:"men"});
 const [index,setIndex]=useState(0);
 const [draft,setDraft]=useState("");
 const [result,setResult]=useState<SportFitResult|null>(null);
 const [selected,setSelected]=useState<SportFitPreview|null>(null);
 const [loading,setLoading]=useState(false);
 const [notice,setNotice]=useState("");
 const version=useRef(0);
 const sequence=sportQuestionSequence(answers.activity);
 const key=sequence[Math.min(index,sequence.length-1)];
 const question=sportQuestion(answers.activity,key);
 const isInput=question.options.length===0;
 function valueForQuestion(){
  if(key==="size")return answers.size??"";
  if(key==="footLength")return answers.footLengthMm?String(answers.footLengthMm):"";
  if(key==="budget")return answers.budgetMinor?String(answers.budgetMinor/100):"";
  return "";
 }
 function advance(next:SportAnswers){
  setAnswers(next);setNotice("");
  if(index+1<sportQuestionSequence(next.activity).length){
   setIndex(index+1);setDraft("");
  }else void finish(next);
 }
 function pick(value:string){
  try{advance(applySportAnswer(answers,key,value));}
  catch{setNotice("Δεν αναγνωρίστηκε η επιλογή. Δοκίμασε ξανά.");}
 }
 function acceptInput(){
  try{advance(applySportAnswer(answers,key,draft));}
  catch{
   setNotice(key==="size"?"Δώσε έγκυρο μέγεθος EU, π.χ. 42 ή 42.5.":
    key==="footLength"?"Το μήκος πέλματος πρέπει να είναι από 80 έως 400 mm.":
    "Το budget πρέπει να είναι θετικό και έως 5.000 €.");
  }
 }
 async function finish(finalAnswers:SportAnswers){
  const id=++version.current;setLoading(true);setResult(null);setSelected(null);setNotice("");
  try{
   const res=await getSportFitResults(finalAnswers);
   if(id!==version.current)return;
   setResult(res);setSelected(res.primary);
   if(!res.survivors.length)setNotice("Δεν βρέθηκαν τεχνικά επιλέξιμα προϊόντα για τα κριτήρια σου. Άλλαξε ένα φίλτρο ή άνοιξε το πλήρες Studio.");
  }catch{
   if(id===version.current)setNotice("Δεν φορτώθηκαν οι προτάσεις. Έλεγξε τη σύνδεσή σου και δοκίμασε ξανά.");
  }finally{if(id===version.current)setLoading(false);}
 }
 function back(){
  if(loading)return;
  if(result){version.current++;setResult(null);setSelected(null);setIndex(sequence.length-1);return;}
  if(index>0){setIndex(index-1);setDraft("");setNotice("");}
  else router.back();
 }
 function restart(){
  version.current++;setResult(null);setSelected(null);setIndex(0);
  setAnswers({activity:"running",audience:"men"});setDraft("");setNotice("");
 }
 async function openWeb(){
  try{await openMarketplace({path:"/sport-fit-studio"});}
  catch{setNotice("Δεν άνοιξε το πλήρες Sport & Fit Studio.");}
 }
 async function openProduct(product:SportFitPreview){
  try{await openMarketplace({path:"/product/"+product.id});}
  catch{setNotice("Δεν άνοιξε η ασφαλής σελίδα προϊόντος.");}
 }
 const done=Boolean(result);
 return <View style={[styles.page,{paddingTop:Math.max(insets.top,10)}]}>
  <View style={styles.header}>
   <Pressable accessibilityRole="button" onPress={back} style={styles.back}><Text style={styles.backText}>←</Text></Pressable>
   <View style={{flex:1}}>
    <Text style={styles.eyebrow}>KONTA MOY · INTELLIGENCE</Text>
    <Text style={styles.headerTitle}>SPORT & FIT STUDIO</Text>
   </View>
   <Pressable onPress={restart} accessibilityRole="button" style={styles.reset}><Text style={styles.resetText}>↻</Text></Pressable>
  </View>
  <ScrollView contentContainerStyle={[styles.scroll,{paddingBottom:Math.max(insets.bottom,16)+32}]} keyboardShouldPersistTaps="handled">
   {!done&&!loading&&<>
    <View style={styles.progress}>
     <Text style={styles.progressLabel}>ΕΡΩΤΗΣΗ {index+1} / {sequence.length}</Text>
     <Text style={styles.progressLabel}>{Math.round((index+1)/sequence.length*100)}%</Text>
    </View>
    <View style={styles.progressTrack}>
     <View style={[styles.progressFill,{width:((index+1)/sequence.length*100+"%") as `${number}%`}]}/>
    </View>
    <Text style={styles.headline}>{question.title}</Text>
    <Text style={styles.subline}>Μία ερώτηση κάθε φορά. Κάθε απάντηση καθοδηγεί την επιλογή των σωστών προϊόντων.</Text>
    {question.options.length>0?question.options.map(option=>
     <Choice key={option.value} label={option.label} onPress={()=>pick(option.value)}
       selected={key==="activity"?answers.activity===option.value:
        key==="audience"?answers.audience===option.value:false}/>)
    :<View style={styles.card}>
      <TextInput keyboardType={key==="size"||key==="footLength"||key==="budget"?"decimal-pad":"default"}
       accessibilityLabel={question.title}
       value={draft} onChangeText={setDraft}
       maxLength={key==="size"?10:8} autoCapitalize="none"
       placeholder={key==="size"?"π.χ. 42 ή 42.5":key==="footLength"?"π.χ. 265": "π.χ. 120"}
       style={styles.input}/>
      {valueForQuestion()!==""&&<Text style={styles.subline}>Προηγούμενη επιλογή: {valueForQuestion()}</Text>}
      <Pressable accessibilityRole="button" style={styles.primary} onPress={acceptInput}>
       <Text style={styles.primaryText}>Συνέχεια →</Text>
      </Pressable>
      {question.optional&&<Pressable accessibilityRole="button" style={styles.skip} onPress={()=>pick("")}>
       <Text style={styles.skipText}>Δεν γνωρίζω / παράλειψη</Text>
      </Pressable>}
     </View>}
    </>}
   {loading&&<View style={styles.loading}>
    <ActivityIndicator size="large" color={theme.green}/>
    <Text style={styles.headline}>Βρίσκουμε το σωστό ταίριασμα…</Text>
    <Text style={styles.subline}>Πραγματικό απόθεμα, κατάλληλη χρήση, επιφάνεια και τεχνική τεκμηρίωση.</Text>
   </View>}
   {done&&result&&<>
    <Text style={styles.eyebrow}>ΤΕΧΝΙΚΟ ΦΙΛΤΡΑΡΙΣΜΑ · {result.evidenceMode==="governed"?"GOVERNED RULES":"LIMITED EVIDENCE"}</Text>
    <Text style={styles.headline}>Ο δικός σου κόσμος αθλητικών προϊόντων.</Text>
    <Text style={styles.subline}>Από {result.candidateCount} οικογένειες προϊόντων, {result.survivingCount} τεχνικά επιλέξιμες επιλογές. {result.vendorName?"Συμμετέχων πωλητής: "+result.vendorName:"Η διαθεσιμότητα εξαρτάται από τον ενεργό κατάλογο."}</Text>
    {result.survivors.length>0&&<ProductUniverse products={result.survivors}
      selectedId={selected?.id} onSelect={setSelected}/>}
    {selected&&<View style={styles.product}>
      <Text style={styles.eyebrow}>ΠΡΟΤΕΙΝΟΜΕΝΗ ΕΠΙΛΟΓΗ</Text>
      <Text style={styles.productTitle}>{selected.title}</Text>
      {selected.brand&&<Text style={styles.subline}>{selected.brand}</Text>}
      <Text style={styles.price}>{money(selected.priceMinor)}</Text>
      <View style={styles.stats}>
       <Text style={styles.stat}>Τεχνική καταλληλότητα: {selected.technicalScore}/100</Text>
       <Text style={styles.stat}>Κάλυψη τεκμηρίωσης: {selected.technicalCoverage}%</Text>
      </View>
      {selected.matchedSize?<Text style={styles.size}>✓ Ταιριαστό μέγεθος: {selected.matchedSize}</Text>
       :<Text style={styles.warning}>Το ακριβές μέγεθος δεν έχει επιβεβαιωθεί. Διάλεξέ το στη σελίδα προϊόντος.</Text>}
      {selected.consultationSummary!==""&&<Text style={styles.body}>{selected.consultationSummary}</Text>}
      {selected.reasons.map((reason,i)=><Text key={i} style={styles.reason}>• {reason}</Text>)}
      {selected.matchProofs.length>0&&<View style={styles.proofs}>
       <Text style={styles.bold}>Γιατί ταιριάζει</Text>
       {selected.matchProofs.map((p,i)=><Text key={i} style={styles.body}>✓ {p.proof||p.knowledge||p.input}</Text>)}
      </View>}
      <Pressable accessibilityRole="button" style={styles.primary} onPress={()=>void openProduct(selected)}>
       <Text style={styles.primaryText}>Δες μέγεθος, απόθεμα & αγορά ↗</Text>
      </Pressable>
     </View>}
    {result.sizeGuide&&<View style={styles.card}>
      <Text style={styles.bold}>Βοήθεια μεγεθών</Text>
      <Text style={styles.body}>EU {result.sizeGuide.sizeLabels.join(", ")} · {result.sizeGuide.publisher}</Text>
      <Text style={styles.subline}>Η ένδειξη μεγέθους δεν υποκαθιστά την επιβεβαίωση της διαθέσιμης παραλλαγής.</Text>
     </View>}
    {result.kit.length>0&&<View style={styles.card}>
     <Text style={styles.bold}>Συνδύασε με</Text>
     {result.kit.slice(0,4).map(p=><Pressable key={p.id} style={styles.kitRow} onPress={()=>void openProduct(p)}>
       <Text style={styles.kitName}>{p.title}</Text><Text style={styles.link}>{money(p.priceMinor)} ↗</Text>
      </Pressable>)}
    </View>}
    <Pressable accessibilityRole="button" style={styles.outline} onPress={restart}>
     <Text style={styles.link}>↻ Νέα αθλητική αναζήτηση</Text>
    </Pressable>
   </>}
   {notice!==""&&<Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>}
   <Pressable accessibilityRole="link" style={styles.outline} onPress={()=>void openWeb()}>
    <Text style={styles.link}>◉ Πλήρες 3D Sport & Fit Studio ↗</Text>
   </Pressable>
   <Text style={styles.disclaimer}>Η εφαρμογή αξιοποιεί τους κανόνες του Sport & Fit Studio. Οι βαθμοί εξαρτώνται από τη διαθέσιμη τεχνική τεκμηρίωση και δεν αποτελούν ιατρική αξιολόγηση. Τελικό μέγεθος, τιμή, απόθεμα και πληρωμή επιβεβαιώνονται μόνο στον ασφαλή ιστότοπο.</Text>
  </ScrollView>
 </View>;
}
const styles=StyleSheet.create({
 page:{flex:1,backgroundColor:"#F8F6ED"},header:{flexDirection:"row",alignItems:"center",gap:12,paddingHorizontal:19,paddingVertical:12,backgroundColor:theme.white,borderBottomWidth:1,borderBottomColor:theme.border},
 back:{height:42,width:42,borderWidth:1,borderColor:theme.border,borderRadius:13,justifyContent:"center",alignItems:"center"},
 backText:{fontSize:24,color:theme.green,fontWeight:"800"},
 reset:{height:42,width:42,justifyContent:"center",alignItems:"center"},
 resetText:{fontSize:29,color:theme.green,fontWeight:"800"},
 eyebrow:{color:theme.gold,fontSize:11,letterSpacing:1.4,fontWeight:"800"},
 headerTitle:{color:theme.green,fontSize:15,fontWeight:"900"},
 scroll:{padding:18,gap:15},
 progress:{flexDirection:"row",justifyContent:"space-between"},
 progressLabel:{fontSize:12,fontWeight:"800",color:theme.muted},
 progressTrack:{height:5,borderRadius:5,backgroundColor:theme.border,overflow:"hidden"},
 progressFill:{height:5,backgroundColor:theme.green},
 headline:{fontSize:28,lineHeight:35,fontWeight:"900",color:theme.green},
 subline:{fontSize:13,lineHeight:20,color:theme.muted},
 choice:{padding:16,flexDirection:"row",alignItems:"center",gap:10,borderRadius:16,backgroundColor:theme.white,borderWidth:1,borderColor:theme.border},
 choiceSelected:{borderColor:theme.green,backgroundColor:"#E9F2E9"},
 choiceLabel:{color:theme.ink,fontSize:16,fontWeight:"800",flex:1},
 choiceSelectedText:{color:theme.green},
 choiceDescription:{fontSize:12,color:theme.muted},
 arrow:{color:theme.green,fontSize:19,fontWeight:"900"},
 card:{backgroundColor:theme.white,borderWidth:1,borderColor:theme.border,borderRadius:18,padding:17,gap:13},
 input:{height:58,borderWidth:1,borderColor:theme.border,borderRadius:12,paddingHorizontal:14,color:theme.ink,fontSize:20},
 primary:{backgroundColor:theme.green,padding:16,borderRadius:14,alignItems:"center"},
 primaryText:{fontWeight:"800",color:theme.white,fontSize:14},
 skip:{padding:12,alignItems:"center"},skipText:{color:theme.muted,fontWeight:"700"},
 loading:{paddingTop:80,gap:18,alignItems:"center"},
 universe:{backgroundColor:"#102C26",borderRadius:26,alignSelf:"center",overflow:"hidden",position:"relative"},
 ring:{position:"absolute",borderWidth:1,borderRadius:999,borderColor:"#52736488"},
 central:{position:"absolute",alignItems:"center",justifyContent:"center"},
 centerCount:{color:theme.white,fontSize:32,fontWeight:"900"},
 centerCaption:{color:"#D7C68C",fontSize:10,fontWeight:"800"},
 orb:{backgroundColor:theme.white,borderColor:"#A6BDAC",borderWidth:2,alignItems:"center",justifyContent:"center",overflow:"hidden"},
 orbActive:{borderWidth:3,borderColor:theme.gold},
 product:{backgroundColor:theme.white,borderRadius:20,borderWidth:1,borderColor:theme.border,padding:18,gap:10},
 productTitle:{fontSize:20,fontWeight:"900",color:theme.green},
 price:{fontSize:23,fontWeight:"900",color:theme.green},
 stats:{gap:4},stat:{fontSize:12,fontWeight:"800",color:theme.ink},
 size:{fontWeight:"800",color:theme.green,fontSize:13},
 warning:{fontSize:12,color:"#9D6233",lineHeight:18},
 body:{fontSize:13,lineHeight:20,color:theme.muted},bold:{fontSize:16,fontWeight:"800",color:theme.ink},
 reason:{fontSize:13,color:theme.ink,lineHeight:20},
 proofs:{padding:12,backgroundColor:theme.cream,borderRadius:13,gap:7},
 kitRow:{paddingVertical:10,borderBottomWidth:1,borderColor:theme.border,gap:5},
 kitName:{fontSize:14,fontWeight:"700",color:theme.ink},
 link:{color:theme.green,fontSize:14,fontWeight:"800"},
 outline:{padding:14,borderWidth:1,borderColor:theme.green,borderRadius:14,alignItems:"center"},
 notice:{fontSize:13,lineHeight:20,color:theme.ink},
 disclaimer:{fontSize:12,lineHeight:19,color:theme.muted}
});
