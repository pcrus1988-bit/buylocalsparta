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
  // Dated 2026-10-15 source audit: exact same detailed family across real brands.
  ["κεφιρ",["l",/κεφιρ|kefir/u]],
  ["εβαπορε",["kg",/γαλα|milk|εβαπορε/u]],
  ["σοκολατα κακαο",["kg",/κακαο|cocoa/u]],
  ["χυμος bυσσινο",["l",/βυσσιν|bυσσιν|cherry/u]],
  ["αλλαντικα γαλοπουλας",["kg",/γαλοπουλ|turkey/u]],
  ["λευκο τυρι",["kg",/λευκ.*τυρ|mozzarella|μοτσαρελα/u]],
  ["υγρα πιατων",["l",/υγρ.*πιατων|πιατων.*υγρ|απορρυπαντικ.*πιατων|dishwashing/u]],

  ["ξυδι",["l",/ξιδ|ξυδ|vinegar/u]],
  ["κατεψυγμενες μπαμιες",["kg",/μπαμι|okra/u]],
  ["κοφτο μακαρονι",["kg",/κοφτ.*μακαρον|μακαρον.*κοφτ|short pasta/u]],
  ["kοφτο mακαρονι",["kg",/κοφτ.*μακαρον|μακαρον.*κοφτ|short pasta/u]],
  ["κρουασαν",["kg",/κρουασαν|croissant/u]],
  ["χαλβας",["kg",/χαλβα|halva/u]],
  ["γκουντα",["kg",/γκουντα|gouda/u]],
  ["φετα",["kg",/φετα|feta/u]],
  ["κεφαλοτυρι",["kg",/κεφαλοτυρ|hard cheese/u]],
  ["μπισκοτα",["kg",/μπισκοτ|biscuit|cookie/u]],
  ["βουτηματα",["kg",/κουλουρακ|βουτημα|cookie/u]],
  ["ψωμι τυποποιημενο",["kg",/ψωμι|bread/u]],
  ["αλευρι για ολες τις χρησεις",["kg",/αλευρι.*ολες.*χρησεις|all purpose flour/u]],
  ["στιγμιαιος καφες",["kg",/στιγμιαι.*καφ|καφ.*στιγμιαι|instant.*coffee/u]],
  ["σοκολατα γαλακτος",["kg",/σοκολατ.*γαλακ|milk chocolate/u]],
  ["σοκολατα κακαο",["kg",/κακαο.*σκονη|cocoa powder/u]],
  ["σοκολατουχο γαλα με γευσεις",["l",/σοκολατουχ.*γαλα|γαλα.*σοκολατουχ|chocolate milk/u]],
  ["αγγελαδινο γιαουρτι",["kg",/γιαουρτ.*αγελαδ|αγελαδ.*γιαουρτ|cow.*yogurt/u]],
  ["πουρες",["kg",/πουρ.*πατατ|πατατ.*πουρ|potato puree/u]],
  ["μαυρο πιπερι",["kg",/μαυρ.*πιπερ|πιπερ.*μαυρ|black pepper/u]],
  ["ριγανη",["kg",/ριγαν|oregano/u]],
  ["βρωμη",["kg",/βρωμ|oats/u]],
  ["παξιμαδι",["kg",/παξιμαδ|rusk/u]],
  ["σπαγγετινι",["kg",/σπαγγετιν|spaghettini/u]],
  ["νυφαδες καλαμποκιου",["kg",/νιφαδ.*καλαμποκ|καλαμποκ.*νιφαδ|corn flakes/u]],
  ["φυσικο μεταλλικο νερο",["l",/φυσικ.*μεταλλικ.*νερ|νερ.*φυσικ.*μεταλλικ|natural mineral water/u]],
  ["πατατακια",["kg",/πατατακ|chips?/u]],
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
  ["κρεμα γαλακτος",["l",/κρεμα γαλακτος|cream/u]],
  ["στραγγιστο γιαουρτι",["kg",/στραγγιστ.*γιαουρτ|γιαουρτ.*στραγγιστ|strained yogurt/u]],
  ["φρεσκο γαλα",["l",/φρεσκ.*γαλα|γαλα.*φρεσκ|fresh milk/u]],
  ["βουτυρο",["kg",/βουτυρ|butter/u]],
  ["πολτος ντοματας",["kg",/ντοματοπολτ|τοματοπολτ|ντοματα.*πολτ|tomato paste/u]],
  ["χυμος ντοματας",["kg",/χυμ.*ντοματ|χυμ.*τοματ|tomato juice/u]],
  ["σαλτσα απο αποφλοιωμενες ντοματες",["kg",/ψιλοκομμ.*ντοματ|ψιλοκομμ.*τοματ|diced tomato/u]],
  ["χυμος πορτοκαλι",["l",/χυμ.*πορτοκαλ|orange juice/u]],
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
  ["παγωμενο τσαι",["l",/παγωμενο τσαι|ice tea/u]],
  ["χυμος βυσσινο",["l",/βυσσιν|cherry/u]],
  ["χυμος ροδακινο",["l",/ροδακιν|peach/u]],
  ["γαλα σοκολατουχο",["l",/σοκολατουχ|chocolate milk/u]]
]);
// Other precisely named beverage categories are not automatically whitelisted;
// category metadata alone does not show carbonation/sugar/fruit percentage.
const dangerous=/\b(?:bio|organic|vegan|gluten|lactose|free|zero|light|diet|protein|instant|ready|precooked|mix|special|infant|kids|reduced|fortified)\b|(?:βιολογ|χωρις|γλουτεν|λακτοζ|υποαλλεργ|ετοιμ|μαγειρεμ|βρασμεν|κονσερβ|μιγμα|παιδικ|βρεφ|πρωτεϊν|εμπλουτισμ|μειωμεν|επεξεργασμ|ολικης)/u;

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
  if(!config[1].test(title)||dangerous.test(title))return false;
  const size=referenceQuantity(p),label=titleQuantity(p.name);
  if(!size||!label||size.unit!==config[0]||label.unit!==size.unit||
     size.amount<.02||size.amount>40||Math.abs(size.amount-label.quantity)>1e-6)return false;
  const fam=productFamily(p);
  const bits=fam?.split("|")[1]?.split(" ").filter(Boolean)||[];
  if(bits.length<2 && !["αραβοσιτελαιο","πυρηνελαιο","κετσαπ","μαγιονεζα","ριγανη","κατεψυγμενος αρακας"].includes(category))return false;
  // Dairy requires fat information, otherwise packaging titles alone do not
  // distinguish normal, low fat, lactose-free and fermented variants.
  const listedFatPercent=/\b\d+(?:[.,]\d+)?\s*%/u.test(title);
  const explicitMilkType=category==="φρεσκο γαλα" && /(?:^|\s)(?:πληρες|ελαφρυ)(?=\s|$)/u.test(title);
  if(["φρεσκο γαλα","στραγγιστο γιαουρτι","αγγελαδινο γιαουρτι","κρεμα γαλακτος"].includes(category) &&
    !listedFatPercent&&!explicitMilkType)return false;
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
