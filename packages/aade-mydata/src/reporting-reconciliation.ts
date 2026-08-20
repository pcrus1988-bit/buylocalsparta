import type {
  MyDataE3InfoRecord,
  MyDataReportingCollection,
  MyDataVatInfoRecord
} from "./reporting.ts";

export type LocalFiscalMarkRecord = Readonly<{
  id: string;
  mark: string;
  issueDate?: string;
  invoiceTypeCode?: string;
  documentNumber?: string;
  incomeCategory?: string;
  e3Code?: string;
  classificationValueMinor?: number;
}>;

export type E3ClassificationMismatch = Readonly<{
  local: LocalFiscalMarkRecord;
  expected: Readonly<{ incomeCategory: string; e3Code: string; valueMinor: number }>;
  actual: readonly Readonly<{ incomeCategory?: string; e3Code?: string; valueMinor?: number }>[];
  reason: "expected_classification_missing" | "classification_value_missing" | "classification_value_mismatch";
}>;

export type MyDataReportingReconciliation = Readonly<{
  status: "matched" | "drift" | "incomplete";
  complete: boolean;
  localDocuments: number;
  vatMarks: number;
  e3Marks: number;
  matchedVat: number;
  matchedE3: number;
  e3ClassificationChecked: number;
  localMissingInVat: readonly LocalFiscalMarkRecord[];
  localMissingInE3: readonly LocalFiscalMarkRecord[];
  localWithoutE3Expectation: readonly LocalFiscalMarkRecord[];
  e3ClassificationMismatches: readonly E3ClassificationMismatch[];
  unmatchedVatMarks: readonly string[];
  unmatchedE3Marks: readonly string[];
}>;

export function reconcileMyDataReporting(input: Readonly<{
  local: readonly LocalFiscalMarkRecord[];
  vat: MyDataReportingCollection<MyDataVatInfoRecord>;
  e3: MyDataReportingCollection<MyDataE3InfoRecord>;
}>): MyDataReportingReconciliation {
  const localByMark = uniqueLocalMarks(input.local);
  const localMarks = new Set(localByMark.keys());
  const vatMarks = uniqueRemoteMarks(input.vat.records.map(record => record.mark));
  const e3Marks = uniqueRemoteMarks(input.e3.records.map(record => record.mark));
  const localMissingInVat = [...localByMark.entries()]
    .filter(([mark]) => !vatMarks.has(mark))
    .map(([,record]) => record);
  const localMissingInE3 = [...localByMark.entries()]
    .filter(([mark]) => !e3Marks.has(mark))
    .map(([,record]) => record);
  const localWithoutE3Expectation = [...localByMark.values()].filter(record => !e3Expectation(record));
  const e3ByMark = groupE3RecordsByMark(input.e3.records);
  const e3ClassificationMismatches: E3ClassificationMismatch[] = [];
  let e3ClassificationChecked = 0;
  for (const [mark, local] of localByMark) {
    const expected = e3Expectation(local);
    if (!expected || !e3Marks.has(mark)) continue;
    e3ClassificationChecked += 1;
    const actualRecords = e3ByMark.get(mark) ?? [];
    const matching = actualRecords.filter(record =>
      record.classificationCategory?.trim() === expected.incomeCategory
      && record.classificationType?.trim() === expected.e3Code
    );
    const actual = actualRecords.map(record => ({
      incomeCategory: normalizedOptional(record.classificationCategory),
      e3Code: normalizedOptional(record.classificationType),
      valueMinor: classificationMinor(record.classificationValue)
    }));
    if (matching.length === 0) {
      e3ClassificationMismatches.push({ local, expected, actual, reason: "expected_classification_missing" });
      continue;
    }
    const matchingValues = matching.map(record => classificationMinor(record.classificationValue));
    if (matchingValues.some(value => value === undefined)) {
      e3ClassificationMismatches.push({ local, expected, actual, reason: "classification_value_missing" });
      continue;
    }
    const actualValueMinor = (matchingValues as number[]).reduce((sum, value) => sum + value, 0);
    if (actualValueMinor !== expected.valueMinor) {
      e3ClassificationMismatches.push({ local, expected, actual, reason: "classification_value_mismatch" });
    }
  }
  const unmatchedVatMarks = [...vatMarks].filter(mark => !localMarks.has(mark)).sort(compareMark);
  const unmatchedE3Marks = [...e3Marks].filter(mark => !localMarks.has(mark)).sort(compareMark);
  const remoteComplete = input.vat.complete && input.e3.complete;
  const localExpectationComplete = localWithoutE3Expectation.length === 0;
  const complete = remoteComplete && localExpectationComplete;
  const drift = localMissingInVat.length > 0 || localMissingInE3.length > 0 || e3ClassificationMismatches.length > 0;

  return {
    status: complete ? (drift ? "drift" : "matched") : "incomplete",
    complete,
    localDocuments: localByMark.size,
    vatMarks: vatMarks.size,
    e3Marks: e3Marks.size,
    matchedVat: localByMark.size - localMissingInVat.length,
    matchedE3: localByMark.size - localMissingInE3.length,
    e3ClassificationChecked,
    localMissingInVat,
    localMissingInE3,
    localWithoutE3Expectation,
    e3ClassificationMismatches,
    unmatchedVatMarks,
    unmatchedE3Marks
  };
}

