import * as Notifications from "expo-notifications";
import {Platform} from "react-native";
import {companionAuthorizedRequest} from "./companion-session";

export type PushPurposes={orderUpdates:boolean;savedItems:boolean;vendorOffers:false};
export type PushDeviceStatus=PushPurposes & {enabled:boolean};
const CHANNEL="companion-updates";
async function pushPermission(){
 await Notifications.setNotificationChannelAsync(CHANNEL,{
   name:"Ενημερώσεις λογαριασμού",
   importance:Notifications.AndroidImportance.DEFAULT,
   vibrationPattern:[0,180,120,180],lightColor:"#193E32"
 });
 const current=await Notifications.getPermissionsAsync();
 if(current.granted)return true;
 if(!current.canAskAgain)return false;
 return (await Notifications.requestPermissionsAsync()).granted;
}
export async function companionPushStatus(){
 return companionAuthorizedRequest<PushDeviceStatus>("/push/device","GET");
}
export async function registerCompanionPush(purposes:PushPurposes){
 if(Platform.OS!=="android")throw Error("ANDROID_ONLY");
 if(!purposes.orderUpdates&&!purposes.savedItems)throw Error("NO_PURPOSE_SELECTED");
 if(purposes.vendorOffers!==false)throw Error("MARKETING_NOT_SUPPORTED");
 if(!await pushPermission())throw Error("NOTIFICATION_PERMISSION_DENIED");
 // Native FCM token. Requires google-services.json in signed Android dev build.
 const result=await Notifications.getDevicePushTokenAsync();
 if(result.type!=="fcm"||typeof result.data!=="string")throw Error("FCM_NOT_CONFIGURED");
 return companionAuthorizedRequest<PushDeviceStatus>("/push/device","PUT",{
   token:result.data,purposes
 });
}
export async function disableCompanionPush(){
 return companionAuthorizedRequest<PushDeviceStatus>("/push/device","DELETE");
}
export async function sendCompanionTestPush(){
 return companionAuthorizedRequest<{submitted:boolean}>("/push/test","POST");
}
