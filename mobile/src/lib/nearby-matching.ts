/** Deterministic matching, avoiding substring-only false positives (e.g. "tea" in "steak"). */
export type ProductCandidate={
  vendorId:string;vendorName:string;vendorLocationId:string;vendorLocality:string;
  productTitle:string;variantId:string;distanceM:number;productUrl:string;
};
export type WantedItem={id:string;title:string;variantId:string|null;completed:boolean;kind:"shopping"|"wishlist"};
export type MatchedProduct=ProductCandidate & {itemId:string;itemTitle:string};

function normalize(value:string){
 return value.normalize("NFKC").toLocaleLowerCase("el-GR").normalize("NFD")
   .replace(/[\u0300-\u036f]/g,"")
   .replace(/[^\p{L}\p{N}]+/gu," ").trim().replace(/\s+/g," ");
}
export function matchLocalItems(items:readonly WantedItem[],products:readonly ProductCandidate[]):MatchedProduct[]{
 const matches:MatchedProduct[]=[];
 for(const item of items){
   if(item.completed)continue;
   const query=normalize(item.title);
   if(query.length<4 && !item.variantId)continue;
   for(const product of products){
     const exactVariant=Boolean(item.variantId && item.variantId===product.variantId);
     const title=normalize(product.productTitle);
     const tokens=query.split(" ").filter(Boolean);
     const normalizedWords=` ${title} `;
     const tokenMatch=tokens.length>0&&tokens.every(token=>token.length>=3&&normalizedWords.includes(` ${token} `));
     if(exactVariant||tokenMatch){
       matches.push({...product,itemId:item.id,itemTitle:item.title});
     }
   }
 }
 return matches.sort((a,b)=>a.distanceM-b.distanceM).slice(0,20);
}
export function validNearbyPosition(latitude:number,longitude:number,accuracy:number){
 return Number.isFinite(latitude)&&Math.abs(latitude)<=90
   &&Number.isFinite(longitude)&&Math.abs(longitude)<=180
   &&Number.isFinite(accuracy)&&accuracy>=0&&accuracy<=200;
}
