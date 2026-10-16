export type ReferenceProductEvidence={
 source_product_id:string;name:string;brand:string|null;category:string|null;
 unit:string|null;unit_quantity:number|null
};
export type ApprovedReferenceGroup={
 id:string;label:string;status:"approved";basis:"kg"|"l"|"piece";memberIds:string[]
};
export function buildApprovedReferenceGroups(products:ReferenceProductEvidence[],reviewed:unknown):ApprovedReferenceGroup[];
