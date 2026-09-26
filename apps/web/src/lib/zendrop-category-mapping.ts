const FALLBACK_CATEGORY_CODE = "general-products";

export function resolveZendropCategoryCode(
  titleValue: unknown,
  categoriesValue: unknown
): string {
  const title = normalize(text(titleValue));
  const categories = Array.isArray(categoriesValue)
    ? categoriesValue.flatMap((value) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return [];
        const name = text((value as Record<string, unknown>).name);
        return name ? [normalize(name)] : [];
      })
    : [];
  const evidence = `${categories.join(" ")} ${title}`;

  if (has(evidence,["baby toys","activity equipment","baby toy","toddler toy"])) return "baby-toddler-toys";
  if (has(evidence,["construction toy","building blocks"])) return "construction-toys";
  if (has(evidence,["toy car","toy vehicle"])) return "toy-vehicles";
  if (has(evidence,["toy","doll","figure"])) return "other-toys";

  if (has(evidence,["headphone","headset","earphone","earbuds"])) return "headphones-headsets";
  if (has(evidence,["phone case","phone cover"])) return "phone-cases-protection";
  if (has(evidence,["phone holder","phone mount"])) return "phone-mounts-holders";
  if (has(evidence,["power bank"])) return "power-banks";
  if (has(evidence,["smartwatch","smart watch"])) return "wearables-smartwatches";
  if (has(evidence,["smartphone"])) return "smartphones";
  if (has(evidence,["computer accessories","mouse","keyboard"])) return "computer-accessories";

  if (has(evidence,["kitchen","dining","cup","mug","tableware","cookware"])) return "kitchen-dining-homeware";
  if (has(evidence,["decorative object","sculpture","statue","figurine","home decor"])) return "decorative-objects";
  if (has(evidence,["wall decor","wall art"])) return "wall-decor";
  if (has(evidence,["storage","organizer","organiser"])) return "storage-organisation";
  if (has(evidence,["rug","carpet"])) return "rugs-carpets";
  if (has(evidence,["bedding","linen","pillow","duvet"])) return "bedding-linen";

  if (has(evidence,["personal care","beauty","makeup","concealer","cosmetic"])) return "beauty-tools-accessories";
  if (has(evidence,["hair accessory","hair clip","hair band"])) return "hair-accessories";
  if (has(evidence,["nail polish","nail colour","nail color"])) return "nail-care-colour";
  if (has(evidence,["bath","body care"])) return "bath-body-care";

  if (has(evidence,["pet bed","pet carrier"])) return "pet-beds-carriers";
  if (has(evidence,["pet bowl","pet feeder"])) return "pet-feeders-bowls";
  if (has(evidence,["cat collar","cat accessories","cat toy"])) return "cat-accessories";
  if (has(evidence,["dog collar","dog accessories","dog toy"])) return "dog-accessories";
  if (has(evidence,["pet grooming","pet hygiene"])) return "pet-grooming-hygiene";

  if (has(evidence,["handbag","shoulder bag","crossbody","tote bag","clutch"])) return "handbags";
  if (has(evidence,["backpack","school bag"])) return "school-bags-backpacks";
  if (has(evidence,["wallet","cardholder","card holder"])) return "wallets-cardholders";
  if (has(evidence,["luggage","travel bag","duffel"])) return "luggage-travel-bags";
  if (has(evidence,["necklace"])) return "necklaces";
  if (has(evidence,["earring"])) return "earrings";
  if (has(evidence,["belt"])) return "belts";

  const gender = has(evidence,["women","woman","female","ladies"]) ? "women"
    : has(evidence,["men","man","male","mens"]) ? "men"
    : null;
  if (has(evidence,["dress"]) && gender==="women") return "fashion-womens-dresses";
  if (has(evidence,["skirt"]) && gender==="women") return "fashion-womens-skirts";
  if (has(evidence,["jumpsuit"]) && gender==="women") return "fashion-womens-jumpsuits";
  if (has(evidence,["trouser","pants","jeans","jogger","cargo"])) return gender==="women"
    ? "fashion-womens-trousers-jeans"
    : gender==="men" ? "fashion-mens-trousers-jeans" : "fashion-accessories-other";
  if (has(evidence,["shorts"])) return gender==="women"
    ? "fashion-womens-shorts"
    : gender==="men" ? "fashion-mens-shorts" : "fashion-accessories-other";
  if (has(evidence,["shirt","blouse"])) return gender==="women"
    ? "fashion-womens-shirts"
    : gender==="men" ? "fashion-mens-shirts" : "fashion-accessories-other";
  if (has(evidence,["t shirt","tshirt","tee","top","polo"])) return gender==="women"
    ? "fashion-womens-tops"
    : gender==="men" ? "fashion-mens-tshirts-tops" : "fashion-accessories-other";
  if (has(evidence,["jacket","coat","blazer"])) return gender==="women"
    ? "fashion-womens-jackets-coats"
    : gender==="men" ? "fashion-mens-jackets-coats" : "fashion-accessories-other";
  if (has(evidence,["sweater","cardigan","hoodie","knit"])) return gender==="women"
    ? "fashion-womens-knitwear"
    : gender==="men" ? "fashion-mens-knitwear" : "fashion-accessories-other";
  if (has(evidence,["swimwear","bikini","swimsuit"])) return gender==="women"
    ? "fashion-womens-swimwear"
    : gender==="men" ? "fashion-mens-swimwear" : "fashion-accessories-other";
  if (has(evidence,["clothing accessories","fashion accessories"])) return "fashion-accessories-other";

  if (has(evidence,["fitness","gym","workout"])) return "fitness-accessories";
  if (has(evidence,["sports equipment","team sports"])) return "team-sports-equipment";
  if (has(evidence,["garden","outdoor"])) return "garden-outdoor-accessories";
  if (has(evidence,["automotive","car accessories"])) return "automotive-accessories";
  if (has(evidence,["building materials","hardware","tool"])) return "hardware-fasteners";

  return FALLBACK_CATEGORY_CODE;
}

export const ZENDROP_FALLBACK_CATEGORY_CODE = FALLBACK_CATEGORY_CODE;

function has(value:string,needles:readonly string[]):boolean{
  return needles.some((needle)=>value.includes(normalize(needle)));
}
function normalize(value:string):string{
  return value.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();
}
function text(value:unknown):string{
  return typeof value==="string"?value.trim():typeof value==="number"?String(value):"";
}
