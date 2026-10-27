import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const file=(p)=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("pre-join pages expose all benefits without implying active payments",()=>{
 const benefits=file("app/benefits/page.tsx"), membership=file("app/membership/page.tsx"),marketing=file("app/marketing/page.tsx");
 assert.match(benefits,/Αναπτυξιακό Ταμείο/);
 assert.match(benefits,/Συλλογική διαφήμιση/);
 assert.match(benefits,/HUB PRO/);
 assert.match(benefits,/Tokens/);
 assert.match(benefits,/Δεν.*ενεργοποιηθεί/);
 assert.match(membership,/δεν υπάρχει ακόμη ενεργή συνδρομή|Δεν υπάρχει ακόμη ενεργή συνδρομή/);
 assert.match(marketing,/δεν υπάρχουν ενεργές συνδρομές|Δεν υπάρχουν ενεργές συνδρομές/);
});
test("marketing programme never claims a personal ad wallet or active credits",()=>{
 const model=file("lib/marketing-program.ts");
 const member=file("app/dashboard/marketing/page.tsx");
 assert.match(model,/percent:20/);
 assert.match(model,/MONTHLY_SERVICE_TOKENS = 250/);
 assert.match(member,/Δεν πιστώνονται Tokens όσο δεν λειτουργεί η συνδρομή/);
 assert.match(member,/Δεν εμφανίζουμε εκτιμώμενα αποτελέσματα/);
});
