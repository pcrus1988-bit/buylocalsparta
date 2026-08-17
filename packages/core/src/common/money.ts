export type Currency = "EUR";

export type Money = Readonly<{
  currency: Currency;
  minor: number;
}>;

export function money(minor: number, currency: Currency = "EUR"): Money {
  if (!Number.isSafeInteger(minor)) {
    throw new Error(`Money minor units must be a safe integer; received ${minor}`);
  }
  return Object.freeze({ currency, minor });
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.minor + b.minor, a.currency);
}

export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.minor - b.minor, a.currency);
}

export function multiplyMoney(a: Money, quantity: number): Money {
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new Error("Quantity must be a non-negative safe integer");
  }
  return money(a.minor * quantity, a.currency);
}

/** Fixed-precision percentage calculation using basis points. 10_000 bps = 100%. */
export function applyBasisPoints(a: Money, basisPoints: number, rounding: "half-up" | "down" = "half-up"): Money {
  if (!Number.isSafeInteger(basisPoints)) throw new Error("basisPoints must be an integer");
  const numerator = a.minor * basisPoints;
  const denominator = 10_000;
  const absolute = Math.abs(numerator);
  const sign = numerator < 0 ? -1 : 1;
  const quotient = Math.floor(absolute / denominator);
  const remainder = absolute % denominator;
  const rounded = rounding === "half-up" && remainder * 2 >= denominator ? quotient + 1 : quotient;
  return money(sign * rounded, a.currency);
}

export function sumMoney(items: readonly Money[], currency: Currency = "EUR"): Money {
  return items.reduce((acc, item) => addMoney(acc, item), money(0, currency));
}

/** Split a VAT-inclusive gross amount into net and tax using fixed integer arithmetic. */
export function splitGrossTax(gross: Money, taxRateBps: number): { net: Money; tax: Money } {
  if (!Number.isSafeInteger(taxRateBps) || taxRateBps < 0) throw new Error("taxRateBps must be a non-negative integer");
  const denominator = 10_000 + taxRateBps;
  const absoluteNumerator = Math.abs(gross.minor) * 10_000;
  const quotient = Math.floor(absoluteNumerator / denominator);
  const remainder = absoluteNumerator % denominator;
  const roundedAbsoluteNet = remainder * 2 >= denominator ? quotient + 1 : quotient;
  const netMinor = gross.minor < 0 ? -roundedAbsoluteNet : roundedAbsoluteNet;
  const net = money(netMinor, gross.currency);
  return { net, tax: money(gross.minor - net.minor, gross.currency) };
}

export function formatMoney(value: Money, locale = "el-GR"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: value.currency }).format(value.minor / 100);
}

function assertSameCurrency(a: Money, b: Money) {
  if (a.currency !== b.currency) throw new Error(`Currency mismatch ${a.currency} vs ${b.currency}`);
}
