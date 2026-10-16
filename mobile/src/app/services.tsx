import {Link,type Href} from "expo-router";
import {Pressable,ScrollView,StyleSheet,Text,View} from "react-native";
import {openMarketplace,type MarketplaceDestination} from "../lib/marketplace-navigation";
import {theme} from "../theme";

type Service={title:string;subtitle:string;icon:string;native?:Href;web?:MarketplaceDestination};
const CONSUMER:Service[]=[
 {title:"Αναζήτηση προϊόντων",subtitle:"Πραγματικές παραλλαγές και offline wishlist",icon:"⌕",native:"/shop"},
 {title:"Τοπικά καταστήματα",subtitle:"Επίσημος κατάλογος, brands και περιοχές",icon:"▤",native:"/stores"},
 {title:"BAZAAR",subtitle:"Προσφορές στον υπάρχοντα ιστότοπο",icon:"◇",web:{path:"/bazaar"}},
 {title:"Παραλαβές & QR",subtitle:"Έλεγχος παραγγελίας στον ασφαλή λογαριασμό",icon:"▣",native:"/pickups"},
 {title:"Παράδοση και πληρωμή",subtitle:"Εγκεκριμένη παράδοση και υπάρχον checkout",icon:"↗",web:{path:"/delivery-pickup"}},
 {title:"Ο λογαριασμός μου",subtitle:"Παραγγελίες, wishlist και επιλογές ασφάλειας",icon:"◉",native:"/account"}
];
const INTELLIGENCE:Service[]=[
 {title:"Nearby",subtitle:"Προαιρετικός έλεγχος πραγματικού τοπικού αποθέματος",icon:"⌖",native:"/nearby"},
 {title:"Sport & Fit Intelligence",subtitle:"Από τα επιλέξιμα προϊόντα στην ιστοσελίδα",icon:"◈",web:{path:"/shop",query:{q:"αθλητικά παπούτσια"}}},
 {title:"Try-On Me",subtitle:"Από τις επιλέξιμες σελίδες ενδυμάτων",icon:"◎",web:{path:"/shop",query:{q:"ρούχα"}}},
 {title:"Έλεγχος Android",subtitle:"Offline λειτουργία, άδειες και σύνδεση",icon:"✓",native:"/diagnostics"}
];
const BUSINESS:Service[]=[
 {title:"Είμαι επαγγελματίας",subtitle:"Υφιστάμενος ασφαλής λογαριασμός πωλητή",icon:"▥",web:{path:"/vendor/login"}},
 {title:"KONTA MOY FISCAL",subtitle:"Η ξεχωριστή υπηρεσία τιμολόγησης",icon:"≡",web:{path:"/timologio"}},
 {title:"Παρατηρητήριο λιανεμπορίου",subtitle:"Έρευνες, μεθοδολογία και δημόσια αποτελέσματα",icon:"◌",web:{path:"/research"}}
];
function Entry({item}:{item:Service}){
 const inner=<>
  <View style={styles.symbol}><Text style={styles.symbolText}>{item.icon}</Text></View>
  <View style={{flex:1,gap:3}}>
    <Text style={styles.name}>{item.title}</Text>
    <Text style={styles.description}>{item.subtitle}</Text>
  </View>
  <Text style={styles.chevron}>{item.native?"→":"↗"}</Text>
 </>;
 if(item.native)return <Link href={item.native} asChild><Pressable accessibilityRole="button" style={styles.entry}>{inner}</Pressable></Link>;
 return <Pressable accessibilityRole="link" onPress={()=>{if(item.web)void openMarketplace(item.web);}} style={styles.entry}>{inner}</Pressable>;
}
function Section({title,items}:{title:string;items:Service[]}){
 return <View style={styles.section}>
  <Text style={styles.heading}>{title}</Text>
  {items.map(item=><Entry item={item} key={item.title}/>)}
 </View>;
}
export default function Services(){
 return <ScrollView contentContainerStyle={styles.screen}>
  <Text style={styles.kicker}>KONTA MOY · ΥΠΗΡΕΣΙΕΣ</Text>
  <Text style={styles.title}>Όλο το KONTA MOY, ένα σημείο.</Text>
  <Text style={styles.lead}>Οι λειτουργίες Android ανοίγουν μέσα στο Companion. Όσα χρειάζονται την υπάρχουσα συνεδρία, το καλάθι ή διαχείριση επιχείρησης ανοίγουν στον ασφαλή ιστότοπο.</Text>
  <Section title="Αγορές και λογαριασμός" items={CONSUMER}/>
  <Section title="Έξυπνα εργαλεία" items={INTELLIGENCE}/>
  <Section title="Για την επιχείρηση" items={BUSINESS}/>
  <Text style={styles.note}>Η πρόσβαση σε μια υπηρεσία δεν εγγυάται ότι είναι διαθέσιμη για κάθε προϊόν, περιοχή ή λογαριασμό. Το Companion δεν αντιγράφει δεδομένα κάρτας ή κωδικούς και δεν αποθηκεύει ιστορικό GPS.</Text>
 </ScrollView>;
}
const styles=StyleSheet.create({
 screen:{padding:19,gap:16,paddingBottom:38},
 kicker:{fontSize:11,letterSpacing:1.5,color:theme.gold,fontWeight:"800"},
 title:{fontSize:31,lineHeight:39,color:theme.green,fontWeight:"800"},
 lead:{fontSize:14,lineHeight:22,color:theme.muted},
 section:{gap:10},
 heading:{fontSize:19,fontWeight:"800",color:theme.ink,paddingTop:6},
 entry:{padding:14,borderWidth:1,borderColor:theme.border,
    backgroundColor:theme.white,borderRadius:16,flexDirection:"row",alignItems:"center",gap:12},
 symbol:{height:45,width:45,borderRadius:14,backgroundColor:"#E6ECE6",
    alignItems:"center",justifyContent:"center"},
 symbolText:{fontSize:24,fontWeight:"800",color:theme.green},
 name:{fontSize:15,fontWeight:"800",color:theme.ink},
 description:{fontSize:12,lineHeight:18,color:theme.muted},
 chevron:{color:theme.green,fontWeight:"800",fontSize:18},
 note:{fontSize:12,color:theme.muted,lineHeight:19,marginTop:4}
});
