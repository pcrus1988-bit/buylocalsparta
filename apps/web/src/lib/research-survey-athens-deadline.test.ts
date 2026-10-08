import assert from "node:assert/strict";
import test from "node:test";
import { athensDeadlineInputToIso, isoToAthensDeadlineInput } from "./research-survey-athens-deadline.ts";

test("survey deadline is interpreted in Athens rather than the browser timezone", () => {
  assert.equal(athensDeadlineInputToIso("2026-10-30T18:00"), "2026-10-30T16:00:00.000Z");
  assert.equal(isoToAthensDeadlineInput("2026-10-30T16:00:00.000Z"), "2026-10-30T18:00");
});

test("summer deadline uses Athens daylight saving time", () => {
  assert.equal(athensDeadlineInputToIso("2026-07-12T15:00"), "2026-07-12T12:00:00.000Z");
});

test("nonexistent and ambiguous daylight-saving hours are rejected", () => {
  assert.throws(() => athensDeadlineInputToIso("2026-03-29T03:30"), /AMBIGUOUS_OR_NONEXISTENT/);
  assert.throws(() => athensDeadlineInputToIso("2026-10-25T03:30"), /AMBIGUOUS_OR_NONEXISTENT/);
});

test("malformed dates cannot be silently shifted to another day", () => {
  assert.throws(() => athensDeadlineInputToIso("2026-02-30T18:00"), /AMBIGUOUS_OR_NONEXISTENT/);
  assert.throws(() => athensDeadlineInputToIso("2026-10-30 18:00"), /DEADLINE_INVALID/);
});
