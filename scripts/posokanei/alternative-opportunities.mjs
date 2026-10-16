/**
 * Non-binding, per-item savings opportunities from validated alternatives.
 * These figures do not replace the basket optimiser or promise combined savings:
 * the final basket may require different supermarkets or incur other constraints.
 */
export function summarizeCheaperAlternatives(results) {
  const byLine=new Map();
  for(const entry of results) {
    if(typeof entry?.lineId!=="string"||!entry.lineId)continue;
    // API summary covers all eligible cheaper candidates, including those
    // beyond the compact displayed list. Old responses still work as fallback.
    const full=entry.bestCheaperSavingEur;
    let bestCents=0;
    if(typeof full==="number"&&Number.isFinite(full)&&full>=0){
      bestCents=Math.round(full*100);
    }else for(const candidate of entry.alternatives||[]){
      if(!["reviewed_equivalent","automatically_verified"].includes(candidate?.confidence)||
         typeof candidate.savingsEur!=="number"||!Number.isFinite(candidate.savingsEur)||
         candidate.savingsEur<=0||
         typeof candidate.originalTotalEur!=="number"||!Number.isFinite(candidate.originalTotalEur)||
         candidate.originalTotalEur<=0)continue;
      const cents=Math.round(candidate.savingsEur*100);
      if(Number.isSafeInteger(cents)&&cents>bestCents)bestCents=cents;
    }
    if(bestCents>0)byLine.set(entry.lineId,Math.max(bestCents,byLine.get(entry.lineId)||0));
  }
  const cents=[...byLine.values()].reduce((total,saving)=>total+saving,0);
  return {lineIds:[...byLine.keys()],productCount:byLine.size,potentialSavingEur:Number((cents/100).toFixed(2))};
}
