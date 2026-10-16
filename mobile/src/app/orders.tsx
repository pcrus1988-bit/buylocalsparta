import {useFocusEffect} from "expo-router";
import {useCallback,useRef,useState} from "react";
import {ActivityIndicator,Pressable,ScrollView,StyleSheet,Text,View} from "react-native";
import {loadCompanionAccount,type CompanionOrder} from "../lib/companion-session";
import {filterOrders,orderStatusText,pickupBadge,pickupOrderPath,type OrderFilter} from "../lib/pickup-model";
import {openMarketplace} from "../lib/marketplace-navigation";
import {theme} from "../theme";

const FILTERS:{key:OrderFilter;label:string}[]=[
 {key:"all",label:"Όλες"},
 {key:"ready",label:"Έτοιμες"},
 {key:"pickup",label:"Παραλαβές"},
 {key:"delivery",label:"Αποστολές"},
 {key:"closed",label:"Κλειστές"}
];
function money(minor:number,currency:string){
 if(!Number.isSafeInteger(minor)||minor<0)return "";
 try{return new Intl.NumberFormat("el-GR",{style:"currency",currency:currency||"EUR"}).format(minor/100);}
 catch{return (minor/100).toFixed(2)+" €";}
}

/** Fresh read-only account orders; never caches customer orders or pickup codes. */
export default function CompanionOrders(){
 const [orders,setOrders]=useState<CompanionOrder[]|null>(null);
 const [filter,setFilter]=useState<OrderFilter>("all");
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const requestVersion=useRef(0);
 const refresh=useCallback(async()=>{
  const version=++requestVersion.current;
  setLoading(true);setError("");
  try{
   const account=await loadCompanionAccount();
   if(version===requestVersion.current)setOrders(account?account.orders:null);
  }catch{
   if(version===requestVersion.current){
    setOrders(null);setError("Δεν έγινε ενημέρωση παραγγελιών. Έλεγξε τη σύνδεσή σου.");
   }
  }finally{
   if(version===requestVersion.current)setLoading(false);
  }
 },[]);
 useFocusEffect(useCallback(()=>{
  void refresh();
  return()=>{requestVersion.current++;};
 },[refresh]));
 const displayed=orders?filterOrders(orders,filter):[];
 async function openOrder(order:CompanionOrder){
  try{await openMarketplace({path:pickupOrderPath(order.id)});}
  catch{setError("Δεν άνοιξαν τα ασφαλή στοιχεία της παραγγελίας.");}
 }
 async function openWebsite(){
  try{await openMarketplace({path:"/account/orders"});}
  catch{setError("Δεν άνοιξε ο ασφαλής λογαριασμός.");}
 }
 return <ScrollView contentContainerStyle={styles.screen}>
  <Text style={styles.kicker}>KONTA MOY COMPANION · ΠΑΡΑΓΓΕΛΙΕΣ</Text>
  <Text style={styles.title}>Οι παραγγελίες μου</Text>
  <Text style={styles.copy}>Πραγματικές καταστάσεις του λογαριασμού σου, παραλαβές και αποστολές. Τα στοιχεία και το QR παραμένουν στον ασφαλή ιστότοπο.</Text>
  <View style={styles.header}>
   <Text style={styles.heading}>Ιστορικό παραγγελιών</Text>
   <Pressable accessibilityRole="button" disabled={loading} onPress={()=>void refresh()}
    style={[styles.refresh,loading&&styles.disabled]}>
    <Text style={styles.refreshText}>Ανανέωση</Text>
   </Pressable>
  </View>
  {loading?<ActivityIndicator color={theme.green} accessibilityLabel="Φόρτωση παραγγελιών"/>:
   orders===null?
    <View style={styles.card}>
     <Text style={styles.copy}>Δεν υπάρχει ενεργή εγγενής σύνδεση Companion σε αυτή τη συσκευή. Μπορείς να δεις όλες τις παραγγελίες σου μέσω του ασφαλούς browser.</Text>
    </View>:
   <>
    <Text style={styles.count}>{orders.length} πρόσφατες παραγγελίες από τον λογαριασμό σου</Text>
    <View style={styles.filters}>
     {FILTERS.map(f=><Pressable key={f.key} accessibilityRole="button"
       accessibilityState={{selected:filter===f.key}}
       onPress={()=>setFilter(f.key)}
       style={[styles.filter,filter===f.key&&styles.filterActive]}>
       <Text style={[styles.filterText,filter===f.key&&styles.filterTextActive]}>{f.label}</Text>
     </Pressable>)}
    </View>
    {displayed.length===0?<View style={styles.card}>
       <Text style={styles.copy}>Δεν υπάρχουν παραγγελίες σε αυτή την κατηγορία.</Text>
      </View>:
     displayed.map(order=>{
      const badge=order.hasPickup?pickupBadge(order):null;
      return <View key={order.id} style={styles.card}>
       <View style={styles.header}>
        <Text style={styles.reference}>{order.reference}</Text>
        {badge==="ready"&&<Text style={styles.ready}>Έτοιμη για παραλαβή</Text>}
       </View>
       <Text style={styles.copy}>Κατάσταση: {orderStatusText(order)}</Text>
       <Text style={styles.meta}>{order.hasPickup?"Παραλαβή από κατάστημα":"Αποστολή / άλλη μέθοδος"}</Text>
       <Text style={styles.money}>{money(order.totalMinor,order.currency)}</Text>
       {badge==="closed"&&<Text style={styles.meta}>Δεν εμφανίζεται ως έτοιμη για παραλαβή.</Text>}
       <Pressable accessibilityRole="link" onPress={()=>void openOrder(order)} style={styles.action}>
        <Text style={styles.actionText}>{badge==="ready"?"Προβολή ασφαλούς QR / παραγγελίας ↗":"Λεπτομέρειες παραγγελίας ↗"}</Text>
       </Pressable>
      </View>;
     })}
   </>
  }
  {error!==""&&<Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>}
  <Pressable accessibilityRole="link" style={styles.primary} onPress={()=>void openWebsite()}>
   <Text style={styles.primaryText}>Όλες οι παραγγελίες στον ιστότοπο ↗</Text>
  </Pressable>
  <Text style={styles.note}>Η εφαρμογή βλέπει έως 25 πρόσφατες παραγγελίες από την ασφαλή υπηρεσία λογαριασμού. Δεν αποθηκεύει ιστορικό παραγγελιών, στοιχεία πληρωμών ή QR στη συσκευή. Για πλήρες ιστορικό χρησιμοποίησε τον ιστότοπο.</Text>
 </ScrollView>;
}
const styles=StyleSheet.create({
 screen:{padding:22,paddingBottom:58,gap:16},
 kicker:{color:theme.gold,fontWeight:"800",letterSpacing:1.3,fontSize:11},
 title:{color:theme.green,fontWeight:"800",fontSize:31,lineHeight:39},
 copy:{color:theme.muted,fontSize:14,lineHeight:22},
 heading:{color:theme.ink,fontWeight:"800",fontSize:17},
 header:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:9},
 refresh:{padding:9,borderRadius:10,borderColor:theme.border,borderWidth:1},
 refreshText:{color:theme.green,fontWeight:"700",fontSize:12},
 disabled:{opacity:.5},
 filters:{flexDirection:"row",flexWrap:"wrap",gap:7},
 filter:{backgroundColor:theme.white,borderWidth:1,borderColor:theme.border,borderRadius:18,paddingHorizontal:12,paddingVertical:10},
 filterActive:{backgroundColor:theme.green,borderColor:theme.green},
 filterText:{fontSize:12,color:theme.green,fontWeight:"700"},
 filterTextActive:{color:theme.white},
 count:{color:theme.ink,fontSize:13,fontWeight:"700"},
 card:{backgroundColor:theme.white,borderRadius:18,padding:17,borderWidth:1,borderColor:theme.border,gap:9},
 reference:{fontWeight:"800",fontSize:16,color:theme.ink},
 ready:{color:theme.green,fontWeight:"800",fontSize:12},
 meta:{color:theme.muted,fontSize:12},
 money:{color:theme.ink,fontSize:14,fontWeight:"800"},
 action:{paddingTop:8,paddingBottom:3},
 actionText:{color:theme.green,fontWeight:"800",fontSize:14},
 primary:{backgroundColor:theme.green,padding:16,alignItems:"center",borderRadius:14},
 primaryText:{color:theme.white,fontWeight:"800",fontSize:14},
 error:{color:"#A54536",fontSize:13,lineHeight:19},
 note:{color:theme.muted,fontSize:12,lineHeight:19}
});
