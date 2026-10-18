import { createHmac } from "node:crypto";
/** Stable server-derived rate-limit identity: never rely on a client-generated visitor ID. */
export function hospitalityLoginRateLimitKey(email:string,secret:string):string {
  if(secret.length<32)throw new Error("HOSPITALITY_AUTH_UNCONFIGURED");
  return createHmac("sha256",secret)
    .update("hospitality-login:v1:")
    .update(email.trim().toLowerCase())
    .digest("base64url");
}
