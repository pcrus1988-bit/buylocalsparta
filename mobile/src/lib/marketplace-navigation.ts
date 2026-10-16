import {Linking} from "react-native";
import * as WebBrowser from "expo-web-browser";
import {marketplaceUrl,type MarketplaceDestination} from "./marketplace-links";
export {marketplaceUrl,type MarketplaceDestination} from "./marketplace-links";

/**
 * First-party storefront handoff via Android Custom Tabs. Browser-owned
 * cookies/cart/payment stay with the secure browser, never copied into Expo.
 */
export async function openMarketplace(destination:MarketplaceDestination){
 const url=marketplaceUrl(destination);
 try{
  await WebBrowser.openBrowserAsync(url,{
   toolbarColor:"#193E32",secondaryToolbarColor:"#BE9850",
   showTitle:true
  });
 }catch{
  // Fallback for devices without supported Custom Tabs.
  await Linking.openURL(url);
 }
}
