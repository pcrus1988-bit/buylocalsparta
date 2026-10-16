/** Local-only handwritten shopping-note import. No network, catalogue lookup,
 * promotion or server-side wishlist operation is implied by these notes.
 */
export type ShoppingNote={title:string;quantity:number};
const MAX_LINES=40;
const MAX_LENGTH=2400;

export function normalizedNoteKey(value:string):string{
 return value.normalize("NFKC").trim().toLocaleLowerCase("el-GR")
  .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .replace(/\s+/g," ");
}

/** Only explicit x / × quantities are interpreted as quantities.
 * "3 σε 1" and other numeric product names remain product titles.
 */
export function parseShoppingNotes(input:string):ShoppingNote[]{
 if(typeof input!=="string"||input.length>MAX_LENGTH)throw Error("INVALID_BATCH");
 const lines=input.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 if(!lines.length||lines.length>MAX_LINES)throw Error("INVALID_BATCH");
 const deduplicated=new Map<string,ShoppingNote>();
 for(const line of lines){
  let text=line.replace(/^(?:[-*•✓]\s*)+/u,"").trim();
  let quantity=1;
  const prefix=text.match(/^(\d{1,3})\s*[x×]\s+(.+)$/iu);
  const suffix=!prefix&&text.match(/^(.+?)\s+[x×]\s*(\d{1,3})$/iu);
  if(prefix){quantity=Number(prefix[1]);text=prefix[2].trim();}
  else if(suffix){quantity=Number(suffix[2]);text=suffix[1].trim();}
  const title=text.normalize("NFKC").replace(/\s+/g," ").trim();
  if(!Number.isSafeInteger(quantity)||quantity<1||quantity>99||title.length<2||title.length>120
    ||/[\u0000-\u001f\u007f]/.test(title))throw Error("INVALID_BATCH");
  const key=normalizedNoteKey(title);
  const prior=deduplicated.get(key);
  if(prior){
   if(prior.quantity+quantity>99)throw Error("QUANTITY_LIMIT");
   deduplicated.set(key,{title:prior.title,quantity:prior.quantity+quantity});
  }else deduplicated.set(key,{title,quantity});
 }
 return [...deduplicated.values()];
}
