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
}>;

export type MyDataReportingReconciliation = Readonly<{
  status: "matched" | "drift" | "incomplete";
  complete: boolean;
  localDocuments: number;
  vatMarks: number;
  e3Marks: number;
  matchedVat: number;
  matchedE3: number;
  localMissingInVat: readonly LocalFiscalMarkRecord[];
  localMissingInE3: readonly LocalFiscalMarkRecord[];
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
  const unmatchedVatMarks = [...vatMarks].filter(mark => !localMarks.has(mark)).sort(compareMark);
  const unmatchedE3Marks = [...e3Marks].filter(mark => !localMarks.has(mark)).sort(compareMark);
  const complete = input.vat.complete && input.e3.complete;
  const drift = localMissingInVat.length > 0 || localMissingInE3.length > 0;

  return {
    status: complete ? (drift ? "drift" : "matched") : "incomplete",
    complete,
    localDocuments: localByMark.size,
    vatMarks: vatMarks.size,
    e3Marks: e3Marks.size,
    matchedVat: localByMark.size - localMissingInVat.length,
    matchedE3: localByMark.size - localMissingInE3.length,
    localMissingInVat,
    localMissingInE3,
    unmatchedVatMarks,
    unmatchedE3Marks
  };
}

function uniqueLocalMarks(records: readonly LocalFiscalMarkRecord[]): Map<string, LocalFiscalMarkRecord> {
  const result = new Map<string, LocalFiscalMarkRecord>();
  for (const record of records) {
    const mark = normalizeMark(record.mark, "local AADE MARK");
    if (result.has(mark)) throw new Error(`Duplicate local AADE MARK ${mark}`);
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

function normalizeMark(value: string, label: string): string {
  const mark = value.trim();
  if (!/^\d{1,40}$/.test(mark)) throw new Error(`${label} must be numeric`);
  return mark;
}

function compareMark(left: string, right: string): number {
  if (left.length !== right.length) return left.length - right.length;
  return left.localeCompare(right);
}
