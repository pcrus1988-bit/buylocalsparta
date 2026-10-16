/** Read-only price references from a public PosoKanei archive. No vendor listings or stock. */
import { createHash } from 'node:crypto';
export const SOURCE='posokanei.gov.gr';
function fail(message){throw new Error('Invalid PosoKanei snapshot: '+message)}
function isRecord(x){return x!==null&&typeof x==='object'&&!Array.isArray(x)}
function str(x,max=500){return typeof x==='string'?x.trim().slice(0,max):''}
function number(x){return typeof x==='number'&&Number.isFinite(x)&&x>=0?x:null}
export function transformSnapshot(snapshot,{countries=['GR']}={}){
  if(!isRecord(snapshot))fail('root must be an object');
  const {date,fetched_at:fetchedAt,total,collected,products}=snapshot;
  if(typeof date!=='string'||! /^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date)))fail('date missing or invalid');
  if(!Number.isSafeInteger(total)||total<1||total>100000)fail('total invalid');
  if(!Number.isSafeInteger(collected)||collected!==total)fail('incomplete archive: collected='+collected+', total='+total);
  if(!Array.isArray(products)||products.length!==total)fail('products length mismatch');
  if(fetchedAt!=null&&(typeof fetchedAt!=='string'||!Number.isFinite(Date.parse(fetchedAt))))fail('fetched_at invalid');
  const allowed=new Set(countries);
  if([...allowed].some(c=>typeof c!=='string'||! /^[A-Z]{2}$/.test(c)))fail('invalid country');
  const refs=[], prices=[], ids=new Set(),retailers=new Set();
  const warnings={invalid_price_rows:0,missing_price_arrays:0};
  for(const p of products){
    if(!isRecord(p))fail('invalid product');
    const id=str(p.id,100),name=str(p.name,1000);
    if(!id||! /^[\w-]+$/.test(id)||!name)fail('product id/name invalid');
    if(ids.has(id))fail('duplicate product id '+id);
    ids.add(id);
    refs.push({
      source:SOURCE,source_product_id:id,snapshot_date:date,name,
      brand:str(p.brand,250)||null,category:str(p.category,250)||null,
      category_ids:Array.isArray(p.category_ids)?p.category_ids.filter(x=>typeof x==='string').slice(0,20):[],
      unit:str(p.unit,20)||null,unit_quantity:number(p.unit_quantity),
      private_label:typeof p.private_label==='boolean'?p.private_label:null,
      image_source_url:str(p.image_url,2000)||null,
      price_drop_flag:p.price_drop===true,
      source_updated_at:str(p.updated_at,64)||null
    });
    if(!Array.isArray(p.retailer_prices)){warnings.missing_price_arrays++;continue}
    const seenRetailers=new Set();
    for(const rp of p.retailer_prices){
      if(!isRecord(rp)||!allowed.has(rp.country))continue;
      const retailer=str(rp.retailer,100),price=number(rp.price);
      if(!retailer||! /^[\w-]+$/.test(retailer)||price===null||price>100000){warnings.invalid_price_rows++;continue}
      const key=rp.country+':'+retailer;
      if(seenRetailers.has(key))fail('duplicate retailer price '+id+'/'+key);
      seenRetailers.add(key);retailers.add(key);
      prices.push({
        source:SOURCE,source_product_id:id,snapshot_date:date,country:rp.country,
        retailer_id:retailer,retailer_name:str(rp.retailer_display_name,200)||null,
        price_eur:price,normalized_unit_price_eur:number(rp.price_normalized),
        is_discount:rp.is_discount===true,discount_percentage:number(rp.discount_percentage),
        source_price_updated_at:str(rp.last_updated,64)||null
      });
    }
  }
  return {manifest:{
    source:SOURCE,mirror:'spyrosavl/posokanei',snapshot_date:date,
    source_fetched_at:fetchedAt??null,source_total:total,source_collected:collected,
    reference_products:refs.length,reference_price_observations:prices.length,
    countries:[...allowed].sort(),retailers:[...retailers].sort(),warnings,
    permissions:'RESEARCH_ONLY_RIGHTS_UNVERIFIED',
    notice:'Reference prices are NOT KONTA MOY vendor offers, inventory, or retailer endorsements.'
  },references:refs,prices};
}
export const sha256=x=>createHash('sha256').update(x).digest('hex');
export const asJsonl=items=>items.map(x=>JSON.stringify(x)).join('\n')+'\n';
