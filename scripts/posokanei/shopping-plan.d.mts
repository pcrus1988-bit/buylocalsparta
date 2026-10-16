import type {BasketPlan,BasketResult,PlanItem} from "./basket-optimizer.mjs";
export type StoreShoppingSection = {
  id:string;name:string;items:PlanItem[];subtotalEur:number
};
export function groupShoppingPlan(plan:BasketPlan|null):StoreShoppingSection[];
export function savingsForPlan(result:BasketResult|null,plan:BasketPlan|null):number|null;
export function planFingerprint(snapshotDate:string,mode:string,plan:BasketPlan|null):string;
export function shoppingPlanText(result:BasketResult|null,plan:BasketPlan|null,mode:"single"|"limited"|"all"):string;
export function packagesForEquivalent(sourceBaseQuantity:number,sourcePackages:number,candidateBaseQuantity:number):number|null;
