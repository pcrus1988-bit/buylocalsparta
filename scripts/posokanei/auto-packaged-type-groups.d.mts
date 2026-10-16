import type {PriceReference} from "./brand-alternatives.mjs";
export type AutoPackagedTypeGroup = {
 id:string;status:"approved";approvalMethod:"automatic_commodity";
 label:string;basis:"kg"|"l";memberIds:string[];
};
export function deriveAutoPackagedTypeGroups(
 products:PriceReference[],previous?:Array<{status:string;memberIds:string[]}>
):AutoPackagedTypeGroup[];
