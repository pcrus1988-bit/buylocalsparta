/**
 * Public research storytelling registry, distinct from the original locked
 * analysis plan. The chapter structure may group existing indicators but
 * MUST NOT claim newly introduced associations were preregistered.
 * EXP01 and any randomized marketplace experiment are strictly absent.
 */
export type ResultsSubchapter = Readonly<{
  id: string; title: string; questionCodes: readonly string[];
  metrics: readonly string[]; relation: string; interpretation: string;
}>;
export type ResultsChapter = Readonly<{
  id: string; number: string; name: string; subtitle: string;
  subchapters: readonly ResultsSubchapter[];
}>;
export const PUBLIC_RESULTS_CHAPTERS: readonly ResultsChapter[] = [
 {id:"economy",number:"01",name:"Οικονομικές πιέσεις",subtitle:"Η οικονομική πραγματικότητα των επιχειρήσεων",subchapters:[
  {id:"costs",title:"Λειτουργικό κόστος και κερδοφορία",questionCodes:["Q21"],metrics:["business_financial_trends_12m.operating_costs.share.increased","business_financial_trends_12m.profitability.share.decreased","business_financial_divergence.share.turnover_up_profit_down"],relation:"Αύξηση κόστους × Μείωση κερδοφορίας",interpretation:"Αυτοαναφερόμενες μεταβολές. Η συνύπαρξη τάσεων δεν αποδεικνύει αιτιότητα."},
  {id:"pressures",title:"Πιέσεις στη βιωσιμότητα",questionCodes:["Q27"],metrics:["economic_viability_pressures.share.purchasing_power","economic_viability_pressures.share.suppliers","economic_viability_pressures.share.energy","economic_viability_pressures.share.liquidity"],relation:"Πίεση ρευστότητας × Επιχειρηματική απαισιοδοξία",interpretation:"Πολλαπλές επιλογές έως τρεις: τα ποσοστά δεν αθροίζονται στο 100%."},
  {id:"structure",title:"Μικρές έναντι μεγαλύτερων επιχειρήσεων",questionCodes:["Q02","Q21"],metrics:["business_financial_trends_12m.turnover.share.decreased","business_financial_trends_12m.profitability.share.decreased"],relation:"Μέγεθος × Πτώση κερδοφορίας",interpretation:"Οι διαφορές κατά μέγεθος μπορεί να συγχέονται με τον κλάδο και τη γεωγραφική σύνθεση."}
 ]},
 {id:"digital",number:"02",name:"Ψηφιακή μετάβαση",subtitle:"Πωλήσεις και τεχνολογικές δυνατότητες",subchapters:[
  {id:"reach",title:"Κανάλια και online πωλήσεις",questionCodes:["Q03","Q04"],metrics:["sales_channels.share.own_eshop","sales_channels.share.social","digital_sales_share.share.0","digital_sales_share.share.26_50"],relation:"E-shop × Προσδοκίες πωλήσεων",interpretation:"Η ύπαρξη καναλιού δεν αποδεικνύει αύξηση πωλήσεων."},
  {id:"tools",title:"Ψηφιακά εργαλεία και συγχρονισμός",questionCodes:["Q05","Q06"],metrics:["digital_readiness.mean","digital_capabilities.catalog.share.yes","digital_capabilities.stock_sync.share.yes","catalog_update_frequency.share.realtime"],relation:"Ψηφιακή ετοιμότητα × Λειτουργική δυσκολία",interpretation:"Οι σύνθετοι δείκτες απαιτούν τον ακριβή δημοσιευμένο κανόνα βαθμολόγησης."},
  {id:"obstacles",title:"Εμπόδια πρώτων ηλεκτρονικών πωλήσεων",questionCodes:["Q22","Q24"],metrics:["first_online_sale_barriers.share.setup_cost","first_online_sale_barriers.share.technical_skills","first_online_sale_barriers.share.time"],relation:"Απουσία online πωλήσεων × Ψηφιακά εμπόδια",interpretation:"Η Q24 αφορά μόνο την επιλέξιμη ομάδα χωρίς online πωλήσεις."}
 ]},
 {id:"customers",number:"03",name:"Πελάτες και τοπική αγορά",subtitle:"Πώς ανακαλύπτουν οι πελάτες τα καταστήματα",subchapters:[
  {id:"channels",title:"Πηγές απόκτησης πελατών",questionCodes:["Q09","Q10"],metrics:["customer_acquisition_sources.share.word_of_mouth","customer_acquisition_sources.share.google","customer_acquisition_sources.share.footfall","acquisition_difficulty_change.mean"],relation:"Κανάλια απόκτησης × Δυσκολία",interpretation:"Οι πηγές απόκτησης είναι πολλαπλές επιλογές."},
  {id:"local",title:"Εξάρτηση από την τοπική αγορά",questionCodes:["Q11","Q12"],metrics:["local_customer_share.share.76_100","local_customer_share.share.51_75","local_product_discovery_importance.mean"],relation:"Τοπική πελατεία × Σημασία online ανακάλυψης",interpretation:"Η σημασία της ανακάλυψης εκφράζει στάση των επιχειρήσεων."},
  {id:"shops",title:"Online παρουσία και φυσικό κατάστημα",questionCodes:["Q25","Q26"],metrics:["online_presence_local_store_impact.share.increased_lot","online_presence_local_store_impact.share.increased_some","online_presence_expected_local_impact.share.yes_lot"],relation:"Διαδικτυακή παρουσία × Φυσική επισκεψιμότητα",interpretation:"Η πραγματική εκτιμώμενη εμπειρία (Q25) δεν συγχέεται με τις υποθετικές προσδοκίες (Q26)."}
 ]},
 {id:"operations",number:"04",name:"Λειτουργικές δυσκολίες",subtitle:"Εμπόδια στην καθημερινή λειτουργία",subchapters:[
  {id:"friction",title:"Πηγές λειτουργικής πίεσης",questionCodes:["Q07"],metrics:["retail_friction.mean","operational_friction.stock.mean","operational_friction.admin.mean","operational_friction.acquisition.mean"],relation:"Εργαλεία αποθέματος × Δυσκολία",interpretation:"Οι κλίμακες αντανακλούν τη βιωμένη δυσκολία, όχι ώρες εργασίας."},
  {id:"growth",title:"Προτεραιότητες εμποδίων ανάπτυξης",questionCodes:["Q08"],metrics:["top_growth_barriers.share.acquisition","top_growth_barriers.share.logistics","top_growth_barriers.share.admin","top_growth_barriers.share.tech"],relation:"Σοβαρότητα δυσκολίας × Δηλωμένο εμπόδιο",interpretation:"Κάθε συμμετέχων επιλέγει έως τρία εμπόδια."},
  {id:"voices",title:"Ποιοτικά εμπόδια και ανοιχτές απαντήσεις",questionCodes:["Q18"],metrics:[],relation:"Θεματική ανάλυση ελεύθερων απαντήσεων",interpretation:"Η ποιοτική ανάλυση χρειάζεται ανθρώπινο έλεγχο και αποπροσωποποίηση πριν δημοσιευθεί."}
 ]},
 {id:"confidence",number:"05",name:"Εμπιστοσύνη και επενδύσεις",subtitle:"Προοπτικές και σχεδιασμοί για το επόμενο 12μηνο",subchapters:[
  {id:"outlook",title:"Αισιοδοξία και προοπτικές πωλήσεων",questionCodes:["Q17","Q19"],metrics:["retail_confidence.mean","sales_outlook.share.up_small","sales_outlook.share.down_small","business_optimism_12m.share.pessimistic"],relation:"Μείωση κερδοφορίας × Απαισιοδοξία",interpretation:"Οι προσδοκίες δεν αποτελούν οικονομική πρόβλεψη."},
  {id:"investment",title:"Επενδυτικές προθέσεις",questionCodes:["Q16"],metrics:["investment_intentions.share.eshop","investment_intentions.share.erp","investment_intentions.share.ads","investment_intentions.share.none"],relation:"Επενδυτική πρόθεση × Ψηφιακή ετοιμότητα",interpretation:"Οι προθέσεις δεν ισοδυναμούν με ήδη υλοποιημένες επενδύσεις."},
  {id:"funding",title:"Δυνατότητα χρηματοδότησης",questionCodes:["Q20"],metrics:["investment_capacity_confidence_12m.share.unlikely","investment_capacity_confidence_12m.share.very_unlikely","investment_capacity_confidence_12m.share.likely"],relation:"Χρηματοδοτική εμπιστοσύνη × Επενδυτικά σχέδια",interpretation:"Η αντιλαμβανόμενη δυνατότητα χρηματοδότησης δεν αποδεικνύει τραπεζική επιλεξιμότητα."}
 ]},
 {id:"inequalities",number:"06",name:"Γεωγραφία και ανισότητες",subtitle:"Διαφορές κατά μέγεθος, κλάδο και γεωγραφία",subchapters:[
  {id:"regional",title:"Περιφερειακές διαφοροποιήσεις",questionCodes:["Q05","Q07","Q19"],metrics:["digital_readiness.mean","retail_friction.mean","retail_confidence.mean"],relation:"Περιοχή × Εμπιστοσύνη",interpretation:"Οι κωδικοί προέλευσης δεν αποτελούν αυτομάτως κωδικούς διοικητικών Περιφερειών."},
  {id:"sectoral",title:"Διαφορές μεταξύ κλάδων",questionCodes:["Q02","Q05","Q21"],metrics:["digital_readiness.mean","retail_friction.mean","business_financial_trends_12m.profitability.share.decreased"],relation:"Κλάδος × Πτώση κερδοφορίας",interpretation:"Περιγραφικές συγκρίσεις δεν είναι αυτομάτως στατιστικά σημαντικές."},
  {id:"sizes",title:"Διαφορές κατά μέγεθος επιχείρησης",questionCodes:["Q02","Q19","Q21"],metrics:["retail_confidence.mean","digital_readiness.mean","business_financial_trends_12m.profitability.share.decreased"],relation:"Μέγεθος × Απαισιοδοξία",interpretation:"Υποομάδες χαμηλού n αποκρύπτονται. Οι συνδυαστικές διασταυρώσεις χρειάζονται ξεχωριστή εκτίμηση."}
 ]}
] as const;
export const PUBLIC_RESULTS_METRICS = [...new Set(PUBLIC_RESULTS_CHAPTERS.flatMap(ch => ch.subchapters.flatMap(s => s.metrics)))];
export function publicMetricLabel(key:string):string {
 const fixed:Record<string,string>={
  "digital_readiness.mean":"Δείκτης ψηφιακής ετοιμότητας",
  "retail_friction.mean":"Δείκτης λειτουργικών δυσκολιών",
  "retail_confidence.mean":"Δείκτης επιχειρηματικής εμπιστοσύνης",
  "business_financial_divergence.share.turnover_up_profit_down":"Αύξηση τζίρου αλλά πτώση κερδών",
  "local_product_discovery_importance.mean":"Σημασία τοπικής online ανακάλυψης",
  "acquisition_difficulty_change.mean":"Μεταβολή δυσκολίας εύρεσης πελάτη"
 };
 if(fixed[key])return fixed[key];
 const parts=key.split(".");
 const root:Record<string,string>={
  business_financial_trends_12m:"Οικονομική πορεία",
  economic_viability_pressures:"Πίεση βιωσιμότητας",
  sales_channels:"Κανάλι πωλήσεων",
  digital_sales_share:"Μερίδιο online πωλήσεων",
  digital_capabilities:"Ψηφιακή δυνατότητα",
  catalog_update_frequency:"Ενημέρωση καταλόγου",
  first_online_sale_barriers:"Εμπόδιο εισόδου online",
  customer_acquisition_sources:"Πηγή νέων πελατών",
  local_customer_share:"Τοπική πελατεία",
  online_presence_local_store_impact:"Επίδραση online παρουσίας",
  online_presence_expected_local_impact:"Προσδοκώμενη επίδραση online",
  operational_friction:"Λειτουργική δυσκολία",
  top_growth_barriers:"Εμπόδιο ανάπτυξης",
  sales_outlook:"Προσδοκία πωλήσεων",
  business_optimism_12m:"Επιχειρηματική αισιοδοξία",
  investment_intentions:"Επενδυτική πρόθεση",
  investment_capacity_confidence_12m:"Χρηματοδοτική δυνατότητα"
 };
 const options:Record<string,string>={
  operating_costs:"λειτουργικό κόστος",profitability:"κερδοφορία",turnover:"τζίρος",
  increased:"αύξηση",decreased:"μείωση",purchasing_power:"αγοραστική δύναμη",
  suppliers:"προμηθευτές",energy:"ενέργεια",liquidity:"ρευστότητα",
  own_eshop:"δικό τους e-shop",social:"κοινωνικά δίκτυα",catalog:"ψηφιακός κατάλογος",
  stock_sync:"συγχρονισμός αποθέματος",setup_cost:"κόστος εγκατάστασης",
  technical_skills:"τεχνικές γνώσεις",time:"χρόνος",word_of_mouth:"συστάσεις",
  google:"Google",footfall:"φυσική κίνηση",stock:"απόθεμα",
  admin:"διοίκηση",acquisition:"απόκτηση πελατών",logistics:"μεταφορές",
  tech:"τεχνολογία",up_small:"μικρή αύξηση",down_small:"μικρή μείωση",
  pessimistic:"απαισιοδοξία",eshop:"ηλεκτρονικό κατάστημα",erp:"ERP",
  ads:"διαφήμιση",none:"καμία",unlikely:"μάλλον απίθανο",very_unlikely:"πολύ απίθανο",
  likely:"πιθανό",increased_lot:"μεγάλη αύξηση",increased_some:"κάποια αύξηση",
  yes_lot:"ναι, πολύ",realtime:"άμεσα",yes:"ναι"
 };
 return [root[parts[0]]??parts[0],...parts.slice(1).filter(x=>x!=="share"&&x!=="mean").map(x=>options[x]??x.replaceAll("_"," "))].join(" · ");
}
