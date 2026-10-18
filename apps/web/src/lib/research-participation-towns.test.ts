import assert from "node:assert/strict";
import test from "node:test";
import { participationTowns } from "./research-participation-towns.ts";
const points = [
  { postcode: "23100", town: "Σπάρτη", region: "PELOPONNESE", latitude: 37.073, longitude: 22.43 },
  { postcode: "23101", town: "Σπάρτη", region: "PELOPONNESE", latitude: 37.074, longitude: 22.44 },
  { postcode: "24100", town: "Καλαμάτα", region: "PELOPONNESE", latitude: 37.04, longitude: 22.11 }
];
test("combines postcodes into town totals and preserves every start in coverage", () => {
  const result = participationTowns([
    { postcode: "231 00", prefecture: "ΛΑΚΩΝΙΑΣ", started: 2 },
    { postcode: "23101", prefecture: "ΛΑΚΩΝΙΑΣ", started: 3 },
    { postcode: "24100", prefecture: "ΜΕΣΣΗΝΙΑΣ", started: 2 },
    { postcode: "99999", prefecture: "ΛΑΚΩΝΙΑΣ", started: 4 }
  ], points);
  assert.equal(result.towns.length, 1);
  assert.equal(result.towns[0].started, 5);
  assert.equal(result.withheld, 2);
  assert.equal(result.unmatched, 4);
  assert.equal(result.towns[0].longitude, 22.44);
  assert.ok(!JSON.stringify(result.towns).includes('23100'));
});
test("does not invent coordinates for invalid, missing or conflicting postcode geography", () => {
  assert.equal(participationTowns([
    {postcode:"23100",prefecture:"ΑΤΤΙΚΗΣ",started:3},
    {postcode:"231",prefecture:"ΛΑΚΩΝΙΑΣ",started:3},
    {postcode:"23100",prefecture:"",started:3}
  ], points).unmatched, 9);
});
test("keeps separate places with identical names apart", () => {
  const reference=[...points,{postcode:"23200",town:"Σπάρτη",region:"PELOPONNESE",latitude:36.5,longitude:23}];
  const result=participationTowns([{postcode:"23100",prefecture:"ΛΑΚΩΝΙΑΣ",started:3},{postcode:"23200",prefecture:"ΛΑΚΩΝΙΑΣ",started:3}],reference);
  assert.equal(result.towns.length,2);
});
