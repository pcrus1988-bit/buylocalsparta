export const AADE_INVOICE_TYPES_2_0_2 = [
  "1.1","1.2","1.3","1.4","1.5","1.6","2.1","2.2","2.3","2.4","3.1","3.2","4","5.1","5.2","6.1","6.2","7.1",
  "8.1","8.2","8.3","8.4","8.5","8.6","9.1","9.2","9.3","10.1","10.2","11.1","11.2","11.3","11.4","11.5","12",
  "13.1","13.2","13.3","13.4","13.30","13.31","14.1","14.2","14.3","14.4","14.5","14.30","14.31","15.1","16.1",
  "17.1","17.2","17.3","17.4","17.5","17.6"
] as const;

export type AadeInvoiceType = typeof AADE_INVOICE_TYPES_2_0_2[number];

const INVOICE_TYPE_SET = new Set<string>(AADE_INVOICE_TYPES_2_0_2);

export function isAadeInvoiceType(value: string): value is AadeInvoiceType {
  return INVOICE_TYPE_SET.has(value.trim());
}

export const AADE_VAT_CATEGORIES = {
  1: { rateBps: 2400, zero: false, exemption: false },
  2: { rateBps: 1300, zero: false, exemption: false },
  3: { rateBps: 600, zero: false, exemption: false },
  4: { rateBps: 1700, zero: false, exemption: false },
  5: { rateBps: 900, zero: false, exemption: false },
  6: { rateBps: 400, zero: false, exemption: false },
  7: { rateBps: 0, zero: true, exemption: true },
  8: { rateBps: 0, zero: true, exemption: false },
  9: { rateBps: 300, zero: false, exemption: false },
  10: { rateBps: 400, zero: false, exemption: false }
} as const;

export type AadeVatCategory = keyof typeof AADE_VAT_CATEGORIES;

export function isAadeVatCategory(value: number): value is AadeVatCategory {
  return Number.isInteger(value) && Object.prototype.hasOwnProperty.call(AADE_VAT_CATEGORIES, value);
}

export function aadeVatRateBps(category: AadeVatCategory): number {
  return AADE_VAT_CATEGORIES[category].rateBps;
}

export const AADE_PAYMENT_METHODS = {
  1: "domestic_professional_account",
  2: "foreign_professional_account",
  3: "cash",
  4: "cheque",
  5: "credit",
  6: "web_banking",
  7: "pos_epos",
  8: "iris"
} as const;

export type AadePaymentMethod = keyof typeof AADE_PAYMENT_METHODS;

export function isAadePaymentMethod(value: number): value is AadePaymentMethod {
  return Number.isInteger(value) && Object.prototype.hasOwnProperty.call(AADE_PAYMENT_METHODS, value);
}

export const AADE_INCOME_CLASSIFICATION_CATEGORIES = [
  "category1_1","category1_2","category1_3","category1_4","category1_5","category1_6","category1_7","category1_8","category1_9","category1_10","category1_95","category3"
] as const;

export const AADE_EXPENSE_CLASSIFICATION_CATEGORIES = [
  "category2_1","category2_2","category2_3","category2_4","category2_5","category2_6","category2_7","category2_8","category2_9","category2_10","category2_11","category2_12","category2_13","category2_14","category2_95"
] as const;

export type AadeIncomeClassificationCategory = typeof AADE_INCOME_CLASSIFICATION_CATEGORIES[number];
export type AadeExpenseClassificationCategory = typeof AADE_EXPENSE_CLASSIFICATION_CATEGORIES[number];

const INCOME_CATEGORY_SET = new Set<string>(AADE_INCOME_CLASSIFICATION_CATEGORIES);
const EXPENSE_CATEGORY_SET = new Set<string>(AADE_EXPENSE_CLASSIFICATION_CATEGORIES);

export function isAadeIncomeClassificationCategory(value: string): value is AadeIncomeClassificationCategory {
  return INCOME_CATEGORY_SET.has(value.trim());
}

export function isAadeExpenseClassificationCategory(value: string): value is AadeExpenseClassificationCategory {
  return EXPENSE_CATEGORY_SET.has(value.trim());
}
