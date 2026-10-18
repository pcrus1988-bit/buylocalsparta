import assert from "node:assert/strict";
import test from "node:test";
import { participationHeatField } from "./research-participation-density.ts";
const points = [
  { postcode: "23100", region: "PELOPONNESE", latitude: 37.0803, longitude: 22.4047 },
  { postcode: "24100", region: "PELOPONNESE", latitude: 37.0588, longitude: 22.1034 }
];
test("uses every matched start, including singleton postal areas, without exposing point records", () => {
  const field = participationHeatField([{postcode:"231 00",prefecture:"ΛΑΚΩΝΙΑΣ",started:1},{postcode:"24100",prefecture:"ΜΕΣΣΗΝΙΑΣ",started:2},{postcode:"99999",prefecture:"ΑΤΤΙΚΗΣ",started:4}], points);
  assert.equal(field.mapped, 3); assert.equal(field.unmatched, 4);
  assert.equal(field.pixels.length, field.width * field.height * 4);
  assert.ok(field.pixels.some((value,index)=>index % 4 === 3 && value > 0));
  assert.deepEqual(Object.keys(field).sort(), ['height','mapped','pixels','unmatched','width']);
});
test("keeps reference coordinate precision in the rendered field", () => {
  const rows=[{postcode:"23100",prefecture:"ΛΑΚΩΝΙΑΣ",started:1}];
  const exact=participationHeatField(rows,points);
  const rounded=participationHeatField(rows,[{...points[0],latitude:37.08,longitude:22.40}]);
  assert.notDeepEqual(exact.pixels, rounded.pixels);
});
test("rejects missing, invalid and region-conflicting postcodes and produces an empty transparent field", () => {
  const field=participationHeatField([{postcode:"23100",prefecture:"ΑΤΤΙΚΗΣ",started:3},{postcode:"231",prefecture:"ΛΑΚΩΝΙΑΣ",started:2}],points);
  assert.equal(field.mapped,0);assert.equal(field.unmatched,5);
  assert.ok(field.pixels.every((value,index)=>index % 4 !== 3 || value===0));
});
