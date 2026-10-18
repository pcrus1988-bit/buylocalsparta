import assert from "node:assert/strict";
import {test} from "node:test";
import {
 COLOR_STUDIOS,COLOR_PRESETS,studioForKey,hexToHsv,hsvToHex,
 normalizeColorHex,tuneColor
} from "../src/lib/color-studios.ts";
test("native Color Studios include all nine exact web catalogue categories",()=>{
 assert.deepEqual(COLOR_STUDIOS.map(x=>x.categoryCode),[
  "studio-nails","studio-lips","studio-eye-makeup","studio-makeup",
  "studio-hair-color","studio-shoes","studio-bags","studio-fashion","studio-home"
 ]);
 assert.equal(new Set(COLOR_STUDIOS.map(x=>x.key)).size,9);
 for(const s of COLOR_STUDIOS){
  assert.deepEqual(studioForKey(s.key),s);
  assert.match(s.defaultHex,/^#[0-9A-F]{6}$/);
 }
 assert.equal(studioForKey("fake"),undefined);
});
test("shade picker recognizes only six-digit HEX and does not pass unsafe query values",()=>{
 assert.equal(normalizeColorHex(" #aaBBcc "),"#AABBCC");
 for(const bad of ["red","#FFF","#GG1111","1;DROP TABLE","#123456?x=1","",null])
  assert.equal(normalizeColorHex(bad),null);
 for(const p of COLOR_PRESETS)assert.equal(normalizeColorHex(p.hex),p.hex);
});
test("HSV conversion retains canonical swatch colors within rounding tolerance",()=>{
 for(const color of ["#FFFFFF","#000000","#FF0000","#00FF00","#0000FF","#7A2538","#C79C88","#19191B"]){
  const result=hsvToHex(hexToHsv(color));
  for(let i=1;i<=5;i+=2){
   assert.ok(Math.abs(parseInt(result.slice(i,i+2),16)-parseInt(color.slice(i,i+2),16))<=1,
    color+" -> "+result);
  }
 }
});
test("fine tuning clamps saturation and brightness and wraps hue",()=>{
 const input="#B52E2E";
 assert.notEqual(tuneColor(input,"h",10),input);
 assert.equal(hexToHsv(tuneColor(input,"v",-360)).v,0);
 assert.equal(Math.round(hexToHsv(tuneColor(input,"s",360)).s),100);
 assert.equal(tuneColor(input,"h",360),hsvToHex(hexToHsv(input)));
 assert.throws(()=>tuneColor(input,"h",999));
 assert.throws(()=>hexToHsv("blue"));
});
