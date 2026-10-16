import type {PriceReference} from "./brand-alternatives.mjs";
export type AutoEggGroup={
  id:string;status:"approved";approvalMethod:"automatic_commodity";
  label:string;basis:"piece";memberIds:string[];
};
export function deriveAutoEggGroups(
  products:PriceReference[],priorGroups?:Array<{status:string;memberIds:string[]}>
):AutoEggGroup[];
