import { id } from "../common/ids.ts";
import { money, type Currency, type Money } from "../common/money.ts";

export type LedgerDirection = "debit" | "credit";
export type LedgerEntry = Readonly<{
  id: string;
  transactionId: string;
  account: string;
  direction: LedgerDirection;
  amount: Money;
  entityType?: string;
  entityId?: string;
}>;

export type LedgerTransaction = Readonly<{
  id: string;
  reference: string;
  createdAt: number;
  entries: readonly LedgerEntry[];
}>;

export class Ledger {
  readonly #transactions: LedgerTransaction[] = [];
  readonly #references = new Set<string>();

  post(input: {
    reference: string;
    createdAt: number;
    entries: readonly Omit<LedgerEntry, "id" | "transactionId">[];
  }): LedgerTransaction {
    if (input.entries.length < 2) throw new Error("Ledger transaction requires at least two entries");
    if (this.#references.has(input.reference)) throw new Error(`Duplicate ledger reference ${input.reference}`);
    const currencies = new Set(input.entries.map((entry) => entry.amount.currency));
    if (currencies.size !== 1) throw new Error("A ledger transaction cannot mix currencies");
    const debits = input.entries.filter((e) => e.direction === "debit").reduce((sum, e) => sum + e.amount.minor, 0);
    const credits = input.entries.filter((e) => e.direction === "credit").reduce((sum, e) => sum + e.amount.minor, 0);
    if (debits !== credits) throw new Error(`Unbalanced ledger transaction: debit ${debits}, credit ${credits}`);

    const transactionId = id("ltx");
    const transaction: LedgerTransaction = Object.freeze({
      id: transactionId,
      reference: input.reference,
      createdAt: input.createdAt,
      entries: input.entries.map((entry) => Object.freeze({ ...entry, id: id("le"), transactionId }))
    });
    this.#transactions.push(transaction);
    this.#references.add(input.reference);
    return transaction;
  }

  balance(account: string, currency: Currency = "EUR"): Money {
    let minor = 0;
    for (const tx of this.#transactions) {
      for (const entry of tx.entries) {
        if (entry.account !== account || entry.amount.currency !== currency) continue;
        minor += entry.direction === "debit" ? entry.amount.minor : -entry.amount.minor;
      }
    }
    return money(minor, currency);
  }

  transactions(): readonly LedgerTransaction[] {
    return this.#transactions;
  }
}

export function customerCaptureEntries(amount: Money, outputVat: Money, paymentFee: Money = money(0)): Omit<LedgerEntry, "id" | "transactionId">[] {
  const netRevenue = money(amount.minor - outputVat.minor, amount.currency);
  const entries: Omit<LedgerEntry, "id" | "transactionId">[] = [
    { account: "psp_receivable", direction: "debit", amount },
    { account: "sales_revenue", direction: "credit", amount: netRevenue },
    { account: "output_vat", direction: "credit", amount: outputVat }
  ];
  if (paymentFee.minor > 0) {
    entries.push({ account: "payment_fee_expense", direction: "debit", amount: paymentFee });
    entries.push({ account: "psp_receivable", direction: "credit", amount: paymentFee });
  }
  return entries;
}
