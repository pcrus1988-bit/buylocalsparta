import type {BeverageVatClass} from "./drinkstock-greek-vat";
import type {DrinkStockCategory} from "./drinkstock-market-pricing";

/**
 * Generic, unbranded Greek bar/cafe starter products. Suggested amounts are
 * editable VENUE LIST PRICES in gross euro cents, not legal MSRP or provider
 * quotes. Never import automatically or infer that inventory exists.
 */
export type DrinkStockStarterProduct=Readonly<{
 key:string;name:string;category:DrinkStockCategory;
 vatClass:Exclude<BeverageVatClass,"review_required">;
 suggestedGrossCents:number;size:string;
}>;
const items:readonly [string,string,DrinkStockCategory,
 Exclude<BeverageVatClass,"review_required">,number,string][]=[
 ["lager330","Μπύρα Lager 330ml","beer","alcoholic",400,"330ml"],
 ["lager500","Μπύρα Lager βαρέλι 500ml","beer","alcoholic",550,"500ml"],
 ["lagerDraft330","Μπύρα Lager βαρέλι 330ml","beer","alcoholic",400,"330ml"],
 ["pilsner500","Μπύρα Pilsner 500ml","beer","alcoholic",550,"500ml"],
 ["wheat500","Μπύρα Weiss 500ml","beer","alcoholic",600,"500ml"],
 ["ipa330","Μπύρα IPA 330ml","beer","alcoholic",650,"330ml"],
 ["craft330","Μπύρα Craft 330ml","beer","alcoholic",650,"330ml"],
 ["cider330","Μηλίτης αλκοολούχος 330ml","beer","alcoholic",500,"330ml"],
 ["whiteGlass","Λευκό κρασί ποτήρι 150ml","wine","alcoholic",500,"150ml"],
 ["redGlass","Κόκκινο κρασί ποτήρι 150ml","wine","alcoholic",500,"150ml"],
 ["roseGlass","Ροζέ κρασί ποτήρι 150ml","wine","alcoholic",500,"150ml"],
 ["whiteCarafe","Λευκό κρασί καραφάκι 500ml","wine","alcoholic",1200,"500ml"],
 ["redCarafe","Κόκκινο κρασί καραφάκι 500ml","wine","alcoholic",1200,"500ml"],
 ["retsina500","Ρετσίνα 500ml","wine","alcoholic",1000,"500ml"],
 ["sparklingGlass","Αφρώδης οίνος ποτήρι 150ml","wine","alcoholic",650,"150ml"],
 ["ouzo50","Ούζο 50ml","spirits","alcoholic",450,"50ml"],
 ["tsipouro50","Τσίπουρο 50ml","spirits","alcoholic",500,"50ml"],
 ["gin50","Τζιν 50ml","spirits","alcoholic",600,"50ml"],
 ["vodka50","Βότκα 50ml","spirits","alcoholic",600,"50ml"],
 ["rum50","Ρούμι 50ml","spirits","alcoholic",600,"50ml"],
 ["whisky50","Ουίσκι 50ml","spirits","alcoholic",650,"50ml"],
 ["tequila50","Τεκίλα 50ml","spirits","alcoholic",650,"50ml"],
 ["brandy50","Μπράντι 50ml","spirits","alcoholic",550,"50ml"],
 ["aperol","Aperol Spritz","cocktail","alcoholic",850,"glass"],
 ["mojito","Mojito","cocktail","alcoholic",900,"glass"],
 ["ginTonic","Gin & Tonic","cocktail","alcoholic",800,"glass"],
 ["negroni","Negroni","cocktail","alcoholic",950,"glass"],
 ["margarita","Margarita","cocktail","alcoholic",950,"glass"],
 ["cubaLibre","Cuba Libre","cocktail","alcoholic",800,"glass"],
 ["daiquiri","Daiquiri","cocktail","alcoholic",850,"glass"],
 ["espressoMartini","Espresso Martini","cocktail","alcoholic",1000,"glass"],
 ["cola330","Αναψυκτικό τύπου Cola 330ml","soft_drink","non_alcoholic",350,"330ml"],
 ["colaZero330","Αναψυκτικό Cola χωρίς ζάχαρη 330ml","soft_drink","non_alcoholic",350,"330ml"],
 ["orangeSoda330","Πορτοκαλάδα 330ml","soft_drink","non_alcoholic",350,"330ml"],
 ["lemonSoda330","Λεμονάδα 330ml","soft_drink","non_alcoholic",350,"330ml"],
 ["tonic200","Tonic χωρίς αλκοόλ 200ml","soft_drink","non_alcoholic",350,"200ml"],
 ["energy250","Ενεργειακό ποτό χωρίς αλκοόλ 250ml","soft_drink","non_alcoholic",450,"250ml"],
 ["water500","Εμφιαλωμένο νερό φυσικό 500ml","other","water",150,"500ml"],
 ["sparklingWater330","Ανθρακούχο νερό 330ml","other","water",300,"330ml"],
 ["espresso","Espresso μονός","other","non_alcoholic",250,"cup"],
 ["doubleEspresso","Espresso διπλός","other","non_alcoholic",350,"cup"],
 ["freddoEspresso","Freddo Espresso","other","non_alcoholic",400,"cup"],
 ["cappuccino","Cappuccino","other","non_alcoholic",400,"cup"],
 ["freddoCappuccino","Freddo Cappuccino","other","non_alcoholic",450,"cup"],
 ["greekCoffee","Ελληνικός καφές","other","non_alcoholic",250,"cup"],
 ["filterCoffee","Καφές φίλτρου","other","non_alcoholic",300,"cup"],
 ["blackTea","Τσάι μαύρο","other","non_alcoholic",300,"cup"],
 ["chamomile","Χαμομήλι","other","non_alcoholic",300,"cup"],
 ["hotChocolate","Ζεστή σοκολάτα","other","non_alcoholic",400,"cup"],
 ["icedTea","Παγωμένο τσάι","other","non_alcoholic",380,"glass"],
 ["freshOrange","Φυσικός χυμός πορτοκάλι","other","non_alcoholic",450,"glass"],
 ["appleJuice","Χυμός μήλο 250ml","other","non_alcoholic",350,"250ml"],
 ["smoothie","Smoothie φρούτων","other","non_alcoholic",650,"glass"],
 ["virginMojito","Virgin Mojito χωρίς αλκοόλ","cocktail","non_alcoholic",650,"glass"],
 ["mocktailFruit","Mocktail φρούτων χωρίς αλκοόλ","cocktail","non_alcoholic",650,"glass"],
 ["zeroBeer330","Μπύρα 0.0% χωρίς αλκοόλ 330ml","beer","non_alcoholic",450,"330ml"]
];
export const DRINKSTOCK_STARTER_CATALOGUE:readonly DrinkStockStarterProduct[]=Object.freeze(
 items.map(([key,name,category,vatClass,suggestedGrossCents,size])=>
  Object.freeze({key,name,category,vatClass,suggestedGrossCents,size}))
);
const byKey=new Map(DRINKSTOCK_STARTER_CATALOGUE.map(item=>[item.key,item]));
export function catalogueTemplateByKey(key:string):DrinkStockStarterProduct|undefined{return byKey.get(key);}
export type CatalogueSelection=Readonly<{key:string;baseCents:number}>;
export function validateCatalogueSelections(input:unknown):CatalogueSelection[]{
 if(!input||!Array.isArray(input)||input.length<1||input.length>60)
  throw new Error("INVALID_CATALOGUE_SELECTION");
 const seen=new Set<string>();
 return input.map(entry=>{
  if(!entry||typeof entry!=="object"||Array.isArray(entry))
   throw new Error("INVALID_CATALOGUE_PRODUCT");
  const v=entry as Record<string,unknown>;
  if(Object.keys(v).sort().join(",")!=="baseCents,key"||
   typeof v.key!=="string"||!catalogueTemplateByKey(v.key)||
   !Number.isSafeInteger(v.baseCents)||Number(v.baseCents)<100||
   Number(v.baseCents)>200000||seen.has(v.key))
   throw new Error("INVALID_CATALOGUE_PRODUCT");
  seen.add(v.key);
  return {key:v.key,baseCents:Number(v.baseCents)};
 });
}
