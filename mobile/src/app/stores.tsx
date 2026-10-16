import {Link} from "expo-router";
import {useState} from "react";
import {Pressable,ScrollView,StyleSheet,Text,TextInput,View} from "react-native";
import {openMarketplace} from "../lib/marketplace-navigation";
import {theme} from "../theme";

export default function Stores(){
 const [query,setQuery]=useState("");
 const [message,setMessage]=useState("");
 async function search(){
  if(query.trim().length<2){setMessage("Γράψε τουλάχιστον 2 γράμματα.");return;}
  setMessage("");
  try{await openMarketplace({path:"/shops",query:{q:query.trim()}});}
  catch{setMessage("Δεν άνοιξε ο κατάλογος καταστημάτων. Έλεγξε το internet.");}
 }
 return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.screen}>
   <Text style={styles.kicker}>KONTA MOY · ΚΑΤΑΣΤΗΜΑΤΑ</Text>
   <Text style={styles.title}>Η τοπική αγορά, στο κινητό σου.</Text>
   <Text style={styles.body}>Γνώρισε πραγματικά καταστήματα και τους ανθρώπους πίσω από τα προϊόντα τους. Η προβολή των καταστημάτων γίνεται στον επίσημο δημόσιο κατάλογο KONTA MOY.</Text>
   <View style={styles.card}>
    <Text style={styles.heading}>Βρες κατάστημα</Text>
    <TextInput value={query} onChangeText={setQuery} maxLength={80}
      placeholder="Όνομα ή είδος καταστήματος"
      accessibilityLabel="Αναζήτηση ονόματος καταστήματος"
      returnKeyType="search" onSubmitEditing={()=>void search()}
      style={styles.input}/>
    <Pressable accessibilityRole="button" onPress={()=>void search()} style={styles.primary}>
     <Text style={styles.primaryText}>Αναζήτηση καταστημάτων ↗</Text>
    </Pressable>
    {message!==""&&<Text accessibilityLiveRegion="polite" style={styles.note}>{message}</Text>}
   </View>
   <View style={styles.cards}>
    <Pressable accessibilityRole="link" style={styles.feature}
      onPress={()=>void openMarketplace({path:"/shops"})}>
      <Text style={styles.symbol}>▤</Text>
      <View style={{flex:1,gap:5}}>
       <Text style={styles.heading}>Κατάλογος καταστημάτων</Text>
       <Text style={styles.body}>Όλα τα εγκεκριμένα δημόσια προφίλ και διαθέσιμα στοιχεία.</Text>
      </View>
      <Text style={styles.chevron}>↗</Text>
    </Pressable>
    <Pressable accessibilityRole="link" style={styles.feature}
      onPress={()=>void openMarketplace({path:"/brands"})}>
      <Text style={styles.symbol}>◎</Text>
      <View style={{flex:1,gap:5}}>
       <Text style={styles.heading}>Brands & μάρκες</Text>
       <Text style={styles.body}>Ανακάλυψε τους κατασκευαστές και τα προϊόντα τους.</Text>
      </View>
      <Text style={styles.chevron}>↗</Text>
    </Pressable>
    <Pressable accessibilityRole="link" style={styles.feature}
      onPress={()=>void openMarketplace({path:"/choose-location"})}>
      <Text style={styles.symbol}>⌖</Text>
      <View style={{flex:1,gap:5}}>
       <Text style={styles.heading}>Η περιοχή μου</Text>
       <Text style={styles.body}>Επίλεξε την περιοχή αγορών στην επίσημη ιστοσελίδα.</Text>
      </View>
      <Text style={styles.chevron}>↗</Text>
    </Pressable>
   </View>
   <View style={styles.dark}>
    <Text style={styles.darkTitle}>Τι υπάρχει δίπλα μου;</Text>
    <Text style={styles.darkCopy}>Μόνο μετά τη δική σου επιλογή μπορείς να ελέγξεις εγκεκριμένες φυσικές τοποθεσίες με φρέσκο απόθεμα για παραλαβή. Δεν εμφανίζουμε υποθετικές τοποθεσίες.</Text>
    <Link href="/nearby" asChild><Pressable accessibilityRole="button" style={styles.gold}>
     <Text style={styles.goldText}>Επιλογή ελέγχου Nearby →</Text>
    </Pressable></Link>
   </View>
   <Text style={styles.note}>Η αναζήτηση ανοίγει την πραγματική δημόσια σελίδα καταστημάτων. Δεν αποθηκεύουμε GPS ή ιστορικό επισκέψεων για αυτή τη λειτουργία.</Text>
 </ScrollView>;
}
const styles=StyleSheet.create({
 screen:{padding:20,gap:16,paddingBottom:40},
 kicker:{fontSize:11,letterSpacing:1.5,color:theme.gold,fontWeight:"800"},
 title:{fontSize:32,lineHeight:40,color:theme.green,fontWeight:"800"},
 body:{fontSize:14,lineHeight:22,color:theme.muted},
 card:{backgroundColor:theme.white,borderRadius:18,borderColor:theme.border,borderWidth:1,padding:17,gap:12},
 heading:{fontSize:17,fontWeight:"800",color:theme.ink},
 input:{height:52,borderWidth:1,borderColor:theme.border,borderRadius:12,paddingHorizontal:13,fontSize:16,color:theme.ink},
 primary:{padding:15,backgroundColor:theme.green,borderRadius:12,alignItems:"center"},
 primaryText:{fontSize:14,fontWeight:"800",color:theme.white},
 cards:{gap:11},
 feature:{padding:17,backgroundColor:theme.white,borderWidth:1,borderColor:theme.border,borderRadius:16,
    flexDirection:"row",alignItems:"center",gap:12},
 symbol:{fontSize:23,color:theme.green,fontWeight:"800"},
 chevron:{fontSize:19,color:theme.green},
 dark:{backgroundColor:theme.green,borderRadius:20,padding:20,gap:12},
 darkTitle:{fontSize:22,color:theme.white,fontWeight:"800"},
 darkCopy:{fontSize:14,color:"#E4ECE5",lineHeight:22},
 gold:{backgroundColor:theme.gold,padding:14,borderRadius:12,alignItems:"center"},
 goldText:{fontSize:14,color:theme.ink,fontWeight:"800"},
 note:{fontSize:12,color:theme.muted,lineHeight:19}
});
