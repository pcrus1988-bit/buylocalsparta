/**
 * FISCAL internal ERP prototype: an in-memory, balanced EUR journal preview.
 * NOT statutory bookkeeping, tax classification, document issuance, or posting.
 * No network, database writes, taxpayer identities, or real chart of accounts.
 */
export type FiscalSandboxAccount =
  | "cash_test" | "bank_test" | "receivable_test" | "payable_test"
  | "sales_test" | "purchases_test" | "inventory_test" | "adjustment_test";
export type FiscalSandboxPosting = Readonly<{
  account: FiscalSandboxAccount;
  side: "debit" | "credit";
  amountMinor: number;
}>;
export type FiscalSandboxJournal = Readonly<{
  kind: "non_fiscal_test_journal_preview";
  currency: "EUR";
  entries: FiscalSandboxPosting[];
  totalDebitMinor: number;
  totalCreditMinor: number;
  balanceMinor: 0;
  postingEnabled: false;
  certifiedBookkeeping: false;
  legalTaxClassification: false;
  fiscalIssuanceEnabled: false;
}>;

export const fiscalSandboxAccounts: readonly FiscalSandboxAccount[] = [
  "cash_test", "bank_test", "receivable_test", "payable_test",
  "sales_test", "purchases_test", "inventory_test", "adjustment_test"
];
const accounts = new Set<string>(fiscalSandboxAccounts);
const MAX_ENTRIES = 40;
const MAX_SINGLE_MINOR = 1_000_000_000;
const MAX_TOTAL_MINOR = 1_000_000_000_000n;

/** Fail closed on all unspecified fields, including any legal document / VAT data. */
export function previewFiscalSandboxJournal(input: unknown): FiscalSandboxJournal {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("JOURNAL_INVALID_INPUT");
  const data = input as Record<string, unknown>;
  if (Object.keys(data).some((key) => key !== "entries"))
    throw new Error("JOURNAL_UNKNOWN_FIELDS");
  if (!Array.isArray(data.entries) || data.entries.length < 2 || data.entries.length > MAX_ENTRIES)
    throw new Error("JOURNAL_INVALID_ENTRY_COUNT");

  let debit = 0n;
  let credit = 0n;
  const entries: FiscalSandboxPosting[] = data.entries.map((raw: unknown) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw new Error("JOURNAL_INVALID_ENTRY");
    const record = raw as Record<string, unknown>;
    if (Object.keys(record).some((key) => !["account", "side", "amountMinor"].includes(key)))
      throw new Error("JOURNAL_UNKNOWN_ENTRY_FIELDS");
    if (typeof record.account !== "string" || !accounts.has(record.account) ||
        (record.side !== "debit" && record.side !== "credit") ||
        typeof record.amountMinor !== "number" || !Number.isSafeInteger(record.amountMinor) ||
        record.amountMinor <= 0 || record.amountMinor > MAX_SINGLE_MINOR)
      throw new Error("JOURNAL_INVALID_ENTRY");
    const amount = BigInt(record.amountMinor);
    if (record.side === "debit") debit += amount;
    else credit += amount;
    if (debit > MAX_TOTAL_MINOR || credit > MAX_TOTAL_MINOR)
      throw new Error("JOURNAL_AMOUNT_OUT_OF_RANGE");
    return {
      account: record.account as FiscalSandboxAccount,
      side: record.side as "debit" | "credit",
      amountMinor: record.amountMinor
    };
  });

  if (debit === 0n || credit === 0n || debit !== credit)
    throw new Error("JOURNAL_NOT_BALANCED");
  return {
    kind: "non_fiscal_test_journal_preview",
    currency: "EUR", entries,
    totalDebitMinor: Number(debit), totalCreditMinor: Number(credit), balanceMinor: 0,
    postingEnabled: false, certifiedBookkeeping: false,
    legalTaxClassification: false, fiscalIssuanceEnabled: false
  };
}
