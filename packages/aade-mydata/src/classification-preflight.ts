import {
  isAadeExpenseClassificationCategory,
  isAadeIncomeClassificationCategory
} from "./catalog.ts";
import { childElements, childText, descendants, parseXmlDocument, type XmlElement } from "./xml.ts";

export type MyDataClassificationIssue = Readonly<{
  code: string;
  path: string;
  message: string;
  severity: "error" | "warning";
}>;

export type MyDataClassificationReport = Readonly<{
  ok: boolean;
  classifiedInvoiceCount: number;
  issues: readonly MyDataClassificationIssue[];
}>;

export class MyDataClassificationPreflightError extends Error {
  readonly report: MyDataClassificationReport;
  constructor(report: MyDataClassificationReport) {
    super(`AADE myDATA classification preflight failed: ${report.issues.filter(issue => issue.severity === "error").map(issue => `${issue.path} ${issue.message}`).join(" | ")}`);
    this.name = "MyDataClassificationPreflightError";
    this.report = report;
  }
}

export function preflightClassificationXml(xml: string): MyDataClassificationReport {
  let root: XmlElement;
  try {
    root = parseXmlDocument(xml);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, classifiedInvoiceCount: 0, issues: [issue("CLASSIFICATION_XML_MALFORMED", "$", message)] };
  }

  const issues: MyDataClassificationIssue[] = [];
  const invoices = root.localName === "invoice" ? [root] : descendants(root, "invoice");
  let classifiedInvoiceCount = 0;
  invoices.forEach((invoice, index) => {
    const result = validateInvoiceClassifications(invoice, index, issues);
    if (result) classifiedInvoiceCount += 1;
  });
  return { ok: !issues.some(entry => entry.severity === "error"), classifiedInvoiceCount, issues };
}

export function assertClassificationXmlPreflight(xml: string): MyDataClassificationReport {
  const report = preflightClassificationXml(xml);
  if (!report.ok) throw new MyDataClassificationPreflightError(report);
  return report;
}

function validateInvoiceClassifications(invoice: XmlElement, invoiceIndex: number, issues: MyDataClassificationIssue[]): boolean {
  const base = `$.invoice[${invoiceIndex}]`;
  const details = childElements(invoice, "invoiceDetails");
  const summary = childElements(invoice, "invoiceSummary")[0];
  const lineKinds = details.map((detail, detailIndex) => validateLine(detail, `${base}.invoiceDetails[${detailIndex}]`, issues));
  const classified = lineKinds.some(kind => kind !== "none") || Boolean(summary && (childElements(summary, "incomeClassification").length || childElements(summary, "expensesClassification").length));
  if (!classified) return false;

  const nonEmptyKinds = lineKinds.filter(kind => kind !== "none");
  if (nonEmptyKinds.length && nonEmptyKinds.length !== details.length) {
    issues.push(issue("CLASSIFICATION_COVERAGE_MIXED", `${base}.invoiceDetails`, "When line classifications are present, every invoice line must be classified"));
  }
  const distinctKinds = new Set(nonEmptyKinds);
  if (distinctKinds.size > 1) {
    issues.push(issue("CLASSIFICATION_DIRECTION_MIXED", `${base}.invoiceDetails`, "Income and expense classifications must not be mixed across invoice lines"));
  }

  if (!summary) return true;
  const summaryKind = validateSummary(summary, `${base}.invoiceSummary`, issues);
  const lineKind = distinctKinds.size === 1 ? [...distinctKinds][0] : undefined;
  if (lineKind && summaryKind !== "none" && lineKind !== summaryKind) {
    issues.push(issue("CLASSIFICATION_SUMMARY_DIRECTION", `${base}.invoiceSummary`, `Summary ${summaryKind} classifications do not match line ${lineKind} classifications`));
  }
  if (lineKind && summaryKind === "none") {
    issues.push(issue("CLASSIFICATION_SUMMARY_MISSING", `${base}.invoiceSummary`, `Summary ${lineKind} classification is required when invoice lines are classified`));
  }
  if (!lineKind && summaryKind !== "none" && details.length) {
    issues.push(issue("CLASSIFICATION_LINES_MISSING", `${base}.invoiceDetails`, "Summary classifications are present but invoice lines are not classified"));
  }
  return true;
}

type ClassificationKind = "income" | "expense" | "none";

function validateLine(detail: XmlElement, path: string, issues: MyDataClassificationIssue[]): ClassificationKind {
  const income = childElements(detail, "incomeClassification");
  const expense = childElements(detail, "expensesClassification");
  if (income.length && expense.length) {
    issues.push(issue("CLASSIFICATION_BOTH_DIRECTIONS", path, "A line cannot contain both income and expense classifications"));
    return "none";
  }
  const net = parseMoney(childText(detail, "netValue"));
  if (income.length) {
    validateIncomeSet(income, `${path}.incomeClassification`, net, issues);
    return "income";
  }
  if (expense.length) {
    validateExpenseSet(expense, `${path}.expensesClassification`, net, issues);
    return "expense";
  }
  return "none";
}

