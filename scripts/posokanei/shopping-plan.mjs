/**
 * Group the optimized (complete) reference basket into practical, per-chain
 * checklists. The source result is immutable; subtotals are summed in cents.
 * Not checkout or proof of stock in any physical branch.
 */
export function groupShoppingPlan(plan) {
  if (!plan?.complete || !Array.isArray(plan.items)) return [];
  const stores = new Map();
  for (const item of plan.items) {
    const found = stores.get(item.retailerId) || {
      id:item.retailerId,name:item.retailerName,items:[],subtotalCents:0
    };
    found.items.push(item);
    found.subtotalCents += Math.round(item.lineTotalEur * 100);
    stores.set(item.retailerId,found);
  }
  return [...stores.values()]
    .sort((a,b)=>a.name.localeCompare(b.name,"el")||a.id.localeCompare(b.id))
    .map(({subtotalCents,...store})=>({
      ...store,subtotalEur:Number((subtotalCents/100).toFixed(2))
    }));
}

/** Actual savings of the selected plan, not the unrestricted theoretical minimum. */
export function savingsForPlan(result,plan) {
  const one=result?.bestSingleStore;
  if (!one?.complete || !plan?.complete ||
      typeof one.totalEur!=="number" || typeof plan.totalEur!=="number") return null;
  const cents=Math.round(one.totalEur*100)-Math.round(plan.totalEur*100);
  return Number((Math.max(0,cents)/100).toFixed(2));
}

/** Distinguish modes, snapshots and actual placements for checklist progress. */
export function planFingerprint(snapshotDate,mode,plan) {
  if (!plan?.complete) return "";
  const rows=plan.items.map(item=>[
    item.lineId,item.retailerId,item.sourceProductId,item.packages
  ].join(":")).sort();
  return JSON.stringify([snapshotDate,mode,rows]);
}

/** A compact Greek checklist suitable for copying to a phone's notes app. */
export function shoppingPlanText(result,plan,mode) {
  if (!result || !plan?.complete || typeof plan.totalEur!=="number") return "";
  const eur=n=>new Intl.NumberFormat("el-GR",{
    style:"currency",currency:"EUR"
  }).format(n);
  const label=mode==="single"?"Μία αλυσίδα":
    mode==="all"?"Κάθε επιλεγμένη αλυσίδα":
      "Έως "+result.storeLimit+" αλυσίδες";
  const lines=[
    "KONTA MOY × Πόσο Κάνει — Λίστα αγορών",
    "Καταγραφή τιμών: "+result.snapshotDate,
    "Σχέδιο: "+label,
    "Σύνολο πλήρους λίστας: "+eur(plan.totalEur),
    ""
  ];
  for (const store of groupShoppingPlan(plan)) {
    lines.push(store.name+" · "+eur(store.subtotalEur));
    for (const item of store.items) {
      lines.push("☐ "+item.productName+" × "+item.packages+
        " συσκ. — "+eur(item.lineTotalEur));
    }
    lines.push("");
  }
  lines.push("Ενδεικτικές τιμές ανά αλυσίδα, όχι τιμές/απόθεμα συγκεκριμένου καταστήματος.");
  lines.push("Δεν περιλαμβάνεται κόστος μετακίνησης ή διανομής.");
  lines.push("Πηγή: posokanei.gov.gr · Ανεξάρτητη σύγκριση KONTA MOY.");
  return lines.join("\n");
}


/** Preserve demanded quantity when swapping to a different pack size. */
export function packagesForEquivalent(sourceBaseQuantity,sourcePackages,candidateBaseQuantity) {
  if (![sourceBaseQuantity,candidateBaseQuantity].every(n=>typeof n==="number"&&Number.isFinite(n)&&n>0) ||
      !Number.isSafeInteger(sourcePackages) || sourcePackages<1 || sourcePackages>100) return null;
  const required=sourceBaseQuantity*sourcePackages;
  const count=Math.ceil(required/candidateBaseQuantity - 1e-9);
  return Number.isSafeInteger(count)&&count>=1&&count<=100?count:null;
}
