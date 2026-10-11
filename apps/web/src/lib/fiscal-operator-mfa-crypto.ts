import {
 createCipheriv,createDecipheriv,createHmac,randomBytes,timingSafeEqual
} from "node:crypto";

const BASE32="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_MILLIS=30000;
export function fiscalMfaBase32(input:Buffer):string{
 let bits=0,value=0,out="";
 for(const byte of input){
  value=(value<<8)|byte;bits+=8;
  while(bits>=5){out+=BASE32[(value>>>(bits-5))&31];bits-=5;}
  value&=(1<<bits)-1;
 }
 if(bits)out+=BASE32[(value<<(5-bits))&31];
 return out;
}
export function fiscalMfaBase32Decode(value:string):Buffer{
 if(!/^[A-Z2-7]{32}$/.test(value))throw new Error("MFA_SECRET_INVALID");
 const bytes:number[]=[];let bits=0,acc=0;
 for(const ch of value){
  acc=(acc<<5)|BASE32.indexOf(ch);bits+=5;
  if(bits>=8){bytes.push((acc>>>(bits-8))&255);bits-=8;acc&=(1<<bits)-1;}
 }
 return Buffer.from(bytes);
}
export function createFiscalMfaSecret():string{
 return fiscalMfaBase32(randomBytes(20));
}
export function fiscalTotp(secret:string,step:number):string{
 if(!Number.isSafeInteger(step)||step<0)throw new Error("MFA_TIME_INVALID");
 const key=fiscalMfaBase32Decode(secret);
 const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(step));
 const hmac=createHmac("sha1",key).update(counter).digest();
 const offset=hmac[hmac.length-1]&0xf;
 const code=(hmac.readUInt32BE(offset)&0x7fffffff)%1000000;
 return String(code).padStart(6,"0");
}
/** Return a fresh counter only. Call under row lock, persisting last_used_step. */
export function verifyFiscalTotp(secret:string,code:unknown,now=Date.now(),lastUsed=-1):number|null{
 if(typeof code!=="string"||!/^[0-9]{6}$/.test(code)||!Number.isFinite(now))return null;
 const current=Math.floor(now/STEP_MILLIS);
 const value=Buffer.from(code);
 let accepted:number|null=null;
 for(let delta=-1;delta<=1;delta++){
  const step=current+delta;
  if(step<0||step<=lastUsed)continue;
  const expected=Buffer.from(fiscalTotp(secret,step));
  if(timingSafeEqual(value,expected))accepted=step;
 }
 return accepted;
}
export function encryptFiscalMfaSecret(secret:string,actorIdentity:string,keyHex:string):string{
 const key=parseFiscalMfaKey(keyHex);
 fiscalMfaBase32Decode(secret);
 const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key,iv);
 cipher.setAAD(Buffer.from(actorIdentity,"utf8"));
 const encrypted=Buffer.concat([cipher.update(secret,"utf8"),cipher.final()]);
 return ["v1",iv.toString("hex"),encrypted.toString("hex"),cipher.getAuthTag().toString("hex")].join(":");
}
export function decryptFiscalMfaSecret(sealed:string,actorIdentity:string,keyHex:string):string{
 const match=/^v1:([a-f0-9]{24}):([a-f0-9]{64}):([a-f0-9]{32})$/.exec(sealed);
 if(!match)throw new Error("MFA_CIPHERTEXT_INVALID");
 const decipher=createDecipheriv("aes-256-gcm",parseFiscalMfaKey(keyHex),Buffer.from(match[1],"hex"));
 decipher.setAAD(Buffer.from(actorIdentity,"utf8"));decipher.setAuthTag(Buffer.from(match[3],"hex"));
 const plain=Buffer.concat([decipher.update(Buffer.from(match[2],"hex")),decipher.final()]).toString("utf8");
 fiscalMfaBase32Decode(plain);
 return plain;
}
export function parseFiscalMfaKey(keyHex:string):Buffer{
 if(!/^[a-f0-9]{64}$/i.test(keyHex))throw new Error("MFA_ENCRYPTION_KEY_INVALID");
 return Buffer.from(keyHex,"hex");
}
export function fiscalTotpUri(secret:string,email:string):string{
 fiscalMfaBase32Decode(secret);
 const label=encodeURIComponent("KONTA MOY FISCAL:"+email);
 return "otpauth://totp/"+label+"?secret="+secret+"&issuer="+
  encodeURIComponent("KONTA MOY FISCAL")+"&algorithm=SHA1&digits=6&period=30";
}
