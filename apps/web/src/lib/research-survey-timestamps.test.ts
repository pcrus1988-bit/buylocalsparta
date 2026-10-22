import assert from "node:assert/strict";
import test from "node:test";
import { formatResearchAthensDateTime, optionalResearchText } from "./research-survey-timestamps.ts";

test("PostgreSQL timestamptz Date values survive Research admin serialization", () => {
  assert.equal(optionalResearchText(new Date("2026-10-08T14:19:57.707Z")), "2026-10-08T14:19:57.707Z");
  assert.equal(optionalResearchText(new Date("2026-10-30T16:00:00Z")), "2026-10-30T16:00:00.000Z");
  assert.equal(optionalResearchText(" 2026-10-30T16:00:00Z "), "2026-10-30T16:00:00Z");
});

test("Research timestamps are always displayed in Athens, including DST changes", () => {
  assert.match(formatResearchAthensDateTime(optionalResearchText(new Date("2026-10-08T14:19:57Z"))), /17:19/);
  assert.match(formatResearchAthensDateTime(optionalResearchText(new Date("2026-10-30T16:00:00Z"))), /18:00/);
  assert.match(formatResearchAthensDateTime("2026-07-12T12:00:00.000Z"), /15:00/);
});

test("invalid timestamps and non-text values are not presented as dates", () => {
  assert.equal(optionalResearchText(undefined), undefined);
  assert.equal(optionalResearchText(null), undefined);
  assert.equal(optionalResearchText(new Date("invalid")), undefined);
  assert.equal(optionalResearchText("  "), undefined);
  assert.equal(optionalResearchText(1234), undefined);
  assert.equal(formatResearchAthensDateTime(undefined), undefined);
  assert.equal(formatResearchAthensDateTime("invalid"), undefined);
});
