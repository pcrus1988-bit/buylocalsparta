import { money } from "../common/money.ts";
import { CatalogManagementService as BaseCatalogManagementService, type CanonicalCatalogProduct } from "./management.ts";

type CreateCanonicalInput = Parameters<BaseCatalogManagementService["createCanonicalFromSubmission"]>[0] & {
  /**
   * Backward-compatible explicit price input for legacy callers only.
   * New Admin canonical-identity creation omits this and therefore creates no retail price.
   */
  platformPriceMinor?: number;
};

/**
 * Compatibility boundary for legacy development callers that still submit an explicit
 * retail price in the same request as canonical identity creation.
 *
 * The core catalogue contract remains price-less by default: no price is inferred from
 * supplier cost, MSRP or any other source. A price is attached only when the caller
 * explicitly supplied platformPriceMinor.
 */
export class CatalogManagementService extends BaseCatalogManagementService {
  override createCanonicalFromSubmission(input: CreateCanonicalInput): CanonicalCatalogProduct {
    const canonical = super.createCanonicalFromSubmission(input);
    if (input.platformPriceMinor === undefined) return canonical;

    const priced: CanonicalCatalogProduct = {
      ...canonical,
      platformPrice: money(input.platformPriceMinor)
    };
    this.registerCanonical(priced);
    return this.canonical(priced.id)!;
  }
}
