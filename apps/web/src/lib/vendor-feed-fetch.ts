import { lookup } from "node:dns/promises";
import { request as httpRequest, type IncomingHttpHeaders, type RequestOptions } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { validateCrawlUrl, validateRedirectTarget, type CrawlFetchPolicy } from "@buy-local-sparta/core";
import { VENDOR_FEED_MAX_BYTES } from "./vendor-product-feed-xml";

const USER_AGENT="KONTAMOU-VendorFeed/1.0 (+https://kontamou.site)";
const POLICY:CrawlFetchPolicy={
  allowedProtocols:["http:","https:"],
  maxResponseBytes:VENDOR_FEED_MAX_BYTES,
  maxRedirects:5
};

export async function fetchVendorProductFeedXml(rawUrl:string):Promise<{xml:string;finalUrl:string;contentType:string}> {
  let current=normalizeSourceUrl(rawUrl);
  for (let hop=0;hop<=5;hop+=1) {
    const validated=hop===0 ? validateCrawlUrl(current,POLICY) : validateRedirectTarget(current,POLICY);
    if (validated.decision!=="allow" || !validated.normalizedUrl || !validated.hostname) {
      throw new Error(`Feed URL rejected: ${validated.reason ?? "unsafe URL"}`);
    }
    current=validated.normalizedUrl;
    const addresses=await resolveAddresses(validated.hostname,current);
    const selected=addresses[0];
    if (!selected) throw new Error("Feed hostname did not resolve to a public address");
    const response=await requestPinned(current,validated.hostname,selected.address,selected.family);
    const location=response.headers.location;
    if (isRedirect(response.status) && location) {
      if (hop===5) throw new Error("Feed URL redirect limit exceeded");
      current=new URL(location,current).toString();
      continue;
    }
    if (response.status<200 || response.status>=300) throw new Error(`Feed URL returned HTTP ${response.status}`);
    const contentType=response.headers["content-type"] ?? "";
    const xml=response.body.toString("utf8");
    if (!xml.trim().startsWith("<") && !/xml/i.test(contentType)) throw new Error("Feed URL did not return XML content");
    return {xml,finalUrl:current,contentType};
  }
  throw new Error("Feed URL could not be fetched");
}

export function normalizeSourceUrl(rawUrl:string):string {
  const value=rawUrl.trim();
  if (!value) throw new Error("Feed URL is required");
  let url:URL;
  try { url=new URL(value); } catch { throw new Error("Feed URL is invalid"); }
  if (!["http:","https:"].includes(url.protocol)) throw new Error("Feed URL must use HTTP or HTTPS");
  url.username="";
  url.password="";
  url.hash="";
  return url.toString();
}

async function resolveAddresses(hostname:string,rawUrl:string) {
  const normalized=normalizeHostname(hostname);
  const directFamily=isIP(normalized);
  const addresses=directFamily ? [{address:normalized,family:directFamily}] : await lookup(normalized,{all:true,verbatim:true});
  if (!addresses.length) throw new Error("Feed hostname did not resolve");
  const validation=validateCrawlUrl(rawUrl,POLICY,addresses.map((entry)=>entry.address));
  if (validation.decision!=="allow") throw new Error(`Feed DNS target rejected: ${validation.reason ?? "unsafe address"}`);
  return addresses;
}

async function requestPinned(rawUrl:string,hostname:string,address:string,family:number):Promise<{status:number;headers:Record<string,string>;body:Buffer}> {
  const url=new URL(rawUrl);
  const request=url.protocol==="https:" ? httpsRequest : httpRequest;
  const options:RequestOptions={
    method:"GET",
    lookup:createPinnedLookup(address,family,hostname),
    headers:{
      "User-Agent":USER_AGENT,
      "Accept":"application/xml,text/xml,application/rss+xml,application/atom+xml;q=0.9,*/*;q=0.3",
      "Accept-Encoding":"identity",
      "Cache-Control":"no-cache"
    },
    timeout:20_000,
    maxHeaderSize:64*1024
  };
  if (url.protocol==="https:") (options as RequestOptions & {servername?:string}).servername=normalizeHostname(hostname);

  return await new Promise((resolve,reject)=>{
    const req=request(url,options,(res)=>{
      const status=res.statusCode??0;
      const headers=normalizeHeaders(res.headers);
      const declared=Number(headers["content-length"]??NaN);
      if (Number.isFinite(declared) && declared>VENDOR_FEED_MAX_BYTES) {
        res.destroy();
        reject(new Error("Feed response exceeds the maximum accepted size"));
        return;
      }
      const chunks:Buffer[]=[];
      let total=0;
      let settled=false;
      const fail=(error:Error)=>{
        if (settled) return;
        settled=true;
        res.destroy();
        reject(error);
      };
      res.on("data",(chunk:Buffer|string)=>{
        const buffer=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);
        total+=buffer.length;
        if (total>VENDOR_FEED_MAX_BYTES) {
          fail(new Error("Feed response exceeds the maximum accepted size"));
          return;
        }
        chunks.push(buffer);
      });
      res.on("error",(error)=>fail(error));
      res.on("end",()=>{
        if (settled) return;
        settled=true;
        resolve({status,headers,body:Buffer.concat(chunks,total)});
      });
    });
    req.on("timeout",()=>req.destroy(new Error("Feed request timed out")));
    req.on("error",reject);
    req.end();
  });
}

function createPinnedLookup(address:string,family:number,expectedHostname:string):LookupFunction {
  const normalized=normalizeHostname(expectedHostname);
  return ((hostname,options,callback)=>{
    if (normalizeHostname(hostname)!==normalized) {
      const error=new Error("Pinned DNS lookup refused an unexpected hostname") as NodeJS.ErrnoException;
      error.code="EACCES";
      callback(error,address,family);
      return;
    }
    if (typeof options==="object" && options?.all) {
      callback(null,[{address,family}]);
      return;
    }
    callback(null,address,family);
  }) as LookupFunction;
}

function normalizeHeaders(headers:IncomingHttpHeaders):Record<string,string> {
  const result:Record<string,string>={};
  for (const [key,value] of Object.entries(headers)) {
    if (Array.isArray(value)) result[key.toLowerCase()]=value.join(", ");
    else if (value!=null) result[key.toLowerCase()]=String(value);
  }
  return result;
}

function isRedirect(status:number):boolean {
  return status===301 || status===302 || status===303 || status===307 || status===308;
}

function normalizeHostname(value:string):string {
  return value.trim().toLowerCase().replace(/^\[|\]$/g,"").replace(/\.$/,"");
}
