/** Staff invitation payloads never trust a role or a client-supplied venue. */
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const TOKEN=/^[a-zA-Z0-9_-]{43}$/;
const MAIL=/^[^\s@]{1,64}@[^\s@]{1,190}$/;
export type StaffInviteCreate=Readonly<{
 email:string;bar:boolean;waiter:boolean;requestKey:string;
}>;
export function parseStaffInviteCreate(input:unknown):StaffInviteCreate{
 if(!input||typeof input!=="object"||Array.isArray(input))throw new Error("INVALID_STAFF_INVITE");
 const v=input as Record<string,unknown>;
 if(Object.keys(v).sort().join(",")!=="bar,email,requestKey,waiter"||
   typeof v.email!=="string"||!MAIL.test(v.email.trim())||v.email.length>254||
   typeof v.bar!=="boolean"||typeof v.waiter!=="boolean"||!(v.bar||v.waiter)||
   typeof v.requestKey!=="string"||!UUID.test(v.requestKey))
  throw new Error("INVALID_STAFF_INVITE");
 return {email:v.email.trim().toLowerCase(),bar:v.bar,waiter:v.waiter,requestKey:v.requestKey};
}
export function parseStaffInviteRevoke(input:unknown){
 if(!input||typeof input!=="object"||Array.isArray(input))throw new Error("INVALID_STAFF_REVOKE");
 const v=input as Record<string,unknown>;
 if(Object.keys(v).sort().join(",")!=="invitationId"||
   typeof v.invitationId!=="string"||!UUID.test(v.invitationId))throw new Error("INVALID_STAFF_REVOKE");
 return {invitationId:v.invitationId};
}
export function parseStaffInviteClaim(input:unknown){
 if(!input||typeof input!=="object"||Array.isArray(input))throw new Error("INVALID_STAFF_CLAIM");
 const v=input as Record<string,unknown>;
 if(Object.keys(v).sort().join(",")!=="token"||
   typeof v.token!=="string"||!TOKEN.test(v.token))throw new Error("INVALID_STAFF_CLAIM");
 return {token:v.token};
}
