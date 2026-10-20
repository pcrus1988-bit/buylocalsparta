/**
 * Automatic approval of clearly labelled *product types* across brands.
 * Nothing here asserts identity of ingredients, manufacturing methods, nutrition,
 * allergens, or local availability. Other unverified families remain searchable.
 * Only exact detailed category + deterministic full product-family signature +
 * explicit package-label quantity + positive-listed category are acceptable.
 */
import {createHash} from "node:crypto";
import {createBrandIndex,productFamily,referenceQuantity} from "./brand-alternatives.mjs";
const norm=x=>String(x||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toLocaleLowerCase("el-GR").replace(/[’‘´΄']/g,"").replace(/\s+/g," ").trim();
const clean=x=>norm(x).replace(/[^\p{L}\p{N}]+/gu," ").trim();
const idValid=id=>typeof id==="string"&&/^[a-zA-Z0-9_-]{1,100}$/.test(id);

// Expected type word/predicate and unit: source category itself must be
// precise; generic "foods", infant, alcohol, supplements, care and medicine
// categories are deliberately absent.
const specs=new Map([
  // 2026-10-19, source-reviewed conventional pantry types. These are
  // positive category + subtype gates, not category-wide equivalence.
  // The complete title signature, distinct brands, corroborated physical
  // package labels and claim veto remain binding for each exact-source SKU.
  ["ρυζι μπασματι",["kg",/(?=.*ρυζι)(?=.*basmati)/u]],
  ["ρυζι καρολινα",["kg",/(?=.*ρυζι)(?=.*καρολιν)/u]],
  ["ρυζι γλασε",["kg",/(?=.*ρυζι)(?=.*γλασ)/u]],
  ["πεννες ριγε",["kg",/(?=.*πεν)(?=.*ριγε)/u]],
  ["φασολια",["kg",/(?=.*φασολια)(?=.*(?:μετρια|μαυροματικα))/u]],
  ["σαλτσα ντοματας",["kg",/(?:(?=.*ντοματ)(?=.*τριμμεν)|(?=.*τοματ)(?=.*τριφτ))/u]],

  // Explicitly described 2026-10-17/18 ordinary grocery and personal-care
  // variants: NEVER approve a generic parent category by itself.
  ["αφροι και τζελ",["l",/(?=.*αφρ)(?=.*ξυρισματ)(?=.*(?:^|[^\p{L}])men(?=$|[^\p{L}]))(?=.*sensitive)/u]],
  ["αφρολουτρα",["l",/(?=.*αφρολουτρ)(?=.*white\s+musk)/u]],
  // Narrow, source-described ordinary family types from the dated Oct 17
  // unreviewed queue. Variants, veterinary diets and claim-bearing goods do
  // not inherit eligibility from their broader source categories.
  ["υγρη τροφη για γατες",["kg",/(?:(?=.*κονσερβα)(?=.*γατ)(?=.*κοτοπουλ)(?=.*γαλοπουλ)|(?=.*γατ)(?=.*κοτοπουλ)(?=.*πατε)(?=.*(?:υγρη.*τροφη|τροφη.*υγρη)))/u]],
  ["υγρη τροφη για σκυλους",["kg",/(?=.*κονσερβα)(?=.*σκυλ)(?=.*κοτοπουλ)(?=.*γαλοπουλ)/u]],
  ["πιτες και πιτακια",["kg",/λουκανικοπιτακ.*σφολιατ/u]],

  // Narrow additional 2026-10-17 types: exact names, brands, units and packs.
  ["κατεψυγμενο μπροκολο",["kg",/μπροκολ|broccoli/u]],
  ["πλιγουρι",["kg",/πλιγουρ|bulgur/u]],
  ["κατεψυγμενα μανιταρια",["kg",/(?=.*μανιταρ)(?=.*φετ)|sliced.*mushroom/u]],
  ["γκοφρετες με σοκολατα γαλακτος",["kg",/(?=.*γκοφρετ)(?=.*σοκολατ)(?=.*γαλακ)/u]],
  ["γκρανολα",["kg",/(?=.*granola)(?=.*μαυρ)(?=.*σοκολατ)/u]],
  ["καραμελες",["kg",/καραμελ.*γαλακ/u]],
  ["γραβιερα",["kg",/(?=.*γραβιερ)(?=.*κρητ)(?=.*π\.?ο\.?π)/u]],

  // 2026-10-17 full-source review: narrow named variants; avoid broad
  // vegetable, spread, alcohol, health and infant product categories.
  ["γατα",["kg",/(?=.*αμμ)(?=.*υγιειν)(?=.*γατ)(?=.*λεβαντ)/u]],
  ["γαλα υψηλης παστεριωσης",["l",/(?=.*γαλα)(?=.*μακρας.*διαρκειας)(?=.*πληρες)/u]],
  ["γκαζοζα",["l",/γκαζοζ/u]],

  // 2026-10-16 source snapshot: specific two-brand ordinary product kinds.
  // Product family identity, named category, corroborated complete package
  // quantity, separately known brands and claim vetoes still apply.
  ["μπισκοτα digestive",["kg",/digestive.*μπισκοτ|μπισκοτ.*digestive/u]],
  ["μακαρονια αστερακια",["kg",/αστρακι|αστερακι/u]],
  ["κατεψυγμενο καλαμποκι",["kg",/καλαμποκ.*κατεψυγμεν|κατεψυγμεν.*καλαμποκ/u]],
  ["φιδες",["kg",/φιδε.*ψιλ|ψιλ.*φιδε/u]],
  ["μπισκοτα γεμιστα διαφορες γευσεις",["kg",/μπισκοτ.*γεμιστ.*κακαο/u]],
  ["αλευρι για τσουρεκι",["kg",/αλευρ.*τσουρεκ/u]],
  ["κορν φλαουερ",["kg",/κορν.*φλαουρ|corn.*flour/u]],
  ["κατεψυγμενα φασολια",["kg",/φασολ.*χαντρ|χαντρ.*φασολ/u]],
  ["γλυκισματα ψυγειου",["kg",/προφιτερολ|profiterole/u]],
  ["ενταμ",["kg",/edam.*φετ|ενταμ.*φετ/u]],
  ["ανθρακουχο νερο",["l",/ανθρακουχ.*νερ|sparkling.*water/u]],
  ["νατσος",["kg",/tortilla.*(?:sweet.*chili|chili.*sweet)/u]],
  ["αλλα αναψυκτικα",["l",/mixer.*pink.*grapefruit/u]],
  ["καφες καπουτσινο",["kg",/στιγμιαι.*ροφημα.*cappuccino/u]],

  // Narrow ordinary goods, audited against the 2026-10-16 retail archive.
  // Generic parent categories still need an explicit source subtype.
  ["μαυρη σοκολατα",["kg",/(?:σοκολατ.*μαυρ|μαυρ.*σοκολατ|dark.*chocolate)/u]],
  ["τσαι",["kg",/(?:τσαι.*βουν|βουν.*τσαι|mountain.*tea)/u]],
  ["τυρια",["kg",/(?:τυρ.*ημισκληρ|ημισκληρ.*τυρ|σκληρ.*τυρ.*τριμμ|τριμμ.*σκληρ.*τυρ)/u]],
  ["φακες",["kg",/(?:φακ|φακ\p{L}*.*ψιλ|lentil)/u]],
  ["λιγκουινι",["kg",/(?:λιγκουιν|linguine)/u]],

  // Additional individually inspected ordinary SKUs from the 2026-10-16
  // archived full-catalogue candidate queue.
  ["κατεψυγμενες αγκιναρες",["kg",/αγκιναρ|artichoke/u]],
  ["κατεψυγμενο μιξ λαχανικων",["kg",/αναμικτ.*λαχανικ|λαχανικ.*αναμικτ|mixed vegetable/u]],
  ["νισεστες",["kg",/νισεστε|cornstarch/u]],
  ["ρυζογαλο",["kg",/ρυζογαλο|rice pudding/u]],
  ["παπρικα",["kg",/παπρικ|paprika/u]],
  ["ριγκατονι",["kg",/ριγκατονι|rigatoni/u]],
  ["λαζανια",["kg",/λαζανακι|lasagne/u]],
  ["στριφτο",["kg",/τριβελακι|fusilli/u]],
  ["χυμος μηλου",["l",/χυμ.*μηλ|apple juice/u]],
  ["χυμος εσπεριδοειδων",["l",/φρουτοποτ.*λεμον|λεμον.*φρουτοποτ/u]],
  ["σοδα",["l",/σοδα|soda/u]],
  ["καφες φιλτρου",["kg",/καφ.*φιλτρ|φιλτρ.*καφ|filter coffee/u]],
  ["εσπρεσσο",["kg",/καφ.*espresso|espresso.*καφ|espresso/u]],
  ["ρεγκατο",["kg",/regato|ρεγκατο/u]],
  ["ποπ κορν",["kg",/ποπ.*κορν|popcorn/u]],

  // Additional categories with unambiguous source-described product kinds;
  // full normalized title family, distinct brands and labelled whole-pack
  // quantity continue to gate every individual approved comparison.
  ["επιδορπιο κρεμας",["kg",/κρεμα.*(?:βανιλ|καραμελ|σοκολατ)|καραμελ.*κρεμα/u]],
  ["γευματα",["kg",/σπανακορυζ|αρακας.*λαδερ|λαδερ.*αρακ/u]],
  ["θαλασσινα και ψαρια",["kg",/(?=.*pollock)(?=.*(?:φιλετ|fillet))/u]],
  ["πατατες",["kg",/κατεψυγμεν.*πατατ|πατατ.*κατεψυγμεν/u]],
  ["μαργαρινη",["kg",/μαργαριν.*classic|classic.*μαργαριν|μαργαριν.*κλασικ|κλασικ.*μαργαριν/u]],
  ["πουλερικα",["kg",/κοτοπουλ.*μπουτ.*φιλετ|φιλετ.*μπουτ.*κοτοπουλ/u]],
  ["παιδικα δημητριακα",["kg",/choco\s*balls|honey\s*rings/u]],

  // Additional source-described types from the same reviewed 10,323-SKU audit.
  // Broad source categories below are bounded to explicit product-title kinds.
  ["παριζα παριζακι",["kg",/παριζα|παριζακι/u]],
  ["μαρμελαδες μελι αλειμμα",["kg",/φυστικοβουτυρ|peanut.*butter/u]],
  ["κονσερβες τονος θαλασσινα",["kg",/σαρδελ|τονο|tuna|sardine/u]],
  ["τορτελινια",["kg",/τορτελιν|tortellini/u]],
  ["κολα",["l",/(?:^|[^\p{L}])cola(?=$|[^\p{L}])|κολα/u]],
  ["ανθοτυρο",["kg",/ανθοτυρ/u]],

  // Source-described ordinary product types inspected in the full 2026-10-15
  // remaining-family audit. Exact category, normalized subtype and pack unit
  // still all have to agree; whitelist membership alone does NOT approve.
  ["προβειο γιαουρτι",["kg",/γιαουρτ.*προβει|προβει.*γιαουρτ/u]],
  ["κατσικισιο γιαουρτι",["kg",/γιαουρτ.*κατσικ|κατσικ.*γιαουρτ/u]],
  ["αριανι",["l",/αριανι/u]],
  ["κατεψυγμενο σπανακι",["kg",/σπανακ|spinach/u]],
  ["σιμιγδαλι",["kg",/σιμιγδαλ|semolina/u]],
  ["ζιτι",["kg",/μακαρον.*τρυπητ|παστιτσιο|ζιτι|ziti/u]],
  ["κουβερτουρα αρτοποιιας",["kg",/κουβερτουρ|couverture/u]],
  ["πτι μπερ",["kg",/πτι.*μπερ|petit.*beurre/u]],
  ["κοραλλια",["kg",/κοραλλ|coralli/u]],
  ["σκορδο σε σκονη",["kg",/σκορδ|garlic/u]],
  ["ρεβυθια",["kg",/ρεβιθ|ρεβυθ|chickpea/u]],
  ["μοτσαρελα",["kg",/μοτσαρελ|mozzarella/u]],
  ["αλλα ζυμαρικα",["kg",/σελινο|ρυζακι/u]],
  ["προιοντα πλυντηριου πιατων",["kg",/αλατ.*πλυντηρι|πλυντηρι.*αλατ/u]],
  ["καθαρισμος τζαμιων",["l",/υγρ.*τζαμι|τζαμι.*υγρ|glass.*clean/u]],
  ["σπαγγετι",["kg",/σπαγγετ|spaghetti/u]],

  // Dated 2026-10-15 source audit: exact same detailed family across real brands.
  ["κεφιρ",["l",/κεφιρ|kefir/u]],
  ["εβαπορε",["kg",/γαλα|milk|εβαπορε/u]],
  ["σοκολατα κακαο",["kg",/κακαο|cocoa/u]],
  ["χυμος bυσσινο",["l",/βυσσιν|bυσσιν|cherry/u]],
  ["αλλαντικα γαλοπουλας",["kg",/γαλοπουλ|turkey/u]],
  ["λευκο τυρι",["kg",/λευκ.*τυρ|mozzarella|μοτσαρελα|αιγοπροβει|κατσικισι/u]],
  ["υγρα πιατων",["l",/υγρ.*πιατων|πιατων.*υγρ|απορρυπαντικ.*πιατων|dishwashing/u]],

  ["ξυδι",["l",/ξιδ|ξυδ|vinegar/u]],
  ["κατεψυγμενες μπαμιες",["kg",/μπαμι|okra/u]],
  ["κοφτο μακαρονι",["kg",/κοφτ.*μακαρον|μακαρον.*κοφτ|short pasta|(?:^|[^\p{L}])κοφτο(?=$|[^\p{L}])/u]],
  ["kοφτο mακαρονι",["kg",/κοφτ.*μακαρον|μακαρον.*κοφτ|short pasta|(?:^|[^\p{L}])κοφτο(?=$|[^\p{L}])/u]],
  ["κρουασαν",["kg",/κρουασαν|croissant/u]],
  ["χαλβας",["kg",/χαλβα|halva/u]],
  ["γκουντα",["kg",/γκουντα|gouda/u]],
  ["φετα",["kg",/φετα|feta/u]],
  ["κεφαλοτυρι",["kg",/κεφαλοτυρ|hard cheese/u]],
  ["μπισκοτα",["kg",/μπισκοτ|biscuit|cookie/u]],
  ["βουτηματα",["kg",/κουλουρακ|μουστοκουλουρ|βουτημα|cookie/u]],
  ["ψωμι τυποποιημενο",["kg",/ψωμι|bread/u]],
  ["αλευρι για ολες τις χρησεις",["kg",/αλευρι.*ολες.*χρησεις|all purpose flour/u]],
  ["στιγμιαιος καφες",["kg",/στιγμιαι.*καφ|καφ.*στιγμιαι|instant.*coffee/u]],
  ["σοκολατα γαλακτος",["kg",/σοκολατ.*γαλακ|γαλακ.*σοκολατ|milk chocolate/u]],
  ["σοκολατα κακαο",["kg",/κακαο.*σκονη|σκονη.*κακαο|cocoa powder|ροφημα.*σοκολατ/u]],
  ["σοκολατουχο γαλα με γευσεις",["l",/σοκολατουχ.*γαλα|γαλα.*σοκολατουχ|γαλα.*κακαο|chocolate milk/u]],
  ["αγγελαδινο γιαουρτι",["kg",/γιαουρτ.*αγελαδ|αγελαδ.*γιαουρτ|cow.*yogurt/u]],
  ["πουρες",["kg",/πουρ.*πατατ|πατατ.*πουρ|potato puree/u]],
  ["μαυρο πιπερι",["kg",/μαυρ.*πιπερ|πιπερ.*μαυρ|black pepper/u]],
  ["ριγανη",["kg",/ριγαν|oregano/u]],
  ["βρωμη",["kg",/βρωμ|oats/u]],
  ["παξιμαδι",["kg",/παξιμαδ|rusk/u]],
  ["σπαγγετινι",["kg",/σπαγγετιν|spaghettini/u]],
  ["νυφαδες καλαμποκιου",["kg",/νιφαδ.*καλαμποκ|καλαμποκ.*νιφαδ|corn flakes/u]],
  ["φυσικο μεταλλικο νερο",["l",/φυσικ.*μεταλλικ.*νερ|νερ.*φυσικ.*μεταλλικ|natural mineral water/u]],
  ["πατατακια",["kg",/πατατακ|τσιπς|chips?/u]],
  ["μουσταρδα",["kg",/μουσταρδ|mustard/u]],
  ["μαρμελαδα",["kg",/μαρμελαδ|jam/u]],
  ["ελληνικος καφες",["kg",/ελληνικ.*καφ|καφ.*ελληνικ|greek coffee/u]],
  ["αλατι",["kg",/αλατ|salt/u]],
  ["αραβοσιτελαιο",["l",/αραβοσιτελαιο|corn oil/u]],
  ["πυρηνελαιο",["l",/πυρηνελαιο|olive pomace/u]],
  ["κριστινια",["kg",/κριτσιν|breadstick/u]],
  ["κριτσινια",["kg",/κριτσιν|breadstick/u]],
  ["κετσαπ",["kg",/κετσαπ|ketchup/u]],
  ["μαγιονεζα",["l",/μαγιονεζ|mayonnaise/u]],
  ["μελι",["kg",/μελι|honey/u]],
  ["ταχινι",["kg",/ταχιν|tahini/u]],
  ["πραλινα φουντουκιου",["kg",/πραλινα|hazelnut/u]],
  ["φρυγανιες",["kg",/φρυγαν|rusk/u]],
  ["φυλλα ζυμης",["kg",/φυλλο|pastry/u]],
  ["φαρινα",["kg",/φαριν|flour/u]],
  ["ζαχαρη αχνη",["kg",/ζαχαρη|αχνη|sugar/u]],
  ["μη επεξεργασμενη ζαχαρη",["kg",/ζαχαρ|sugar/u]],
  ["κρεμα γαλακτος",["l",/κρεμα γαλακτος|cream|φυτικ.*κρεμα.*ζαχαροπλαστικ/u]],
  ["στραγγιστο γιαουρτι",["kg",/στραγγιστ.*γιαουρτ|γιαουρτ.*στραγγιστ|strained yogurt/u]],
  ["φρεσκο γαλα",["l",/φρεσκ.*γαλα|γαλα.*φρεσκ|fresh milk/u]],
  ["βουτυρο",["kg",/βουτυρ|butter/u]],
  ["πολτος ντοματας",["kg",/ντοματοπολτ|τοματοπολτ|ντοματα.*πολτ|tomato paste/u]],
  ["χυμος ντοματας",["kg",/χυμ.*ντοματ|χυμ.*τοματ|tomato juice|(?=.*(?:ντοματ|τοματ))(?=.*passata)/u]],
  ["σαλτσα απο αποφλοιωμενες ντοματες",["kg",/(?=.*ψιλοκομμ)(?=.*(?:ντοματ|τοματ))|diced tomato/u]],
  ["χυμος πορτοκαλι",["l",/χυμ.*πορτοκαλ|νεκταρ.*πορτοκαλ|orange juice/u]],
  ["κατεψυγμενα φασολακια",["kg",/φασολακια|green beans/u]],
  ["κατεψυγμενος αρακας",["kg",/αρακας|peas/u]],
  ["μακρυκοκο ρυζι",["kg",/ρυζι|rice/u]],
  ["προβρασμενο ρυζι",["kg",/ρυζι|rice/u]],
  ["κριθαρακι",["kg",/κριθαρακ|orzo/u]],
  ["εξτρα παρθενο ελαιολαδο",["l",/εξαιρετικ.*παρθεν.*ελαιο|extra virgin olive/u]],
  ["ελαιολαδο",["l",/ελαιολαδ|oliveoil|olive oil/u]],
  ["αναμικτοι χυμοι",["l",/χυμ|νεκταρ|juice|nectar/u]],
  ["πορτοκαλαδες",["l",/πορτοκαλαδ|orangeade/u]],
  ["λεμοναδες",["l",/λεμοναδ|lemonade/u]],
  ["παγωμενο τσαι",["l",/παγωμενο τσαι|κρυο.*τσαι.*λεμον|ice tea/u]],
  ["χυμος βυσσινο",["l",/βυσσιν|cherry/u]],
  ["χυμος ροδακινο",["l",/ροδακιν|peach/u]],
  ["γαλα σοκολατουχο",["l",/σοκολατουχ|chocolate milk/u]]
]);
// Other precisely named beverage categories are not automatically whitelisted;
// category metadata alone does not show carbonation/sugar/fruit percentage.
const dangerous=/\b(?:bio|organic|vegan|gluten|lactose|free|zero|light|diet|protein|instant|ready|precooked|mix|special|infant|kids|reduced|fortified)\b|(?:βιολογ|χωρις|γλουτεν|λακτοζ|υποαλλεργ|ετοιμ|μαγειρεμ|βρασμεν|κονσερβ|μιγμα|παιδικ|βρεφ|πρωτεϊν|εμπλουτισμ|μειωμεν|επεξεργασμ|ολικης)/u;

// Claimed specialty variants remain strict; only a few *explicit, complete*
// source-described strings may be compared within their OWN variant, never
// assumed equivalent to a conventional product or certified allergen-safe.
const safeWholeGrainCategories=new Set([
  "ταχινι","λιγκουινι","κριτσινια","κριστινια","βρωμη","παξιμαδι"
]);
const explicitWholeGrainSubtypes=new Map([
  // Only the exact audited October 17 preparations qualify; the other
  // wholegrain products within these source categories remain unreviewed.
  ["φρυγανιες",/(?=.*φρυγανι)(?=.*χωριατικ)(?=.*ολικης\s+αλεσης)/u],
  ["κριθαρακι",/(?=.*κριθαρακ)(?=.*μετρι)(?=.*ολικης\s+αλεσης)/u],
  ["σπαγγετι",/(?=.*σπαγγετιν)(?=.*νο\s*10)(?=.*ολικης\s+αλεσης)/u],
  ["σπαγγετινι",/(?=.*σπαγγετιν)(?=.*νο\s*10)(?=.*ολικης\s+αλεσης)/u]
]);
const safeLabelledGlutenFreeCategories=new Set(["κετσαπ","μουσταρδα"]);
const safeLabelledNonCarbonatedCategories=new Set(["πορτοκαλαδες"]);
function hasForbiddenClaim(category,title){
  if(!dangerous.test(title))return false;
  let withoutApprovedVariant=title;
  // 'Κονσέρβα' is the explicitly required physical product type for these
  // two ordinary wet-pet-food categories, not by itself a special health or
  // preparation claim. Do not waive any other restricted wording.
  if(["υγρη τροφη για γατες","υγρη τροφη για σκυλους"].includes(category) &&
     /κονσερβ/u.test(title))
    withoutApprovedVariant=withoutApprovedVariant.replace(/κονσερβ[\p{L}]*/gu," ");
  if((safeWholeGrainCategories.has(category)||
      explicitWholeGrainSubtypes.get(category)?.test(title)) &&
     /ολικης\s+αλεσης/u.test(title))
    withoutApprovedVariant=withoutApprovedVariant.replace(/ολικης\s+αλεσης/gu," ");
  if(safeLabelledGlutenFreeCategories.has(category) &&
     /χωρις\s+γλουτενη/u.test(title))
    withoutApprovedVariant=withoutApprovedVariant.replace(/χωρις\s+γλουτενη/gu," ");
  // The published 19 Oct catalogue explicitly identifies ordinary Zero
  // cola with both "Zero" and "Χωρίς ζάχαρη" on the package. This is
  // product-type comparison only, never equal sweetener/caffeine formulation.
  if(category==="κολα" &&
     /(?:^|[^\p{L}])zero(?=$|[^\p{L}])/u.test(title) &&
     /χωρις\s+ζαχαρη/u.test(title))
    withoutApprovedVariant=withoutApprovedVariant
      .replace(/(?:^|[^\p{L}])zero(?=$|[^\p{L}])/gu," ")
      .replace(/χωρις\s+ζαχαρη/gu," ");
  // Same exact declared "with corn, Vegan" breadstick type only; no
  // certification, allergy or ingredients equivalence is inferred.
  if(["κριτσινια","κριστινια"].includes(category) &&
     /κριτσιν.*(?:με\s+)?καλαμποκ/u.test(title) &&
     /(?:^|[^\p{L}])vegan(?=$|[^\p{L}])/u.test(title))
    withoutApprovedVariant=withoutApprovedVariant.replace(/(?:^|[^\p{L}])vegan(?=$|[^\p{L}])/gu," ");
  if(safeLabelledNonCarbonatedCategories.has(category) &&
     /χωρις\s+ανθρακικο/u.test(title))
    withoutApprovedVariant=withoutApprovedVariant.replace(/χωρις\s+ανθρακικο/gu," ");
  // Unexpected extra claims (organic, other allergies, children's lines,
  // protein fortification, sugar reduction, etc.) retain the veto.
  return dangerous.test(withoutApprovedVariant);
}

function titleQuantity(title){
  // Entire-labelled multi-pack price basis: "6x1,5lt" means 9L,
  // "3x250g" means 0.75kg. Never use partial/ambiguous counts.
  const n=norm(title);
  const regex=/(?:^|[^\p{L}\p{N}])(?:(\d{1,3})\s*[x×]\s*)?(\d+(?:[.,]\d+)?)\s*(kg|kgr|κιλα?|g|gr|γρ|γραμμαρια|lt|l|λιτρα?|ml|μλ)(?=$|[^\p{L}])/gu;
  const m=[...n.matchAll(regex)];
  if(m.length!==1)return null;
  const count=m[0][1]?Number(m[0][1]):1;
  const v=Number(m[0][2].replace(",","."));
  const unit=m[0][3],mass=/^(?:kg|kgr|κιλα?|g|gr|γρ|γραμμαρια)$/u.test(unit);
  const canonical=mass?"kg":"l";
  const factor=/^(?:kg|kgr|κιλα?|l|lt|λιτρα?)$/u.test(unit)?1:.001;
  const quantity=count*v*factor;
  if(!Number.isFinite(quantity)||quantity<=0||quantity>40||!Number.isSafeInteger(count)||count>30)return null;
  return {unit:canonical,quantity};
}
function accepted(p){
  if(!idValid(p?.source_product_id))return false;
  const category=clean(p.category);
  const config=specs.get(category);
  if(!config)return false;
  const title=norm(p.name);
  if(!config[1].test(title)||hasForbiddenClaim(category,title))return false;
  // Raw/plain staples do not permit identically worded *processed* variants.
  // Exact cross-brand family matching is necessary, but not sufficient.
  if(["πουλερικα","πατατες"].includes(category)&&
     /πανε|παναρισ|marinat|μαριναρ|seasoned|καρυκευ|μπαχαρ|spiced|προτηγαν|prefried|pre-fried|προψημεν|breaded|battered|wedge|σφην|sticks|τηγανιτ|προετοιμασμεν/u.test(title))return false;
  // Dried beans are not ready meals, canned beans or cooked pulses.
  // Source "Φασόλια" contains multiple preparations; matching the type words
  // alone must never override contradictory processing indicators.
  if(category==="φασολια" &&
     /κατεψυγμεν|μαγειρεμ|προμαγειρεμ|παρασκευασμεν|βρασμεν|κονσερβ|ετοιμ|σε\s+σαλτσ|canned|cooked|ready\s+to/u.test(title))return false;
  // Pet-food descriptions can be precise while naming a veterinary diet or
  // additional meat/formulation. Such titles must never acquire automatic
  // approval merely because their names match between two brands.
  if(["υγρη τροφη για γατες","υγρη τροφη για σκυλους"].includes(category) &&
     /κτηνιατρ|θεραπευτ|κλινικ|διαιτ|υποαλλεργ|στειρωμ|sterili|veterinar|renal|urinary|gastro|prescription|weight management|φαρμακευτ/u.test(title))return false;
  if(category==="υγρη τροφη για γατες" &&
     /μοσχαρ|βοδιν|βοειδ|αρνι|χοιριν|γαλοπουλ|παπι|σολομ|ψαρ|τονο|κουνελ|συκωτ|ζελε|ζελατ|σαλτσ|gravy|jelly|beef|veal|turkey|duck|salmon|tuna|rabbit/u.test(title) &&
     /πατε/u.test(title))return false;
  const size=referenceQuantity(p),label=titleQuantity(p.name);
  if(!size||!label||size.unit!==config[0]||label.unit!==size.unit||
     size.amount<.02||size.amount>40||Math.abs(size.amount-label.quantity)>1e-6)return false;
  const fam=productFamily(p);
  const bits=fam?.split("|")[1]?.split(" ").filter(Boolean)||[];
  if(bits.length<2 && !(category==="βουτηματα" && /μουστοκουλουρ/u.test(title)) && !(category==="γευματα" && bits.length===1 && bits[0]==="σπανακορυζο") && !(["kοφτο mακαρονι","κοφτο μακαρονι"].includes(category) && bits.length===1 && bits[0]==="κοφτο") && !["πλιγουρι","κατεψυγμενο μπροκολο","κεφιρ","γκαζοζα","αραβοσιτελαιο","πυρηνελαιο","κετσαπ","μαγιονεζα","ριγανη","κατεψυγμενος αρακας","αριανι","κοραλλια","αλλα ζυμαρικα","ταχινι","φαρινα","ανθοτυρο","κατεψυγμενες αγκιναρες","νισεστες","ρυζογαλο","ριγκατονι","λαζανια","στριφτο","σοδα","μακαρονια αστερακια","γλυκισματα ψυγειου"].includes(category))return false;
  // Dairy requires fat information, otherwise packaging titles alone do not
  // distinguish normal, low fat, lactose-free and fermented variants.
  const listedFatPercent=/\b\d+(?:[.,]\d+)?\s*%/u.test(title);
  const explicitMilkType=category==="φρεσκο γαλα" && /(?:^|\s)(?:πληρες|ελαφρυ)(?=\s|$)/u.test(title);
  const explicitPlantPastryCream=category==="κρεμα γαλακτος"&&
    /φυτικ.*κρεμα.*ζαχαροπλαστικ/u.test(title);
  if(["φρεσκο γαλα","στραγγιστο γιαουρτι","αγγελαδινο γιαουρτι","κρεμα γαλακτος"].includes(category) &&
    !listedFatPercent&&!explicitMilkType&&!explicitPlantPastryCream)return false;
  return true;
}
export function deriveAutoPackagedTypeGroups(products,previous=[]){
  if(!Array.isArray(products)||!Array.isArray(previous))return [];
  const protectedIds=new Set(previous.flatMap(g=>g?.status==="approved"&&Array.isArray(g.memberIds)?g.memberIds:[]));
  const seen=new Set(),duplicateIds=new Set();
  for(const p of products){
    const id=p?.source_product_id;
    if(seen.has(id))duplicateIds.add(id);
    seen.add(id);
  }
  const generated=[];
  for(const [key,members] of createBrandIndex(products)){
    const eligible=members.filter(p=>!protectedIds.has(p.source_product_id)&&!duplicateIds.has(p.source_product_id)&&accepted(p));
    if(eligible.length<2||eligible.length>100)continue;
    if(members.some(p=>!protectedIds.has(p.source_product_id)&&
       !duplicateIds.has(p.source_product_id)&&!accepted(p)))continue;
    const category=new Set(eligible.map(p=>clean(p.category)));
    const brands=new Set(eligible.map(p=>clean(p.brand)));
    if(category.size!==1||brands.size<2||brands.has(""))continue;
    const unit=referenceQuantity(eligible[0])?.unit;
    if(!unit||eligible.some(p=>referenceQuantity(p)?.unit!==unit))continue;
    generated.push({
      id:"auto-type-"+createHash("sha256").update(key).digest("hex").slice(0,24),
      status:"approved",approvalMethod:"automatic_commodity",
      label:eligible[0].category+" · "+key.split("|")[1].slice(0,44),
      basis:unit,memberIds:eligible.map(p=>p.source_product_id).sort()
    });
  }
  return generated.sort((a,b)=>a.id.localeCompare(b.id));
}
