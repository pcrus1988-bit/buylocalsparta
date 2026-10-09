// NYXI Agent 5: pure, fail-closed retrieval core. No database writes or public API.
// Only Agent 4 evidence that resolves to an authorized, archived snapshot is searchable.
const READY = new Set(["ready", "complete"]);
const ARCHIVED = new Set(["archived", "ready"]);
const HEX_SHA256 = /^[a-f0-9]{64}$/i;
const COMPLEX_FINISHES = new Set(["magnetic", "cat-eye", "chrome", "glitter", "metallic", "pearl", "holographic"]);

function timestamp(value) {
  if (typeof value !== "string" || !value.trim()) return NaN;
  return Date.parse(value);
}
function present(value) { return typeof value === "string" && value.trim().length > 0; }
function same(a, b) { return String(a ?? "").toLocaleLowerCase("en") === String(b ?? "").toLocaleLowerCase("en"); }
function tokens(value) {
  return String(value ?? "").normalize("NFKC").toLocaleLowerCase("en")
    .match(/[\\p{L}\\p{N}]+/gu) ?? [];
}

/** Explicitly refuse orphaned, unapproved, expired, non-archived or unreviewed evidence. */
export function provenanceEligible(row, now = new Date()) {
  if (!row || !present(row.fragmentId) || !present(row.text) || row.reviewState !== "verified") return false;
  const { source, snapshot, manifest, approval } = row;
  if (!source || !snapshot || !manifest || !approval) return false;
  if (!present(source.id) || source.status !== "verified") return false;
  if (!present(snapshot.id) || !same(snapshot.sourceId, source.id) || !HEX_SHA256.test(snapshot.sha256 ?? "")) return false;
  if (!present(snapshot.storagePath) || snapshot.storageBucket !== "nyxi-evidence") return false;
  if (!same(manifest.snapshotId, snapshot.id) || !same(manifest.sourceId, source.id)) return false;
  if (!ARCHIVED.has(manifest.corpusState) || !READY.has(manifest.extractionStatus)) return false;
  if (approval.acquisitionAuthorized !== true || !same(approval.sourceId, source.id)) return false;
  if (!present(approval.assetUrl) || !same(approval.assetUrl, snapshot.requestedUrl)) return false;
  if (!same(approval.approvedFinalUrl || approval.assetUrl, snapshot.finalUrl)) return false;
  if (!present(approval.retentionPolicy) || !present(approval.rightsBasis) || !present(approval.approvedBy)) return false;
  const captured = timestamp(snapshot.fetchedAt);
  const approved = timestamp(approval.approvedAt);
  const expiry = timestamp(approval.expiresAt);
  const review = timestamp(approval.reviewDueAt);
  const current = now instanceof Date ? now.getTime() : timestamp(now);
  if (![captured, approved, expiry, review, current].every(Number.isFinite)) return false;
  if (!(approved <= captured && captured < expiry && current < expiry && current < review)) return false;
  if (approval.retentionUntil != null) {
    const retention = timestamp(approval.retentionUntil);
    if (!Number.isFinite(retention) || current >= retention) return false;
  }
  return true;
}

const FILTER_FIELDS = Object.freeze({
  jurisdiction: "jurisdiction", authority: "authority", evidenceType: "evidenceType",
  sourceId: "sourceId", brand: "brand", line: "line", productId: "productId",
  sku: "sku", ingredientId: "ingredientId", formulaId: "formulaId",
  legalStatus: "legalStatus", sdsRevision: "sdsRevision",
  claimStatus: "claimStatus", recallStatus: "recallStatus",
  manufacturingTerm: "manufacturingTerm", productType: "productType"
});

function matchesHardFilters(row, filters) {
  for (const [key, field] of Object.entries(FILTER_FIELDS)) {
    if (filters[key] == null) continue;
    const actual = key === "sourceId" ? row.source?.id : row[field];
    if (Array.isArray(actual)) {
      if (!actual.some(v => same(v, filters[key]))) return false;
    } else if (!same(actual, filters[key])) return false;
  }
  if (!filters.includeSuperseded && row.superseded === true) return false;
  if (filters.effectiveAt != null) {
    const date = timestamp(filters.effectiveAt);
    if (!Number.isFinite(date)) return false;
    const from = timestamp(row.effectiveFrom);
    const to = row.effectiveTo == null ? Infinity : timestamp(row.effectiveTo);
    if (!Number.isFinite(from) || Number.isNaN(to) || date < from || date >= to) return false;
  }
  return true;
}

