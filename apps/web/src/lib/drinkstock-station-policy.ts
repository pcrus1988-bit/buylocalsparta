import type {DrinkOrderState} from "./drinkstock-commerce-policy";
export const DRINKSTOCK_STATIONS=["bar","waiter"] as const;
export type DrinkStockStation=typeof DRINKSTOCK_STATIONS[number];
export function isDrinkStockStation(value:unknown):value is DrinkStockStation{
 return value==="bar"||value==="waiter";
}
export const STATION_TRANSITIONS:ReadOnly<Record<DrinkStockStation,Readonly<Partial<Record<DrinkOrderState,DrinkOrderState>>>>> = {
 bar:{paid:"accepted",accepted:"preparing",preparing:"ready"},
 waiter:{ready:"served"}
};
export function mayStationAdvance(station:DrinkStockStation,from:DrinkOrderState,to:DrinkOrderState){
 return STATION_TRANSITIONS[station][from]===to;
}
export type StationCommand=Readonly<{targetUserId:string;station:DrinkStockStation;enabled:boolean;requestKey:string}>;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function parseStationAssignment(value:unknown):StationCommand{
 if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("INVALID_STATION_ASSIGNMENT");
 const x=value as Record<string,unknown>;
 if(Object.keys(x).sort().join(",")!=="enabled,requestKey,station,targetUserId"||
  typeof x.targetUserId!=="string"||x.targetUserId.length<1||x.targetUserId.length>200||
  !isDrinkStockStation(x.station)||typeof x.enabled!=="boolean"||
  typeof x.requestKey!=="string"||!uuid.test(x.requestKey))
  throw new Error("INVALID_STATION_ASSIGNMENT");
 return {targetUserId:x.targetUserId,station:x.station,enabled:x.enabled,requestKey:x.requestKey};
}
