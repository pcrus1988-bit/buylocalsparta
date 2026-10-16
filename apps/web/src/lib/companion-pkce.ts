import {createHash} from "node:crypto";

// Public client constants are not secrets. Never embed database keys in Android.
export const COMPANION_CLIENT_ID="kontamou-companion-android";
export const COMPANION_REDIRECT_URI="kontamoucompanion://auth";
export function validChallenge(value:string){
 return /^[A-Za-z0-9_-]{43}$/.test(value);
}
export function validState(value:string){
 return /^[A-Za-z0-9_-]{16,128}$/.test(value);
}
export function validClient(client:string,redirect:string){
 return client===COMPANION_CLIENT_ID && redirect===COMPANION_REDIRECT_URI;
}
export function challengeForVerifier(value:string){
 if(!/^[A-Za-z0-9_-]{43,128}$/.test(value))throw new Error("INVALID_GRANT");
 return createHash("sha256").update(value,"ascii").digest("base64url");
}
export function sessionToken(value:unknown):value is string{
 return typeof value==="string"&&/^[A-Za-z0-9_-]{43}$/.test(value);
}
