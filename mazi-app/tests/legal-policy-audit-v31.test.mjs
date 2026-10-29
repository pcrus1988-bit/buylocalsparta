import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
function parseLegalModule(name){
 const src=read("lib/legal/v3-"+name+".ts");
 const start=src.indexOf("={");
 assert.ok(start>=0,"canonical module missing export: "+name);
 const end=src.lastIndexOf(" as const satisfies");
 return JSON.parse(src.slice(start+1,end));
}
const docs={...parseLegalModule("core"),...parseLegalModule("finance"),...parseLegalModule("data")};
const keys=["terms","membership","services","fund","award","marketing","governance","community","privacy","retention","cookies","compliance"];
test("every legal policy has one owner, ordered article numbers and meaningful content",()=>{
 assert.deepEqual(Object.keys(docs).sort(),keys.slice().sort());
 for(const [slug,doc] of Object.entries(docs)){
  assert.ok(doc.title.length>15,slug);
  assert.ok(doc.sections.length>=4,slug);
  const headings=new Set();
  for(const [index,sec] of doc.sections.entries()){
   assert.ok(sec.heading.startsWith((index+1)+"."),slug+" misnumbered section "+sec.heading);
   assert.ok(!headings.has(sec.heading),slug+" duplicated "+sec.heading);headings.add(sec.heading);
   assert.ok(sec.paragraphs.length>=1,slug+" has blank section");
   for(const p of sec.paragraphs)assert.ok(p.length>35,slug+" has empty legal paragraph");
  }
 }
});
test("cross-policy references all resolve to real policy routes",()=>{
 const all=Object.values(docs).flatMap(x=>x.sections.flatMap(s=>s.paragraphs)).join("\n");
 const routes=[...all.matchAll(/\/legal\/([a-z]+)/g)].map(x=>x[1]);
 for(const route of routes)assert.ok(Object.hasOwn(docs,route),"Unknown legal reference /legal/"+route);
 const others=[...all.matchAll(/\/(?:terms|privacy|invitation-terms|marketplace\/rules|services\/catalogue|hubs\/join)\b/g)];
 assert.ok(others.length>5,"Missing special policy references");
});
test("general terms never inherit fees, Tokens, Fund formula or grant financial rules",()=>{
 const txt=docs.terms.sections.flatMap(s=>s.paragraphs).join(" ");
 assert.doesNotMatch(txt,/€\s*\d|\b250\b|\b40%\b|\b20%\b|ceil\(|\bTokens?\s*\d+/);
 assert.match(txt,/\/legal\/membership/);
 assert.match(txt,/\/legal\/services/);
 assert.match(txt,/\/legal\/fund/);
 assert.match(txt,/\/marketplace\/rules/);
 assert.match(docs.membership.sections.flatMap(s=>s.paragraphs).join(" "),/€250/);
 assert.match(docs.award.sections.flatMap(s=>s.paragraphs).join(" "),/ceil\(/);
});
test("current GDPR transparency and retention never masquerade as future paid services",()=>{
 assert.equal(docs.privacy.status,"current");
 assert.equal(docs.retention.status,"current");
 assert.equal(docs.cookies.status,"current");
 const txt=docs.privacy.sections.flatMap(s=>s.paragraphs).join(" ");
 assert.match(txt,/άρθρο 21|άρθρου 21/);
 assert.match(txt,/ένα μήν|ενός μηνός|ενός μήνα/);
 assert.match(txt,/άρθρο 6|άρθρου 6/);
 const retention=docs.retention.sections.flatMap(s=>s.paragraphs).join(" ");
 assert.match(retention,/δεν τεκμηριώνει/);
 assert.match(retention,/4308\/2014/);
});
test("marketing pilot remains distinct from advertising consent and Fund payouts",()=>{
 const m=docs.marketing.sections.flatMap(s=>s.paragraphs).join(" ");
 const p=docs.privacy.sections.flatMap(s=>s.paragraphs).join(" ");
 assert.match(m,/προεπισκόπηση/);
 assert.match(m,/δεν αποτελεί|δεν επιτρέπει/i);
 assert.match(p,/εμπορικ|marketing/);
 assert.match(docs.fund.sections.flatMap(s=>s.paragraphs).join(" "),/founding-needs-2026/);
 assert.match(docs.fund.sections.flatMap(s=>s.paragraphs).join(" "),/€0/);
});
test("statutory reference inventory is subject-scoped, not a generic copy-paste list",()=>{
 const code=read("lib/legal/v31-sources.ts");
 assert.match(code,/legalSourceMap:Record<LegalSlug/);
 for(const slug of keys)assert.match(code,new RegExp("\\b"+slug+":\\["));
 assert.match(code,/eur-lex.europa.eu\/eli\/reg\/2016\/679/);
 assert.match(code,/dpa.gr\/enimerwtiko/);
 assert.match(code,/tax2.taxheaven.gr\/law\/5144/);
 assert.doesNotMatch(read("app/legal/legal-document.tsx"),/legalSourceMap\[slug\][\s\S]*?https:\/\/www\.taxheaven\.gr\/law\/4308/);
});

test("privacy transparency names the verified US Supabase processing region and does not invent an accepted DPA",()=>{
 const notices=docs.privacy.sections.flatMap(s=>s.paragraphs).join(" ");
 assert.match(notices,/us-east-1/);
 assert.match(notices,/Ηνωμένες Πολιτείες Αμερικής/);
 assert.match(notices,/supabase\.com\/legal\/customer-resources\/data-processing-addendum/);
 assert.match(notices,/Τυποποιημένες Συμβατικές Ρήτρες/);
 assert.match(notices,/δεν αποδεικνύει από μόνη της/);
 assert.match(notices,/info@kontamou\.site/);
 assert.doesNotMatch(notices,/όλες οι (διαβιβάσεις|ροές) είναι νόμιμες/);
});

test("privacy update has a distinct dated revision and preserved historic contract codification",()=>{
 const registry=read("lib/legal-documents.ts");
 const page=read("app/legal/legal-document.tsx");
 const history=read("app/legal/changes/page.tsx");
 assert.match(registry,/PRIVACY_NOTICE_REVISION="mazi-privacy-us-transfer-20261029"/);
 assert.match(registry,/PRIVACY_NOTICE_REVISED_ON="29.10.2026"/);
 assert.match(page,/slug==="privacy"/);
 assert.match(page,/PRIVACY_NOTICE_REVISION/);
 assert.match(history,/us-east-1/);
 assert.match(history,/δεν τροποποιεί σιωπηρά/);
});
