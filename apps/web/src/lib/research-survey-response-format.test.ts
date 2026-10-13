import assert from "node:assert/strict";
import test from "node:test";
import { researchCsvCell, readableResearchAnswer } from "./research-survey-response-format.ts";

test("single and multiple-choice answers use instrument labels", () => {
  const config = { options: [["yes", "Ναι"], ["no", "Όχι"]] };
  assert.equal(readableResearchAnswer("yes", config), "Ναι");
  assert.equal(readableResearchAnswer(["yes", "no"], config), "Ναι, Όχι");
  assert.equal(readableResearchAnswer(3, config), "3");
});

test("matrix answers use configured item and scale labels", () => {
  const config = { items: [["cost", "Cost"]], scale: [["high", "High"]] };
  assert.equal(readableResearchAnswer({ cost: "high" }, config), "Cost: High");
  assert.equal(readableResearchAnswer(null, config), "—");
});

test("CSV quoting escapes formulas and embedded quotes", () => {
  assert.equal(researchCsvCell('Hello "world"'), '"Hello ""world"""');
  assert.equal(researchCsvCell("=HYPERLINK(1)"), "\"'=HYPERLINK(1)\"");
  assert.equal(researchCsvCell(" \t=1+1"), "\"' \t=1+1\"");
  assert.equal(researchCsvCell("+SUM(1,2)"), "\"'+SUM(1,2)\"");
  assert.equal(researchCsvCell("ordinary"), '"ordinary"');
});
