import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const lib = readFileSync(new URL("./research-live-preview-data.ts", import.meta.url), "utf8");
const publicData = readFileSync(new URL("./research-public-results-data.ts", import.meta.url), "utf8");
const explorer = readFileSync(new URL("../app/research/greek-retail-2026/results/ResearchResultsWorkbench.tsx", import.meta.url), "utf8");
const previewPage = readFileSync(new URL("../app/research/greek-retail-2026/results/Preview/page.tsx", import.meta.url), "utf8");
const previewApi = readFileSync(new URL("../app/api/research/greek-retail-2026/results-preview-live/route.ts", import.meta.url), "utf8");

test("private research preview provides descriptive cells and county counts from n=1", () => {
  assert.match(lib, /const MIN_CELL_N = 1;/);
  assert.match(lib, /const MIN_INTERNAL_PREFECTURE_N = 1;/);
  assert.match(explorer, /const \[minN,setMinN\]=useState\(1\)/);
  assert.match(explorer, /slice\(0,GREECE_PREFECTURES\.length\)/);
});

test("single-respondent research cells require privileged access and remain separate from public release", () => {
  assert.match(previewPage, /rawResearchAnswerAccess\(principal\)/);
  assert.match(previewApi, /rawResearchAnswerAccess\(principal\)/);
  assert.match(publicData, /if\(e\.suppressed \|\|/);
  assert.match(publicData, /e\.unweightedN<30/);
  assert.match(lib, /q\.question_type NOT IN \('text','experiment'\)/);
});
