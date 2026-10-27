/**
 * Q18 PUBLICATION BOUNDARY.
 *
 * Reads a sealed, explicitly approved public release projection only.
 * Never query research_answers, response_design_context or private Admin Q18 rows
 * from a public route. Quote and prefecture outputs are independently governed.
 */
import { publicResearchQ18DisplayText } from "./research-q18-publication-moderation";

export type PublicVoiceQuote = Readonly<{id:string;category:string;text:string}>;
export type PublicVoiceCategory = Readonly<{key:string;label:string;count:number}>;
export type PublicVoiceGeography = Readonly<{area:string;category:string;count:number;eligibleN:number}>;
export type PublicVoiceData = Readonly<{
 quotes:readonly PublicVoiceQuote[];
 categories:readonly PublicVoiceCategory[];
 geography:readonly PublicVoiceGeography[];
}>;
const asRecord=(v:unknown):Record<string,unknown>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
const asArray=(v:unknown):readonly unknown[]=>Array.isArray(v)?v:[];
const simple=(v:unknown,max:number):string=>typeof v==="string"&&v.trim().length<=max?v.trim():"";
const count=(v:unknown)=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=0?v:undefined;
/** Conservative supplementary screen; this does not replace mandatory human privacy approval. */
const suspicious=(v:string)=>/@|https?:\/\/|www\.|(?:\+30|0030)?\s*69\d(?:[\s.-]*\d){8}|(?:\d[\s.-]*){10,}/i.test(v);
export function publicVoiceDataFromRelease(value:unknown):PublicVoiceData|undefined {
 const source=asRecord(value);
 if(source.schema!=="kontamou.research.q18-public-voices.v1"||source.reviewStatus!=="approved"||
    source.privacyReviewed!==true||source.geographySuppressed!==true||
    typeof source.approvedAt!=="string"||!/^20\d{2}-\d{2}-\d{2}T/.test(source.approvedAt))return undefined;
 const categories=asArray(source.categories).flatMap(value=>{
  const item=asRecord(value),key=simple(item.key,90),label=simple(item.label,140),n=count(item.count);
  return key&&label&&n!==undefined&&n>=30?[{key,label,count:n}]:[];
 }).filter((v,i,all)=>all.findIndex(item=>item.key===v.key)===i);
 const keys=new Set(categories.map(c=>c.key));
 const quotes=asArray(source.quotes).flatMap(value=>{
  const item=asRecord(value),id=simple(item.id,110),category=simple(item.category,90),text=simple(item.text,900);
  const displayText=publicResearchQ18DisplayText(id,text);
  // No location, sector or participant reference is accepted in the public quote object.
  if(!id||!keys.has(category)||displayText===null||displayText.length<12||suspicious(displayText)||
     item.publicApproved!==true||item.deidentified!==true||
     Object.keys(item).some(k=>!["id","category","text","publicApproved","deidentified"].includes(k)))return [];
  return [{id,category,text:displayText}];
 }).filter((v,i,all)=>all.findIndex(item=>item.id===v.id)===i);
 const geography=asArray(source.geography).flatMap(value=>{
  const item=asRecord(value),area=simple(item.area,100),category=simple(item.category,90);
  const n=count(item.eligibleN),categoryCount=count(item.count);
  // Strictly suppressed prefecture × theme cells, no person-level records.
  if(!area||!keys.has(category)||n===undefined||categoryCount===undefined||
     n<30||categoryCount<30||categoryCount>n||item.publicApproved!==true)return [];
  return [{area,category,count:categoryCount,eligibleN:n}];
 });
 return {categories,quotes,geography};
}
