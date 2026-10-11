/**
 * Pure, fail-closed routing policy between KONTA MOY and the independent
 * FISCAL service. Never forward marketplace cookies or mutate API requests.
 */
export type FiscalRouteDecision =
 | Readonly<{kind:"marketplace"}>
 | Readonly<{kind:"local_admin_sso";path:"/admin/fiscal-access"}>
 | Readonly<{kind:"redirect";url:string}>
 | Readonly<{kind:"deny"}>
 | Readonly<{kind:"unavailable"}>;

const marketPath = (path:string,root:string) =>
 path === root || path.startsWith(root+"/");

function trustedFiscalOrigin(raw:string|undefined,marketplaceOrigin:string):string|undefined{
 if(!raw?.trim())return undefined;
 try{
  const parsed=new URL(raw.trim());
  if(parsed.protocol!=="https:"||parsed.username||parsed.password||
    parsed.pathname!=="/"||parsed.search||parsed.hash||
    parsed.origin===marketplaceOrigin)return undefined;
  return parsed.origin;
 }catch{return undefined;}
}

/**
 * The marketplace owns only its vendor confirmation page and API endpoint.
 * All other FISCAL HTTP APIs are private to the independent service hostname.
 * Browser navigation is a redirect rather than a cross-origin rewrite, so
 * merchant session cookies cannot accidentally become marketplace cookies.
 */
export function fiscalMarketplaceRoute(input:Readonly<{
 pathname:string;search:string;method:string;
 marketplaceOrigin:string;fiscalBaseUrl:string|undefined;
}>):FiscalRouteDecision{
 const {pathname,method}=input;
 if(!marketPath(pathname,"/timologio")&&!marketPath(pathname,"/timologio-admin"))
  return {kind:"marketplace"};
 if(pathname==="/timologio/marketplace-link")
  return method==="GET"||method==="HEAD"?{kind:"marketplace"}:{kind:"deny"};
 if(pathname==="/timologio/api/marketplace-link/confirm")
  return {kind:"marketplace"};
 if(marketPath(pathname,"/timologio/api")||
    marketPath(pathname,"/timologio-admin/api")||
    marketPath(pathname,"/timologio-admin/sso"))
  return {kind:"deny"};
 if(method!=="GET"&&method!=="HEAD")return {kind:"deny"};
 if(marketPath(pathname,"/timologio-admin"))
  return {kind:"local_admin_sso",path:"/admin/fiscal-access"};
 const origin=trustedFiscalOrigin(input.fiscalBaseUrl,input.marketplaceOrigin);
 if(!origin)return {kind:"unavailable"};
 // The Next URL supplies already-normalized paths and search values.
 if(!pathname.startsWith("/")||pathname.startsWith("//")||
   (input.search&&!input.search.startsWith("?")))return {kind:"deny"};
 return {kind:"redirect",url:origin+pathname+input.search};
}
