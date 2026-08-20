import {
  AADE_VAT_CATEGORIES,
  isAadeInvoiceType,
  isAadePaymentMethod,
  isAadeVatCategory
} from "./catalog.ts";
import { childElements, childText, descendants, parseXmlDocument, type XmlElement } from "./xml.ts";

export type MyDataPreflightIssue = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type MyDataPreflightReport = Readonly<{
  ok: boolean;
  invoiceCount: number;
  issues: readonly MyDataPreflightIssue[];
}>;

export class MyDataPreflightError extends Error {
  readonly report: MyDataPreflightReport;
  constructor(report: MyDataPreflightReport) {
    super(`AADE myDATA preflight failed: ${report.issues.map(issue => `${issue.path} ${issue.message}`).join(" | ")}`);
    this.name = "MyDataPreflightError";
    this.report = report;
  }
}

export function preflightInvoiceXml(xml: string): MyDataPreflightReport {
  const issues: MyDataPreflightIssue[] = [];
  let root: XmlElement;
  try {
    root = parseXmlDocument(xml);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, invoiceCount: 0, issues: [{ code: "XML_MALFORMED", path: "$", message }] };
  }

  if (root.localName !== "InvoicesDoc") {
    issues.push({ code: "ROOT_INVALID", path: "$", message: `Expected InvoicesDoc root, received ${root.localName}` });
  }

  const invoices = root.localName === "invoice" ? [root] : descendants(root, "invoice");
  if (!invoices.length) issues.push({ code: "INVOICE_MISSING", path: "$.invoice", message: "At least one invoice is required" });

  invoices.forEach((invoice, invoiceIndex) => validateInvoice(invoice, invoiceIndex, issues));
  return { ok: issues.length === 0, invoiceCount: invoices.length, issues };
}

export function assertInvoiceXmlPreflight(xml: string): MyDataPreflightReport {
  const report = preflightInvoiceXml(xml);
  if (!report.ok) throw new MyDataPreflightError(report);
  return report;
}

function validateInvoice(invoice: XmlElement, invoiceIndex: number, issues: MyDataPreflightIssue[]): void {
  const base = `$.invoice[${invoiceIndex}]`;
  const header = childElements(invoice, "invoiceHeader")[0];
  const details = childElements(invoice, "invoiceDetails");
  const summary = childElements(invoice, "invoiceSummary")[0];

  if (!header) issues.push(issue("HEADER_MISSING", `${base}.invoiceHeader`, "Invoice header is required"));
  else validateHeader(header, `${base}.invoiceHeader`, issues);

  if (!details.length) issues.push(issue("DETAILS_MISSING", `${base}.invoiceDetails`, "At least one invoice line is required"));
  const lineNumbers = new Set<number>();
  details.forEach((detail, detailIndex) => validateDetail(detail, `${base}.invoiceDetails[${detailIndex}]`, lineNumbers, issues));

  if (!summary) issues.push(issue("SUMMARY_MISSING", `${base}.invoiceSummary`, "Invoice summary is required"));
  else validateSummary(summary, `${base}.invoiceSummary`, details, issues);

  validatePaymentMethods(invoice, base, summary, issues);
}

function validateHeader(header: XmlElement, path: string, issues: MyDataPreflightIssue[]): void {
  const series = childText(header, "series")?.trim();
  const aa = childText(header, "aa")?.trim();
  const issueDate = childText(header, "issueDate")?.trim();
  const invoiceType = childText(header, "invoiceType")?.trim();

  if (!series) issues.push(issue("SERIES_MISSING", `${path}.series`, "Series is required"));
  else if (series.length > 50) issues.push(issue("SERIES_TOO_LONG", `${path}.series`, "Series must not exceed 50 characters"));

  if (!aa) issues.push(issue("AA_MISSING", `${path}.aa`, "AA is required"));
  else if (aa.length > 50) issues.push(issue("AA_TOO_LONG", `${path}.aa`, "AA must not exceed 50 characters"));

  if (!issueDate) issues.push(issue("ISSUE_DATE_MISSING", `${path}.issueDate`, "Issue date is required"));
  else if (!isIsoDate(issueDate)) issues.push(issue("ISSUE_DATE_INVALID", `${path}.issueDate`, "Issue date must be a real YYYY-MM-DD calendar date"));

  if (!invoiceType) issues.push(issue("INVOICE_TYPE_MISSING", `${path}.invoiceType`, "Invoice type is required"));
  else if (!isAadeInvoiceType(invoiceType)) issues.push(issue("INVOICE_TYPE_INVALID", `${path}.invoiceType`, `Unsupported AADE 2.0.2 invoice type: ${invoiceType}`));
}

