import {companionAuthorizedRequest} from "./companion-session";
import {prepareNewAddress,type AddressDraft} from "./address-rules";
export type SavedAddress={
 id:string;label:string;fullName:string;companyName?:string;vatNumber?:string;
 line1:string;line2?:string;locality:string;region?:string;postcode:string;
 countryCode:string;phone?:string;isDefaultBilling:boolean;isDefaultDelivery:boolean
};
export type AddressProfile={fullName:string;addresses:SavedAddress[]};
function validAddress(value:unknown):value is SavedAddress{
 if(!value||typeof value!=="object")return false;
 const a=value as Record<string,unknown>;
 return typeof a.id==="string"&&/^[A-Za-z0-9_-]{6,128}$/.test(a.id)
  &&["label","fullName","line1","locality","postcode","countryCode"]
   .every(key=>typeof a[key]==="string"&&(a[key] as string).length<300)
  &&typeof a.isDefaultBilling==="boolean"&&typeof a.isDefaultDelivery==="boolean"
  &&/^\d{5}$/.test(a.postcode as string);
}
function validatedResponse(value:unknown):AddressProfile{
 if(!value||typeof value!=="object")throw Error("INVALID_ADDRESS_RESPONSE");
 const profile=(value as {profile?:unknown}).profile;
 if(!profile||typeof profile!=="object")throw Error("INVALID_ADDRESS_RESPONSE");
 const p=profile as Record<string,unknown>;
 if(typeof p.fullName!=="string"||!Array.isArray(p.addresses)
  ||p.addresses.length>100||!p.addresses.every(validAddress))
  throw Error("INVALID_ADDRESS_RESPONSE");
 return p as unknown as AddressProfile;
}
export async function loadAddressProfile():Promise<AddressProfile>{
 return validatedResponse(await companionAuthorizedRequest<unknown>("/addresses","GET"));
}
export async function createAccountAddress(draft:AddressDraft):Promise<AddressProfile>{
 const payload=prepareNewAddress(draft);
 return validatedResponse(await companionAuthorizedRequest<unknown>("/addresses","POST",payload));
}

function addressId(id:string):string{
 if(!/^[A-Za-z0-9_-]{6,128}$/.test(id))throw Error("INVALID_ADDRESS_ID");
 return id;
}
export async function updateAccountAddress(id:string,draft:AddressDraft):Promise<AddressProfile>{
 const payload={id:addressId(id),...prepareNewAddress(draft)};
 return validatedResponse(await companionAuthorizedRequest<unknown>("/addresses","PUT",payload));
}
export async function removeAccountAddress(id:string):Promise<AddressProfile>{
 return validatedResponse(await companionAuthorizedRequest<unknown>("/addresses","DELETE",{id:addressId(id)}));
}
