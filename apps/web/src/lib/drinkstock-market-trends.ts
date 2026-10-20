/**
 * Read-only price visualization utilities.
 * No synthetic commerce events, database writes or price authority.
 */
type PriceMovement=Readonly<{id:string;beforeCents:number;afterCents:number}>;
export type PriceHistoryEvent=Readonly<{
 id:string;createdAt:string;movements:readonly PriceMovement[];
}>;

/**
 * Reconstruct up to 20 actual recorded rehearsal movements in chronological
 * order. A discontinuity or disagreement with the current persisted quote
 * hides unverifiable history rather than fabricating a price path.
 */
export function recordedRehearsalPriceSeries(
 events:readonly PriceHistoryEvent[],productId:string,currentCents:number
):number[]{
 if(!productId||!Number.isSafeInteger(currentCents)||currentCents<1)return [];
 const ordered=[...events].slice(0,20).sort((a,b)=>{
  const ta=Date.parse(a.createdAt),tb=Date.parse(b.createdAt);
  return (Number.isFinite(ta)?ta:0)-(Number.isFinite(tb)?tb:0)||a.id.localeCompare(b.id);
 });
 let values:number[]=[];
 for(const event of ordered){
  const m=event.movements.find(item=>item.id===productId);
  if(!m||!Number.isSafeInteger(m.beforeCents)||!Number.isSafeInteger(m.afterCents)||
    m.beforeCents<1||m.afterCents<1)continue;
  if(values.length&&values[values.length-1]!==m.beforeCents)values=[];
  if(!values.length)values.push(m.beforeCents);
  values.push(m.afterCents);
 }
 if(!values.length||values[values.length-1]!==currentCents)return [currentCents];
 return values.slice(-21);
}

/** Fixed-sized SVG polyline, always within the viewport. Values are cents. */
export function priceSparklinePoints(
 prices:readonly number[],width=160,height=44
):string{
 if(prices.length<2||prices.length>100||
   !Number.isFinite(width)||!Number.isFinite(height)||width<20||height<20||
   prices.some(x=>!Number.isSafeInteger(x)||x<1))return "";
 const low=Math.min(...prices),high=Math.max(...prices),span=Math.max(1,high-low);
 const inset=4;
 return prices.map((c,i)=>{
  const x=inset+(width-2*inset)*i/(prices.length-1);
  const y=inset+(height-2*inset)*(1-(c-low)/span);
  return x.toFixed(2)+","+y.toFixed(2);
 }).join(" ");
}
