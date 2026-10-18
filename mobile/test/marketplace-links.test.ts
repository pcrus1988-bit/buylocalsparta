import assert from "node:assert/strict";
import test from "node:test";
import {marketplaceUrl} from "../src/lib/marketplace-links.ts";

test("first party browse and checkout routes are canonical HTTPS",()=>{
 assert.equal(marketplaceUrl({path:"/cart"}),"https://kontamou.site/cart");
 assert.equal(marketplaceUrl({path:"/shops",query:{q:"μαγαζί"}}),
   "https://kontamou.site/shops?q=%CE%BC%CE%B1%CE%B3%CE%B1%CE%B6%CE%AF");
 assert.equal(marketplaceUrl({path:"/product/05f782e0-cad3-4266-a542-44cd6a8292c7"}),
   "https://kontamou.site/product/05f782e0-cad3-4266-a542-44cd6a8292c7");
 assert.equal(marketplaceUrl({path:"/product/cv_55467684072d4bd19f6d"}),
   "https://kontamou.site/product/cv_55467684072d4bd19f6d");
 assert.equal(marketplaceUrl({path:"/product/brown-calf-leather-platform-shoes"}),
   "https://kontamou.site/product/brown-calf-leather-platform-shoes");
});
test("customer order detail handoff accepts only a first-party validated path",()=>{
 assert.equal(marketplaceUrl({path:"/account/orders/ord_10027"}),
  "https://kontamou.site/account/orders/ord_10027");
 for(const path of ["/account/orders/../../admin","/account/orders/ord_123%2Fadmin",
  "/account/orders/a?redirect=evil","/account/orders/too.short","/account/orders//evil.com"]){
  assert.throws(()=>marketplaceUrl({path}));
 }
});
test("reject external hosts, arbitrary paths, route traversal and malformed query",()=>{
 for(const path of ["//evil.example/shop","https://evil.example/shop","/admin",
   "/product/../../checkout","/product/%2f%2fhost","/vendor/private"]){
  assert.throws(()=>marketplaceUrl({path}));
 }
 assert.throws(()=>marketplaceUrl({path:"/shop",query:{redirect:"https://evil.example"}}));
 assert.throws(()=>marketplaceUrl({path:"/shops",query:{q:"broken\u0000query"}}));
 assert.throws(()=>marketplaceUrl({path:"/shop",query:{q:"x".repeat(121)}}));
});

test("nine Color Studios can hand off selected HEX into private first-party photo picker",()=>{
 const url=marketplaceUrl({path:"/color-finder",query:{
  category:"studio-nails",color:"#C79C88"
 }});
 assert.equal(url,"https://kontamou.site/color-finder?category=studio-nails&color=%23C79C88");
 for(const query of [
  {category:"unknown",color:"#C79C88"},
  {category:"studio-nails",color:"#FFF"},
  {category:"studio-nails",color:"#000000&returnTo=//evil.example"}
 ])assert.throws(()=>marketplaceUrl({path:"/color-finder",query}));
});
