import {useFocusEffect,Link} from "expo-router";
import {useCallback,useRef,useState} from "react";
import {ActivityIndicator,Alert,Pressable,ScrollView,StyleSheet,Switch,Text,TextInput,View} from "react-native";
import {createAccountAddress,loadAddressProfile,updateAccountAddress,removeAccountAddress,type AddressProfile,type SavedAddress} from "../lib/companion-addresses";
import {EMPTY_ADDRESS,draftFromSavedAddress,type AddressDraft} from "../lib/address-rules";
import {openMarketplace} from "../lib/marketplace-navigation";
import {theme} from "../theme";
type TextField=Exclude<keyof AddressDraft,"isDefaultBilling"|"isDefaultDelivery">;
const FIELDS:readonly {key:TextField;label:string;placeholder:string;keyboard?: "phone-pad"|"number-pad"}[]=[
 {key:"label",label:"Ονομασία",placeholder:"π.χ. Σπίτι"},
 {key:"fullName",label:"Ονοματεπώνυμο",placeholder:"Όνομα και επώνυμο"},
 {key:"companyName",label:"Επωνυμία (προαιρετικό)",placeholder:"Επωνυμία επιχείρησης"},
 {key:"vatNumber",label:"ΑΦΜ (προαιρετικό)",placeholder:"ΑΦΜ"},
 {key:"line1",label:"Οδός και αριθμός",placeholder:"π.χ. Λυκούργου 12"},
 {key:"line2",label:"Όροφος / διαμέρισμα (προαιρετικό)",placeholder:"π.χ. 2ος όροφος"},
 {key:"locality",label:"Πόλη",placeholder:"π.χ. Σπάρτη"},
 {key:"region",label:"Περιφέρεια (προαιρετικό)",placeholder:"π.χ. Λακωνία"},
 {key:"postcode",label:"Ταχυδρομικός κώδικας",placeholder:"π.χ. 23100",keyboard:"number-pad"},
 {key:"phone",label:"Τηλέφωνο (προαιρετικό)",placeholder:"π.χ. 69XXXXXXXX",keyboard:"phone-pad"}
];
const LIMITS:Record<TextField,number>={
 label:80,fullName:160,companyName:200,vatNumber:40,line1:240,line2:240,locality:120,region:120,postcode:5,phone:40
};
function message(error:unknown){
 const code=error instanceof Error?error.message:"";
 if(code==="NOT_ENABLED")return "Οι διευθύνσεις Android δεν έχουν ενεργοποιηθεί ακόμη.";
 if(code==="LOGIN_REQUIRED")return "Συνδέσου πρώτα στο KONTA MOY Companion.";
 if(code==="FULL_NAME_REQUIRED")return "Συμπλήρωσε όνομα και επώνυμο.";
 if(code==="ADDRESS_REQUIRED")return "Συμπλήρωσε τη διεύθυνση και την πόλη.";
 if(code==="INVALID_POSTCODE")return "Ο ταχυδρομικός κώδικας πρέπει να έχει 5 ψηφία.";
 if(code==="INVALID_PHONE")return "Έλεγξε τον αριθμό τηλεφώνου.";
 if(code==="RATE_LIMITED")return "Έγιναν πολλές προσπάθειες. Προσπάθησε αργότερα.";
 return "Δεν ολοκληρώθηκε η ενημέρωση. Μπορείς να διαχειριστείς τις διευθύνσεις στον ασφαλή ιστότοπο.";
}
export default function CompanionAddresses(){
 const [profile,setProfile]=useState<AddressProfile|null>(null);
 const [draft,setDraft]=useState<AddressDraft>(EMPTY_ADDRESS);
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [formOpen,setFormOpen]=useState(false);
 const [editingId,setEditingId]=useState<string|null>(null);
 const [notice,setNotice]=useState("");
 const version=useRef(0);
 const refresh=useCallback(async()=>{
  const id=++version.current;
  setLoading(true);
  try{
   const next=await loadAddressProfile();
   if(id===version.current){
    setProfile(next);setNotice("");
    setDraft(old=>({...old,fullName:old.fullName||next.fullName}));
   }
  }catch(e){
   if(id===version.current){setProfile(null);setNotice(message(e));}
  }finally{if(id===version.current)setLoading(false);}
 },[]);
 useFocusEffect(useCallback(()=>{void refresh();return()=>{version.current++;};},[refresh]));
 async function save(){
  if(saving||!profile)return;
  setSaving(true);setNotice("");
  try{
   const next=await createAccountAddress(draft);
   setProfile(next);
   setFormOpen(false);
   setDraft({...EMPTY_ADDRESS,fullName:next.fullName});
   setNotice("Η νέα διεύθυνση αποθηκεύτηκε στον λογαριασμό KONTA MOY.");
  }catch(e){setNotice(message(e));}
  finally{setSaving(false);}
 }
 async function manageWeb(){
  try{await openMarketplace({path:"/account"});}
  catch{setNotice("Δεν ήταν δυνατό να ανοίξει ο ασφαλής λογαριασμός.");}
 }
 return <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
  <Text style={styles.kicker}>KONTA MOY COMPANION · ΔΙΕΥΘΥΝΣΕΙΣ</Text>
  <Text style={styles.title}>Οι διευθύνσεις μου</Text>
  <Text style={styles.body}>Δες τις αποθηκευμένες διευθύνσεις του λογαριασμού σου και πρόσθεσε νέα. Η επιλογή τρόπου παράδοσης και η πληρωμή γίνονται στο ασφαλές checkout.</Text>
  {loading&&<ActivityIndicator color={theme.green} accessibilityLabel="Φόρτωση διευθύνσεων"/>}
  {notice!==""&&<Text style={styles.notice} accessibilityLiveRegion="polite">{notice}</Text>}
  {!loading&&profile===null&&<View style={styles.card}>
    <Text style={styles.body}>Για να εμφανιστούν οι διευθύνσεις σου απαιτείται εγγενής σύνδεση λογαριασμού και ενεργή υπηρεσία Android.</Text>
    <Link href="/account" asChild><Pressable accessibilityRole="button" style={styles.outline}>
     <Text style={styles.link}>Σύνδεση λογαριασμού →</Text>
    </Pressable></Link>
   </View>}
  {profile&&<>
   <View style={styles.card}>
    <View style={styles.headingRow}>
     <Text style={styles.heading}>Αποθηκευμένες διευθύνσεις</Text>
     <Pressable accessibilityRole="button" disabled={loading||saving} onPress={()=>void refresh()}>
      <Text style={styles.link}>Ανανέωση</Text>
     </Pressable>
    </View>
    {profile.addresses.length===0?<Text style={styles.body}>Δεν υπάρχει ακόμη αποθηκευμένη διεύθυνση.</Text>:
     profile.addresses.map(address=><View key={address.id} style={styles.entry}>
      <Text style={styles.entryTitle}>{address.label}</Text>
      <Text style={styles.body}>{address.fullName}</Text>
      <Text style={styles.body}>{address.line1}{address.line2?", "+address.line2:""}</Text>
      <Text style={styles.body}>{address.postcode} {address.locality}{address.region?" · "+address.region:""}</Text>
      <View style={styles.pills}>
       {address.isDefaultBilling&&<Text style={styles.pill}>Τιμολόγηση</Text>}
       {address.isDefaultDelivery&&<Text style={styles.pill}>Παράδοση</Text>}
      </View>
     </View>)}
    <Text style={styles.hint}>Η αλλαγή ή διαγραφή υπάρχουσας διεύθυνσης γίνεται προς το παρόν μέσω του ασφαλούς λογαριασμού στον ιστότοπο.</Text>
   </View>
   <Pressable accessibilityRole="button" style={styles.primary}
    disabled={saving} onPress={()=>setFormOpen(v=>!v)}>
    <Text style={styles.primaryText}>{formOpen?"Κλείσιμο φόρμας":"＋ Προσθήκη νέας διεύθυνσης"}</Text>
   </Pressable>
   {formOpen&&<View style={styles.card}>
     <Text style={styles.heading}>Νέα διεύθυνση στην Ελλάδα</Text>
     {FIELDS.map(field=><View key={field.key} style={styles.field}>
       <Text style={styles.fieldLabel}>{field.label}</Text>
       <TextInput accessibilityLabel={field.label} style={styles.input}
        placeholder={field.placeholder} keyboardType={field.keyboard??"default"}
        autoCapitalize={field.key==="postcode"||field.key==="phone"?"none":"sentences"}
        maxLength={LIMITS[field.key]} editable={!saving}
        value={draft[field.key]} onChangeText={value=>setDraft(old=>({...old,[field.key]:value}))}/>
     </View>)}
     <Text style={styles.hint}>Χώρα: Ελλάδα (GR). Η διεύθυνση καταχωρείται στον ίδιο λογαριασμό που χρησιμοποιεί το checkout.</Text>
     <View style={styles.switchRow}>
      <Text style={styles.switchText}>Προεπιλογή τιμολόγησης</Text>
      <Switch disabled={saving} value={draft.isDefaultBilling} onValueChange={v=>setDraft(o=>({...o,isDefaultBilling:v}))}/>
     </View>
     <View style={styles.switchRow}>
      <Text style={styles.switchText}>Προεπιλογή παράδοσης</Text>
      <Switch disabled={saving} value={draft.isDefaultDelivery} onValueChange={v=>setDraft(o=>({...o,isDefaultDelivery:v}))}/>
     </View>
     <Text style={styles.hint}>Η αποθήκευση ενημερώνει και το ονοματεπώνυμο του προφίλ πελάτη, όπως και στην υπάρχουσα ιστοσελίδα.</Text>
     <Pressable accessibilityRole="button" disabled={saving} onPress={()=>void save()}
      style={[styles.primary,saving&&styles.disabled]}>
      <Text style={styles.primaryText}>{saving?"Αποθήκευση…":"Αποθήκευση στον λογαριασμό"}</Text>
     </Pressable>
    </View>}
  </>}
  <Pressable accessibilityRole="link" onPress={()=>void manageWeb()} style={styles.outline}>
   <Text style={styles.link}>Διαχείριση διευθύνσεων στον ιστότοπο ↗</Text>
  </Pressable>
  <Link href="/basket" asChild><Pressable accessibilityRole="button" style={styles.outline}>
   <Text style={styles.link}>Επιστροφή στο καλάθι →</Text>
  </Pressable></Link>
  <Text style={styles.hint}>Οι διευθύνσεις φορτώνονται προσωρινά από τον λογαριασμό και δεν αποθηκεύονται σε SQLite ή στα δεδομένα ειδοποιήσεων του Companion. Δεν γίνεται παραγγελία από αυτή τη σελίδα.</Text>
 </ScrollView>;
}
const styles=StyleSheet.create({
 screen:{padding:21,paddingBottom:60,gap:16},
 kicker:{color:theme.gold,fontSize:11,letterSpacing:1.4,fontWeight:"800"},
 title:{fontSize:31,lineHeight:39,color:theme.green,fontWeight:"800"},
 body:{fontSize:14,lineHeight:21,color:theme.muted},
 card:{borderColor:theme.border,borderWidth:1,borderRadius:18,padding:17,backgroundColor:theme.white,gap:12},
 headingRow:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:7},
 heading:{fontSize:17,color:theme.ink,fontWeight:"800",flexShrink:1},
 entry:{backgroundColor:theme.cream,borderRadius:13,padding:13,gap:4},
 entryTitle:{fontSize:16,color:theme.green,fontWeight:"800"},
 pills:{flexDirection:"row",gap:8,flexWrap:"wrap"},
 pill:{fontSize:11,fontWeight:"800",color:theme.green,borderRadius:10,padding:7,backgroundColor:theme.white},
 primary:{backgroundColor:theme.green,alignItems:"center",padding:15,borderRadius:13},
 primaryText:{fontSize:14,fontWeight:"800",color:theme.white},
 outline:{borderColor:theme.green,borderWidth:1,borderRadius:13,alignItems:"center",padding:14},
 link:{color:theme.green,fontWeight:"800",fontSize:13},
 field:{gap:5},
 fieldLabel:{fontSize:13,fontWeight:"700",color:theme.ink},
 input:{borderColor:theme.border,borderWidth:1,borderRadius:12,paddingHorizontal:12,paddingVertical:13,fontSize:16,color:theme.ink},
 switchRow:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",gap:12},
 switchText:{flex:1,color:theme.ink,fontSize:14,fontWeight:"700"},
 hint:{fontSize:12,color:theme.muted,lineHeight:18},
 notice:{color:theme.ink,fontSize:13,lineHeight:20},
 disabled:{opacity:.55}
});
