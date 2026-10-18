import {useRouter} from "expo-router";
import {Image,Pressable,ScrollView,StyleSheet,Text,View} from "react-native";
import {COLOR_STUDIOS,type ColorStudioDefinition} from "../lib/color-studios";
import {theme} from "../theme";

const ART:Readonly<Record<ColorStudioDefinition["key"],string>>={
 nails:"nail-studio.png",lips:"lip-studio.png",eyes:"eye-studio.png",
 makeup:"makeup-studio.png",hair:"hair-color-studio.png",
 shoes:"shoe-studio.png",bags:"accessory-studio.png",
 fashion:"fashion-studio.png",home:"home-color-studio.png"
};
export default function NativeColorStudios(){
 const router=useRouter();
 return <ScrollView contentContainerStyle={styles.root}>
  <Text style={styles.eyebrow}>KONTA MOY · COLOR FINDER</Text>
  <Text style={styles.title}>Το χρώμα σου, το Studio σου.</Text>
  <Text style={styles.intro}>Εννέα Studios. Ξεκίνα από μια απόχρωση, ρύθμισέ την και δες πραγματικά προϊόντα του KONTA MOY ταξινομημένα με βάση τη χρωματική τους εγγύτητα.</Text>
  <View style={styles.hero}>
   <View style={styles.heroCopy}>
    <Text style={styles.heroTitle}>COLOR FIRST.</Text>
    <Text style={styles.heroSubtitle}>PRODUCT SECOND.</Text>
    <Text style={styles.heroBody}>Διάλεξε το αντικείμενο που θέλεις να ταιριάξεις.</Text>
   </View>
   <View style={styles.heroSwatches}>
    {["#7A2538","#D998A8","#806056","#C4A68C","#497657"].map(h=><View key={h} style={[styles.swatch,{backgroundColor:h}]}/>)}
   </View>
  </View>
  <Text style={styles.sectionTitle}>Τα Color Studios</Text>
  <View style={styles.grid}>
   {COLOR_STUDIOS.map((s,i)=><Pressable key={s.key} accessibilityRole="button"
     accessibilityLabel={s.english+" — "+s.description}
     onPress={()=>router.push({pathname:"/color-studio",params:{studio:s.key}})}
     style={styles.card}>
      <Image resizeMode="cover" style={styles.art}
       source={{uri:"https://kontamou.site/color-finder/studios/"+ART[s.key]}}/>
      <View style={styles.cardCopy}>
       <Text style={styles.number}>{String(i+1).padStart(2,"0")} / 09</Text>
       <Text style={styles.cardTitle}>{s.title}</Text>
       <Text style={styles.cardLabel}>{s.english}</Text>
       <Text style={styles.cardDescription}>{s.description}</Text>
       <Text style={styles.link}>Βρες το χρώμα σου →</Text>
      </View>
     </Pressable>)}
  </View>
  <Text style={styles.privacy}>Οι χρωματικές επιλογές γίνονται στη συσκευή σου. Η αναζήτηση αποχρώσεων χρησιμοποιεί μόνο το επιλεγμένο HEX και την κατηγορία. Φωτογραφίες δεν ανεβαίνουν αυτόματα στο Companion.</Text>
 </ScrollView>;
}
const styles=StyleSheet.create({
 root:{padding:19,gap:16,paddingBottom:42},
 eyebrow:{color:theme.gold,fontWeight:"800",letterSpacing:1.5,fontSize:11},
 title:{fontSize:33,fontWeight:"900",lineHeight:40,color:theme.green},
 intro:{color:theme.muted,fontSize:14,lineHeight:22},
 hero:{backgroundColor:theme.green,borderRadius:22,padding:19,gap:18},
 heroCopy:{gap:4},heroTitle:{fontSize:22,color:theme.white,fontWeight:"900"},
 heroSubtitle:{fontSize:17,color:"#D7C68C",fontWeight:"800"},
 heroBody:{fontSize:13,color:"#E9EFED",marginTop:9},
 heroSwatches:{flexDirection:"row",gap:8},
 swatch:{height:27,flex:1,borderRadius:15,borderWidth:1,borderColor:"#FFFFFF55"},
 sectionTitle:{fontSize:19,color:theme.ink,fontWeight:"800",marginTop:4},
 grid:{flexDirection:"row",flexWrap:"wrap",gap:10},
 card:{width:"48%",backgroundColor:theme.white,borderWidth:1,borderColor:theme.border,borderRadius:17,overflow:"hidden",flexGrow:1},
 art:{width:"100%",height:132,backgroundColor:theme.cream},
 cardCopy:{padding:12,gap:5},
 number:{color:theme.gold,fontSize:11,fontWeight:"800"},
 cardTitle:{color:theme.green,fontSize:19,fontWeight:"800"},
 cardLabel:{color:theme.muted,fontSize:9,fontWeight:"800",letterSpacing:.7},
 cardDescription:{fontSize:12,lineHeight:17,color:theme.muted,minHeight:34},
 link:{color:theme.green,fontSize:12,fontWeight:"800",marginTop:5},
 privacy:{fontSize:12,lineHeight:19,color:theme.muted,paddingTop:8}
});
