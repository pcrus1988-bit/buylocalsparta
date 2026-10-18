import {Link,usePathname,type Href} from "expo-router";
import {useEffect,useState} from "react";
import {Keyboard,Pressable,StyleSheet,Text,View} from "react-native";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {theme} from "../theme";

const TABS=[
 {href:"/" as const,symbol:"⌂",name:"Αρχική"},
 {href:"/shop" as const,symbol:"⌕",name:"Αγορές"},
 {href:"/lists" as const,symbol:"☷",name:"Λίστες"},
 {href:"/basket" as const,symbol:"▣",name:"Καλάθι"},
 {href:"/account" as const,symbol:"◉",name:"Εγώ"}
];
export function CompanionDock(){
 const pathname=usePathname();
 const insets=useSafeAreaInsets();
 const [keyboard,setKeyboard]=useState(false);
 useEffect(()=>{
  const shown=Keyboard.addListener("keyboardDidShow",()=>setKeyboard(true));
  const hidden=Keyboard.addListener("keyboardDidHide",()=>setKeyboard(false));
  return()=>{shown.remove();hidden.remove();};
 },[]);
 // Sport & Fit uses a fullscreen, distraction-free guided consultation.
 if(keyboard||pathname==="/sport-fit")return null;
 return <View accessibilityRole="tablist" style={[styles.bar,{paddingBottom:Math.max(insets.bottom,9)}]}>
   {TABS.map(t=><Link href={t.href as Href} asChild key={t.href}>
      <Pressable accessibilityRole="tab"
        accessibilityState={{selected:pathname===t.href}}
        accessibilityLabel={t.name}
        style={styles.entry}>
        <Text style={[styles.symbol,pathname===t.href&&styles.active]}>{t.symbol}</Text>
        <Text style={[styles.label,pathname===t.href&&styles.active]}>{t.name}</Text>
      </Pressable>
   </Link>)}
 </View>;
}
const styles=StyleSheet.create({
 bar:{flexDirection:"row",backgroundColor:theme.white,
      borderTopColor:theme.border,borderTopWidth:1,paddingTop:8,
      paddingHorizontal:5},
 entry:{flex:1,alignItems:"center",justifyContent:"center",paddingVertical:3,gap:2,
        minHeight:43},
 symbol:{fontSize:23,fontWeight:"800",color:theme.muted},
 label:{fontSize:11,fontWeight:"700",color:theme.muted},
 active:{color:theme.green}
});
