import test from "node:test";
import assert from "node:assert/strict";
import {validateDisposableRestoreContext,SOURCE_DB,RESTORE_DB} from "./fiscal-disposable-restore-drill.mjs";
const source="postgresql://fiscal_ci:synthetic-only@localhost:5432/fiscal_ci";
function valid(extra={}){return {ci:"true",mode:"synthetic",sourceUrl:source,marketplaceUrls:[],...extra};}
test("M47 produces a different local synthetic restore database",()=>{
 const result=validateDisposableRestoreContext(valid());
 assert.match(result.source,new RegExp("/"+SOURCE_DB+"$"));
 assert.match(result.target,new RegExp("/"+RESTORE_DB+"$"));
 assert.notEqual(result.source,result.target);
 assert.equal(Object.isFrozen(result),true);
});
test("refuses execution outside both explicit CI and synthetic drill mode",()=>{
 for(const scenario of [{ci:undefined},{ci:"false"},{mode:undefined},{mode:"production"}]){
  assert.throws(()=>validateDisposableRestoreContext(valid(scenario)),/FISCAL_M47_SYNTHETIC_CI_ONLY/);
 }
});
test("refuses every remote or non-disposable database",()=>{
 for(const changed of [
  source.replace("localhost","db.kcpwxplxqtqdsfwlfsaa.supabase.co"),
  source.replace("localhost","192.168.1.10"),
  source.replace("/fiscal_ci","/fiscal"),
  source.replace("fiscal_ci:","postgres:"),
  source.replace("synthetic-only@","@"),
  source+"?sslmode=disable",
  "http://fiscal_ci:synthetic-only@localhost/fiscal_ci"
 ]){
  assert.throws(()=>validateDisposableRestoreContext(valid({sourceUrl:changed})),
   /FISCAL_M47_LOCAL_DATABASE_REQUIRED/);
 }
});
test("refuses sharing a database with marketplace even inside CI",()=>{
 assert.throws(()=>validateDisposableRestoreContext(valid({
  marketplaceUrls:[source.replace("fiscal_ci:synthetic-only","another:password")]
 })),/FISCAL_DATABASE_MUST_BE_INDEPENDENT/);
});
test("refuses unavailable or malformed source URL",()=>{
 assert.throws(()=>validateDisposableRestoreContext(valid({sourceUrl:undefined})),
  /FISCAL_M47_SOURCE_UNAVAILABLE/);
 assert.throws(()=>validateDisposableRestoreContext(valid({sourceUrl:"not-a-url"})),
  /FISCAL_M47_INVALID_SOURCE/);
});
