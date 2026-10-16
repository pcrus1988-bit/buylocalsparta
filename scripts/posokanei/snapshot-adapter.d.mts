/** Read-only PosoKanei snapshot adapter contract shared with Next.js. */
export type SourceReference={
  source:string;source_product_id:string;snapshot_date:string;name:string;
  brand:string|null;category:string|null;unit:string|null;unit_quantity:number|null;
  image_source_url:string|null;category_ids:string[];
};
export type SourcePrice={
  source:string;source_product_id:string;snapshot_date:string;country:string;
  retailer_id:string;retailer_name:string|null;price_eur:number;
  source_price_updated_at:string|null;is_discount:boolean;
};
export function transformSnapshot(snapshot:unknown,options?:{countries?:string[]}):{
  manifest:{snapshot_date:string;warnings:{invalid_price_rows:number;missing_price_arrays:number};reference_products:number;reference_price_observations:number};
  references:SourceReference[];prices:SourcePrice[];
};
export function sha256(raw:Uint8Array|string):string;
export function asJsonl(items:unknown[]):string;
