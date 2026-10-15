"use client";
import {useEffect} from "react";
import type {NearbyOffer} from "../lib/nearby-offers";

const KEY="km_nearby_offers_v1_enabled";
let checking=false;
let lastNotificationIds=new Set<string>();

export async function nearbyBrowserNotification(offer: NearbyOffer) {
  if(typeof Notification==="undefined"||Notification.permission!=="granted") return;
  try {
    const registration=await navigator.serviceWorker?.getRegistration("/account/nearby-offers/");
    if(registration && "showNotification" in registration) {
      await registration.showNotification("Αποκλειστική προσφορά κοντά σου", {
        body:`${offer.vendorName}: ${offer.title}`,
        icon:"/favicon.ico",tag:`km-nearby-${offer.id}`,
        data:{url:"/account/nearby-offers"}
      });
    } else {
      const notice=new Notification("Αποκλειστική προσφορά κοντά σου",{
        body:`${offer.vendorName}: ${offer.title}`,tag:`km-nearby-${offer.id}`
      });
      notice.onclick=()=>{window.focus();window.location.assign("/account/nearby-offers");};
    }
  } catch {
    // Permission alone does not guarantee platform-specific foreground delivery.
  }
}

export async function checkForNearbyOffers(csrfToken: string, onOffers?: (offers: NearbyOffer[])=>void) {
  if(checking||!navigator.geolocation) return;
  checking=true;
  try {
    const point=await new Promise<GeolocationPosition>((resolve,reject)=>
      navigator.geolocation.getCurrentPosition(resolve,reject,{maximumAge:60000,timeout:12000,enableHighAccuracy:false}));
    if(point.coords.accuracy>200) return;
    const response=await fetch("/api/account/nearby-offers", {
      method:"POST",headers:{"content-type":"application/json","x-csrf-token":csrfToken},
      body:JSON.stringify({
        latitude:point.coords.latitude,longitude:point.coords.longitude,accuracy:point.coords.accuracy
      }),cache:"no-store"
    });
    if(!response.ok) return;
    const payload=await response.json() as {offers:NearbyOffer[]};
    const offers=Array.isArray(payload.offers)?payload.offers:[];
    onOffers?.(offers);
    for(const offer of offers) {
      if(offer.notify&&!lastNotificationIds.has(offer.id)) {
        lastNotificationIds.add(offer.id);
        await nearbyBrowserNotification(offer);
      }
    }
    if(lastNotificationIds.size>100) lastNotificationIds=new Set();
  } catch {
    // Geolocation may be denied, unavailable or temporarily inaccurate.
  } finally {checking=false;}
}

export function NearbyOffersWatcher() {
  useEffect(()=>{
    let active=true,enabled=false,csrf="";
    async function hydrate(){
      if(!active || localStorage.getItem(KEY)!=="true")return;
      try {
        const pref=await fetch("/api/account/nearby-offers",{cache:"no-store"});
        if(!pref.ok)return;
        const state=await pref.json() as {enabled?:boolean;csrfToken?:string};
        csrf=state.csrfToken??"";
        if(!csrf)return;
        enabled=state.enabled===true;
        if(!enabled)localStorage.removeItem(KEY);
      }catch{/* fail closed */}
    }
    async function tick(){
      if(!active||!enabled||!csrf||document.visibilityState!=="visible")return;
      // Do not trigger a surprise browser permission prompt during background polling.
      try {
        const permission=await navigator.permissions?.query({name:"geolocation"});
        if(permission?.state!=="granted")return;
      } catch {return;}
      await checkForNearbyOffers(csrf);
    }
    void hydrate().then(()=>void tick());
    const timer=window.setInterval(()=>void tick(),120000);
    const updated=()=>{enabled=false;csrf="";void hydrate().then(()=>void tick());};
    const visible=()=>{if(document.visibilityState==="visible")void tick();};
    window.addEventListener("km-nearby-offers-settings-changed",updated);
    document.addEventListener("visibilitychange",visible);
    return()=>{active=false;window.clearInterval(timer);window.removeEventListener("km-nearby-offers-settings-changed",updated);document.removeEventListener("visibilitychange",visible);};
  },[]);
  return null;
}
export function rememberNearbyOffersEnabled(enabled:boolean){
  if(enabled)localStorage.setItem(KEY,"true");
  else localStorage.removeItem(KEY);
  window.dispatchEvent(new Event("km-nearby-offers-settings-changed"));
}
