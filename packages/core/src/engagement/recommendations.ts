import type { CustomerRecommendation, RecommendationProduct, RecommendationSignal } from "./types.ts";

const EXPLANATIONS = {
  el: {
    same_category_as_saved: "Σχετίζεται με κατηγορία που έχεις αποθηκεύσει.",
    same_brand_as_saved: "Είναι από μάρκα που έχεις αποθηκεύσει.",
    recent_category_interest: "Σχετίζεται με πρόσφατη κατηγορία που είδες.",
    recent_brand_interest: "Σχετίζεται με μάρκα που είδες πρόσφατα.",
    available_locally: "Είναι διαθέσιμο τοπικά τώρα.",
    advice_available: "Υπάρχει διαθέσιμη τοπική συμβουλή."
  },
  en: {
    same_category_as_saved: "It matches a category you saved.",
    same_brand_as_saved: "It is from a brand you saved.",
    recent_category_interest: "It relates to a category you viewed recently.",
    recent_brand_interest: "It relates to a brand you viewed recently.",
    available_locally: "It is currently available locally.",
    advice_available: "Local advice is available."
  }
} as const;

function explain(reasons: readonly string[], locale: "el" | "en"): string {
  const dictionary = EXPLANATIONS[locale];
  return reasons.slice(0, 3).map((reason) => dictionary[reason as keyof typeof dictionary] ?? reason).join(" ");
}

export class CustomerRecommendationService {
  recommend(input: {
    enabled: boolean;
    products: readonly RecommendationProduct[];
    saved: readonly RecommendationSignal[];
    recentlyViewed: readonly RecommendationSignal[];
    limit?: number;
    locale?: "el" | "en";
    maxPerBrand?: number;
    maxPerCategory?: number;
  }): readonly CustomerRecommendation[] {
    if (!input.enabled) return [];
    if (!input.saved.length && !input.recentlyViewed.length) return [];
    const savedIds = new Set(input.saved.map((item) => item.canonicalVariantId));
    const savedCategories = new Map<string, number>();
    const savedBrands = new Map<string, number>();
    for (const item of input.saved) {
      savedCategories.set(item.categoryCode, (savedCategories.get(item.categoryCode) ?? 0) + 1);
      if (item.brand) savedBrands.set(item.brand.toLocaleLowerCase("el-GR"), (savedBrands.get(item.brand.toLocaleLowerCase("el-GR")) ?? 0) + 1);
    }
    const recentCategories = new Map<string, number>();
    const recentBrands = new Map<string, number>();
    const sortedRecent = [...input.recentlyViewed].sort((a, b) => (b.viewedAt ?? 0) - (a.viewedAt ?? 0));
    sortedRecent.forEach((item, index) => {
      const weight = Math.max(0.25, 1 - index * 0.12);
      recentCategories.set(item.categoryCode, (recentCategories.get(item.categoryCode) ?? 0) + weight);
      if (item.brand) {
        const brand = item.brand.toLocaleLowerCase("el-GR");
        recentBrands.set(brand, (recentBrands.get(brand) ?? 0) + weight);
      }
    });

    const scored: Array<CustomerRecommendation & { categoryCode: string; brandKey: string }> = [];
    for (const product of input.products) {
      if (!product.available || savedIds.has(product.canonicalVariantId)) continue;
      const reasons: string[] = [];
      let score = 0;
      const savedCategory = savedCategories.get(product.categoryCode) ?? 0;
      if (savedCategory > 0) { score += Math.min(12, savedCategory * 6); reasons.push("same_category_as_saved"); }
      const brandKey = product.brand?.toLocaleLowerCase("el-GR") ?? "";
      const savedBrand = brandKey ? savedBrands.get(brandKey) ?? 0 : 0;
      if (savedBrand > 0) { score += Math.min(10, savedBrand * 5); reasons.push("same_brand_as_saved"); }
      const recentCategory = recentCategories.get(product.categoryCode) ?? 0;
      if (recentCategory > 0) { score += Math.min(8, recentCategory * 4); reasons.push("recent_category_interest"); }
      const recentBrand = brandKey ? recentBrands.get(brandKey) ?? 0 : 0;
      if (recentBrand > 0) { score += Math.min(6, recentBrand * 3); reasons.push("recent_brand_interest"); }
      score += 1;
      reasons.push("available_locally");
      if (product.adviceAvailable) { score += 0.25; reasons.push("advice_available"); }
      scored.push({ canonicalVariantId: product.canonicalVariantId, score: Math.round(score * 1000) / 1000, reasons, explanation: explain(reasons, input.locale ?? "el"), categoryCode: product.categoryCode, brandKey });
    }

    const target = Math.min(20, Math.max(1, input.limit ?? 8));
    const maxPerBrand = Math.max(1, input.maxPerBrand ?? 2);
    const maxPerCategory = Math.max(1, input.maxPerCategory ?? 3);
    const brandCounts = new Map<string, number>();
    const categoryCounts = new Map<string, number>();
    const chosen: typeof scored = [];
    for (const item of scored.sort((a, b) => b.score - a.score || a.canonicalVariantId.localeCompare(b.canonicalVariantId))) {
      if (chosen.length >= target) break;
      const brandCount = item.brandKey ? brandCounts.get(item.brandKey) ?? 0 : 0;
      const categoryCount = categoryCounts.get(item.categoryCode) ?? 0;
      if (item.brandKey && brandCount >= maxPerBrand) continue;
      if (categoryCount >= maxPerCategory) continue;
      chosen.push(item);
      if (item.brandKey) brandCounts.set(item.brandKey, brandCount + 1);
      categoryCounts.set(item.categoryCode, categoryCount + 1);
    }
    return chosen.map(({ categoryCode: _categoryCode, brandKey: _brandKey, ...item }) => structuredClone(item));
  }
}
