/**
 * Cross-check a non-identifying set of registry postcodes with official
 * GISCO 2025 postcode-point ADVISORY candidates. No individual GEMI record
 * or verified physical address is read or inferred.
 */
import { readFileSync } from "node:fs";

export function postcodeSourceCoverage(
  postcodes: readonly string[],
  reviewRows: readonly Readonly<{ postcode: string; reviewReason: string }>[]
) {
  const sought = new Set(postcodes.filter(p => /^[0-9]{5}$/.test(p)));
  const byCode = new Map(reviewRows.filter(r => /^[0-9]{5}$/.test(r.postcode)).map(r => [r.postcode,r]));
  const matched = [...sought].filter(p => byCode.has(p));
  const byReviewReason = Object.fromEntries(
    [...new Set(reviewRows.map(x => x.reviewReason))].map(reason => [
      reason, matched.filter(p => byCode.get(p)?.reviewReason === reason).length
    ])
  );
  return {
    distinctRegistryPostcodes: sought.size,
    sourcePostcodes: byCode.size,
    overlap: matched.length,
    missingFromSource: sought.size - matched.length,
    overlapPct: sought.size ? Number((100 * matched.length / sought.size).toFixed(2)) : 0,
    matchedByReviewReason: byReviewReason,
    verifiedBusinessAddresses: 0,
    publishableFromPostcodeOnly: 0
  };
}

if (process.argv[1]?.endsWith("check-gemi-postcode-coverage.ts")) {
  const inventory = process.argv[2];
  const candidates = process.argv[3];
  if (!inventory || !candidates || process.argv.length !== 4) {
    throw new Error("Expected non-identifying JSON postcode inventory and postcode-candidate NDJSON");
  }
  const dataset = JSON.parse(readFileSync(inventory, "utf8")) as { postcodes: string[] };
  if (!Array.isArray(dataset.postcodes)) throw new Error("Missing postcode inventory");
  const reviews = readFileSync(candidates, "utf8").split(/\r?\n/)
    .filter(Boolean).map(line => JSON.parse(line) as {postcode:string;reviewReason:string});
  console.log(JSON.stringify(postcodeSourceCoverage(dataset.postcodes, reviews), null, 2));
}
