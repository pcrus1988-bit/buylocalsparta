import {money,escapeHtml,pricedLines,manualLines,selectedRetailerIds,completePlan,safePrice,eligibleAlternative,groupedItems,compareLabel} from './core.mjs';

const $ = id => document.getElementById(id);
const KEY='kontamou-posokanei-mini-draft-v1';
const emptyListing={status:'unavailable',products:[],retailers:[]};
const state={catalog:emptyListing,lines:[],excluded:[],storeLimit:2,result:null,resultsVisible:false,checking:false,searching:false,brandResults:[],notice:'',loading:true};
let timer,fetchController,run=0;
const id=()=>`line_${Math.random().toString(36).slice(2,11)}`;
function toast(message){const el=$('toast');el.textContent=message;el.hidden=false;clearTimeout(timer);timer=setTimeout(()=>el.hidden=true,3500);}
function restore(){
  try{
    const value=JSON.parse(sessionStorage.getItem(KEY)||'{}');
    if(Array.isArray(value.lines))state.lines=value.lines.filter(l=>l&&/^line_[a-z0-9]{1,30}$/.test(l.id)&&typeof l.name==='string'&&l.name.length<=200&&(
      l.kind==='manual'||(l.kind==='exact'&&/^[A-Za-z0-9_-]{1,100}$/.test(l.sourceProductId)&&Number.isInteger(l.packageCount)&&l.packageCount>=1&&l.packageCount<=100)
    )).slice(0,20);
    if(Array.isArray(value.excluded))state.excluded=value.excluded.filter(x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x)).slice(0,24);
    if(Number.isInteger(value.storeLimit)&&value.storeLimit>=1&&value.storeLimit<=5)state.storeLimit=value.storeLimit;
  }catch{}
}
function persist(){try{sessionStorage.setItem(KEY,JSON.stringify({lines:state.lines,excluded:state.excluded,storeLimit:state.storeLimit}));}catch{}}
function invalidate(){run++;state.checking=false;state.result=null;state.resultsVisible=false;state.brandResults=[];$('plan-section').hidden=true;persist();renderBasket();}
function renderStatus(){
  const ready=state.catalog.status==='ready';
  const label=state.loading?'Έλεγχος δημοσιευμένων τιμών…':ready?`Καταγραφή: ${state.catalog.snapshotDate||'μη διαθέσιμη ημερομηνία'} · Ενδεικτικές τιμές`:'Δεν έχουν δημοσιευτεί επαληθευμένες τιμές — η χειροκίνητη λίστα λειτουργεί.';
  $('source-status').innerHTML=`<span class="status-dot"></span> ${escapeHtml(label)}`;
  $('source-status').classList.toggle('pending',!ready&&!state.loading);
}
function renderProducts(){
  const root=$('products'), msg=$('search-message');
  if(state.searching){msg.textContent='Αναζήτηση…';root.innerHTML='';return;}
  if(state.catalog.status!=='ready'){
    msg.textContent='Η ζωντανή σύγκριση θα εμφανιστεί μόλις επιτραπεί η δημοσίευση της πηγής.';
    root.innerHTML='<div class="empty-result">Μπορείς ήδη να φτιάξεις χειροκίνητη λίστα παρακάτω. Δεν εμφανίζουμε δοκιμαστικές τιμές.</div>';return;
  }
  const products=Array.isArray(state.catalog.products)?state.catalog.products:[];
  msg.textContent=products.length?`Εμφανίζονται ${products.length} προϊόντα · αναζήτησε με πιο συγκεκριμένη λέξη για περισσότερα.`:'Δεν βρέθηκαν προϊόντα με καταγεγραμμένη τιμή.';
  root.innerHTML=products.length?products.map(p=>{
    const offers=(p.offers||[]).filter(o=>safePrice(o.priceEur));
    const min=offers.length?Math.min(...offers.map(o=>o.priceEur)):null;
    const safeId=escapeHtml(p.id);
    return `<article class="product"><div class="product-art" aria-hidden="true">🛒</div><div class="product-text"><b>${escapeHtml(p.name)}</b><small>${escapeHtml(p.brand||p.category||'Είδος παντοπωλείου')}</small></div><div class="product-price">${min!==null?'από '+money(min):'—'}</div><button class="add-button" data-action="add" data-id="${safeId}" aria-label="Προσθήκη ${escapeHtml(p.name)}" ${min===null?'disabled':''}>+</button></article>`;
  }).join(''):'<div class="empty-result">Δοκίμασε άλλη ονομασία ή πρόσθεσε είδος χειροκίνητα.</div>';
}
function renderRetailers(){
  $('store-limit').value=String(state.storeLimit);
  const retailers=state.catalog.retailers||[];
  $('retailers').innerHTML=retailers.length?retailers.map(r=>`<label class="retailer"><input type="checkbox" data-retailer="${escapeHtml(r.id)}" ${!state.excluded.includes(r.id)?'checked':''}><span>${escapeHtml(r.name)}</span></label>`).join(''):'<p class="muted">Οι διαθέσιμες αλυσίδες θα εμφανιστούν όταν ενεργοποιηθούν οι τιμές.</p>';
}
function renderBasket(){
  const lines=state.lines; $('basket-count').textContent=String(lines.length);
  $('basket').innerHTML=!lines.length?'<div class="empty"><span>🧺</span><b>Η λίστα σου είναι άδεια.</b><small>Πρόσθεσε το πρώτο προϊόν.</small></div>':lines.map(l=>{
    const exact=l.kind==='exact';
    return `<div class="basket-item ${l.done?'done':''}">
      <input type="checkbox" data-action="done" data-id="${escapeHtml(l.id)}" ${l.done?'checked':''} aria-label="Ολοκληρώθηκε ${escapeHtml(l.name)}">
      <div class="item-name">${escapeHtml(l.name)}<small>${exact?'Καταγεγραμμένο προϊόν':'Χειροκίνητο · χωρίς τιμή'}</small></div>
      ${exact?`<div class="qty"><button type="button" data-action="minus" data-id="${escapeHtml(l.id)}" aria-label="Μείωση ποσότητας">−</button><strong>${l.packageCount}</strong><button type="button" data-action="plus" data-id="${escapeHtml(l.id)}" aria-label="Αύξηση ποσότητας">+</button></div>`:''}
      <button type="button" class="remove" data-action="remove" data-id="${escapeHtml(l.id)}" aria-label="Αφαίρεση ${escapeHtml(l.name)}">×</button></div>`;
  }).join('');
  const canCompare=pricedLines(lines).length>0&&state.catalog.status==='ready'&&selectedRetailerIds(state.catalog.retailers||[],state.excluded).length>0&&!state.checking;
  $('compare').disabled=!canCompare;
  $('compare').innerHTML=state.checking?'Υπολογισμός…':'Βρες το οικονομικότερο καλάθι <span aria-hidden="true">→</span>';
  const priced=pricedLines(lines).length,manual=manualLines(lines).length;
  $('basket-note').textContent=priced?`${priced} καταγεγραμμένα προϊόντα για σύγκριση${manual?' · '+manual+' χειροκίνητα εκτός κόστους':''}. Προσωρινή λίστα μόνο σε αυτή την καρτέλα.`:'Για σύγκριση τιμών πρόσθεσε τουλάχιστον ένα καταγεγραμμένο προϊόν. Η χειροκίνητη λίστα παραμένει διαθέσιμη.';
  $('brand-check').hidden=!priced||state.catalog.status!=='ready';
  if(!state.brandResults.length)$('brand-results').innerHTML='';
}
function renderPlan(){
  const r=state.result,plan=completePlan(r),manual=manualLines(state.lines).length;
  $('plan-section').hidden=false;
  if(!plan){
    const missing=r?.missingItems||r?.cheapestWithinStoreLimit?.missingItems||[];
    $('plan').innerHTML=`<p class="plan-warning">Δεν υπάρχει πλήρης τιμολόγηση για όλα τα καταγεγραμμένα προϊόντα στις επιλεγμένες αλυσίδες.${missing.length?' Είδη χωρίς καταγεγραμμένη επιλογή: '+missing.length+'.':''} Επίλεξε περισσότερες αλυσίδες ή άλλα προϊόντα.</p>`;
    $('copy-plan').hidden=true;return;
  }
  const single=r.bestSingleStore;
  const saving=single?.complete&&safePrice(single.totalEur)&&single.totalEur>plan.totalEur?single.totalEur-plan.totalEur:null;
  const groups=groupedItems(plan);
  $('plan').innerHTML=`<div class="plan-summary"><small>Οικονομικότερη πλήρης καταγεγραμμένη λύση · ${plan.storeCount} αλυσίδες</small><div class="plan-total">${money(plan.totalEur)}</div>${saving!==null?`<div class="saving">Εξοικονόμηση ${money(saving)} σε σχέση με τη φθηνότερη πλήρη λύση μίας αλυσίδας</div>`:''}<small>${escapeHtml(compareLabel(plan,r,manual))} Καταγραφή: ${escapeHtml(r.snapshotDate||'—')}</small></div>${groups.map(g=>`<div class="plan-shop"><h3><span>${escapeHtml(g.name)}</span><span>${money(g.subtotal)}</span></h3>${g.items.map(item=>`<div class="plan-line ${state.lines.find(l=>l.id===item.lineId)?.done?'checked':''}"><input id="check-${escapeHtml(item.lineId)}" type="checkbox" data-action="plan-done" data-id="${escapeHtml(item.lineId)}" ${state.lines.find(l=>l.id===item.lineId)?.done?'checked':''}><label for="check-${escapeHtml(item.lineId)}">${escapeHtml(item.productName)} × ${item.packages}</label><b>${money(item.lineTotalEur)}</b></div>`).join('')}</div>`).join('')}${manual?`<div class="plan-warning">${manual} χειροκίνητα είδη της λίστας δεν έχουν τιμή και δεν περιλαμβάνονται στο ποσό.</div>`:''}`;
  $('copy-plan').hidden=false;
}
function render(){renderStatus();renderProducts();renderRetailers();renderBasket();}
async function search(){
  const q=$('search').value.trim().slice(0,100);
  if(fetchController)fetchController.abort();
  const controller=new AbortController();fetchController=controller;state.searching=true;renderProducts();
  try{
    const url='/api/posokanei?'+new URLSearchParams({q,page:'1',exclude:state.excluded.join(',')});
    const response=await fetch(url,{cache:'no-store',signal:controller.signal,headers:{Accept:'application/json'}});
    if(!response.ok)throw new Error('unavailable');
    const json=await response.json();
    if(controller.signal.aborted)return;
    if(json.status!=='ready')throw new Error('unavailable');
    state.catalog={...json,products:Array.isArray(json.products)?json.products:[],retailers:Array.isArray(json.retailers)?json.retailers:[]};
  }catch(e){if(controller.signal.aborted)return;state.catalog=emptyListing;}
  finally{if(!controller.signal.aborted){state.searching=false;state.loading=false;render();}}
}
let searchTimer;
$('search').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(search,250);});
$('products').addEventListener('click',e=>{
  const btn=e.target.closest('[data-action="add"]');if(!btn)return;
  const p=(state.catalog.products||[]).find(x=>x.id===btn.dataset.id);if(!p)return;
  const existing=state.lines.find(l=>l.kind==='exact'&&l.sourceProductId===p.id&&!l.replacedFrom);
  if(existing){if(existing.packageCount>=100)return toast('Έως 100 συσκευασίες ανά προϊόν.');existing.packageCount++;}
  else {if(state.lines.length>=20)return toast('Η λίστα χωρά έως 20 είδη.');state.lines.push({id:id(),kind:'exact',sourceProductId:p.id,packageCount:1,name:p.name,done:false});}
  invalidate();toast('Προστέθηκε στη λίστα.');
});
$('manual-form').addEventListener('submit',e=>{
  e.preventDefault();const name=$('manual-name').value.trim().slice(0,100);if(!name)return;
  if(state.lines.length>=20)return toast('Η λίστα χωρά έως 20 είδη.');
  state.lines.push({id:id(),kind:'manual',name,done:false});$('manual-name').value='';invalidate();toast('Το είδος προστέθηκε χωρίς τιμή.');
});
function markDone(lineId,value){const line=state.lines.find(l=>l.id===lineId);if(!line)return;line.done=value;persist();renderBasket();if(state.result)renderPlan();}
$('basket').addEventListener('change',e=>{if(e.target.dataset.action==='done')markDone(e.target.dataset.id,e.target.checked);});
$('basket').addEventListener('click',e=>{
  const btn=e.target.closest('[data-action]');if(!btn||btn.tagName==='INPUT')return;
  const line=state.lines.find(l=>l.id===btn.dataset.id);if(!line)return;
  const action=btn.dataset.action;
  if(action==='remove')state.lines=state.lines.filter(l=>l.id!==line.id);
  else if(action==='plus'&&line.kind==='exact')line.packageCount=Math.min(100,line.packageCount+1);
  else if(action==='minus'&&line.kind==='exact')line.packageCount=Math.max(1,line.packageCount-1);
  invalidate();
});
$('stores-toggle').addEventListener('click',()=>{const panel=$('stores-panel');panel.hidden=!panel.hidden;$('stores-toggle').setAttribute('aria-expanded',String(!panel.hidden));});
$('store-limit').addEventListener('change',e=>{state.storeLimit=Math.max(1,Math.min(5,Number(e.target.value)));invalidate();});
$('retailers').addEventListener('change',e=>{
  if(!e.target.dataset.retailer)return;
  const key=e.target.dataset.retailer;
  state.excluded=e.target.checked?state.excluded.filter(x=>x!==key):[...new Set([...state.excluded,key])];
  invalidate();void search();
});
$('compare').addEventListener('click',async()=>{
  const exact=pricedLines(state.lines);
  const retailerIds=selectedRetailerIds(state.catalog.retailers||[],state.excluded);
  if(!exact.length||!retailerIds.length||state.checking||state.catalog.status!=='ready')return;
  const request=++run;state.checking=true;renderBasket();
  try{
    const response=await fetch('/api/posokanei/optimize',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({lines:exact.map(({id,sourceProductId,packageCount,replacedFrom})=>({id,kind:'exact',sourceProductId,packageCount,...(replacedFrom?{replacedFrom}:{})})),storeLimit:state.storeLimit,retailerIds})});
    const json=await response.json();
    if(!response.ok||json.status!=='ready'||!json.result)throw Error(json.error||'Ο υπολογισμός δεν ολοκληρώθηκε.');
    if(request!==run)return;
    state.result=json.result;renderPlan();$('plan-section').scrollIntoView({behavior:'smooth',block:'start'});
  }catch(e){if(request===run)toast(e instanceof Error?e.message:'Προσωρινό σφάλμα σύγκρισης.');}
  finally{if(request===run){state.checking=false;renderBasket();}}
});
$('plan').addEventListener('change',e=>{if(e.target.dataset.action==='plan-done')markDone(e.target.dataset.id,e.target.checked);});
$('copy-plan').addEventListener('click',async()=>{
  const plan=completePlan(state.result);if(!plan)return;
  const text=['ΚΟΝΤΑ ΜΟΥ × PosoKanei · Λίστα αγορών','Καταγραφή: '+state.result.snapshotDate,'',...groupedItems(plan).flatMap(g=>[g.name+' · '+money(g.subtotal),...g.items.map(x=>'☐ '+x.productName+' × '+x.packages+' — '+money(x.lineTotalEur)),'']), 'Σύνολο καταγεγραμμένων: '+money(plan.totalEur),...(manualLines(state.lines).length?['','Χωρίς τιμή:',...manualLines(state.lines).map(x=>'☐ '+x.name)]:[]),'Οι τιμές ενδέχεται να διαφέρουν ανά κατάστημα.'].join('\n');
  try{await navigator.clipboard.writeText(text);toast('Η λίστα αντιγράφηκε.');}catch{toast('Η αντιγραφή απαιτεί ασφαλή σύνδεση (HTTPS).');}
});
$('brand-check').addEventListener('click',async()=>{
  const lines=pricedLines(state.lines);if(!lines.length)return;
  const btn=$('brand-check');btn.disabled=true;btn.textContent='Έλεγχος εναλλακτικών…';
  try{
    const r=await fetch('/api/posokanei/alternatives',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({lines:lines.map(l=>({id:l.id,sourceProductId:l.sourceProductId,packageCount:l.packageCount})),excludedRetailerIds:state.excluded})});
    const body=await r.json();if(!r.ok||body.status!=='ready')throw Error('Ο έλεγχος δεν είναι διαθέσιμος.');
    const valid=(body.lines||[]).map(x=>({...x,alternatives:(x.alternatives||[]).filter(eligibleAlternative)})).filter(x=>x.alternatives.length);
    state.brandResults=valid;
    $('brand-results').innerHTML=valid.length?`<div class="brand-options"><h3>Επαληθευμένες φθηνότερες μάρκες</h3>${valid.flatMap(line=>line.alternatives.slice(0,2).map(a=>`<div class="brand-option"><span><b>${escapeHtml(a.name)}</b><small>${escapeHtml(a.retailerName)} · δυνητικό όφελος ${money(a.savingsEur)} · ${a.packageCount} συσκ.</small></span><button data-action="alternative" data-line="${escapeHtml(line.lineId)}" data-product="${escapeHtml(a.id)}">Επιλογή</button></div>`)).join('')}</div>`:'<div class="brand-options">Δεν βρέθηκαν επαληθευμένες φθηνότερες εναλλακτικές για την τρέχουσα λίστα.</div>';
  }catch(e){toast(e instanceof Error?e.message:'Ο έλεγχος απέτυχε.');}
  finally{btn.disabled=false;btn.textContent='Έλεγχος για φθηνότερες μάρκες';}
});
$('brand-results').addEventListener('click',e=>{
  const btn=e.target.closest('[data-action="alternative"]');if(!btn)return;
  const source=state.brandResults.find(l=>l.lineId===btn.dataset.line);
  const alt=source?.alternatives.find(a=>a.id===btn.dataset.product);
  const line=state.lines.find(l=>l.id===btn.dataset.line&&l.kind==='exact'&&l.sourceProductId===source?.sourceProductId);
  if(!line||!eligibleAlternative(alt))return;
  // The server has verified the quantity-equivalent replacement; do not trust local displayed savings.
  const original=line.replacedFrom||{sourceProductId:line.sourceProductId,packageCount:line.packageCount};
  line.replacedFrom=original;line.sourceProductId=alt.id;line.packageCount=alt.packageCount;line.name=alt.name;
  invalidate();toast('Επιλέχθηκε φθηνότερη μάρκα. Υπολόγισε ξανά το καλάθι.');
});
restore();render();void search();
if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
