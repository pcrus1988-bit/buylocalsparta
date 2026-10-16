import {useEffect,useMemo,useRef} from "react";
import {AccessibilityInfo,Animated,Easing,Image,StyleSheet,useWindowDimensions,View} from "react-native";

/**
 * Android cold-start logo assembly. Reuses the very same official KONTA MOY
 * image displayed on the home screen. Each piece is a clipped view of one
 * single image, so the final assembled mark cannot be retyped or recolored.
 */
const LOGO=require("../../assets/icon.png");
const GRID=3;
const ENTER_MS=860;
const STAGGER_MS=72;
const DIRECTIONS=[
 [-1,-1],[0,-1],[1,-1],
 [-1,0],[0,-1],[1,0],
 [-1,1],[0,1],[1,1]
] as const;

export const COMPANION_BOOT_DURATION_MS=
 ENTER_MS+(GRID*GRID-1)*STAGGER_MS+160+290+210;

type BootProps={ready:boolean;onComplete:()=>void};

export function CompanionBootSplash({ready,onComplete}:BootProps){
 const {width,height}=useWindowDimensions();
 // Integral cells prevent visible seams on Android device densities.
 const size=Math.max(180,Math.floor(Math.min(width*.82,348)/GRID)*GRID);
 const cell=size/GRID;
 const progress=useRef(DIRECTIONS.map(()=>new Animated.Value(0))).current;
 const pieceOpacity=useRef(new Animated.Value(1)).current;
 const fullOpacity=useRef(new Animated.Value(0)).current;
 const screenOpacity=useRef(new Animated.Value(1)).current;
 const started=useRef(false);
 const positions=useMemo(()=>DIRECTIONS.map(([x,y])=>({
  x:x*(width*.65+size*.5),
  y:y*(height*.56+size*.5)
 })),[width,height,size]);

 useEffect(()=>{
  if(!ready||started.current)return;
  started.current=true;
  let stopped=false;
  let running:Animated.CompositeAnimation|undefined;
  const finish=()=>{if(!stopped)onComplete();};
  const dismiss=()=>{
   if(stopped)return;
   running=Animated.sequence([
    Animated.delay(290),
    Animated.timing(screenOpacity,{toValue:0,duration:210,useNativeDriver:true})
   ]);
   running.start(result=>{if(result.finished)finish();});
  };
  const begin=async()=>{
   let reduceMotion=false;
   try{reduceMotion=await AccessibilityInfo.isReduceMotionEnabled();}
   catch{/* A static assembled mark is not required when API unavailable. */}
   if(stopped)return;
   if(reduceMotion){
    pieceOpacity.setValue(0);
    fullOpacity.setValue(1);
    dismiss();
    return;
   }
   running=Animated.parallel(progress.map((value,index)=>Animated.timing(value,{
    toValue:1,duration:ENTER_MS,delay:index*STAGGER_MS,
    easing:Easing.out(Easing.cubic),useNativeDriver:true
   })));
   running.start(result=>{
    if(stopped||!result.finished)return;
    // Single exact source image hides the fragment boundaries when assembled.
    running=Animated.parallel([
     Animated.timing(fullOpacity,{toValue:1,duration:160,useNativeDriver:true}),
     Animated.timing(pieceOpacity,{toValue:0,duration:160,useNativeDriver:true})
    ]);
    running.start(next=>{if(next.finished)dismiss();});
   });
  };
  void begin();
  return ()=>{
   stopped=true;
   running?.stop();
   for(const item of progress)item.stopAnimation();
   pieceOpacity.stopAnimation();
   fullOpacity.stopAnimation();
   screenOpacity.stopAnimation();
  };
 },[ready,progress,pieceOpacity,fullOpacity,screenOpacity,onComplete]);

 return <Animated.View
   accessibilityLabel="KONTA MOY"
   accessibilityElementsHidden
   importantForAccessibility="no-hide-descendants"
   pointerEvents="auto"
   style={[StyleSheet.absoluteFill,styles.canvas,{opacity:screenOpacity}]}>
   <View style={{width:size,height:size}}>
    <Animated.View style={[StyleSheet.absoluteFill,{opacity:pieceOpacity}]}>
     {DIRECTIONS.map(([dx,dy],index)=>{
      const row=Math.floor(index/GRID),col=index%GRID;
      const pos=positions[index];
      const value=progress[index];
      const translateX=value.interpolate({inputRange:[0,1],outputRange:[pos.x,0]});
      const translateY=value.interpolate({inputRange:[0,1],outputRange:[pos.y,0]});
      const rotate=value.interpolate({inputRange:[0,1],
       outputRange:[`${(dx-dy)*9}deg`,"0deg"]});
      const opacity=value.interpolate({inputRange:[0,.18,1],outputRange:[.6,1,1]});
      return <Animated.View key={index} style={{
       position:"absolute",left:col*cell,top:row*cell,
       width:cell,height:cell,overflow:"hidden",
       opacity,transform:[{translateX},{translateY},{rotate}]
      }}>
       <Image source={LOGO} resizeMode="stretch" fadeDuration={0}
        style={{position:"absolute",width:size,height:size,left:-col*cell,top:-row*cell}}/>
      </Animated.View>;
     })}
    </Animated.View>
    <Animated.Image source={LOGO} resizeMode="stretch" fadeDuration={0}
     style={{width:size,height:size,opacity:fullOpacity,position:"absolute",left:0,top:0}}/>
   </View>
 </Animated.View>;
}
const styles=StyleSheet.create({
 canvas:{backgroundColor:"#FFFFFF",alignItems:"center",justifyContent:"center",zIndex:10000,elevation:10000}
});
