import { Stack } from "expo-router";
import {useEffect} from "react";
import * as Notifications from "expo-notifications";
import {Linking} from "react-native";
import { StatusBar } from "expo-status-bar";
import { theme } from "../theme";
import { CompanionForegroundWatcher } from "../components/CompanionForegroundWatcher";

export default function RootLayout() {
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
    return()=>subscription.remove();
  },[]);
  return <>
    <CompanionForegroundWatcher />
    <StatusBar style="dark" />
    <Stack screenOptions={{
      headerStyle:{backgroundColor:theme.cream},
      headerTintColor:theme.green,
      headerTitleStyle:{fontWeight:"700"},
      contentStyle:{backgroundColor:theme.cream},
    }}>
      <Stack.Screen name="index" options={{title:"KONTA MOY"}} />
      <Stack.Screen name="nearby" options={{title:"Κοντά μου"}} />
      <Stack.Screen name="account" options={{title:"Ο λογαριασμός μου"}} />
      <Stack.Screen name="lists" options={{title:"Οι λίστες μου"}} />
      <Stack.Screen name="pickups" options={{title:"Οι παραλαβές μου"}} />
      <Stack.Screen name="notifications" options={{title:"Ειδοποιήσεις Android"}} />
    </Stack>
  </>;
}
