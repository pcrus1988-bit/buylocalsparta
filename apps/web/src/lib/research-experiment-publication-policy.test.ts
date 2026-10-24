import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isPrivateExperimentEstimate, redactPrivateExperimentFromPublicMetadata
} from "./research-experiment-publication-policy.ts";

test("EXP01 choices and effects never qualify as publishable estimates", () => {
  assert.equal(isPrivateExperimentEstimate({
    metric_key:"platform_choice_experiment.amce.commission_pct",
    method:"randomized_profile_amce_clustered_v1"
  }), true);
  assert.equal(isPrivateExperimentEstimate({
    metricKey:"EXP01.choice_share", method:"any"
  }), true);
  assert.equal(isPrivateExperimentEstimate({
    metric_key:"digital_readiness.mean", method:"stratified_srs_fpc_v1"
  }), false);
  assert.equal(isPrivateExperimentEstimate({
    metric_key:"retail_friction.mean", metadata:{label:"Operational friction"}
  }), false);
});

test("the public methodology omits private instrument, plan, diagnostics and notes", () => {
  const source = {
    instrument: { questions: [
      {code:"Q05", promptEl:"Digital capabilities"},
      {code:"EXP01",type:"experiment",config:{monthly_fee_eur:[0,29,69,129]}}
    ]},
    analysisPlan: {
      plan: {questionMeasures:[
        {questionCode:"Q05", metricKeys:["digital_readiness.mean"]},
        {questionCode:"EXP01", metricKeys:["platform_choice_experiment.amce"]}
      ]}
    },
    analysis: {varianceMethod:"stratified_srs_fpc_v1",experimentDiagnostics:{completed:200}},
    disclosure:{randomizedExperimentExploratoryPublished:true,smallBaseSuppression:true},
    limitations:["Normal survey limitations","EXP01 was analyzed as exploratory experiment"],
    publicOther:{retailReadiness:"normal data"}
  };
  const output = redactPrivateExperimentFromPublicMetadata(source);
  const serialized = JSON.stringify(output);
  assert.doesNotMatch(serialized,/EXP01|experiment|amce|platform.choice/i);
  assert.equal((output.instrument as {questions:unknown[]}).questions.length,1);
  assert.equal((output.analysisPlan as {plan:{questionMeasures:unknown[]}}).plan.questionMeasures.length,1);
  assert.equal((output.analysis as Record<string,unknown>).varianceMethod,"stratified_srs_fpc_v1");
  assert.equal((output.disclosure as Record<string,unknown>).smallBaseSuppression,true);
  assert.deepEqual((output.limitations as string[]),["Normal survey limitations"]);
  assert.equal((source.instrument.questions).length,2,"internal evidence remains unchanged");
});

test("release builder, checker and public reader all exclude EXP01", () => {
  const release = readFileSync(new URL("./research-survey-release.ts", import.meta.url),"utf8");
  assert.match(release,/const methodology = redactPrivateExperimentFromPublicMetadata/);
  assert.equal(
    release.match(/estimatesResult\.rows\.filter\(\((?:row|estimate)\) => !isPrivateExperimentEstimate/g)?.length,3
  );
  assert.match(release,/methodology: redactPrivateExperimentFromPublicMetadata\(objectValue\(release\.methodology_json\)\)/);
  assert.match(release,/methodology: redactPrivateExperimentFromPublicMetadata\(objectValue\(row\.methodology_json\)\)/);
});
