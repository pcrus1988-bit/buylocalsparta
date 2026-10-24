import test from "node:test";
import assert from "node:assert/strict";
import { validateResearchDataAccessInquiry, ResearchDataAccessInputError } from "./research-data-access-request.ts";

test("validates and normalizes a public data access inquiry", () => {
  const validated = validateResearchDataAccessInquiry({
    email: " Researcher@Example.ORG ",
    message: "  Θα ήθελα ανωνυμοποιημένα δεδομένα για ακαδημαϊκή ανάλυση. ",
    acceptProcessing: true
  });
  assert.equal(validated.email, "researcher@example.org");
  assert.match(validated.message, /ακαδημαϊκή/);
});

test("rejects absent consent, short message and header-injection email", () => {
  for (const input of [
    { email: "ok@example.org", message: "A properly lengthy message here", acceptProcessing: false },
    { email: "ok@example.org", message: "too short", acceptProcessing: true },
    { email: "ok@example.org\nBcc:attacker@example.org", message: "A properly lengthy message here", acceptProcessing: true }
  ]) {
    assert.throws(() => validateResearchDataAccessInquiry(input), ResearchDataAccessInputError);
  }
});
