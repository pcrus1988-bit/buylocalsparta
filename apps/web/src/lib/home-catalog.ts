import { createHash } from "node:crypto";
import {
  getCanonicalAvailability,
  getCatalogCard,
  getPublicCatalogProducts,
  type CatalogCard
} from "./catalog-view";

const ROTATION_WINDOW_MS = 30 * 60 * 1000;
const AVAILABILITY_BATCH_SIZE = 8;
const AVAILABLE_CANDIDATE_BUFFER = 8;

function score(seed: string, value: string): string {
  return createHash("sha256").update(`${seed}:${value}`).digest("hex");
}

/**
 * Homepage discovery intentionally performs read-only availability checks before
 * invoking the fairness assignment engine. This prevents products that are never
 * rendered on the homepage from receiving qualified exposure/assignment events.
 *
 * The final visible cards still use getCatalogCard(), so vendor choice, sticky
 * attribution and the live offer price remain governed by the same authoritative
 * fairness path as product pages and catalogue discovery.
 */
export async function getHomepageCatalogCards(
  visitorKey: string,
  postcode = "23100",
  limit = 4
): Promise<readonly CatalogCard[]> {
  if (limit <= 0) return [];

  const canonicals = await getPublicCatalogProducts();
  if (!canonicals.length) return [];

  const rotationSlot = Math.floor(Date.now() / ROTATION_WINDOW_MS);
  const seed = `${visitorKey}:${rotationSlot}`;
  const ordered = [...canonicals].sort((left, right) => score(seed, left.id).localeCompare(score(seed, right.id)));
  const availableIds: string[] = [];
  const targetCandidateCount = Math.min(ordered.length, Math.max(limit, AVAILABLE_CANDIDATE_BUFFER));

  for (let start = 0; start < ordered.length && availableIds.length < targetCandidateCount; start += AVAILABILITY_BATCH_SIZE) {
    const batch = ordered.slice(start, start + AVAILABILITY_BATCH_SIZE);
    const availability = await Promise.all(batch.map((product) => getCanonicalAvailability(product.id, postcode)));
    for (let index = 0; index < batch.length; index += 1) {
      if (availability[index]?.available) availableIds.push(batch[index].id);
      if (availableIds.length >= targetCandidateCount) break;
    }
  }

  const cards: CatalogCard[] = [];
  for (const canonicalVariantId of availableIds) {
    if (cards.length >= limit) break;
    try {
      const card = await getCatalogCard(canonicalVariantId, visitorKey, postcode);
      if (card?.available) cards.push(card);
    } catch (error) {
      console.error(JSON.stringify({
        level: "error",
        event: "storefront.homepage_assignment_degraded",
        canonicalVariantId,
        message: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  return cards;
}
