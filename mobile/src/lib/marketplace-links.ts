const ORIGIN="https://kontamou.site";
const PRODUCT_PATH=/^\/product\/[a-zA-Z0-9_-]{6,180}$/;
const ORDER_DETAIL_PATH=/^\/account\/orders\/[A-Za-z0-9_-]{6,128}$/;
const ROUTES=new Set([
 "/shop","/shops","/brands","/bazaar","/cart","/checkout",
 "/account","/account/orders","/account/security",
 "/delivery-pickup","/payments-security","/choose-location",
 "/research","/research/greek-retail-2026","/timologio",
 "/vendor","/vendor/login","/color-finder"
]);
export type MarketplaceDestination={
  path:string;
  query?:Readonly<Record<string,string>>;
};
export function marketplaceUrl(destination:MarketplaceDestination):string{
 if(!ROUTES.has(destination.path)&&!PRODUCT_PATH.test(destination.path)&&!ORDER_DETAIL_PATH.test(destination.path))throw new Error("UNAPPROVED_MARKETPLACE_DESTINATION");
 const url=new URL(destination.path,ORIGIN);
 if(destination.query){
  const keys=Object.keys(destination.query);
  if(keys.length>3)throw new Error("INVALID_MARKETPLACE_QUERY");
  for(const key of keys){
   const value=destination.query[key];
   if(!["q","category","page","view","color"].includes(key)
     ||typeof value!=="string"||value.length>120
     ||Array.from(value).some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127))
     throw new Error("INVALID_MARKETPLACE_QUERY");
   if(value.trim())url.searchParams.set(key,value.trim());
  }
 }
 return url.toString();
}
