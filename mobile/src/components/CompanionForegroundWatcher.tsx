import {useEffect} from "react";
import {AppState,DeviceEventEmitter} from "react-native";
import * as Location from "expo-location";
import {getPreferences} from "../lib/companion-store";
import {scanVerifiedNearbyStock} from "../lib/nearby-client";
import {notifyRelevantItem} from "../lib/companion-notifications";

/**
 * Runs only while the Android app is in the foreground; no background tasks,
 * geofences or ACCESS_BACKGROUND_LOCATION requested or registered.
 */
export function CompanionForegroundWatcher(){
 useEffect(()=>{
  let disposed=false;
  let locationSubscription:Location.LocationSubscription|undefined;
  let running=false;
  let lastScan=0;
  async function stop(){
    locationSubscription?.remove();locationSubscription=undefined;
  }
  async function start(){
    if(disposed||locationSubscription||AppState.currentState!=="active")return;
    const pref=await getPreferences().catch(()=>({shoppingReminders:false,vendorOffers:false}));
    if(disposed||!pref.shoppingReminders)return;
    const permission=await Location.getForegroundPermissionsAsync();
    if(disposed||permission.status!=="granted")return;
    const sub=await Location.watchPositionAsync(
      {accuracy:Location.Accuracy.Balanced,distanceInterval:100,timeInterval:120000},
      position=>void (async()=>{
        if(disposed||running||AppState.currentState!=="active")return;
        const now=Date.now();
        if(now-lastScan<120000)return;
        lastScan=now;running=true;
        try{
          const fresh=await getPreferences();
          if(!fresh.shoppingReminders)return;
          const {matches}=await scanVerifiedNearbyStock(position.coords);
          for(const item of matches.slice(0,2)){
            // Local Android notification, not FCM remote push.
            if(disposed || AppState.currentState!=="active")break;
            await notifyRelevantItem(item);
          }
        }catch{/* poor GPS/network must never trigger an unverified alert */}
        finally{running=false;}
      })()
    );
    if(disposed||AppState.currentState!=="active")sub.remove();
    else locationSubscription=sub;
  }
  const preferenceChanged=DeviceEventEmitter.addListener("companion-preferences-changed",()=>{
    void stop().then(()=>start());
  });
  const changed=AppState.addEventListener("change",status=>{
    if(status==="active")void start();
    else void stop();
  });
  // Re-read preference after returning to the app; never prompt from watcher.
  void start();
  return()=>{disposed=true;changed.remove();preferenceChanged.remove();void stop();};
 },[]);
 return null;
}
