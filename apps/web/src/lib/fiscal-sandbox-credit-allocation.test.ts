import test from "node:test";
import assert from "node:assert/strict";
import {previewFiscalSandboxCredit} from "./fiscal-sandbox-credit-allocation.ts";

const draftId = "12345678-1234-1234-1234-123456789abc";
const original = (lane = "b2c") => ({
  draftId, lane, currency: "EUR", grossMinor: 8750,
  lines: [
    {lineNo: 1, grossMinor: 5000},
    {lineNo: 2, grossMinor: 2500},
    {lineNo: 3, grossMinor: 1250}
  ]
});
const credit = (externalId: string, lines: {lineNo: number; amountMinor: number}[]) =>
  ({externalId, lines});
const example = () => ({
  original: original(),
  previous: [credit("CREDIT-0001", [{lineNo: 1, amountMinor: 2000}])],
  candidate: credit("CREDIT-0002", [
    {lineNo: 1, amountMinor: 1200},
    {lineNo: 2, amountMinor: 500}
  ])
});

test("calculates bounded residuals without issuing a credit note or transferring funds", () => {
  const result = previewFiscalSandboxCredit(example());
  assert.equal(result.kind, "non_fiscal_test_credit_allocation");
  assert.deepEqual(result.totals, {
    originalGrossMinor: "8750",
    previouslyAllocatedMinor: "2000",
    proposedCreditMinor: "1700",
    remainingGrossMinor: "5050"
  });
  assert.deepEqual(result.rows.map((row) => row.remainingGrossMinor), ["1800", "2000", "1250"]);
  for (const flag of [
    "legalCreditNoteIssued", "taxReversalDetermined", "refundExecuted",
    "officialAccounting", "fiscalIssuanceEnabled"
  ] as const) assert.equal(result[flag], false);
});

test("the same closed-form arithmetic works for all four test lanes", () => {
  for (const lane of ["b2c", "pos", "b2b", "b2g"]) {
    const result = previewFiscalSandboxCredit({...example(), original: original(lane)});
    assert.equal(result.lane, lane);
    assert.equal(result.totals.remainingGrossMinor, "5050");
  }
});

test("a full remaining credit reaches exactly zero, never a negative balance", () => {
  const request = example();
  request.candidate = credit("CREDIT-0003", [
    {lineNo: 1, amountMinor: 3000},
    {lineNo: 2, amountMinor: 2500},
    {lineNo: 3, amountMinor: 1250}
  ]);
  const result = previewFiscalSandboxCredit(request);
  assert.equal(result.totals.remainingGrossMinor, "0");
  assert.deepEqual(result.rows.map((line) => line.remainingGrossMinor), ["0", "0", "0"]);
});

test("rejects proposed over-crediting individual original lines", () => {
  const request = example();
  request.candidate = credit("CREDIT-0003", [{lineNo: 1, amountMinor: 3001}]);
  assert.throws(() => previewFiscalSandboxCredit(request), /CREDIT_OVERALLOCATED/);
  // Aggregate availability cannot hide over-allocation on a single line.
  request.candidate = credit("CREDIT-0004", [{lineNo: 3, amountMinor: 1251}]);
  assert.throws(() => previewFiscalSandboxCredit(request), /CREDIT_OVERALLOCATED/);
});

test("rejects incomplete, repeated or overallocated historical adjustments", () => {
  const request = example();
  assert.throws(() => previewFiscalSandboxCredit({...request,
    previous: [...request.previous, request.previous[0]]
  }), /CREDIT_DUPLICATE_REFERENCE/);
  assert.throws(() => previewFiscalSandboxCredit({...request,
    previous: [credit("CREDIT-0008", [{lineNo: 1, amountMinor: 5001}])]
  }), /CREDIT_HISTORY_OVERALLOCATED/);
  assert.throws(() => previewFiscalSandboxCredit({...request,
    previous: Array.from({length: 101}, (_, i) => credit("HIST-" + String(i).padStart(8, "0"), [
      {lineNo: 1, amountMinor: 1}
    ]))
  }), /CREDIT_INVALID_HISTORY/);
  assert.throws(() => previewFiscalSandboxCredit({...request,
    candidate: credit("CREDIT-0001", [{lineNo: 2, amountMinor: 1}])
  }), /CREDIT_DUPLICATE_REFERENCE/);
});

test("rejects a source snapshot whose line sum disagrees with original draft gross", () => {
  const request = example();
  assert.throws(() => previewFiscalSandboxCredit({...request,
    original: {...request.original, grossMinor: 8751}
  }), /CREDIT_ORIGINAL_TOTAL_MISMATCH/);
  assert.throws(() => previewFiscalSandboxCredit({...request,
    original: {...request.original, lines: request.original.lines.slice(0, 2)}
  }), /CREDIT_ORIGINAL_TOTAL_MISMATCH/);
});

test("rejects duplicate adjustment lines and non-existent source lines", () => {
  const request = example();
  assert.throws(() => previewFiscalSandboxCredit({...request,
    candidate: credit("CREDIT-0010", [{lineNo: 1, amountMinor: 5}, {lineNo: 1, amountMinor: 10}])
  }), /CREDIT_DUPLICATE_LINE/);
  assert.throws(() => previewFiscalSandboxCredit({...request,
    candidate: credit("CREDIT-0011", [{lineNo: 4, amountMinor: 5}])
  }), /CREDIT_INVALID_LINE/);
  assert.throws(() => previewFiscalSandboxCredit({...request,
    original: {...request.original, lines: [
      {lineNo: 1, grossMinor: 5000}, {lineNo: 3, grossMinor: 2500}
    ]}
  }), /CREDIT_NONCONTIGUOUS_ORIGINAL/);
});

test("rejects unknown legal state, document, accounting and tax fields", () => {
  const request = example();
  const forbidden = [
    {...request, issued: true},
    {...request, original: {...request.original, taxNumber: "123456789"}},
    {...request, candidate: {...request.candidate, legalCreditNote: true}},
    {...request, candidate: credit("CREDIT-0022", [
      {lineNo: 1, amountMinor: 2, legalVatBps: 2400}
    ] as {lineNo: number; amountMinor: number}[])}
  ];
  for (const entry of forbidden) {
    assert.throws(() => previewFiscalSandboxCredit(entry), /CREDIT_/);
  }
});

test("rejects amounts that are zero, negative, fractional, or too large", () => {
  for (const amountMinor of [0, -1, 1.5, NaN, Infinity, 1_000_000_000_001]) {
    const request = example();
    request.candidate = credit("CREDIT-0030", [{lineNo: 2, amountMinor}]);
    assert.throws(() => previewFiscalSandboxCredit(request), /CREDIT_INVALID_AMOUNT/);
  }
});

test("fails closed on invalid original identity, currency and input shape", () => {
  assert.throws(() => previewFiscalSandboxCredit(null), /CREDIT_INVALID_INPUT/);
  const request = example();
  assert.throws(() => previewFiscalSandboxCredit({...request,
    original: {...request.original, draftId: "invented"}
  }), /CREDIT_INVALID_DRAFT_ID/);
  assert.throws(() => previewFiscalSandboxCredit({...request,
    original: {...request.original, currency: "USD"}
  }), /CREDIT_INVALID_ORIGINAL/);
  assert.throws(() => previewFiscalSandboxCredit({...request,
    original: {...request.original, lane: "official"}
  }), /CREDIT_INVALID_ORIGINAL/);
});
