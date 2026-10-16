import {Linking} from "react-native";
import {marketplaceUrl,type MarketplaceDestination} from "./marketplace-links";
export {marketplaceUrl,type MarketplaceDestination} from "./marketplace-links";
/** Browser owns website cart, checkout, cookies and payment credentials. */
export async function openMarketplace(destination:MarketplaceDestination){
 await Linking.openURL(marketplaceUrl(destination));
}
