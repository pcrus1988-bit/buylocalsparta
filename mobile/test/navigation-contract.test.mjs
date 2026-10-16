import assert from "node:assert/strict";
import test from "node:test";
import {existsSync,readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname,resolve} from "node:path";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"../src/app");
const layout=readFileSync(resolve(root,"_layout.tsx"),"utf8");
const routes=["index","shop","stores","basket","services","lists","account",
 "nearby","pickups","notifications","diagnostics"];

test("every flagship buyer and service journey resolves to an Expo Router screen",()=>{
 for(const route of routes){
  assert.equal(existsSync(resolve(root,route+".tsx")),true,route+" screen missing");
  assert.equal(layout.includes('name="'+route+'"'),true,route+" missing from stack");
 }
});
test("shopping discovery and cart are reachable from primary Android navigation",()=>{
 const dock=readFileSync(resolve(root,"../components/CompanionDock.tsx"),"utf8");
 for(const link of ['href:"/"','href:"/shop"','href:"/lists"',
  'href:"/basket"','href:"/account"']){
   assert.equal(dock.includes(link),true,"Missing tab "+link);
 }
 assert.equal(layout.includes("<CompanionDock />"),true);
});
