import assert from "node:assert/strict";
import test from "node:test";
import {normalizedNoteKey,parseShoppingNotes} from "../src/lib/shopping-list-import.ts";

test("bulk import handles Greek names, bullets and both explicit quantity forms",()=>{
 assert.deepEqual(parseShoppingNotes("• 2x Γάλα\n- Ντομάτες × 3\nΚαφές"),[
  {title:"Γάλα",quantity:2},
  {title:"Ντομάτες",quantity:3},
  {title:"Καφές",quantity:1}
 ]);
});
test("plain numeric product names are not misread as quantities",()=>{
 assert.deepEqual(parseShoppingNotes("3 σε 1 καφές"),[{title:"3 σε 1 καφές",quantity:1}]);
});
test("repeated hand-written notes combine quantities despite casing or accents",()=>{
 assert.deepEqual(parseShoppingNotes("2x Ντομάτες\nντοματες x 3"),[
  {title:"Ντομάτες",quantity:5}
 ]);
 assert.equal(normalizedNoteKey("ΓΆΛΑ"),normalizedNoteKey("γάλα"));
});
test("reject overflow instead of silently truncating the shopping list",()=>{
 assert.throws(()=>parseShoppingNotes("99x Γάλα\nΓάλα"),/QUANTITY_LIMIT/);
 assert.throws(()=>parseShoppingNotes("100x Γάλα"),/INVALID_BATCH/);
 assert.throws(()=>parseShoppingNotes("0x Γάλα"),/INVALID_BATCH/);
});
test("invalid or runaway inputs are refused without partial changes",()=>{
 assert.throws(()=>parseShoppingNotes(" "),/INVALID_BATCH/);
 assert.throws(()=>parseShoppingNotes("Γάλα\n".repeat(41)),/INVALID_BATCH/);
 assert.throws(()=>parseShoppingNotes("α".repeat(2410)),/INVALID_BATCH/);
 assert.throws(()=>parseShoppingNotes("Milk\u0000"),/INVALID_BATCH/);
});
test("titles with their own punctuation and numbers are preserved",()=>{
 assert.deepEqual(parseShoppingNotes("Coca-Cola Zero 1,5L\n2 × Κρέμα SPF 50"),[
  {title:"Coca-Cola Zero 1,5L",quantity:1},
  {title:"Κρέμα SPF 50",quantity:2}
 ]);
});
