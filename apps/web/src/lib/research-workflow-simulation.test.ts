import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createSimulationInvitation, createSimulationReceipt, readSimulationToken,
  SIMULATION_TTL_MS, validSimulationEmail
} from "./research-workflow-simulation.ts";

const env = { BLS_AUTH_SECRET: "sim-test-secret-0123456789-abcdefghijklmnopqrstuvwxyz", NODE_ENV: "test" };
const at = 1_800_000_000_000;
const answers = { business: "Βιβλιοπωλείο", online: "yes", priority: "Ενημέρωση πελατών" };

test("rehearsal links are encrypted, time bounded, and scoped to the intended study", () => {
  const issued = createSimulationInvitation("greek-retail-2026", "tester@example.com", at, env);
  assert.equal(issued.expiresAt, at + SIMULATION_TTL_MS);
  assert.ok(!issued.token.includes("tester@example.com"));
  const decoded = readSimulationToken(issued.token, "invitation", at + 1, env);
  assert.equal(decoded.recipient, "tester@example.com");
  assert.equal(decoded.slug, "greek-retail-2026");
  assert.equal(decoded.runId, issued.runId);
  assert.throws(() => readSimulationToken(issued.token, "invitation", issued.expiresAt + 1, env));
  assert.throws(() => readSimulationToken(issued.token, "receipt", at + 1, env));
});

test("altering a token invalidates the AES-GCM authentication tag", () => {
  const { token } = createSimulationInvitation("greek-retail-2026", "test@example.com", at, env);
  const chars = [...token];
  const index = Math.floor(chars.length / 2);
  chars[index] = chars[index] === "A" ? "B" : "A";
  assert.throws(() => readSimulationToken(chars.join(""), "invitation", at, env));
});

test("sample submission validates required answers and returns an encrypted receipt", () => {
  const { token } = createSimulationInvitation("greek-retail-2026", "test@example.com", at, env);
  const invitation = readSimulationToken(token, "invitation", at, env);
  const receiptToken = createSimulationReceipt(invitation, answers, at + 500, env);
  assert.ok(!receiptToken.includes("Βιβλιοπωλείο"));
  const receipt = readSimulationToken(receiptToken, "receipt", at + 501, env);
  assert.equal(receipt.runId, invitation.runId);
  assert.equal(receipt.answersCount, 3);
  assert.match(receipt.answerHash, /^[a-f0-9]{64}$/);
  assert.throws(() => createSimulationReceipt(invitation, { ...answers, priority: "" }, at, env));
  assert.throws(() => createSimulationReceipt(invitation, { ...answers, extra: "unexpected" }, at, env));
});

test("simulation never accepts bulk recipient strings or newline-injected emails", () => {
  assert.equal(validSimulationEmail("test@example.com"), true);
  assert.equal(validSimulationEmail("one@example.com,two@example.com"), false);
  assert.equal(validSimulationEmail("test@example.com\nBcc:other@example.com"), false);
  assert.throws(() => createSimulationInvitation("bad slug", "test@example.com", at, env));
});
