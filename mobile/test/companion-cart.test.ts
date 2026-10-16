import assert from "node:assert/strict";
import {test} from "node:test";
import {cartItemsAfterChange,nextCartQuantity} from "../src/lib/companion-cart-rules.ts";
import type {NativeCartItem} from "../src/lib/companion-cart.ts";
const a="c61f2b2a-1397-47b8-8e63-d82cbed75abe";
const b="cv_12345678";
const data:NativeCartItem[]=[
 {canonicalVariantId:a,title:"A",quantity:2,priceMinor:100,available:true},
 {canonicalVariantId:b,title:"B",quantity:1,priceMinor:200,available:false}
];
test("cart changes preserve other products and never silently cap quantities",()=>{
 assert.deepEqual(cartItemsAfterChange(data,a,3),[{canonicalVariantId:b,quantity:1},{canonicalVariantId:a,quantity:3}]);
 assert.deepEqual(cartItemsAfterChange(data,a,0),[{canonicalVariantId:b,quantity:1}]);
 assert.equal(nextCartQuantity(data,a,1),3);
 assert.equal(nextCartQuantity(data,b,-1),0);
 assert.throws(()=>nextCartQuantity(data,a,98));
 assert.throws(()=>cartItemsAfterChange(data,a,100));
 assert.equal(data[0].quantity,2);
});
test("invalid public IDs and negative quantity never enter the cart",()=>{
 for(const id of ["","anything","../admin","https://evil.test","cv_short"]){
  assert.throws(()=>cartItemsAfterChange(data,id,1));
 }
 assert.throws(()=>cartItemsAfterChange(data,a,-1));
});
