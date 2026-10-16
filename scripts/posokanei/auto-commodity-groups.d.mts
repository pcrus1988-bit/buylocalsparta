import type {PriceReference} from "./brand-alternatives.mjs";
export type AutoCommodityGroup={
  id:string;
  status:"approved";
  approvalMethod:"automatic_commodity";
  label:string;
  basis:"kg";
  memberIds:string[];
};
export function deriveAutoCommodityGroups(
  products:PriceReference[],
  reviewedGroups?:Array<{status:string;memberIds:string[]}>
):AutoCommodityGroup[];
