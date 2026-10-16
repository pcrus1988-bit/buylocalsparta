/** Broad discovery categories. Each source category remains searchable; these are browsing facets. */
const norm=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("el-GR");
const RULES:[string,RegExp][]=[
 ["Γαλακτοκομικά & αυγά",/γαλα|τυρ|γιαουρ|φετα|βουτυρ|κρεμα γαλακτος|αυγ/],
 ["Ψωμί & αρτοποιείο",/ψωμ|φρυγαν|αρτο|τοστ|παξιμαδ|κουλουρ|κρουασαν/],
 ["Ζυμαρικά, ρύζι & όσπρια",/ζυμαρ|μακαρον|σπαγγετ|ρυζ|οσπρι|φακ|φασολ|ρεβιθ|κριθαρακ|πενν/],
 ["Λάδια, σάλτσες & κονσέρβες",/ελαιολ|λαδι|σαλτσ|ντοματ|τοματο|κονσερβ|ξυδ|μουσταρ|μαγιονεζ|πελτε/],
 ["Κρέας, ψάρι & αλλαντικά",/κρεα|κοτοπουλ|χοιριν|μοσχαρ|ψαρ|αλλαντικ|ζαμπον|γαλοπουλ|λουκανικ/],
 ["Καφές & ροφήματα",/καφ|τσα[ιγ]|ροφημα|κακαο/],
 ["Νερά, αναψυκτικά & χυμοί",/νερο|αναψυκ|χυμ|πορτοκαλαδ|λεμοναδ|κολα|σοδα/],
 ["Γλυκά & σνακ",/μπισκοτ|σοκολατ|γλυκ|παγωτ|σνακ|πατατακ|τσιπ|μπαρ|γκοφρετ/],
 ["Φρούτα & λαχανικά",/φρουτ|λαχαν|σαλατ|μηλ|μπανα|φραουλ|πατατ|αγγουρ/],
 ["Κατεψυγμένα",/κατεψυγ|κατεψ/],
 ["Βρεφικά & παιδικά",/βρεφ|παιδικ|μπεμπ|παν[εα]ς/],
 ["Καθαριστικά & σπίτι",/καθαρισ|απορρυπαν|μαλακτικ|χαρτ|σακουλ|σφουγγαρ|οικιακ/],
 ["Προσωπική φροντίδα",/σαμπουαν|οδοντ|στοματ|αφρολουτρ|αποσμητ|σαπουν|περιποι|σερβιετ/]
];
export const BROAD_CATEGORIES=[...RULES.map(([s])=>s),"Άλλα προϊόντα"];
export function broadCategory(label:string|null|undefined):string{
 const s=norm(label||"");
 if(/σοκολατ|γκοφρετ|μπισκοτ|καραμελ/.test(s))return "Γλυκά & σνακ";
 return RULES.find(([,re])=>re.test(s))?.[0]||"Άλλα προϊόντα";
}
export type ComparableProduct={source_product_id:string;name:string;brand:string|null;category:string|null;unit:string|null;unit_quantity:number|null};
export function baseQuantity(p:ComparableProduct):{unit:"kg"|"l"|"piece";amount:number}|null{
 const u=(p.unit||"").toLowerCase(),n=p.unit_quantity;
 if(typeof n!=="number"||!Number.isFinite(n)||n<=0)return null;
 if(u==="kg"||u==="l")return {unit:u,amount:n};
 if(u==="g"||u==="gr")return {unit:"kg",amount:n/1000};
 if(u==="ml")return {unit:"l",amount:n/1000};
 if(u==="piece"||u==="pcs")return {unit:"piece",amount:n};
 return null;
}
// Suggest only strongly matched product types; never claim all same-category goods are interchangeable.
function signature(p:ComparableProduct):string|null{
 const s=norm(p.name);
 if(/βιολογ|χωρις λακτοζ|χωρις γλουτεν|χωρις ζαχαρ|πρωτειν|vegan|βρεφ|κατσικ|προβει/.test(s))return null;
 if(/ντοματ|τοματο|tomat/.test(s)){
   if(/ψιλοκομμ|κονκασε|κονκασ/.test(s))return "diced-tomato";
   if(/πελτε/.test(s))return "tomato-paste";
   if(/passata|πασατα|χυμο/.test(s))return "tomato-passata";
 }
 if(/εξαιρετικ.*παρθεν|extra virgin/.test(s)&&/ελαιολαδ/.test(s))return "extra-virgin-olive-oil";
 if(/σπαγγετ|spaghetti/.test(s)){const m=s.match(/(?:no|n\.|ν)\s*(\d+)/);return "spaghetti-"+(m?.[1]||"standard");}
 if(/κριθαρακ/.test(s))return "orzo";
 if(/ζαχαρ/.test(s)&&/λευκ|κρυσταλλ/.test(s))return "white-sugar";
 if(/γαλα/.test(s)&&/φρεσκ|παστεριωσ/.test(s)){const m=s.match(/1[.,][57]|3[.,][56]/);return m?"milk-"+m[0].replace(",","."):null;}
 return null;
}
export function equivalentType(a:ComparableProduct,b:ComparableProduct):boolean{
 const aa=baseQuantity(a),bb=baseQuantity(b),sa=signature(a);
 return !!(sa&&sa===signature(b)&&aa&&bb&&aa.unit===bb.unit&&a.category===b.category&&norm(a.brand||"")!==norm(b.brand||""));
}
