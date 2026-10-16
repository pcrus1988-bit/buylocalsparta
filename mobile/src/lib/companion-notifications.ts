import * as Notifications from "expo-notifications";
import {mayNotify} from "./companion-store";
import type {MatchedProduct} from "./nearby-matching";

Notifications.setNotificationHandler({
  handleNotification: async()=>({
    shouldPlaySound:false,shouldSetBadge:false,shouldShowBanner:true,shouldShowList:true
  })
});

export async function requestCompanionNotifications():Promise<boolean>{
  await Notifications.setNotificationChannelAsync("shopping-reminders",{
    name:"Υπενθυμίσεις αγορών",importance:Notifications.AndroidImportance.DEFAULT,
    vibrationPattern:[0,150,100,150],lightColor:"#193E32",
  });
  const current=await Notifications.getPermissionsAsync();
  if(current.granted)return true;
  if(!current.canAskAgain)return false;
  const result=await Notifications.requestPermissionsAsync();
  return result.granted;
}

export async function notifyRelevantItem(match:MatchedProduct):Promise<boolean>{
  const permission=await Notifications.getPermissionsAsync();
  if(!permission.granted)return false;
  const key=`shopping:${match.itemId}:${match.vendorId}`;
  if(!await mayNotify(key))return false;
  await Notifications.scheduleNotificationAsync({
    content:{
      title:"KONTA MOY Companion · Κοντινή υπενθύμιση",
      body:`Ίσως βρήκαμε «${match.itemTitle}» στο ${match.vendorName}. Δες διαθεσιμότητα πριν πας.`,
      data:{type:"shopping_reminder",productUrl:match.productUrl},
    },
    trigger:null,
  });
  return true;
}