function validateDetail(detail: XmlElement, path: string, lineNumbers: Set<number>, issues: MyDataPreflightIssue[]): void {
  const lineNumber = integerField(detail, "lineNumber", `${path}.lineNumber`, issues, { min: 1 });
  if (lineNumber !== undefined) {
    if (lineNumbers.has(lineNumber)) issues.push(issue("LINE_NUMBER_DUPLICATE", `${path}.lineNumber`, `Duplicate line number ${lineNumber}`));
    lineNumbers.add(lineNumber);
  }

  const netValue = moneyField(detail, "netValue", `${path}.netValue`, issues, true);
  const vatAmount = moneyField(detail, "vatAmount", `${path}.vatAmount`, issues, true);
  const vatCategory = integerField(detail, "vatCategory", `${path}.vatCategory`, issues, { min: 1 });
  const exemption = childText(detail, "vatExemptionCategory")?.trim();

  if (vatCategory !== undefined && !isAadeVatCategory(vatCategory)) {
    issues.push(issue("VAT_CATEGORY_INVALID", `${path}.vatCategory`, `Unsupported AADE VAT category: ${vatCategory}`));
  }

  if (vatCategory !== undefined && isAadeVatCategory(vatCategory)) {
    const catalog = AADE_VAT_CATEGORIES[vatCategory];
    if (catalog.exemption && !exemption) {
      issues.push(issue("VAT_EXEMPTION_REQUIRED", `${path}.vatExemptionCategory`, "VAT category 7 requires a VAT exemption category"));
    }
    if (!catalog.exemption && exemption) {
      issues.push(issue("VAT_EXEMPTION_UNEXPECTED", `${path}.vatExemptionCategory`, `VAT exemption category is not valid with VAT category ${vatCategory}`));
    }
    if (catalog.zero && vatAmount !== undefined && Math.abs(vatAmount) > 0.000001) {
      issues.push(issue("VAT_AMOUNT_NONZERO", `${path}.vatAmount`, `VAT category ${vatCategory} requires zero VAT amount`));
    }
  }

  if (netValue !== undefined && netValue < 0) issues.push(issue("NET_VALUE_NEGATIVE", `${path}.netValue`, "Net value must not be negative"));
}

function validateSummary(summary: XmlElement, path: string, details: readonly XmlElement[], issues: MyDataPreflightIssue[]): void {
  const totalNet = moneyField(summary, "totalNetValue", `${path}.totalNetValue`, issues, true);
  const totalVat = moneyField(summary, "totalVatAmount", `${path}.totalVatAmount`, issues, true);
  moneyField(summary, "totalGrossValue", `${path}.totalGrossValue`, issues, true);

  const lineNets = details.map(detail => parseMoney(childText(detail, "netValue"))).filter((value): value is number => value !== undefined);
  const lineVats = details.map(detail => parseMoney(childText(detail, "vatAmount"))).filter((value): value is number => value !== undefined);

  if (totalNet !== undefined && lineNets.length === details.length && !moneyEqual(totalNet, sum(lineNets))) {
    issues.push(issue("SUMMARY_NET_MISMATCH", `${path}.totalNetValue`, `Summary net ${fmt(totalNet)} does not match line net total ${fmt(sum(lineNets))}`));
  }
  if (totalVat !== undefined && lineVats.length === details.length && !moneyEqual(totalVat, sum(lineVats))) {
    issues.push(issue("SUMMARY_VAT_MISMATCH", `${path}.totalVatAmount`, `Summary VAT ${fmt(totalVat)} does not match line VAT total ${fmt(sum(lineVats))}`));
  }
}

function validatePaymentMethods(invoice: XmlElement, base: string, summary: XmlElement | undefined, issues: MyDataPreflightIssue[]): void {
  const methods = descendants(invoice, "paymentMethodDetails");
  if (!methods.length) return;
  const amounts: number[] = [];
  methods.forEach((method, index) => {
    const path = `${base}.paymentMethods.paymentMethodDetails[${index}]`;
    const type = integerField(method, "type", `${path}.type`, issues, { min: 1 });
    if (type !== undefined && !isAadePaymentMethod(type)) issues.push(issue("PAYMENT_TYPE_INVALID", `${path}.type`, `Unsupported AADE payment method: ${type}`));
    const amount = moneyField(method, "amount", `${path}.amount`, issues, true);
    if (amount !== undefined) amounts.push(amount);
  });

  const gross = summary ? parseMoney(childText(summary, "totalGrossValue")) : undefined;
  if (gross !== undefined && amounts.length === methods.length && !moneyEqual(gross, sum(amounts))) {
    issues.push(issue("PAYMENT_TOTAL_MISMATCH", `${base}.paymentMethods`, `Payment total ${fmt(sum(amounts))} does not match invoice gross ${fmt(gross)}`));
  }
}

function integerField(element: XmlElement, name: string, path: string, issues: MyDataPreflightIssue[], options?: { min?: number }): number | undefined {
  const raw = childText(element, name)?.trim();
  if (!raw) {
    issues.push(issue("FIELD_MISSING", path, `${name} is required`));
    return undefined;
  }
  if (!/^\d+$/.test(raw)) {
    issues.push(issue("INTEGER_INVALID", path, `${name} must be an integer`));
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || (options?.min !== undefined && value < options.min)) {
    issues.push(issue("INTEGER_RANGE", path, `${name} is outside the allowed range`));
    return undefined;
  }
  return value;
}

function moneyField(element: XmlElement, name: string, path: string, issues: MyDataPreflightIssue[], required: boolean): number | undefined {
  const raw = childText(element, name)?.trim();
  if (!raw) {
    if (required) issues.push(issue("FIELD_MISSING", path, `${name} is required`));
    return undefined;
  }
  const value = parseMoney(raw);
  if (value === undefined) {
    issues.push(issue("MONEY_INVALID", path, `${name} must be a non-negative amount with at most 2 decimals`));
    return undefined;
  }
  return value;
}

function parseMoney(raw: string | undefined): number | undefined {
  if (!raw || !/^\d+(?:\.\d{1,2})?$/.test(raw.trim())) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 0));
  return date.getUTCFullYear() === year && date.getUTCMonth() === (month ?? 1) - 1 && date.getUTCDate() === day;
}

function moneyEqual(a: number, b: number): boolean { return Math.abs(a - b) <= 0.01; }
function sum(values: readonly number[]): number { return values.reduce((total, value) => total + value, 0); }
function fmt(value: number): string { return value.toFixed(2); }
function issue(code: string, path: string, message: string): MyDataPreflightIssue { return { code, path, message }; }
