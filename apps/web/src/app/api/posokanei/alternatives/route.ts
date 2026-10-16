import {NextResponse} from "next/server";
import {loadPublishedReference,pricedCatalog} from "../../../../lib/posokanei-public-runtime";
import {baseQuantity,equivalentType} from "../../../../lib/posokanei-discovery";
export const dynamic="force-dynamic";
export const runtime="nodejs";
const headers={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
export async function GET(req:Request){
  try{
    const url=new URL(req.url);
    const id=url.searchParams.get("productId")||"";
    if(!/^[A-Za-z0-9_-]{1,100}$/.test(id))return NextResponse.json({status:"invalid",alternatives:[]},{status:400,headers});
    const excluded=new Set((url.searchParams.get("exclude")||"").slice(0,1500).split(",").filter(x=>/^[a-zA-Z0-9_-]{1,100}$/.test(x)));
    const snap=await loadPublishedReference();
    if(!snap)return NextResponse.json({status:"unavailable",alternatives:[]},{status:503,headers});
    const source=snap.products.find(p=>p.source_product_id===id);
    if(!source)return NextResponse.json({status:"not_found",alternatives:[]},{status:404,headers});
    const base=baseQuantity(source);
    const catalog=pricedCatalog(snap);
    const best=(productId:string)=>{
      const list=(catalog.byProduct.get(productId)||[]).filter(o=>!excluded.has(o.retailer_id));
      return list.length?list[0]:null;
    };
    const sourceOffer=best(id);
    if(!base||!sourceOffer)return NextResponse.json({status:"ready",alternatives:[],reason:"not_comparable"},{headers});
    const referenceUnitPrice=sourceOffer.price_eur/base.amount;
    const alternatives=snap.products.filter(p=>equivalentType(source,p)).flatMap(p=>{
      const quantity=baseQuantity(p);
      const offer=best(p.source_product_id);
      if(!quantity||!offer)return [];
      const unitPrice=offer.price_eur/quantity.amount;
      if(unitPrice>=referenceUnitPrice*0.97)return [];
      return [{
        id:p.source_product_id,name:p.name,brand:p.brand,category:p.category,
        packageQuantity:quantity.amount,unit:quantity.unit,
        priceEur:offer.price_eur,unitPriceEur:Number(unitPrice.toFixed(2)),
        retailerId:offer.retailer_id,retailerName:offer.retailer_name||offer.retailer_id,
        savingPercent:Math.round(100*(1-unitPrice/referenceUnitPrice))
      }];
    }).sort((a,b)=>a.unitPriceEur-b.unitPriceEur||a.name.localeCompare(b.name,"el")).slice(0,5);
    return NextResponse.json({status:"ready",basis:base.unit,originalUnitPriceEur:Number(referenceUnitPrice.toFixed(2)),alternatives},{headers});
  }catch{
    return NextResponse.json({status:"unavailable",alternatives:[]},{status:503,headers});
  }
}
