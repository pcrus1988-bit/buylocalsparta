import type {
  GreekProductContentQuality,
  GreekProductLocalizationInput,
  IcecatLocalizedText,
  IcecatSpecification,
  OpenIcecatProductDraft,
  VerifiedSourceSpecification
} from "./types.ts";
import { localizedText, normalizeKey, preservesNumericFacts } from "./utils.ts";

export function applyVerifiedGreekLocalization(
  draft: OpenIcecatProductDraft,
  localization: GreekProductLocalizationInput,
  minimumGreekScore = 0.9,
  verifiedSourceSpecifications: readonly VerifiedSourceSpecification[] = draft.specifications.map((spec) => ({
    key: spec.key,
    name: spec.name.value,
    value: spec.value.value,
    rawValue: spec.rawValue,
    unit: spec.unit,
    searchable: spec.searchable
  }))
): OpenIcecatProductDraft {
  const title = localizedDerived(localization.title) ?? draft.title;
  const description = localizedDerived(localization.description) ?? draft.description;
  const category = localizedDerived(localization.category) ?? draft.category;
  const verifiedByKey = new Map(verifiedSourceSpecifications.map((spec) => [spec.key, spec] as const));
  const specifications = localization.specifications?.length
    ? localization.specifications
        .filter((spec) => spec.name.trim() && spec.value.trim())
        .map((spec) => {
          const key = spec.key.trim() || normalizeKey(spec.name);
          const source = verifiedByKey.get(key);
          if (!source) throw new Error(`Localized Icecat specification ${key} is not present in verified source data`);
          if (!preservesNumericFacts(source.value, spec.value)) {
            throw new Error(`Localized Icecat specification ${key} changed a numeric fact`);
          }
          return {
            key,
            name: localizedText(spec.name.trim(), "EL", "TRANSLATED_VERIFIED"),
            value: localizedText(spec.value.trim(), "EL", "TRANSLATED_VERIFIED"),
            rawValue: source.rawValue?.trim() || undefined,
            unit: source.unit?.trim() || undefined,
            searchable: source.searchable
          };
        })
    : draft.specifications;

  return {
    ...draft,
    title,
    description,
    category,
    specifications,
    greekQuality: assessGreekProductContent({ title, description, category, specifications }, minimumGreekScore)
  };
}

export function assessGreekProductContent(
  content: Readonly<{
    title?: IcecatLocalizedText;
    description?: IcecatLocalizedText;
    category?: IcecatLocalizedText;
    specifications?: readonly IcecatSpecification[];
  }>,
  minimumScore = 0.9
): GreekProductContentQuality {
  if (!Number.isFinite(minimumScore) || minimumScore < 0 || minimumScore > 1) {
    throw new Error("Greek quality threshold must be between 0 and 1");
  }
  const required = {
    title: Boolean(content.title?.value.trim() && content.title.locale === "EL"),
    description: Boolean(content.description?.value.trim() && content.description.locale === "EL"),
    category: Boolean(content.category?.value.trim() && content.category.locale === "EL"),
    specifications: Boolean(
      content.specifications?.length
      && content.specifications.every((spec) => spec.name.locale === "EL" && spec.value.locale === "EL")
    )
  } as const;
  const weights = { title: 0.3, description: 0.3, category: 0.2, specifications: 0.2 } as const;
  const score = (Object.keys(required) as (keyof typeof required)[]).reduce(
    (sum, key) => sum + (required[key] ? weights[key] : 0),
    0
  );
  const missing = (Object.keys(required) as (keyof typeof required)[]).filter((key) => !required[key]);
  return {
    score: Number(score.toFixed(5)),
    status: score >= minimumScore ? "READY" : "NEEDS_ENRICHMENT",
    required,
    missing
  };
}

function localizedDerived(value: string | undefined): IcecatLocalizedText | undefined {
  const normalized = value?.trim();
  return normalized ? localizedText(normalized, "EL", "TRANSLATED_VERIFIED") : undefined;
}
