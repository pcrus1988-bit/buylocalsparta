import * as SQLite from "expo-sqlite";
import { DeviceEventEmitter } from "react-native";
import {validCanonicalPublicId} from "./canonical-id";
import {planCatalogAdd,planListMoveMerge,type CatalogAddAction,type ListKind} from "./list-rules";
import {normalizedNoteKey,parseShoppingNotes} from "./shopping-list-import";
export type {ListKind} from "./list-rules";

export type ListItem = {
  id: string;
  kind: ListKind;
  title: string;
  quantity: number;
  completed: boolean;
  variantId: string | null;
  createdAt: number;
};
export type CompanionPreferences = {
  shoppingReminders: boolean;
  vendorOffers: boolean;
};

let pendingDatabase: Promise<SQLite.SQLiteDatabase> | undefined;
async function database() {
  pendingDatabase ??= (async()=>{
   const db=await SQLite.openDatabaseAsync("kontamou-companion-v1.db");
   await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS companion_items (
      id TEXT PRIMARY KEY NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('shopping','wishlist')),
      title TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 99),
      completed INTEGER NOT NULL DEFAULT 0,
      variant_id TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS companion_preferences (
      key TEXT PRIMARY KEY NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS companion_alerts (
      alert_key TEXT PRIMARY KEY NOT NULL,
      sent_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS companion_alerts_sent_at ON companion_alerts(sent_at);
  `);
   return db;
  })().catch(e=>{pendingDatabase=undefined;throw e;});
  return pendingDatabase;
}
export async function getItems(kind?: ListKind): Promise<ListItem[]> {
  const db = await database();
  const rows=kind
    ? await db.getAllAsync<{
      id:string;kind:ListKind;title:string;quantity:number;completed:number;variant_id:string|null;created_at:number
    }>("SELECT * FROM companion_items WHERE kind=? ORDER BY completed ASC,created_at DESC",kind)
    : await db.getAllAsync<{
      id:string;kind:ListKind;title:string;quantity:number;completed:number;variant_id:string|null;created_at:number
    }>("SELECT * FROM companion_items ORDER BY completed ASC,created_at DESC");
  return rows.map(r=>({id:r.id,kind:r.kind,title:r.title,quantity:r.quantity,
    completed:r.completed===1,variantId:r.variant_id,createdAt:r.created_at}));
}
export async function addItem(kind:ListKind,title:string,quantity=1,variantId:string|null=null){
  const clean=title.normalize("NFKC").trim().replace(/\s+/g," ");
  if(!["shopping","wishlist"].includes(kind)||clean.length<2||clean.length>120
    ||!Number.isSafeInteger(quantity)||quantity<1||quantity>99
    ||(variantId!==null&&!validCanonicalPublicId(variantId)))throw new Error("INVALID_ITEM");
  const db=await database();
  let resultId="";
  await db.withExclusiveTransactionAsync(async tx=>{
    // Re-using a free-text shopping item should not create a second row.
    // Canonical variants follow addCatalogItem(), never a fuzzy text match.
    if(kind==="shopping"&&variantId===null){
      const rows=await tx.getAllAsync<{id:string;title:string;quantity:number}>(
        "SELECT id,title,quantity FROM companion_items WHERE kind='shopping' AND variant_id IS NULL"
      );
      const existing=rows.find(row=>normalizedNoteKey(row.title)===normalizedNoteKey(clean));
      if(existing){
        if(existing.quantity+quantity>99)throw Error("QUANTITY_LIMIT");
        await tx.runAsync("UPDATE companion_items SET quantity=?,completed=0 WHERE id=?",
          existing.quantity+quantity,existing.id);
        resultId=existing.id;
        return;
      }
    }
    resultId=`companion_${Date.now()}_${Math.random().toString(36).slice(2,12)}`;
    await tx.runAsync("INSERT INTO companion_items(id,kind,title,quantity,completed,variant_id,created_at) VALUES(?,?,?,?,0,?,?)",
      resultId,kind,clean,quantity,variantId,Date.now());
  });
  return resultId;
}
/** Add multiple local handwritten shopping notes in one atomic transaction.
 * Normalized matches merge, but canonical variants are never inferred from text.
 * Existing website saved products, order ledger and checkout are untouched.
 */
export async function importShoppingNotes(input:string):Promise<{
 created:number;updated:number;total:number
}>{
 const notes=parseShoppingNotes(input);
 const db=await database();
 let created=0,updated=0;
 await db.withExclusiveTransactionAsync(async tx=>{
   const existing=await tx.getAllAsync<{
     id:string;title:string;quantity:number;completed:number
   }>("SELECT id,title,quantity,completed FROM companion_items WHERE kind='shopping' AND variant_id IS NULL ORDER BY created_at DESC");
   const byKey=new Map(existing.map(row=>[normalizedNoteKey(row.title),row]));
   for(const note of notes){
     const key=normalizedNoteKey(note.title);
     const row=byKey.get(key);
     if(row){
       const next=row.quantity+note.quantity;
       if(!Number.isSafeInteger(next)||next>99)throw Error("QUANTITY_LIMIT");
       await tx.runAsync("UPDATE companion_items SET quantity=?,completed=0 WHERE id=?",
         next,row.id);
       byKey.set(key,{...row,quantity:next,completed:0});
       updated++;
     }else{
       const id=`companion_${Date.now()}_${Math.random().toString(36).slice(2,12)}`;
       await tx.runAsync(
        "INSERT INTO companion_items(id,kind,title,quantity,completed,variant_id,created_at) VALUES(?,'shopping',?,?,0,NULL,?)",
        id,note.title,note.quantity,Date.now()
       );
       byKey.set(key,{id,title:note.title,quantity:note.quantity,completed:0});
       created++;
     }
   }
 });
 return {created,updated,total:notes.length};
}

/** Add a real canonical variant to a chosen local list, without duplicate rows.
 * Wishlist: idempotent (reopens a checked item).
 * Shopping: repeated adds increment quantity, capped at 99.
 */
export async function addCatalogItem(
 kind:ListKind,product:{variantId:string;title:string},quantity=1
):Promise<CatalogAddAction>{
 const variant=product.variantId?.trim();
 const title=product.title?.normalize("NFKC").trim().replace(/\s+/g," ");
 if(!validCanonicalPublicId(variant)||!title||title.length<2||title.length>120)
  throw Error("INVALID_CATALOG_ITEM");
 const db=await database();
 let action:CatalogAddAction="added";
 await db.withExclusiveTransactionAsync(async tx=>{
   const old=await tx.getFirstAsync<{id:string;quantity:number;completed:number}>(
    "SELECT id,quantity,completed FROM companion_items WHERE kind=? AND variant_id=? ORDER BY created_at DESC LIMIT 1",
    kind,variant
   );
   const plan=planCatalogAdd(kind,old?{quantity:old.quantity,completed:old.completed===1}:null,quantity);
   action=plan.action;
   if(old){
     if(plan.action!=="exists")
       await tx.runAsync("UPDATE companion_items SET quantity=?,completed=? WHERE id=?",
         plan.quantity,plan.completed?1:0,old.id);
     return;
   }
   const id=`companion_${Date.now()}_${Math.random().toString(36).slice(2,12)}`;
   await tx.runAsync(
    "INSERT INTO companion_items(id,kind,title,quantity,completed,variant_id,created_at) VALUES(?,?,?,?,0,?,?)",
    id,kind,title,plan.quantity,variant,Date.now()
   );
 });
 return action;
}

export async function setItemCompleted(id:string,completed:boolean){
  const db=await database();
  await db.runAsync("UPDATE companion_items SET completed=? WHERE id=?",completed?1:0,id);
}
/** Local-only item updates. No remote customer data is touched. */
export async function setItemQuantity(id:string,quantity:number){
 if(!Number.isSafeInteger(quantity)||quantity<1||quantity>99)throw new Error("INVALID_QUANTITY");
 const db=await database();
 await db.runAsync("UPDATE companion_items SET quantity=? WHERE id=?",quantity,id);
}
export async function moveItem(id:string,kind:ListKind){
 if(kind!=="shopping"&&kind!=="wishlist")throw new Error("INVALID_KIND");
 const db=await database();
 await db.withExclusiveTransactionAsync(async tx=>{
   const source=await tx.getFirstAsync<{
     kind:ListKind;variant_id:string|null;quantity:number;completed:number
   }>("SELECT kind,variant_id,quantity,completed FROM companion_items WHERE id=?",id);
   if(!source||source.kind===kind)return;
   const target=source.variant_id?await tx.getFirstAsync<{
     id:string;quantity:number;completed:number
   }>("SELECT id,quantity,completed FROM companion_items WHERE kind=? AND variant_id=? AND id<>? ORDER BY created_at DESC LIMIT 1",kind,source.variant_id,id):null;
   if(target){
     const merged=planListMoveMerge(
      {quantity:source.quantity,completed:source.completed===1},
      {quantity:target.quantity,completed:target.completed===1}
     );
     await tx.runAsync("UPDATE companion_items SET quantity=?,completed=? WHERE id=?",
       merged.quantity,merged.completed?1:0,target.id);
     await tx.runAsync("DELETE FROM companion_items WHERE id=?",id);
   }else{
     await tx.runAsync("UPDATE companion_items SET kind=? WHERE id=?",kind,id);
   }
 });
}
/** Only remove checked-off local entries after explicit user confirmation. */
export async function clearCompletedItems(kind:ListKind):Promise<number>{
 if(kind!=="shopping"&&kind!=="wishlist")throw Error("INVALID_KIND");
 const db=await database();
 const result=await db.runAsync("DELETE FROM companion_items WHERE kind=? AND completed=1",kind);
 return result.changes;
}

export async function removeItem(id:string){
  const db=await database();
  await db.runAsync("DELETE FROM companion_items WHERE id=?",id);
}
export async function getPreferences():Promise<CompanionPreferences>{
  const db=await database();
  const rows=await db.getAllAsync<{key:string;enabled:number}>("SELECT key,enabled FROM companion_preferences");
  return {shoppingReminders:rows.some(r=>r.key==="shopping_reminders"&&r.enabled===1),
    vendorOffers:rows.some(r=>r.key==="vendor_offers"&&r.enabled===1)};
}
export async function setPreference(kind:keyof CompanionPreferences,value:boolean){
  const db=await database();
  const key=kind==="shoppingReminders"?"shopping_reminders":"vendor_offers";
  await db.runAsync("INSERT INTO companion_preferences(key,enabled) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET enabled=excluded.enabled",key,value?1:0);
  DeviceEventEmitter.emit("companion-preferences-changed");
}
export async function mayNotify(alertKey:string, now=Date.now()):Promise<boolean>{
  // Atomically claim before attempting notification; fails closed if delivery is uncertain.
  const db=await database();
  let allowed=false;
  await db.withExclusiveTransactionAsync(async tx=>{
    await tx.runAsync("DELETE FROM companion_alerts WHERE sent_at<?",now-30*86400000);
    const count=await tx.getFirstAsync<{n:number}>("SELECT COUNT(*) AS n FROM companion_alerts WHERE sent_at>?",now-86400000);
    if((count?.n??0)>=2)return;
    const earlier=await tx.getFirstAsync<{sent_at:number}>("SELECT sent_at FROM companion_alerts WHERE alert_key=?",alertKey);
    if(earlier && earlier.sent_at>now-86400000)return;
    await tx.runAsync("INSERT INTO companion_alerts(alert_key,sent_at) VALUES(?,?) ON CONFLICT(alert_key) DO UPDATE SET sent_at=excluded.sent_at",
      alertKey,now);
    allowed=true;
  });
  return allowed;
}

/** Explicit one-way import from signed-in account. Never deletes a local item. */
export async function importAccountWishlist(
 products:readonly {variantId:string;title:string}[]
):Promise<number>{
 const db=await database();
 let inserted=0;
 await db.withExclusiveTransactionAsync(async tx=>{
   const existing=await tx.getAllAsync<{variant_id:string|null}>(
     "SELECT variant_id FROM companion_items WHERE kind='wishlist' AND variant_id IS NOT NULL"
   );
   const known=new Set(existing.map(x=>x.variant_id));
   for(const product of products.slice(0,80)){
     const variant=product.variantId?.trim();
     const name=product.title?.normalize("NFKC").trim().replace(/\s+/g," ");
     if(!variant || variant.length>128 || !name || name.length<2 || name.length>120
       || known.has(variant))continue;
     const id=`companion_${Date.now()}_${Math.random().toString(36).slice(2,12)}`;
     await tx.runAsync(
       "INSERT INTO companion_items(id,kind,title,quantity,completed,variant_id,created_at) VALUES(?,'wishlist',?,1,0,?,?)",
       id,name,variant,Date.now()
     );
     known.add(variant);
     inserted++;
   }
 });
 return inserted;
}

/** On-device privacy reset. Does not touch server-side user saved products. */
export async function clearCompanionLocalData(){
 const db=await database();
 await db.withExclusiveTransactionAsync(async tx=>{
   await tx.runAsync("DELETE FROM companion_items");
   await tx.runAsync("DELETE FROM companion_alerts");
   await tx.runAsync("DELETE FROM companion_preferences");
 });
 DeviceEventEmitter.emit("companion-preferences-changed");
}