function validateSummary(summary: XmlElement, path: string, issues: MyDataClassificationIssue[]): ClassificationKind {
  const income = childElements(summary, "incomeClassification");
  const expense = childElements(summary, "expensesClassification");
  if (income.length && expense.length) {
    issues.push(issue("CLASSIFICATION_SUMMARY_BOTH_DIRECTIONS", path, "Invoice summary cannot contain both income and expense classifications"));
    return "none";
  }
  const totalNet = parseMoney(childText(summary, "totalNetValue"));
  if (income.length) {
    validateIncomeSet(income, `${path}.incomeClassification`, totalNet, issues);
    return "income";
  }
  if (expense.length) {
    validateExpenseSet(expense, `${path}.expensesClassification`, totalNet, issues);
    return "expense";
  }
  return "none";
}

function validateIncomeSet(nodes: readonly XmlElement[], path: string, expectedAmount: number | undefined, issues: MyDataClassificationIssue[]): void {
  const seen = new Set<string>();
  const amounts: number[] = [];
  nodes.forEach((node, index) => {
    const itemPath = `${path}[${index}]`;
    const category = childText(node, "classificationCategory")?.trim();
    const type = childText(node, "classificationType")?.trim();
    const amount = classificationAmount(node, itemPath, issues);
    if (amount !== undefined) amounts.push(amount);

    if (!category) issues.push(issue("INCOME_CATEGORY_MISSING", `${itemPath}.classificationCategory`, "Income classification category is required"));
    else if (!isAadeIncomeClassificationCategory(category)) issues.push(issue("INCOME_CATEGORY_INVALID", `${itemPath}.classificationCategory`, `Unsupported income classification category: ${category}`));
    if (type && !/^E3_\d{3}(?:_\d{3})?$/.test(type)) issues.push(issue("INCOME_TYPE_INVALID", `${itemPath}.classificationType`, `Invalid income classification type: ${type}`));

    const key = `${category ?? ""}|${type ?? ""}`;
    if (seen.has(key)) issues.push(issue("INCOME_CLASSIFICATION_DUPLICATE", itemPath, "Duplicate income classification category/type combination"));
    seen.add(key);
  });
  if (expectedAmount !== undefined && amounts.length === nodes.length && !moneyEqual(sum(amounts), expectedAmount)) {
    issues.push(issue("INCOME_CLASSIFICATION_AMOUNT_MISMATCH", path, `Income classification amount ${fmt(sum(amounts))} does not match net value ${fmt(expectedAmount)}`));
  }
}

function validateExpenseSet(nodes: readonly XmlElement[], path: string, expectedAmount: number | undefined, issues: MyDataClassificationIssue[]): void {
  const seen = new Set<string>();
  const regularAmounts: number[] = [];
  let regularCount = 0;
  nodes.forEach((node, index) => {
    const itemPath = `${path}[${index}]`;
    const category = childText(node, "classificationCategory")?.trim();
    const type = childText(node, "classificationType")?.trim();
    const amount = classificationAmount(node, itemPath, issues);
    const vatClassification = Boolean(type && /^(?:VAT_36[1-6]|NOT_VAT_295)$/.test(type));

    if (category && !isAadeExpenseClassificationCategory(category)) issues.push(issue("EXPENSE_CATEGORY_INVALID", `${itemPath}.classificationCategory`, `Unsupported expense classification category: ${category}`));
    if (type && !/^(?:E3_\d{3}(?:_\d{3})?|VAT_36[1-6]|NOT_VAT_295)$/.test(type)) issues.push(issue("EXPENSE_TYPE_INVALID", `${itemPath}.classificationType`, `Invalid expense classification type: ${type}`));
    if (vatClassification && category) issues.push(issue("VAT_CLASSIFICATION_CATEGORY_FORBIDDEN", `${itemPath}.classificationCategory`, "VAT expense classifications must not include a classification category"));
    if (!vatClassification) {
      regularCount += 1;
      if (amount !== undefined) regularAmounts.push(amount);
    }

    const key = `${category ?? ""}|${type ?? ""}`;
    if (seen.has(key)) issues.push(issue("EXPENSE_CLASSIFICATION_DUPLICATE", itemPath, "Duplicate expense classification category/type combination"));
    seen.add(key);
  });
  if (regularCount > 0 && expectedAmount !== undefined && regularAmounts.length === regularCount && !moneyEqual(sum(regularAmounts), expectedAmount)) {
    issues.push(issue("EXPENSE_CLASSIFICATION_AMOUNT_MISMATCH", path, `Expense classification amount ${fmt(sum(regularAmounts))} does not match net value ${fmt(expectedAmount)}`));
  }
}

function classificationAmount(node: XmlElement, path: string, issues: MyDataClassificationIssue[]): number | undefined {
  const raw = childText(node, "amount")?.trim();
  if (!raw) {
    issues.push(issue("CLASSIFICATION_AMOUNT_MISSING", `${path}.amount`, "Classification amount is required"));
    return undefined;
  }
  const amount = parseMoney(raw);
  if (amount === undefined) {
    issues.push(issue("CLASSIFICATION_AMOUNT_INVALID", `${path}.amount`, "Classification amount must be a non-negative value with at most 2 decimals"));
    return undefined;
  }
  return amount;
}

function parseMoney(raw: string | undefined): number | undefined {
  if (!raw || !/^\d+(?:\.\d{1,2})?$/.test(raw.trim())) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function moneyEqual(a: number, b: number): boolean { return Math.abs(a - b) <= 0.01; }
function sum(values: readonly number[]): number { return values.reduce((total, value) => total + value, 0); }
function fmt(value: number): string { return value.toFixed(2); }
function issue(code: string, path: string, message: string, severity: "error" | "warning" = "error"): MyDataClassificationIssue { return { code, path, message, severity }; }
