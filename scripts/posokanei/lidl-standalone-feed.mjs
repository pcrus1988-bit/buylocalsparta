/**
 * Read-only normalization of Lidl Plus Greece's advertised offers.
 * These are independent Lidl offer cards, NOT matched PosoKanei catalogue SKUs.
 * Public display requires separately verified source rights.
 */
const storeKey=/^GR[0-9]{4}$/;
const short=(x,n=180)=>typeof x==="string"?x.trim().slice(0,n):"";
const number=x=>typeof x==="number"&&Number.isFinite(x)&&x>0&&x<=100000?x:null;
const validTime=s=>typeof s==="string"&&Number.isFinite(Date.parse(s))&&/T/.test(s);
const safeStore=s=>storeKey.test(s);
export function normalizeGreekStores(data){
  if(!Array.isArray(data)||data.length>1500)throw new Error("Invalid Lidl store directory");
  const ids=new Set();
  return data.map(s=>{
    if(!s||!safeStore(s.storeKey)||ids.has(s.storeKey))throw new Error("Invalid/duplicate Lidl store");
    ids.add(s.storeKey);
    return {id:s.storeKey,name:short(s.name,100)||s.storeKey,
      city:short(s.locality,100),address:short(s.address,160),postalCode:short(s.postalCode,20)};
  }).sort((a,b)=>a.city.localeCompare(b.city,"el")||a.name.localeCompare(b.name,"el"));
}
export function normalizeGreekLidlOffers(data,{storeKey:store,observedAt,now=new Date()}){
  if(!safeStore(store)||!validTime(observedAt)||!Number.isFinite(now.getTime())||
    !data||!Array.isArray(data.offers)||data.offers.length>5000)throw new Error("Invalid Lidl offers response");
  const seen=new Set(),out=[];
  for(const p of data.offers){
    if(!p||typeof p!=="object")continue;
    const id=short(p.id,90),name=short(p.title,250);
    if(!id||!name||seen.has(id)||!validTime(p.startValidityDate)||
      !validTime(p.endValidityDate))continue;
    const price=number(p.priceBox?.largePartNumeric);
    if(price===null||p.priceBox?.priceSymbol!=="€")continue;
    if(!Number.isInteger(Math.round(price*100))||Math.abs(price*100-Math.round(price*100))>0.001)continue;
    const old=number(p.priceBox?.smallPartNumeric);
    const previousPrice=old!==null&&old>price?old:null;
    const starts=validTime(p.startValidityDateUTC)?p.startValidityDateUTC:p.startValidityDate;
    const ends=validTime(p.endValidityDateUTC)?p.endValidityDateUTC:p.endValidityDate;
    if(Date.parse(starts)>Date.parse(ends))continue;
    const current=now.getTime()>=Date.parse(starts)&&now.getTime()<=Date.parse(ends);
    const upcoming=now.getTime()<Date.parse(starts);
    if(!current&&!upcoming)continue;
    seen.add(id);
    const ids=Array.isArray(p.productIds)?p.productIds.filter(s=>typeof s==="string"&&/^[A-Za-z0-9_-]{1,40}$/.test(s)).slice(0,5):[];
    out.push({
      id:"lidl_gr:"+store+":"+id,retailer:"Lidl",retailerProductIds:ids,
      storeKey:store,name,brand:short(p.brand,120)||null,category:short(p.category,100)||null,
      packaging:short(p.packaging,140)||null,unitPriceText:short(p.pricePerUnit,150)||null,
      priceEur:price,referencePriceEur:previousPrice,discountText:short(p.priceBox?.discountMessage,80)||null,
      validFrom:starts,validTo:ends,observedAt,
      offerType:short(p.offerType,120)||null,redemptionChannel:short(p.redemptionChannel,60)||null,
      validityStatus:current?"current":"upcoming",membershipRequirement:"verify_with_retailer",
      matchedPosokaneiId:null,basketEligible:false,source:"lidl_plus_public_offers"
    });
  }
  return out.sort((a,b)=>(a.validityStatus==="current"?0:1)-(b.validityStatus==="current"?0:1)||
    a.name.localeCompare(b.name,"el")||a.id.localeCompare(b.id));
}
