import { Stack } from "expo-router";
import {useCallback,useEffect,useRef,useState} from "react";
import * as SplashScreen from "expo-splash-screen";
import {CompanionBootSplash} from "../components/CompanionBootSplash";
import * as Notifications from "expo-notifications";
import {Linking,View} from "react-native";
import {CompanionDock} from "../components/CompanionDock";
import {companionPushStatus} from "../lib/companion-push";
import {companionAuthorizedRequest} from "../lib/companion-session";
import { StatusBar } from "expo-status-bar";
import { theme } from "../theme";
import { CompanionForegroundWatcher } from "../components/CompanionForegroundWatcher";

// Keep the native white splash until the React logo animation is mounted.
void SplashScreen.preventAutoHideAsync().catch(()=>undefined);

export default function RootLayout() {
 const [layoutReady,setLayoutReady]=useState(false);
 const [bootComplete,setBootComplete]=useState(false);
 const nativeSplashHidden=useRef(false);
 const handleRootLayout=useCallback(()=>{
  if(nativeSplashHidden.current)return;
  nativeSplashHidden.current=true;
  setLayoutReady(true);
  void SplashScreen.hideAsync().catch(()=>undefined);
 },[]);
 const onBootComplete=useCallback(()=>setBootComplete(true),[]);
  useEffect(()=>{
    const open=(data:Record<string,unknown>|undefined)=>{
      if(!data)return;
      const url=data.productUrl;
      if(typeof url==="string"&&url.startsWith("https://kontamou.site/shop?")){
        void Linking.openURL(url);
      }
      const orderUrl=data.orderUrl;
      if(typeof orderUrl==="string" && orderUrl.length<180 &&
        /^https:\/\/kontamou\.site\/account\/orders\/[A-Za-z0-9_-]+$/.test(orderUrl)){
        void Linking.openURL(orderUrl);
      }
    };
    const subscription=Notifications.addNotificationResponseReceivedListener(response=>{
      open(response.notification.request.content.data);
    });
    // Also support the cold-start tap path on Android.
    void Notifications.getLastNotificationResponseAsync().then(response=>{
      if(response)open(response.notification.request.content.data);
    }).catch(()=>undefined);
    const rotated=Notifications.addPushTokenListener(token=>{
      if(token.type!=="fcm"||typeof token.data!=="string")return;
      // Re-register only a previously consented first-party mobile session.
      void companionPushStatus().then(status=>{
        if(!status.enabled)return;
        return companionAuthorizedRequest("/push/device","PUT",{
          token:token.data,
          purposes:{orderUpdates:status.orderUpdates,savedItems:status.savedItems,vendorOffers:false}
        });
      }).catch(()=>undefined);
    });
    return()=>{subscription.remove();rotated.remove();};
  },[]);
  return <View style={{flex:1,backgroundColor:"#FFFFFF"}} onLayout={handleRootLayout}>
    <CompanionForegroundWatcher />
    <StatusBar style="dark" />
    <View style={{flex:1}}>
    <Stack screenOptions={{
      headerStyle:{backgroundColor:theme.cream},
      headerTintColor:theme.green,
      headerTitleStyle:{fontWeight:"700"},
      contentStyle:{backgroundColor:theme.cream},
    }}>
      <Stack.Screen name="index" options={{title:"KONTA MOY"}} />
      <Stack.Screen name="shop" options={{title:"Αγορές"}} />
      <Stack.Screen name="color-studios" options={{title:"Color Studios"}} />
      <Stack.Screen name="color-studio" options={{title:"Color Finder"}} />
      <Stack.Screen name="sport-fit" options={{headerShown:false,title:"Sport & Fit Studio"}} />
      <Stack.Screen name="stores" options={{title:"Καταστήματα"}} />
      <Stack.Screen name="basket" options={{title:"Καλάθι"}} />
      <Stack.Screen name="services" options={{title:"Όλες οι υπηρεσίες"}} />
      <Stack.Screen name="nearby" options={{title:"Κοντά μου"}} />
      <Stack.Screen name="account" options={{title:"Ο λογαριασμός μου"}} />
      <Stack.Screen name="lists" options={{title:"Οι λίστες μου"}} />
      <Stack.Screen name="pickups" options={{title:"Οι παραλαβές μου"}} />
      <Stack.Screen name="orders" options={{title:"Οι παραγγελίες μου"}} />
      <Stack.Screen name="addresses" options={{title:"Οι διευθύνσεις μου"}} />
      <Stack.Screen name="notifications" options={{title:"Ειδοποιήσεις Android"}} />
      <Stack.Screen name="diagnostics" options={{title:"Έλεγχος λειτουργίας"}} />
    </Stack>
    <CompanionDock />
    </View>
    {!bootComplete&&<CompanionBootSplash ready={layoutReady} onComplete={onBootComplete}/>}
  </View>;
}
