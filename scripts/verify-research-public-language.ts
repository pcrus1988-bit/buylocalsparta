import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();

const PUBLIC_RESEARCH_FILES = [
  "apps/web/src/app/research/page.tsx",
  "apps/web/src/components/ResearchStudyDashboard.tsx",
  "apps/web/src/components/ResearchLiveProgress.tsx",
  "apps/web/src/app/research/[slug]/results/page.tsx",
  "apps/web/src/app/research/[slug]/methodology/page.tsx",
  "apps/web/src/app/research/compare/page.tsx",
  "apps/web/src/app/research/market-sentiment/page.tsx",
  "apps/web/src/components/ResearchExternalAnalysis.tsx",
  "apps/web/src/app/research/privacy/page.tsx",
  "apps/web/src/app/research/[slug]/t/[token]/page.tsx",
  "apps/web/src/components/ResearchSurveyForm.tsx",
  "apps/web/src/app/research/greek-retail-2026/page.tsx",
  "apps/web/src/app/research/greek-retail-2026/methodology/page.tsx",
  "apps/web/src/app/research/greek-retail-2026/results/page.tsx"
] as const;

const FORBIDDEN_PUBLIC_TERMS: ReadonlyArray<readonly [string, RegExp]> = [
  ["release", /\breleases?\b/i],
  ["wave", /\bwaves?\b/i],
  ["governed", /\bgoverned\b/i],
  ["evidence", /\bevidence\b/i],
  ["provenance", /\bprovenance\b/i],
  ["dataset hash", /dataset\s+hash/i],
  ["artifact hash", /artifact\s+hash/i],
  ["analysis run", /analysis\s+run/i],
  ["sample draw", /sample\s+draw/i],
  ["fieldwork", /\bfieldwork\b/i],
  ["operational", /\boperational\b/i],
  ["longitudinal", /\blongitudinal\b/i],
  ["comparability", /\bcomparability\b/i],
  ["immutable", /\bimmutable\b/i],
  ["snapshot", /\bsnapshot\b/i],
  ["questionnaire", /\bquestionnaire\b/i],
  ["opaque token", /opaque\s+token/i],
  ["pseudonymous", /\bpseudonymous\b/i],
  ["retention governance", /retention\s+governance/i],
  ["fingerprint", /\bfingerprints?\b/i],
  ["SHA-256", /SHA-?256/],
  ["instrument", /\binstrument\b/i],
  ["unweighted", /\bunweighted\b/i],
  ["weighted base", /weighted\s+base/i],
  ["withheld", /\bwithheld\b/i],
  ["estimate", /\bestimates?\b/i],
  ["weighting", /\bweighting\b/i],
  ["analytical", /\banalytical\b/i],
  ["population", /\bpopulation\b/i],
  ["sample", /\bsample\b/i],
  ["respondent", /\brespondents?\b/i],
  ["protocol", /\bprotocol\b/i],
  ["exploratory", /\bexploratory\b/i],
  ["preregistered", /\bpreregistered\b/i],
  ["confirmatory", /\bconfirmatory\b/i],
  ["machine-readable", /machine[- ]readable/i],
  ["canonical JSON", /canonical\s+JSON/i],
  ["schema", /\bschema\b/i],
  ["runtime", /\bruntime\b/i],
  ["deployment", /\bdeployment\b/i],
  ["readiness", /\breadiness\b/i],
  ["public layer", /public\s+layer/i],
  ["research object", /research\s+object/i],
  ["technical appendix", /technical\s+appendix/i],
  ["API", /\bAPI\b/]
];

type Violation = {
  file: string;
  line: number;
  column: number;
  term: string;
  text: string;
};

function isModuleSpecifier(node: ts.StringLiteralLike): boolean {
  const parent = node.parent;
  return (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) && parent.moduleSpecifier === node;
}

function inspectText(
  file: string,
  source: ts.SourceFile,
  node: ts.Node,
  value: string,
  violations: Violation[]
): void {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return;

  for (const [term, pattern] of FORBIDDEN_PUBLIC_TERMS) {
    pattern.lastIndex = 0;
    if (!pattern.test(normalized)) continue;
    const location = source.getLineAndCharacterOfPosition(node.getStart(source));
    violations.push({
      file,
      line: location.line + 1,
      column: location.character + 1,
      term,
      text: normalized.length > 180 ? normalized.slice(0, 177) + "..." : normalized
    });
  }
}

const violations: Violation[] = [];

for (const relativeFile of PUBLIC_RESEARCH_FILES) {
  const absoluteFile = path.join(ROOT, relativeFile);
  const sourceText = fs.readFileSync(absoluteFile, "utf8");
  const source = ts.createSourceFile(
    relativeFile,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );

  function visit(node: ts.Node): void {
    if (ts.isJsxText(node)) {
      inspectText(relativeFile, source, node, node.getText(source), violations);
    } else if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      !isModuleSpecifier(node)
    ) {
      inspectText(relativeFile, source, node, node.text, violations);
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
}

if (violations.length > 0) {
  console.error("Public Research copy contains internal or technological terminology:");
  for (const violation of violations) {
    console.error(
      `- ${violation.file}:${violation.line}:${violation.column} [${violation.term}] ${JSON.stringify(violation.text)}`
    );
  }
  process.exit(1);
}

console.log("Public Research language guard passed.");
