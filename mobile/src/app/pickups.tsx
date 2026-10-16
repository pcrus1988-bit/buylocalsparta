import {useFocusEffect} from "expo-router";
import {useCallback,useState} from "react";
import {ActivityIndicator,Pressable,ScrollView,StyleSheet,Text,View} from "react-native";
import {loadCompanionAccount,type CompanionOrder} from "../lib/companion-session";
import {pickupBadge,pickupCounts,pickupOrderPath,pickupOrders} from "../lib/pickup-model";
import {openMarketplace} from "../lib/marketplace-navigation";
import {theme} from "../theme";

const pickupText={
 ready:"Έτοιμη για παραλαβή",
 pending:"Αναμονή επιβεβαίωσης",
 closed:"Ακυρωμένη / ολοκληρωμένη επιστροφή"
} as const;

function total(minor:number,currency:string){
 if(!Number.isSafeInteger(minor)||minor<0)return "";
 try{return new Intl.NumberFormat("el-GR",{style:"currency",currency:currency||"EUR"}).format(minor/100);}
 catch{return (minor/100).toFixed(2)+" €";}
}

/** Read-only authenticated pickup snapshot; no local QR, secrets, or cached order payload. */
export default function CompanionPickups(){
 const [orders,setOrders]=useState<CompanionOrder[]|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const refresh=useCallback(async()=>{
  setLoading(true);setError("");
  try{
   const account=await loadCompanionAccount();
   setOrders(account?account.orders:null);
  }catch{
   setOrders(null);
   setError("Δεν έγινε ενημέρωση παραλαβών. Έλεγξε τη σύνδεσή σου.");
  }finally{setLoading(false);}
 },[]);
 useFocusEffect(useCallback(()=>{void refresh();},[refresh]));
 const pickups=orders?pickupOrders(orders):[];
 const counts=orders?pickupCounts(orders):{total:0,ready:0};
 async function openOrder(id:string){
  try{await openMarketplace({path:pickupOrderPath(id)});}
  catch{setError("Δεν άνοιξε η ασφαλής παραγγελία στον ιστότοπο.");}
 }
 async function openAll(){
  try{await openMarketplace({path:"/account/orders",query:{view:"pickup"}});}
  catch{setError("Δεν άνοιξε ο ασφαλής λογαριασμός.");}
 }
 return <ScrollView contentContainerStyle={styles.screen}>
   <Text style={styles.kicker}>KONTA MOY COMPANION · ΠΑΡΑΛΑΒΕΣ</Text>
   <Text style={styles.title}>Οι παραλαβές μου</Text>
   <Text style={styles.copy}>Δες την πραγματική κατάσταση των παραγγελιών παραλαβής σου. Το QR ανοίγει μόνο στον ασφαλή λογαριασμό KONTA MOY.</Text>
   <View style={styles.card}>
    <View style={styles.row}>
     <Text style={styles.heading}>Κατάσταση παραλαβών</Text>
     <Pressable accessibilityRole="button" disabled={loading}
       onPress={()=>void refresh()} style={[styles.refresh,loading&&styles.disabled]}>
      <Text style={styles.refreshLabel}>Ανανέωση</Text>
     </Pressable>
    </View>
    {loading?<ActivityIndicator color={theme.green} accessibilityLabel="Φόρτωση παραλαβών"/>:
      orders===null?
      <Text style={styles.copy}>Η εγγενής σύνδεση λογαριασμού δεν είναι διαθέσιμη σε αυτή την έκδοση ή δεν έχεις συνδεθεί. Μπορείς να δεις τις παραλαβές σου μέσω του ασφαλούς browser.</Text>:
      <>
       <Text style={styles.stats}>{counts.ready} έτοιμες · {counts.total} παραγγελίες παραλαβής</Text>
       {pickups.length===0?<Text style={styles.copy}>Δεν υπάρχουν παραγγελίες παραλαβής στα 25 πιο πρόσφατα αποτελέσματα του λογαριασμού.</Text>:
        pickups.map(order=>{
         const badge=pickupBadge(order);
         return <View style={styles.order} key={order.id}>
          <View style={styles.row}>
           <Text style={styles.orderTitle}>{order.reference}</Text>
           <Text style={[styles.status,badge==="ready"&&styles.ready]}>{pickupText[badge]}</Text>
          </View>
          <Text style={styles.meta}>Κατάσταση παραγγελίας: {order.status}</Text>
          <Text style={styles.meta}>{total(order.totalMinor,order.currency)}</Text>
          <Pressable accessibilityRole="link" onPress={()=>void openOrder(order.id)}>
           <Text style={styles.orderLink}>{badge==="ready"?"Άνοιγμα ασφαλούς QR / κωδικού ↗":"Λεπτομέρειες παραγγελίας ↗"}</Text>
          </Pressable>
         </View>;
        })
       }
      </>
    }
    {error!==""&&<Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>}
    <Pressable accessibilityRole="button" style={styles.primary} onPress={()=>void openAll()}>
      <Text style={styles.primaryText}>Οι παραλαβές μου στον ιστότοπο ↗</Text>
    </Pressable>
   </View>
   <View style={styles.card}>
    <Text style={styles.heading}>Πώς παραλαμβάνω;</Text>
    <Text style={styles.step}>1. Περίμενε μέχρι η παραγγελία να δηλωθεί έτοιμη.</Text>
    <Text style={styles.step}>2. Άνοιξε τα στοιχεία της συγκεκριμένης παραγγελίας στον ασφαλή λογαριασμό.</Text>
    <Text style={styles.step}>3. Δείξε τον έγκυρο κωδικό στο φυσικό κατάστημα κατά την παραλαβή.</Text>
   </View>
   <Text style={styles.note}>Οι καταστάσεις προέρχονται αποκλειστικά από τον λογαριασμό σου όταν είναι ενεργή η εγγενής σύνδεση. Δεν δημιουργούμε ή αποθηκεύουμε QR, δεν διατηρούμε αντίγραφα παραγγελιών στη συσκευή και δεν υποθέτουμε διαθεσιμότητα καταστήματος.</Text>
 </ScrollView>;
}
const styles=StyleSheet.create({
 screen:{padding:22,paddingBottom:58,gap:18},
 kicker:{color:theme.gold,fontWeight:"800",letterSpacing:1.3,fontSize:11},
 title:{color:theme.green,fontWeight:"800",fontSize:31,lineHeight:39},
 copy:{color:theme.muted,fontSize:14,lineHeight:22},
 card:{backgroundColor:theme.white,borderWidth:1,borderColor:theme.border,borderRadius:19,padding:18,gap:14},
 heading:{color:theme.green,fontSize:19,fontWeight:"800",flexShrink:1},
 row:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:8,flexWrap:"wrap"},
 refresh:{borderColor:theme.border,borderWidth:1,borderRadius:10,padding:10},
 refreshLabel:{color:theme.green,fontWeight:"700",fontSize:12},
 disabled:{opacity:.5},
 stats:{color:theme.ink,fontWeight:"800",fontSize:14},
 order:{padding:13,borderRadius:13,borderColor:theme.border,borderWidth:1,backgroundColor:theme.cream,gap:7},
 orderTitle:{color:theme.ink,fontWeight:"800",fontSize:15},
 status:{fontSize:12,color:theme.muted,fontWeight:"800"},
 ready:{color:theme.green},
 meta:{fontSize:12,color:theme.muted},
 orderLink:{fontSize:14,color:theme.green,fontWeight:"800",paddingTop:6},
 step:{color:theme.ink,fontSize:14,lineHeight:22},
 primary:{padding:15,borderRadius:13,backgroundColor:theme.green,alignItems:"center"},
 primaryText:{color:theme.white,fontWeight:"800",fontSize:14},
 error:{color:"#A54536",fontSize:13,lineHeight:19},
 note:{fontSize:12,lineHeight:19,color:theme.muted}
});
