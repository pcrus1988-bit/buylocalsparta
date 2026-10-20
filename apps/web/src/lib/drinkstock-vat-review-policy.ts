import type {BeverageVatClass} from "./drinkstock-greek-vat";

export class DrinkStockVatReviewError extends Error {
 constructor(public readonly code:string,public readonly status:number=400){super(code);}
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const classes:readonly string[]=["alcoholic","non_alcoholic","water","review_required"];
export type VatReviewCommand=Readonly<{
 productId:string;requestKey:string;vatClass:BeverageVatClass;
 reviewed:boolean;reviewBasis:string;
}>;
export function parseVatReviewCommand(input:unknown):VatReviewCommand {
 if(!input||typeof input!=="object"||Array.isArray(input))
  throw new DrinkStockVatReviewError("INVALID_VAT_REVIEW");
 const p=input as Record<string,unknown>;
 if(Object.keys(p).sort().join(",")!=="productId,requestKey,reviewBasis,reviewed,vatClass")
  throw new DrinkStockVatReviewError("INVALID_VAT_REVIEW");
 if(typeof p.productId!=="string"||!uuid.test(p.productId)||
    typeof p.requestKey!=="string"||!uuid.test(p.requestKey))
  throw new DrinkStockVatReviewError("INVALID_VAT_REVIEW_ID");
 if(typeof p.vatClass!=="string"||!classes.includes(p.vatClass)||
    typeof p.reviewed!=="boolean"||
    p.reviewed!==(p.vatClass!=="review_required"))
  throw new DrinkStockVatReviewError("INVALID_VAT_CLASSIFICATION");
 const reviewBasis=typeof p.reviewBasis==="string"?p.reviewBasis.trim().replace(/\s+/g," "):"";
 if(reviewBasis.length<15||reviewBasis.length>500)
  throw new DrinkStockVatReviewError("INVALID_REVIEW_BASIS");
 return {productId:p.productId.toLowerCase(),requestKey:p.requestKey.toLowerCase(),
   vatClass:p.vatClass as BeverageVatClass,reviewed:p.reviewed,reviewBasis};
}
