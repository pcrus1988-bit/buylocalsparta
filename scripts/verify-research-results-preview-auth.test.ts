import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  createResearchPreviewTicket, RESEARCH_PREVIEW_EMAIL,
  RESEARCH_PREVIEW_TTL_MS, researchPreviewConfigured,
  validResearchPreviewCredentials, validResearchPreviewTicket
} from "../apps/web/src/lib/research-preview-access.ts";

test("dedicated preview account is credentialed, scoped and revoked on rotation", () => {
  const beforePassword = process.env.BLS_RESEARCH_RESULTS_PREVIEW_PASSWORD;
  const beforeSecret = process.env.BLS_AUTH_SECRET;
  try {
    process.env.BLS_AUTH_SECRET = "local-preview-test-secret-longer-than-32-chars";
    process.env.BLS_RESEARCH_RESULTS_PREVIEW_PASSWORD = "test-preview-pass-123!";
    assert.equal(researchPreviewConfigured(), true);
    assert.equal(validResearchPreviewCredentials(RESEARCH_PREVIEW_EMAIL, "test-preview-pass-123!"), true);
    assert.equal(validResearchPreviewCredentials("ADMIN@DEMO.LOCAL", "test-preview-pass-123!"), false);
    assert.equal(validResearchPreviewCredentials(RESEARCH_PREVIEW_EMAIL, "wrong"), false);
    const now = 1_800_000_000_000;
    const ticket = createResearchPreviewTicket(now);
    assert.equal(validResearchPreviewTicket(ticket.token, now), true);
    assert.equal(validResearchPreviewTicket(ticket.token, now + RESEARCH_PREVIEW_TTL_MS), false);
    assert.equal(validResearchPreviewTicket(ticket.token + ".forgery", now), false);
    const parts = ticket.token.split(".");
    assert.equal(validResearchPreviewTicket(parts[0].slice(0, -2) + "aa." + parts[1], now), false);
    process.env.BLS_RESEARCH_RESULTS_PREVIEW_PASSWORD = "rotated-preview-pass-123!";
    assert.equal(validResearchPreviewTicket(ticket.token, now), false);
    delete process.env.BLS_RESEARCH_RESULTS_PREVIEW_PASSWORD;
    assert.equal(researchPreviewConfigured(), false);
    assert.equal(validResearchPreviewCredentials(RESEARCH_PREVIEW_EMAIL, "test-preview-pass-123!"), false);
  } finally {
    if (beforePassword === undefined) delete process.env.BLS_RESEARCH_RESULTS_PREVIEW_PASSWORD;
    else process.env.BLS_RESEARCH_RESULTS_PREVIEW_PASSWORD = beforePassword;
    if (beforeSecret === undefined) delete process.env.BLS_AUTH_SECRET;
    else process.env.BLS_AUTH_SECRET = beforeSecret;
  }
});
