/**
 * Audited source-SKU equivalence publication. A manually reviewed source-title
 * group is allowed only for the exact product records actually inspected.
 * Any new/renamed product, different brand/category/pack, partial member group,
 * wrong basis, or ID collision fails closed until editorial re-review.
 *
 * This is equivalence of the published product TYPE, not a guarantee of
 * identical ingredients, allergens, country of origin, availability or taste.
 */
import {referenceQuantity} from "./brand-alternatives.mjs";
const validId=/^[a-z0-9-]{3,100}$/;
export function buildApprovedReferenceGroups(products,reviewed){
  if(!Array.isArray(products)||reviewed?.schema_version!==1||
    reviewed.source!=="posokanei.gov.gr"||!Array.isArray(reviewed.groups))return [];
  const byId=new Map(products.map(p=>[p.source_product_id,p]));
  const used=new Set(),groupIds=new Set(),result=[];
  for(const group of reviewed.groups){
    if(group?.status!=="approved"||typeof group.id!=="string"||
      !validId.test(group.id)||groupIds.has(group.id)||
      typeof group.label!=="string"||!group.label.trim()||
      !["kg","l","piece"].includes(group.basis)||
      !Array.isArray(group.members)||group.members.length<2||
      group.members.length>100)continue;
    groupIds.add(group.id);
    const found=[],local=new Set(),categories=new Set(),brands=new Set();
    let safe=true;
    for(const pinned of group.members){
      const id=pinned?.id,p=byId.get(id);
      const q=p&&referenceQuantity(p);
      if(typeof id!=="string"||!p||used.has(id)||local.has(id)||
        !q||q.unit!==group.basis||
        pinned.name!==p.name||pinned.brand!==p.brand||
        pinned.category!==p.category||pinned.unit!==p.unit||
        pinned.unit_quantity!==p.unit_quantity||
        typeof p.brand!=="string"||!p.brand.trim()||
        typeof p.category!=="string"||!p.category.trim()){
        safe=false;break;
      }
      local.add(id);found.push(id);categories.add(p.category);
      brands.add(p.brand.normalize("NFD").toLocaleLowerCase("el-GR"));
    }
    if(!safe||categories.size!==1||brands.size<2)continue;
    for(const id of found)used.add(id);
    result.push({id:group.id,label:group.label,status:"approved",basis:group.basis,memberIds:found});
  }
  return result;
}
