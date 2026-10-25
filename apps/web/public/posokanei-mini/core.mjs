// Pure, dependency-free helpers: never invent or infer price observations.
export const money = value => typeof value === 'number' && Number.isFinite(value)
  ? new Intl.NumberFormat('el-GR',{style:'currency',currency:'EUR'}).format(value) : '—';
export const escapeHtml = value => String(value??'').replace(/[&<>"']/g, char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export const pricedLines = lines => lines.filter(l=>l.kind==='exact');
export const manualLines = lines => lines.filter(l=>l.kind==='manual');
export const selectedRetailerIds = (retailers,excluded) => retailers.map(r=>r.id).filter(id=>!excluded.includes(id));
export const completePlan = result => result?.cheapestWithinStoreLimit?.complete===true ? result.cheapestWithinStoreLimit : null;
export const safePrice = value => typeof value==='number' && Number.isFinite(value) && value>0 && value<100000;
export const eligibleAlternative = alt => alt && ['reviewed_equivalent','automatically_verified'].includes(alt.confidence) &&
  safePrice(alt.originalTotalEur) && safePrice(alt.candidateTotalEur) && alt.originalTotalEur>alt.candidateTotalEur &&
  Number.isSafeInteger(alt.packageCount) && alt.packageCount>=1 && alt.packageCount<=100 && /^[A-Za-z0-9_-]{1,100}$/.test(alt.id);
export function groupedItems(plan) {
  const groups=new Map();
  for(const item of plan?.items||[]){
    const id=item.retailerId;
    if(!groups.has(id))groups.set(id,{id,name:item.retailerName,items:[],subtotal:0});
    const g=groups.get(id);g.items.push(item);g.subtotal+=item.lineTotalEur;
  }
  return [...groups.values()].sort((a,b)=>a.name.localeCompare(b.name,'el'));
}
export function compareLabel(plan,result,manualCount){
  if(!plan)return 'Δεν υπάρχει πλήρης καταγεγραμμένη τιμή για αυτό το καλάθι.';
  return manualCount?`Σύγκριση μόνο για ${result?.lineCount||plan.items.length} καταγεγραμμένα είδη · ${manualCount} χειροκίνητα εκτός υπολογισμού.`:'Σύγκριση καταγεγραμμένων ειδών · όχι τελική τιμή στο κατάστημα.';
}
