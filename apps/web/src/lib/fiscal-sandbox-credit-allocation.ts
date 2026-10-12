/**
 * FISCAL gross-amount credit allocation sandbox.
 *
 * Deterministically checks proposed adjustments against an immutable,
 * previously tenant-authorized test draft and its complete adjustment history.
 *
 * NO legal credit note, legal tax reversal, financial transfer, posting,
 * AADE transmission or fiscal issuance occurs here. Not a source of statutory
 * outstanding balances; no database access or side effects.
 */
export type FiscalTestCreditLane = "b2c" | "pos" | "b2b" | "b2g";

export type FiscalSandboxCreditRow = Readonly<{
  lineNo: number;
  originalGrossMinor: string;
  previouslyAllocatedMinor: string;
  proposedCreditMinor: string;
  remainingGrossMinor: string;
}>;

export type FiscalSandboxCreditPreview = Readonly<{
  kind: "non_fiscal_test_credit_allocation";
  currency: "EUR";
  lane: FiscalTestCreditLane;
  originalDraftId: string;
  rows: FiscalSandboxCreditRow[];
  totals: Readonly<{
    originalGrossMinor: string;
    previouslyAllocatedMinor: string;
    proposedCreditMinor: string;
    remainingGrossMinor: string;
  }>;
  legalCreditNoteIssued: false;
  taxReversalDetermined: false;
  refundExecuted: false;
  officialAccounting: false;
  fiscalIssuanceEnabled: false;
}>;

const MAX_MINOR = 1_000_000_000_000;
const MAX_PREVIOUS = 100;
const ID_PATTERN = /^[A-Za-z0-9._:-]{8,120}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function recordOf(value: unknown, allowed: readonly string[], error: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(error);
  const data = value as Record<string, unknown>;
  if (Object.keys(data).some((key) => !allowed.includes(key))) throw new Error(error);
  return data;
}

function positiveMinor(value: unknown): bigint {
  if (typeof value !== "number" || !Number.isSafeInteger(value) ||
      value <= 0 || value > MAX_MINOR) throw new Error("CREDIT_INVALID_AMOUNT");
  return BigInt(value);
}

function lineNumber(value: unknown, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) ||
      value < 1 || value > max) throw new Error("CREDIT_INVALID_LINE");
  return value;
}

function creditLines(value: unknown, max: number): Map<number, bigint> {
  if (!Array.isArray(value) || value.length < 1 || value.length > max)
    throw new Error("CREDIT_INVALID_LINES");
  const result = new Map<number, bigint>();
  for (const raw of value) {
    const line = recordOf(raw, ["lineNo", "amountMinor"], "CREDIT_INVALID_LINE");
    const number = lineNumber(line.lineNo, max);
    if (result.has(number)) throw new Error("CREDIT_DUPLICATE_LINE");
    result.set(number, positiveMinor(line.amountMinor));
  }
  return result;
}

function allocation(raw: unknown, max: number): {id: string; lines: Map<number, bigint>} {
  const item = recordOf(raw, ["externalId", "lines"], "CREDIT_INVALID_ALLOCATION");
  if (typeof item.externalId !== "string" || !ID_PATTERN.test(item.externalId))
    throw new Error("CREDIT_INVALID_REFERENCE");
  return {id: item.externalId, lines: creditLines(item.lines, max)};
}

/**
 * Caller must obtain the original draft and its *complete* adjustment history
 * using the same tenant-scoped authorization. The function does not query DB.
 *
 * Accepts plain JSON-safe, strictly whitelisted inputs. All financial inputs
 * are whole, positive EUR minor units (cents), never floats or signed amounts.
 */
export function previewFiscalSandboxCredit(input: unknown): FiscalSandboxCreditPreview {
  const request = recordOf(input, ["original", "previous", "candidate"], "CREDIT_INVALID_INPUT");
  const original = recordOf(
    request.original, ["draftId", "lane", "currency", "lines"], "CREDIT_INVALID_ORIGINAL"
  );
  if (typeof original.draftId !== "string" || !UUID_PATTERN.test(original.draftId))
    throw new Error("CREDIT_INVALID_DRAFT_ID");
  if (!["b2c", "pos", "b2b", "b2g"].includes(original.lane as string) ||
      original.currency !== "EUR") throw new Error("CREDIT_INVALID_ORIGINAL");
  if (!Array.isArray(original.lines) || original.lines.length < 1 || original.lines.length > 30)
    throw new Error("CREDIT_INVALID_ORIGINAL_LINES");

  const source = new Map<number, bigint>();
  let totalOriginal = 0n;
  for (let i = 0; i < original.lines.length; i++) {
    const item = recordOf(
      original.lines[i], ["lineNo", "grossMinor"], "CREDIT_INVALID_ORIGINAL_LINE"
    );
    // Require complete and contiguous snapshots. An omitted line could conceal
    // prior allocation or misrepresent the original draft's amount.
    if (item.lineNo !== i + 1) throw new Error("CREDIT_NONCONTIGUOUS_ORIGINAL");
    const amount = positiveMinor(item.grossMinor);
    totalOriginal += amount;
    if (totalOriginal > BigInt(MAX_MINOR)) throw new Error("CREDIT_ORIGINAL_TOO_LARGE");
    source.set(i + 1, amount);
  }

  if (!Array.isArray(request.previous) || request.previous.length > MAX_PREVIOUS)
    throw new Error("CREDIT_INVALID_HISTORY");
  const usedIds = new Set<string>();
  const used = new Map<number, bigint>();
  for (const raw of request.previous) {
    const historic = allocation(raw, source.size);
    if (usedIds.has(historic.id)) throw new Error("CREDIT_DUPLICATE_REFERENCE");
    usedIds.add(historic.id);
    for (const [number, amount] of historic.lines) {
      const next = (used.get(number) ?? 0n) + amount;
      if (next > source.get(number)!) throw new Error("CREDIT_HISTORY_OVERALLOCATED");
      used.set(number, next);
    }
  }

  const candidate = allocation(request.candidate, source.size);
  if (usedIds.has(candidate.id)) throw new Error("CREDIT_DUPLICATE_REFERENCE");
  let previousTotal = 0n;
  let proposedTotal = 0n;
  const rows: FiscalSandboxCreditRow[] = [];
  for (const [lineNo, originalGross] of source) {
    const previous = used.get(lineNo) ?? 0n;
    const proposed = candidate.lines.get(lineNo) ?? 0n;
    if (previous + proposed > originalGross) throw new Error("CREDIT_OVERALLOCATED");
    previousTotal += previous;
    proposedTotal += proposed;
    rows.push({
      lineNo,
      originalGrossMinor: String(originalGross),
      previouslyAllocatedMinor: String(previous),
      proposedCreditMinor: String(proposed),
      remainingGrossMinor: String(originalGross - previous - proposed)
    });
  }

  return {
    kind: "non_fiscal_test_credit_allocation",
    currency: "EUR",
    lane: original.lane as FiscalTestCreditLane,
    originalDraftId: original.draftId as string,
    rows,
    totals: {
      originalGrossMinor: String(totalOriginal),
      previouslyAllocatedMinor: String(previousTotal),
      proposedCreditMinor: String(proposedTotal),
      remainingGrossMinor: String(totalOriginal - previousTotal - proposedTotal)
    },
    legalCreditNoteIssued: false,
    taxReversalDetermined: false,
    refundExecuted: false,
    officialAccounting: false,
    fiscalIssuanceEnabled: false
  };
}