function uniqueLocalMarks(records: readonly LocalFiscalMarkRecord[]): Map<string, LocalFiscalMarkRecord> {
  const result = new Map<string, LocalFiscalMarkRecord>();
  for (const record of records) {
    const mark = normalizeMark(record.mark, "local AADE MARK");
    if (result.has(mark)) throw new Error(`Duplicate local AADE MARK ${mark}`);
    if (record.classificationValueMinor !== undefined && (!Number.isSafeInteger(record.classificationValueMinor) || record.classificationValueMinor < 0)) {
      throw new Error(`Local E3 classification value for MARK ${mark} must be a non-negative integer minor-unit value`);
    }
    result.set(mark, { ...record, mark });
  }
  return result;
}

function uniqueRemoteMarks(values: readonly (string | undefined)[]): Set<string> {
  const result = new Set<string>();
  for (const value of values) {
    if (!value?.trim()) continue;
    result.add(normalizeMark(value, "AADE reporting MARK"));
  }
  return result;
}

function groupE3RecordsByMark(records: readonly MyDataE3InfoRecord[]): Map<string, MyDataE3InfoRecord[]> {
  const grouped = new Map<string, MyDataE3InfoRecord[]>();
  for (const record of records) {
    if (!record.mark?.trim()) continue;
    const mark = normalizeMark(record.mark, "AADE reporting MARK");
    const existing = grouped.get(mark);
    if (existing) existing.push(record);
    else grouped.set(mark, [record]);
  }
  return grouped;
}

function e3Expectation(record: LocalFiscalMarkRecord): { incomeCategory: string; e3Code: string; valueMinor: number } | undefined {
  const incomeCategory = normalizedOptional(record.incomeCategory);
  const e3Code = normalizedOptional(record.e3Code);
  const valueMinor = record.classificationValueMinor;
  if (!incomeCategory || !e3Code || valueMinor === undefined) return undefined;
  return { incomeCategory, e3Code, valueMinor };
}

function classificationMinor(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  const minor = Math.round(value * 100);
  return Number.isSafeInteger(minor) ? minor : undefined;
}

function normalizedOptional(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function normalizeMark(value: string, label: string): string {
  const mark = value.trim();
  if (!/^\d{1,40}$/.test(mark)) throw new Error(`${label} must be numeric`);
  return mark;
}

function compareMark(left: string, right: string): number {
  if (left.length !== right.length) return left.length - right.length;
  return left.localeCompare(right);
}