export function evidenceCitation(row) {
  return Object.freeze({
    sourceId: row.source.id, sourceUrl: row.source.canonicalUrl,
    snapshotId: row.snapshot.id, fragmentId: row.fragmentId,
    sha256: row.snapshot.sha256, fetchedAt: row.snapshot.fetchedAt,
    documentRevision: row.documentRevision ?? null,
    page: row.page ?? null, section: row.section ?? null,
    effectiveFrom: row.effectiveFrom ?? null, effectiveTo: row.effectiveTo ?? null,
    superseded: row.superseded === true
  });
}

/** Hard-filter BEFORE ranking. External semantic scores must be keyed by verified fragment ID. */
export function searchEvidence(rows, { query = "", filters = {}, semanticScores = {}, limit = 20, now = new Date() } = {}) {
  const q = [...new Set(tokens(query))];
  const cap = Math.max(0, Math.min(100, Number.isInteger(limit) ? limit : 20));
  return rows.filter(row => provenanceEligible(row, now) && matchesHardFilters(row, filters))
    .map(row => {
      const haystack = tokens([row.text, row.title, row.originalTerm, row.normalizedTerm].join(" "));
      const lexical = q.length ? q.filter(word => haystack.includes(word)).length / q.length : 0;
      const rawSemantic = semanticScores[row.fragmentId];
      const semantic = Number.isFinite(rawSemantic) ? Math.min(1, Math.max(0, rawSemantic)) : 0;
      return { row, lexical, semantic, score: 0.65 * lexical + 0.35 * semantic };
    })
    .filter(item => !q.length || item.lexical > 0 || item.semantic > 0)
    .sort((a, b) => b.score - a.score || a.row.fragmentId.localeCompare(b.row.fragmentId))
    .slice(0, cap)
    .map(item => ({
      fragmentId: item.row.fragmentId, text: item.row.text, score: item.score,
      lexicalScore: item.lexical, semanticScore: item.semantic,
      citation: evidenceCitation(item.row),
      explanation: { matchedTerms: q.filter(t => tokens(item.row.text).includes(t)), provenanceVerified: true }
    }));
}

function triple(value) {
  return Array.isArray(value) && value.length === 3 && value.every(v => Number.isFinite(v)) ? value : null;
}
function distance(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }

/** Perceptual comparison: OKLab preferred, CIE Lab fallback; never compare HEX/RGB. */
export function compareShades(shades, target, {
  finish, opacity, undertone, allowCrossFinish = false, now = new Date(), limit = 20
} = {}) {
  const targetOK = triple(target?.oklab);
  const targetLab = triple(target?.lab);
  if (!targetOK && !targetLab) return [];
  const requestedFinish = finish ?? target.finish;
  const requestedOpacity = opacity ?? target.opacity;
  const requestedUndertone = undertone ?? target.undertone;
  const results = [];
  for (const shade of shades) {
    if (requestedOpacity && !same(shade.opacity, requestedOpacity)) continue;
    if (requestedUndertone && !same(shade.undertone, requestedUndertone)) continue;
    if (requestedFinish && !same(shade.finish, requestedFinish)) {
      if (!allowCrossFinish || COMPLEX_FINISHES.has(String(shade.finish).toLowerCase())
        || COMPLEX_FINISHES.has(String(requestedFinish).toLowerCase())) continue;
    }
    const valid = (shade.measurements ?? []).filter(m =>
      present(m.id) && ["measured", "derived"].includes(m.method)
      && Number.isFinite(m.confidence) && m.confidence > 0 && m.confidence <= 1
      && provenanceEligible(m.evidence, now)
    );
    const candidates = valid.map(m => {
      const ok = triple(m.oklab);
      const lab = triple(m.lab);
      const space = targetOK && ok ? "OKLab" : targetLab && lab ? "CIELAB" : null;
      if (!space) return null;
      const delta = space === "OKLab" ? distance(targetOK, ok) : distance(targetLab, lab);
      const adjusted = delta / m.confidence;
      return { measurement: m, space, distance: delta, adjustedDistance: adjusted };
    }).filter(Boolean).sort((a, b) => a.adjustedDistance - b.adjustedDistance || a.measurement.id.localeCompare(b.measurement.id));
    if (!candidates.length) continue;
    const best = candidates[0];
    results.push({
      shadeId: shade.id, brand: shade.brand, line: shade.line, sku: shade.sku,
      finish: shade.finish, opacity: shade.opacity, undertone: shade.undertone,
      measurementId: best.measurement.id, measurementMethod: best.measurement.method,
      confidence: best.measurement.confidence, colorSpace: best.space,
      distance: best.distance, adjustedDistance: best.adjustedDistance,
      validMeasurementCount: candidates.length, citation: evidenceCitation(best.measurement.evidence)
    });
  }
  return results.sort((a, b) => a.adjustedDistance - b.adjustedDistance || String(a.shadeId).localeCompare(String(b.shadeId)))
    .slice(0, Math.max(0, Math.min(100, Number.isInteger(limit) ? limit : 20)));
}
