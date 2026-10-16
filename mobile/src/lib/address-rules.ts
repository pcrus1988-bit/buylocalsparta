/** Native address creation is account-scoped, never persisted to SQLite.
 * Editing/deleting existing addresses remains in the protected web account.
 */
export type AddressDraft={
 label:string;fullName:string;line1:string;line2:string;locality:string;
 region:string;postcode:string;phone:string;isDefaultBilling:boolean;isDefaultDelivery:boolean
};
export type NewAddressPayload={
 label:string;fullName:string;line1:string;line2?:string;locality:string;
 region?:string;postcode:string;phone?:string;countryCode:"GR";
 isDefaultBilling:boolean;isDefaultDelivery:boolean
};
export const EMPTY_ADDRESS:AddressDraft={
 label:"Σπίτι",fullName:"",line1:"",line2:"",locality:"",
 region:"",postcode:"",phone:"",isDefaultBilling:false,isDefaultDelivery:false
};
function clean(value:string){return value.normalize("NFKC").trim().replace(/\s+/g," ");}
export function prepareNewAddress(draft:AddressDraft):NewAddressPayload{
 const label=clean(draft.label)||"Διεύθυνση";
 const fullName=clean(draft.fullName);
 const line1=clean(draft.line1);
 const locality=clean(draft.locality);
 const postcode=clean(draft.postcode);
 const phone=clean(draft.phone);
 const region=clean(draft.region);
 const line2=clean(draft.line2);
 if(fullName.split(" ").filter(Boolean).length<2 || fullName.length>160)
  throw Error("FULL_NAME_REQUIRED");
 if(!line1||line1.length>240||!locality||locality.length>120||label.length>80
  ||line2.length>240||region.length>120)throw Error("ADDRESS_REQUIRED");
 if(!/^\d{5}$/.test(postcode))throw Error("INVALID_POSTCODE");
 if(phone&&!/^\+?[0-9 ()-]{8,24}$/.test(phone))throw Error("INVALID_PHONE");
 if([label,fullName,line1,line2,locality,region,phone].some(v=>/[\u0000-\u001f\u007f]/.test(v)))
  throw Error("INVALID_ADDRESS");
 return {label,fullName,line1,locality,postcode,countryCode:"GR",
  ...(line2?{line2}:{}),...(region?{region}:{}),...(phone?{phone}:{}),
  isDefaultBilling:draft.isDefaultBilling,isDefaultDelivery:draft.isDefaultDelivery};
}
