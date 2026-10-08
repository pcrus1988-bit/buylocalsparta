import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertResearchSimulationEmailReady,
  assertResearchSurveyEmailReady,
  researchSurveyEmailConfiguration
} from "./research-survey-mail.ts";

const sesTestEnv = {
  BLS_MAIL_AWS_REGION: "eu-north-1",
  BLS_MAIL_AWS_ACCESS_KEY_ID: "AKIA0123456789ABCD12",
  BLS_MAIL_AWS_SECRET_ACCESS_KEY: "dummy-for-unit-test-only"
};

test("Research uses its own sender and reply mailbox by default", () => {
  const config = researchSurveyEmailConfiguration({});
  assert.equal(config.from, "research@kontamou.site");
  assert.equal(config.replyTo, "research@kontamou.site");
  assert.equal(config.enabled, false);
});

test("SES simulation is independently gated from live survey delivery", () => {
  assert.throws(
    () => assertResearchSimulationEmailReady({ ...sesTestEnv }),
    /RESEARCH_SIMULATION_EMAIL_DISABLED/
  );
  const config = assertResearchSimulationEmailReady({
    ...sesTestEnv, BLS_RESEARCH_SIMULATION_EMAIL_ENABLED: "true"
  });
  assert.equal(config.enabled, false);
  assert.equal(config.configurationSetName, undefined);
  assert.throws(
    () => assertResearchSurveyEmailReady({
      ...sesTestEnv, BLS_RESEARCH_SIMULATION_EMAIL_ENABLED: "true"
    }),
    /RESEARCH_EMAIL_DELIVERY_DISABLED/
  );
});

test("A live send needs both explicit enablement and SES event configuration", () => {
  assert.throws(
    () => assertResearchSurveyEmailReady({
      ...sesTestEnv, BLS_RESEARCH_EMAIL_DELIVERY_ENABLED: "true"
    }),
    /BLS_RESEARCH_SES_CONFIGURATION_SET/
  );
  assert.equal(assertResearchSurveyEmailReady({
    ...sesTestEnv,
    BLS_RESEARCH_EMAIL_DELIVERY_ENABLED: "true",
    BLS_RESEARCH_SES_CONFIGURATION_SET: "research-events"
  }).configurationSetName, "research-events");
});

test("Simulation refuses to send without server-only SES credentials", () => {
  assert.throws(
    () => assertResearchSimulationEmailReady({
      BLS_RESEARCH_SIMULATION_EMAIL_ENABLED: "true"
    }),
    /SES mail/
  );
});
