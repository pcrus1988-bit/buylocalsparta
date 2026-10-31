import test from "node:test";
import assert from "node:assert/strict";
import {
  parsePressCsv, combinePressContacts, normalizePressLanguage, contactsFromLanguages, MAX_PRESS_CONTACTS
} from "../apps/web/src/lib/research-press-csv.ts";

test("CSV groups Greek and English recipients and removes same-language duplicates", () => {
  const r=parsePressCsv("email,language,outlet,name\nnews@example.org,el,Outlet,Greek Desk\nworld@example.org,en,Media,English Desk\nNEWS@example.org,Greek,Outlet,Duplicate\n");
  assert.deepEqual(r.counts,{el:1,en:1});
  assert.equal(r.duplicateCount,1);
  assert.deepEqual(r.contacts.map(c=>[c.email,c.language]),[["news@example.org","el"],["world@example.org","en"]]);
});
test("semicolon CSV with BOM, escaped quotes and Greek labels",()=>{
  const r=parsePressCsv('\uFEFFemail;language;outlet;name\r\n"desk@example.gr";"Ελληνικά";"Local; Media";"Νέα ""Ελλάδα"""\r\n');
  assert.equal(r.contacts[0]?.language,"el");
  assert.equal(r.contacts[0]?.outlet,"Local; Media");
  assert.equal(r.contacts[0]?.name,'Νέα "Ελλάδα"');
});
test("ambiguous language values reject import; no domain-based inference",()=>{
  assert.throws(()=>parsePressCsv("email,language\neditor@example.gr,\n"),/explicitly/);
  assert.throws(()=>parsePressCsv("email,language\neditor@example.gr,de\n"),/explicitly/);
  assert.equal(normalizePressLanguage("en"),"en");
  assert.equal(normalizePressLanguage("greek"),"el");
  assert.equal(normalizePressLanguage("fr"),null);
});
test("same email with conflicting languages is rejected",()=>{
  assert.throws(()=>parsePressCsv("email,language\npress@example.org,en\npress@example.org,el\n"),/conflicting/);
  assert.throws(()=>combinePressContacts([{email:"press@example.org",language:"el"}],
    [{email:"press@example.org",language:"en"}],"append"),/Conflicting/);
});
test("CSV errors are transactional, missing headers and invalid emails reject",()=>{
  assert.throws(()=>parsePressCsv("email,outlet\na@example.org,Foo\n"),/email and language/);
  assert.throws(()=>parsePressCsv("email,language\nno-at-sign,en\n"),/invalid email/);
  assert.throws(()=>parsePressCsv("email,language\na@example.org,en,extra\n"),/columns/);
  assert.throws(()=>parsePressCsv('email,language\n"a@example.org,en\n'),/Unclosed/);
});
test("saved contacts require an explicit validated locale",()=>{
  assert.deepEqual(contactsFromLanguages(["press@example.org"],{"press@example.org":"en"}),
    [{email:"press@example.org",language:"en"}]);
  assert.throws(()=>contactsFromLanguages(["press@example.org"],{}),/missing an explicit language/);
});
test("campaigns over 500 contacts import and append without compromising deduplication",()=>{
  const initial=Array.from({length:600},(_,i)=>`desk${i}@example.org,el`);
  const incoming=Array.from({length:600},(_,i)=>`desk${i+500}@example.org,en`);
  const first=parsePressCsv("email,language\n"+initial.join("\n")+"\n");
  const second=parsePressCsv("email,language\n"+incoming.join("\n")+"\n");
  assert.equal(first.contacts.length,600);
  assert.equal(second.contacts.length,600);
  // A same-address conflicting locale is still rejected when lists are appended.
  assert.throws(()=>combinePressContacts(first.contacts,second.contacts,"append"),/Conflicting/);
  const safeIncoming=second.contacts.map(c=>Number(c.email.match(/^desk(\d+)/)?.[1])<600
    ? {...c,language:"el" as const}:c);
  const combined=combinePressContacts(first.contacts,safeIncoming,"append");
  assert.equal(combined.length,1100);
  assert.equal(new Set(combined.map(c=>c.email)).size,1100);
});

test("oversized recipient collections are rejected against the new campaign ceiling",()=>{
  const contacts=Array.from({length:MAX_PRESS_CONTACTS+1},(_,i)=>({email:`desk${i}@example.org`,language:"el" as const}));
  assert.throws(()=>combinePressContacts([],contacts,"replace"),new RegExp(String(MAX_PRESS_CONTACTS)));
});

test("append honors existing locales and keeps unique recipients",()=>{
  const merged=combinePressContacts([{email:"a@example.org",language:"el"}],
    [{email:"a@example.org",language:"el"},{email:"b@example.org",language:"en"}],"append");
  assert.equal(merged.length,2);
});
