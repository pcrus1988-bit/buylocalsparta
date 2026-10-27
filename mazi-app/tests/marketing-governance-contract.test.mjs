import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(p)=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("super admin marketing readiness requires authenticated strict MAZI role",()=>{
 const src=read("../apps/web/src/app/admin/mazi/marketing/page.tsx");
 assert.match(src,/getAdminSession/);
 assert.match(src,/if\(!principal\)redirect\("\/admin\/login"\)/);
 assert.match(src,/if\(!isMaziSuperAdmin\(principal\)\)/);
 assert.match(src,/δεν επιτρέπει μεταφορές/);
});
test("public transparency separates funds and never fabricates live numbers",()=>{
 const src=read("app/transparency/page.tsx");
 assert.match(src,/Αναπτυξιακό Ταμείο/);
 assert.match(src,/Συλλογική Προβολή/);
 assert.match(src,/δεν έχει ενεργοποιηθεί/);
 assert.match(src,/δεν δημοσιεύονται υποθετικά υπόλοιπα/i);
});
