import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const ui=readFileSync(new URL("../../apps/web/src/components/PosoKaneiPublicClient.tsx",import.meta.url),"utf8");
const css=readFileSync(new URL("../../apps/web/src/components/PosoKaneiPublicClient.module.css",import.meta.url),"utf8");
const nav=readFileSync(new URL("../../apps/web/src/lib/customer-mobile-commerce.ts",import.meta.url),"utf8");
const api=readFileSync(new URL("../../apps/web/src/app/api/posokanei/saved-list/route.ts",import.meta.url),"utf8");

test("mobile PosoKanei replaces global bottom nav with own always-visible list menu",()=>{
  assert.match(nav,/"\/posokanei"/);
  assert.match(ui,/className=\{styles\.mobileBasketShortcut\}/);
  assert.match(ui,/setMobileListOpen\(true\)/);
  assert.match(ui,/styles\.mobileBasketOpen/);
  assert.match(css,/\.mobileBasketOpen/);
  assert.match(css,/\.mobileListBackdrop/);
});

test("grocery replacements are compact and preserve explicit verified selection",()=>{
  assert.match(ui,/className=\{styles\.suggestionDisclosure\}/);
  assert.match(ui,/Αυτόματα ελεγμένη αντιστοίχιση/);
  assert.match(ui,/chooseAlternative\(entry\.lineId,option\)/);
  assert.doesNotMatch(ui,/Η εναλλακτική δεν έχει επιβεβαιωθεί/);
});

test("customer account is mandatory for permanent shopping-list save",()=>{
  assert.match(ui,/\/login\?next=/);
  assert.match(ui,/PENDING_LIST_KEY/);
  assert.match(ui,/sessionStorage\.setItem\(PENDING_LIST_KEY/);
  assert.match(ui,/localStorage\.setItem\("posokanei-shopping-v2",JSON\.stringify\(\{excluded,maxStores:storeLimit\}\)\)/);
  assert.doesNotMatch(ui,/localStorage\.setItem\("posokanei-checklist-v1"/);
  assert.match(api,/requireAccountSession\(request,true\)/);
  assert.match(api,/WHERE user_id=\$1/);
  assert.match(api,/ON CONFLICT \(user_id\) DO UPDATE/);
  assert.match(api,/validList\(body\)/);
  assert.match(ui,/x-csrf-token/);
  assert.match(ui,/setProgress\(data\.saved\.progress\)/);
});
