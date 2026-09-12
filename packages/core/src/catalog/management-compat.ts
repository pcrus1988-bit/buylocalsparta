import { money } from "../common/money.ts";
import { CatalogManagementService as BaseCatalogManagementService, type CanonicalCatalogProduct } from "./management.ts";

type CreateCanonicalInput = Parameters<BaseCatalogManagementService["createCanonicalFromSubmission"]>[0] & {
  /** Legacy development-smoke input only; production Admin canonical creation omits it. */
  platformPriceMinor?: number;
};

/**
 * Compatibility boundary for the legacy development runtime.
 * Core canonical creation remains price-less by default. No supplier cost or MSRP is
 * inferred as retail; a price is attached only when a legacy caller explicitly supplies it.
 */
export class CatalogManagementService extends BaseCatalogManagementService {
  override createCanonicalFromSubmission(input: CreateCanonicalInput): CanonicalCatalogProduct {
    const canonical = super.createCanonicalFromSubmission(input);
    if (input.platformPriceMinor === undefined) return canonical;
    const priced: CanonicalCatalogProduct = { ...canonical, platformPrice: money(input.platformPriceMinor) };
    this.registerCanonical(priced);
    return this.canonical(priced.id)!;
  }
}
