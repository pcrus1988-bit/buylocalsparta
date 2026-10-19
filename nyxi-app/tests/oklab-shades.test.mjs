import test from "node:test";
import assert from "node:assert/strict";
import { rgbFromHex, oklabFromRgb, oklabDistance, closestIllustrativeShades } from "../lib/nyxi-color.ts";

const near = (actual, expected, epsilon = 0.0001) =>
  assert.ok(Math.abs(actual - expected) < epsilon, `Expected ${actual} close to ${expected}`);

test("OKLab follows reference D65 red and blue values", () => {
  const red = oklabFromRgb({r:255,g:0,b:0});
  near(red[0],0.627955); near(red[1],0.224863); near(red[2],0.125846);
  const blue = oklabFromRgb({r:0,g:0,b:255});
  near(blue[0],0.452014); near(blue[1],-0.032457); near(blue[2],-0.311528);
});

test("same color has zero distance; symmetry holds", () => {
  const a = oklabFromRgb(rgbFromHex("#563F3B"));
  const b = oklabFromRgb(rgbFromHex("#EF796B"));
  near(oklabDistance(a,a),0,1e-12);
  near(oklabDistance(a,b),oklabDistance(b,a),1e-12);
});

test("nearest known shade comes first and limit is respected", () => {
  const shades = [{name:"blue",hex:"#0033CC"}, {name:"red",hex:"#EE0000"}, {name:"green",hex:"#00DD00"}];
  const ranked = closestIllustrativeShades({r:238,g:0,b:0}, shades,2);
  assert.equal(ranked.length,2);
  assert.equal(ranked[0].name,"red");
  assert.ok(ranked[0].distance <= ranked[1].distance);
});

test("malformed HEX values are rejected rather than treated as products", () => {
  assert.throws(() => rgbFromHex("cherry"),/invalid_hex_color/);
  assert.throws(() => rgbFromHex("#abc"),/invalid_hex_color/);
});

test("out-of-range device samples remain finite", () => {
  assert.ok(oklabFromRgb({r:Infinity,g:-7,b:520}).every(Number.isFinite));
});

test("empty palette stays empty; no phantom product suggestion", () => {
  assert.deepEqual(closestIllustrativeShades({r:150,g:20,b:90},[]),[]);
});
