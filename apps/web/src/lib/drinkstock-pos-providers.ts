/**
 * Greek hospitality POS integration targets — evidence-based onboarding registry.
 *
 * These are candidate software systems, not measured market-share rankings.
 * Registration here never means a connected/approved integration. Every
 * provider starts blocked until vendor access, venue configuration and
 * production end-to-end tests establish actual capabilities.
 */
import type {PosCapability} from "./drinkstock-pos-contract";

export const GREEK_HOSPITALITY_POS_PROVIDERS=[
 {
  id:"epsilon_pylon_restaurant",name:"EPSILON NET PYLON Restaurant",vendor:"EPSILON NET",
  product:"PYLON Restaurant Hybrid",approach:"vendor_bridge",
  evidence:["https://epsilonnet.gr/eidos-logismikou/efarmoges-estiasis-delivery/","https://www.nexi.gr/el/erp%20providers/erp%20providers/"],
  note:"Nexi WebECR is payment-terminal interoperability, NOT a drink sales API."
 },
 {
  id:"softone_fnb",name:"SOFTONE F&B",vendor:"ENTERSOFTONE",
  product:"SOFTONE F&B",approach:"vendor_cloud_or_local_bridge",
  evidence:["https://entersoftonefnb.gr/eurobank/tourismos/programma-parangeliolipsias/","https://www.softone.gr/erp-pos/"],
  note:"Confirm restaurant deployment-specific integration license, sales-event operations and certified merchant."
 },
 {
  id:"wizcom_inorder",name:"Wizcom inOrder",vendor:"Wizcom",
  product:"inOrder",approach:"vendor_bridge",
  evidence:["https://www.wizcom.gr/software/inorder","https://www.wizcom.gr/software/inorder/delivery"],
  note:"Published efood/Wolt bridge does not itself authorize independent POS order writes."
 },
 {
  id:"twinsoft_orexsys",name:"Twinsoft OREXSYS",vendor:"Twinsoft",
  product:"OREXSYS",approach:"vendor_local_bridge",
  evidence:["https://www.twinsoftathens.gr/el-gr/twinsoft-athens-orexsys.html"],
  note:"Require documented vendor-approved transaction/receipt interface; no private protocol scraping."
 },
 {
  id:"megasoft_prisma_win",name:"Megasoft PRISMA Win Restaurant",vendor:"Megasoft",
  product:"PRISMA Win Restaurant-Café",approach:"vendor_web_services",
  evidence:["https://www.megasoft.gr/emporikes-efarmoges/emporikes-efarmoges-epipleon-diaxeiriseis/web-services-e-commerce","https://www.megasoft.gr/proionta/pos-efarmoges"],
  note:"Web services document item/price/availability reads and order writes; confirm final paid sale events, deployed version and license."
 },
 {
  id:"oracle_simphony",name:"Oracle MICROS Simphony",vendor:"Oracle via Eurotel",
  product:"Simphony POS",approach:"documented_api_provisioning",
  evidence:["https://www.eurotel.gr/hospitality/partner/oracle-hospitality","https://docs.oracle.com/en/industries/food-beverage/simphony/omsstsg2api/index.html"],
  note:"Oracle STS Gen2 check/menu/notification API; provisioning, location and revenue center permissions mandatory."
 },
 {
  id:"poseidon_anima_menu",name:"Poseidon Anima Menu",vendor:"Poseidon Software",
  product:"Anima Menu",approach:"vendor_bridge",
  evidence:["https://www.animamenu.gr/","https://www.poseidon.gr/"],
  note:"Existing efood/eDelivery integration is not a general partner API specification."
 },
 {
  id:"semantic_garsonista",name:"Semantic Garsonista",vendor:"Semantic Software",
  product:"Garsonista",approach:"vendor_bridge",
  evidence:["https://garsonista.gr/products/","https://www.nexi.gr/el/erp%20providers/erp%20providers/"],
  note:"Nexi WebECR integration is fiscal/payment-terminal oriented; require item-level sales interface."
 },
 {
  id:"simply_rest",name:"Simply REST",vendor:"Simply",
  product:"Simply REST / ADMATE REST",approach:"vendor_bridge",
  evidence:["https://www.simplycloud.gr/","https://www.nexi.gr/el/erp%20providers/erp%20providers/"],
  note:"Confirm specific merchant product/version; REST is a product name, not proof of RESTful API."
 },
 {
  id:"fastorder",name:"FastOrder",vendor:"FastOrder",
  product:"FastOrder hospitality ordering",approach:"vendor_bridge",
  evidence:["https://www.fastorder.gr/integrations"],
  note:"Published bridges to other ERP/POS brands do not prove a public third-party DrinkStock API."
 }
] as const;
export type GreekHospitalityPosId=typeof GREEK_HOSPITALITY_POS_PROVIDERS[number]["id"];
export type PosProviderApproach=typeof GREEK_HOSPITALITY_POS_PROVIDERS[number]["approach"];
export type PosProviderProfile=typeof GREEK_HOSPITALITY_POS_PROVIDERS[number];
export type PosProviderReadiness="vendor_access_required"|"sandbox_verified"|"venue_pilot_verified"|"production_verified";

const capabilities:readonly PosCapability[]=[
 "catalog_read","sales_read","order_write","price_write",
 "payment_status","refunds_read","inventory_read","fulfilment_write"
];
const capabilitySet=new Set<string>(capabilities);
export class PosReadinessError extends Error{
 readonly code:string;
 constructor(code:string){super(code);this.code=code;}
}
export function getGreekPosProvider(id:string):PosProviderProfile{
 const provider=GREEK_HOSPITALITY_POS_PROVIDERS.find(p=>p.id===id);
 if(!provider)throw new PosReadinessError("UNKNOWN_POS_PROVIDER");
 return provider;
}
export type PosConnectionEvidence={
 providerId:GreekHospitalityPosId;
 readiness:PosProviderReadiness;
 vendorApproved:boolean;
 merchantApproved:boolean;
 signedWebhooksVerified:boolean;
 serverLocationMappingVerified:boolean;
 productMappingVerified:boolean;
 deduplicationVerified:boolean;
 reconciliationVerified:boolean;
 fiscalProviderApproved:boolean;
 approvedCapabilities:readonly PosCapability[];
};
/**
 * No authority is granted by selecting a brand in UI.
 * These values must be derived from signed-off private connection records
 * and successful acceptance checks, never posted by a public caller.
 */
export function mayEnablePosCapability(e:PosConnectionEvidence,capability:PosCapability):boolean{
 getGreekPosProvider(e.providerId);
 if(!capabilitySet.has(capability)||!e.approvedCapabilities.includes(capability)||
    e.readiness!=="production_verified"||!e.vendorApproved||!e.merchantApproved||
    !e.serverLocationMappingVerified||!e.productMappingVerified||
    !e.deduplicationVerified||!e.reconciliationVerified)return false;
 if(["sales_read","payment_status","refunds_read"].includes(capability)&&!e.signedWebhooksVerified)return false;
 if(["order_write","price_write","fulfilment_write"].includes(capability)&&
    (!e.signedWebhooksVerified||!e.fiscalProviderApproved))return false;
 return true;
}
/** Safe metadata view for integration discovery; no credentials or access toggles. */
export function posProviderCatalogue(){
 return GREEK_HOSPITALITY_POS_PROVIDERS.map(x=>({
  id:x.id,name:x.name,vendor:x.vendor,product:x.product,
  approach:x.approach,status:"vendor_access_required" as const,
  liveConnected:false,liveCapabilities:[] as PosCapability[],
  evidence:[...x.evidence],note:x.note
 }));
}
