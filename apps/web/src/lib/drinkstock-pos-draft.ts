/**
 * Safe, self-managed venue POS preparation. Persist only catalogue labels
 * and manual mappings. Never store POS credentials, URLs, payment claims or
 * connection authority in a customer-controlled configuration.
 */
import {GREEK_HOSPITALITY_POS_PROVIDERS} from "./drinkstock-pos-providers.ts";
import type {PosSetupPath,PosCsvItem,PosItemMapping,DrinkStockMenuItem} from "./drinkstock-pos-onboarding";
export type PosDraft={
 providerId:string;otherName:string;path:PosSetupPath;
 menu:PosCsvItem[];mappings:PosItemMapping[];
};
export type SavedPosDraft=PosDraft&{revision:number;updatedAt:string|null};
export class PosDraftError extends Error{
 readonly code:string;readonly status:number;
 constructor(code:string,status=400){super(code);this.code=code;this.status=status;}
}
const providers=new Set<string>(GREEK_HOSPITALITY_POS_PROVIDERS.map(p=>p.id));
const idPattern=/^[^\u0000-\u001f\u007f]{1,160}$/u;
const textOk=(v:unknown,max:number):v is string=>
 typeof v==="string"&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v);
const record=(x:unknown):x is Record<string,unknown>=>Boolean(x)&&typeof x==="object"&&!Array.isArray(x);
export const EMPTY_POS_DRAFT:PosDraft={providerId:"",otherName:"",path:"vendor_assisted",menu:[],mappings:[]};
export function validatePosDraft(value:unknown):PosDraft{
 if(!record(value))throw new PosDraftError("BAD_DRAFT");
 const {providerId,otherName,path,menu,mappings}=value;
 if(typeof providerId!=="string"||!(providers.has(providerId)||providerId==="other")||
 !textOk(otherName,90)||!["cloud","local_bridge","vendor_assisted"].includes(String(path))||
 !Array.isArray(menu)||menu.length>500||!Array.isArray(mappings)||mappings.length>500)
 throw new PosDraftError("BAD_DRAFT");
 if(providerId==="other"&&(otherName as string).trim().length<2)
 throw new PosDraftError("MISSING_POS_NAME");
 const unique=new Set<string>(),safeMenu:PosCsvItem[]=[];
 for(const raw of menu){
  if(!record(raw)||!textOk(raw.externalItemId,160)||!idPattern.test(raw.externalItemId)||
   !textOk(raw.name,200)||!raw.name.trim()||unique.has(raw.externalItemId))
   throw new PosDraftError("BAD_MENU_ITEM");
  unique.add(raw.externalItemId);
  safeMenu.push({externalItemId:raw.externalItemId,name:raw.name.trim()});
 }
 const seen=new Set<string>(),safeMap:PosItemMapping[]=[];
 for(const raw of mappings){
  if(!record(raw)||typeof raw.externalItemId!=="string"||
   !unique.has(raw.externalItemId)||seen.has(raw.externalItemId)||
   !textOk(raw.productId,64)||!(raw.productId===""||/^[a-f0-9-]{36}$/i.test(raw.productId)))
   throw new PosDraftError("BAD_MAPPING");
  seen.add(raw.externalItemId);
  safeMap.push({externalItemId:raw.externalItemId,productId:raw.productId});
 }
 // Freshly imported menu may have unmapped rows; do not infer approval.
 return {providerId,otherName:providerId==="other"?otherName.trim():"",
  path:path as PosSetupPath,menu:safeMenu,mappings:safeMap};
}
export function validateDraftProductMembership(draft:PosDraft,drinks:readonly DrinkStockMenuItem[]):void{
 const eligible=new Set(drinks.map(d=>d.id));
 if(draft.mappings.some(m=>m.productId&&!eligible.has(m.productId)))
  throw new PosDraftError("UNKNOWN_VENUE_PRODUCT",409);
}
export type PosSelfCheck={providerSelected:boolean;catalogueImported:boolean;
 mapped:number;total:number;unmapped:number;duplicateTargets:number;
 readyForVendorTest:boolean;liveConnected:false};
export function selfCheckDraft(draft:PosDraft,drinks:readonly DrinkStockMenuItem[]):PosSelfCheck{
 const valid=new Set(drinks.map(d=>d.id));const m=draft.mappings.filter(x=>x.productId&&valid.has(x.productId));
 const targetIds=m.map(x=>x.productId);
 const duplicateTargets=targetIds.length-new Set(targetIds).size;
 const mapped=new Set(m.map(x=>x.externalItemId)).size;
 return {providerSelected:providers.has(draft.providerId)||draft.providerId==="other"&&draft.otherName.trim().length>=2,
  catalogueImported:draft.menu.length>0,mapped,total:draft.menu.length,
  unmapped:Math.max(0,draft.menu.length-mapped),duplicateTargets,
  readyForVendorTest:Boolean(draft.providerId)&&draft.menu.length>0&&
   mapped===draft.menu.length&&duplicateTargets===0,liveConnected:false};
}
