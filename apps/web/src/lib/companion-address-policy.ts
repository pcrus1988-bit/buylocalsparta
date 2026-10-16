/** Pure input contract for first-party Android creation of a customer-owned address.
 * Update/delete are deliberately absent until versioned editing is reviewed.
 */
export type CompanionNewAddress={
 label:string;fullName:string;line1:string;line2?:string;locality:string;
 region?:string;postcode:string;countryCode:"GR";phone?:string;
 isDefaultBilling:boolean;isDefaultDelivery:boolean
};
function optional(value:unknown,max:number):string|undefined{
 if(value===undefined||value===null||value==="")return undefined;
 if(typeof value!=="string")throw Error("INVALID_ADDRESS");
 if(/[\u0000-\u001f\u007f]/.test(value))throw Error("INVALID_ADDRESS");
 const normalized=value.normalize("NFKC").trim().replace(/\s+/g," ");
 if(normalized.length>max||/[\u0000-\u001f\u007f]/.test(normalized))
  throw Error("INVALID_ADDRESS");
 return normalized||undefined;
}
function required(value:unknown,max:number):string{
 const text=optional(value,max);
 if(!text)throw Error("INVALID_ADDRESS");
 return text;
}
export function parseCompanionNewAddress(value:unknown):CompanionNewAddress{
 if(!value||typeof value!=="object"||Array.isArray(value))throw Error("INVALID_ADDRESS");
 const x=value as Record<string,unknown>;
 const allowed=new Set(["label","fullName","line1","line2","locality","region",
  "postcode","countryCode","phone","isDefaultBilling","isDefaultDelivery"]);
 if(Object.keys(x).some(k=>!allowed.has(k)))throw Error("INVALID_ADDRESS");
 const fullName=required(x.fullName,160);
 if(fullName.split(" ").length<2)throw Error("FULL_NAME_REQUIRED");
 const postcode=required(x.postcode,16);
 if(!/^\d{5}$/.test(postcode))throw Error("INVALID_POSTCODE");
 const cc=x.countryCode===undefined?"GR":x.countryCode;
 if(cc!=="GR")throw Error("INVALID_COUNTRY");
 const phone=optional(x.phone,40);
 if(phone&&!/^\+?[0-9 ()-]{8,24}$/.test(phone))throw Error("INVALID_PHONE");
 if(x.isDefaultBilling!==undefined&&typeof x.isDefaultBilling!=="boolean")throw Error("INVALID_ADDRESS");
 if(x.isDefaultDelivery!==undefined&&typeof x.isDefaultDelivery!=="boolean")throw Error("INVALID_ADDRESS");
 return {
  label:optional(x.label,80)??"Διεύθυνση",
  fullName,
  line1:required(x.line1,240),
  ...(optional(x.line2,240)?{line2:optional(x.line2,240)}:{}),
  locality:required(x.locality,120),
  ...(optional(x.region,120)?{region:optional(x.region,120)}:{}),
  postcode,countryCode:"GR",
  ...(phone?{phone}:{}),
  isDefaultBilling:x.isDefaultBilling===true,
  isDefaultDelivery:x.isDefaultDelivery===true
 };
}
