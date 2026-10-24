import { PUBLIC_RESULTS_METRICS, publicMetricLabel } from "./research-public-results-sections.ts";

/**
 * Editorial mapping from real instrument questions to APPROVED public metrics.
 * This is NOT a query for arbitrary raw answers. Some items are composite
 * indices (separately identified) or conditional questions. Private EXP01 is
 * intentionally excluded at the registry and data adapter boundaries.
 */
export type MapQuestionDefinition = Readonly<{
  id: string;
  label: string;
  fullLabel: string;
  note: string;
  metricKeys: readonly string[];
}>;
const available=new Set(PUBLIC_RESULTS_METRICS);
const def=(id:string,label:string,fullLabel:string,note:string,keys:readonly string[]):MapQuestionDefinition=>({
 id,label,fullLabel,note,metricKeys:keys.filter(k=>available.has(k))
});
export const PUBLIC_MAP_QUESTIONS: readonly MapQuestionDefinition[]=[
 def("Q03","Κανάλια πωλήσεων","Q03 · Από ποια κανάλια πραγματοποιείτε πωλήσεις;",
  "Πολλαπλές επιλογές: τα ποσοστά των απαντήσεων δεν απαιτείται να αθροίζουν σε 100%.",[
  "sales_channels.share.own_eshop","sales_channels.share.social"]),
 def("Q04","Μερίδιο ηλεκτρονικών πωλήσεων","Q04 · Τι μέρος των λιανικών πωλήσεων πραγματοποιείται online?",
  "Τα ποσοστά αφορούν κατηγορίες μεριδίου online πωλήσεων.",[
  "digital_sales_share.share.0","digital_sales_share.share.26_50"]),
 def("Q05","Ψηφιακές δυνατότητες","Q05 · Ποιες ψηφιακές δυνατότητες διαθέτει η επιχείρηση;",
  "Αναλύονται ξεχωριστές επιλεγμένες δυνατότητες. Ο συνολικός σύνθετος δείκτης εμφανίζεται στην κατηγορία Δείκτες.",[
  "digital_capabilities.catalog.share.yes","digital_capabilities.stock_sync.share.yes"]),
 def("Q06","Ενημέρωση καταλόγου","Q06 · Πόσο συχνά ενημερώνεται ο κατάλογος προϊόντων;",
  "Συχνότητα όπως δηλώνεται από τις επιχειρήσεις.",["catalog_update_frequency.share.realtime"]),
 def("Q07","Λειτουργικές δυσκολίες","Q07 · Σε ποιους τομείς αντιμετωπίζετε λειτουργικές δυσκολίες;",
  "Οι βαθμολογίες δυσκολίας δεν είναι ποσοστά απαντήσεων.",[
  "operational_friction.stock.mean","operational_friction.admin.mean","operational_friction.acquisition.mean"]),
 def("Q08","Εμπόδια ανάπτυξης","Q08 · Ποια είναι τα κυριότερα εμπόδια ανάπτυξης;",
  "Έως τρεις επιλογές ανά συμμετέχοντα: τα ποσοστά δεν αθροίζουν υποχρεωτικά σε 100%.",[
  "top_growth_barriers.share.acquisition","top_growth_barriers.share.logistics",
  "top_growth_barriers.share.admin","top_growth_barriers.share.tech"]),
 def("Q09","Απόκτηση νέων πελατών","Q09 · Από πού προέρχονται οι νέοι πελάτες;",
  "Πολλαπλές δηλωμένες πηγές· η κάθε απάντηση χρωματίζει τον χάρτη με διαφορετικές περιφερειακές τιμές.",[
  "customer_acquisition_sources.share.word_of_mouth",
  "customer_acquisition_sources.share.google","customer_acquisition_sources.share.footfall"]),
 def("Q10","Δυσκολία εύρεσης πελατών","Q10 · Πόσο έχει αλλάξει η δυσκολία απόκτησης πελάτη;",
  "Βαθμολογία σε κλίμακα 0–10, όχι ποσοστό.",["acquisition_difficulty_change.mean"]),
 def("Q11","Τοπική πελατεία","Q11 · Τι ποσοστό των πελατών είναι τοπικοί;",
  "Ποσοστά επιχειρήσεων ανά κατηγορία τοπικής πελατείας.",[
  "local_customer_share.share.76_100","local_customer_share.share.51_75"]),
 def("Q12","Τοπική online ανακάλυψη","Q12 · Πόσο σημαντική είναι η διαδικτυακή εύρεση τοπικών προϊόντων;",
  "Μέση βαθμολογία 1–5, όχι ποσοστό.",["local_product_discovery_importance.mean"]),
 def("Q16","Επενδύσεις επόμενου 12μήνου","Q16 · Πού σχεδιάζετε να επενδύσετε το επόμενο 12μηνο;",
  "Πολλαπλές επενδυτικές προθέσεις, όχι πραγματοποιημένες επενδύσεις.",[
  "investment_intentions.share.eshop","investment_intentions.share.erp",
  "investment_intentions.share.ads","investment_intentions.share.none"]),
 def("Q17","Προσδοκίες πωλήσεων","Q17 · Πώς εκτιμάτε ότι θα εξελιχθούν οι πωλήσεις;",
  "Οι προσδοκίες δεν συνιστούν προβλέψεις πραγματικών πωλήσεων.",[
  "sales_outlook.share.up_small","sales_outlook.share.down_small"]),
 def("Q19","Επιχειρηματική αισιοδοξία","Q19 · Πώς βλέπετε το επόμενο 12μηνο;",
  "Αυτοαναφερόμενη αισιοδοξία.",["business_optimism_12m.share.pessimistic"]),
 def("Q20","Χρηματοδότηση επενδύσεων","Q20 · Πόσο εφικτή θεωρείτε τη χρηματοδότηση επένδυσης;",
  "Αντιλαμβανόμενη δυνατότητα χρηματοδότησης, όχι τραπεζική αξιολόγηση.",[
  "investment_capacity_confidence_12m.share.unlikely",
  "investment_capacity_confidence_12m.share.very_unlikely",
  "investment_capacity_confidence_12m.share.likely"]),
 def("Q21","Μεταβολή τζίρου, κόστους, κερδών","Q21 · Πώς μεταβλήθηκαν τα βασικά οικονομικά μεγέθη;",
  "Τρεις διαφορετικές μεταβλητές. Η επιλογή αλλάζει ξεχωριστά τη χρωματική απεικόνιση.",[
  "business_financial_trends_12m.turnover.share.decreased",
  "business_financial_trends_12m.operating_costs.share.increased",
  "business_financial_trends_12m.profitability.share.decreased"]),
 def("Q24","Εμπόδια online εισόδου","Q24 · Τι εμποδίζει την έναρξη online πωλήσεων;",
  "Η ερώτηση αφορά μόνο όσους πληρούν τη σχετική συνθήκη εισόδου.",[
  "first_online_sale_barriers.share.setup_cost","first_online_sale_barriers.share.technical_skills",
  "first_online_sale_barriers.share.time"]),
 def("Q25","Επίδραση online στο κατάστημα","Q25 · Πώς επηρεάζει η online παρουσία το φυσικό κατάστημα;",
  "Αυτοαναφερόμενη εμπειρία, όχι μετρημένη αύξηση πελατείας.",[
  "online_presence_local_store_impact.share.increased_lot",
  "online_presence_local_store_impact.share.increased_some"]),
 def("Q26","Αναμενόμενη online επίδραση","Q26 · Τι περιμένουν όσοι δεν διαθέτουν online παρουσία;",
  "Ερώτηση υπό συνθήκη, δεν ισοδυναμεί με πραγματική εμπειρία.",[
  "online_presence_expected_local_impact.share.yes_lot"]),
 def("Q27","Πιέσεις οικονομικής βιωσιμότητας","Q27 · Ποιες πιέσεις απειλούν περισσότερο τη βιωσιμότητα;",
  "Έως τρεις επιλογές ανά επιχείρηση· διαφορετικές αποκρίσεις μπορεί να συνυπάρχουν.",[
  "economic_viability_pressures.share.purchasing_power",
  "economic_viability_pressures.share.suppliers",
  "economic_viability_pressures.share.energy",
  "economic_viability_pressures.share.liquidity"]),
 def("indices","Σύνθετοι δείκτες","Δείκτες · Συνολικές βαθμολογίες της έρευνας",
  "Σύνθετες βαθμολογίες βάσει του δημοσιευμένου μεθοδολογικού πρωτοκόλλου.",[
  "digital_readiness.mean","retail_friction.mean","retail_confidence.mean"]),
] as const;
export const mapAnswers=(question:MapQuestionDefinition)=>question.metricKeys.map(key=>({
 key,label:publicMetricLabel(key)
}));
export function safeMapSelection(questionId:string,answerKey:string){
 const question=PUBLIC_MAP_QUESTIONS.find(q=>q.id===questionId)??PUBLIC_MAP_QUESTIONS.find(q=>q.id==="Q09")!;
 const answer=question.metricKeys.includes(answerKey)?answerKey:question.metricKeys[0]??"";
 return {question,answer};
}
export function mapLegendDomain(metricKey:string,format:"mean"|"proportion",values:readonly number[]){
 if(format==="proportion")return {minimum:0,maximum:1,unit:"%"};
 if(["digital_readiness.mean","retail_friction.mean","retail_confidence.mean"].includes(metricKey))
  return {minimum:0,maximum:100,unit:"/100"};
 if(metricKey==="acquisition_difficulty_change.mean")return {minimum:0,maximum:10,unit:"/10"};
 if(metricKey==="local_product_discovery_importance.mean"||metricKey.startsWith("operational_friction."))
  return {minimum:1,maximum:5,unit:"/5"};
 const observed=values.filter(Number.isFinite);
 return {minimum:0,maximum:Math.max(1,...observed),unit:""};
}
export function mapColorStrength(value:number,domain:{minimum:number;maximum:number}){
 return Math.max(0,Math.min(1,(value-domain.minimum)/Math.max(.00001,domain.maximum-domain.minimum)));
}
