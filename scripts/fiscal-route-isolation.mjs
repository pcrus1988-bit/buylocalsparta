import {readFile,readdir} from "node:fs/promises";
import {resolve,relative,sep} from "node:path";
import assert from "node:assert/strict";
const root=resolve("fiscal/service");
const app=resolve(root,"src/app");
async function walk(dir){
  let result=[];
  for(const item of await readdir(dir,{withFileTypes:true})){
    const path=resolve(dir,item.name);
    if(item.isDirectory())result.push(...await walk(path));
    else if(item.name==="route.ts"||item.name==="page.tsx")result.push(relative(app,path).split(sep).join("/"));
  }
  return result;
}
const routes=await walk(app);
const allowed=(path)=>path==="page.tsx"||
 path.startsWith("timologio/")||path.startsWith("timologio-admin/");
const forbidden=routes.filter(x=>!allowed(x));
assert.deepEqual(forbidden,[],"Standalone app may not expose marketplace endpoints");
const forbiddenInFiscal=[
 "timologio/marketplace-link/page.tsx",
 "timologio/api/marketplace-link/confirm/route.ts",
 "timologio-admin/api/login/route.ts",
 "admin/page.tsx","api/cron/research-study-jobs/route.ts",
 "api/checkout/route.ts","vendor/page.tsx"
];
for(const path of forbiddenInFiscal)assert.ok(!routes.includes(path),"Forbidden Fiscal route: "+path);
for(const expected of [
 "timologio/page.tsx","timologio/api/v1/drafts/route.ts",
 "timologio-admin/page.tsx","timologio-admin/sso/callback/route.ts"
])assert.ok(routes.includes(expected),"Missing Fiscal route: "+expected);
const config=JSON.parse(await readFile(resolve(root,"vercel.json"),"utf8"));
assert.equal(config.framework,"nextjs");
assert.ok(!Object.hasOwn(config,"crons"),"Standalone Fiscal must not schedule marketplace crons");
assert.ok(!Object.hasOwn(config,"env"),"Standalone config must not embed marketplace secrets");
const next=await readFile(resolve(root,"next.config.ts"),"utf8");
assert.ok(next.includes('FISCAL_STANDALONE_MODE')&&next.includes("FISCAL_STANDALONE_MODE=true"));
const appRoot=await readFile(resolve(app,"layout.tsx"),"utf8");
assert.ok(!appRoot.includes("getSeoGlobalSettingsSnapshot"));
console.log("FISCAL ROUTE ISOLATION PASSED:",routes.length,"application routes, no marketplace crons");
