import type {
  IcecatImage,
  IcecatSpecification,
  OpenIcecatProductDraft,
  OpenIcecatSourceProduct
} from "./types.ts";
import { assessGreekProductContent } from "./localization.ts";
import {
  asBoolean,
  asRecord,
  firstArray,
  firstText,
  isValidGtin,
  localizedText,
  localizedValue,
  normalizeGtin,
  normalizeKey,
  normalizeLocale,
  sanitizeIcecatPayload,
  stripContentToken
} from "./utils.ts";

export function normalizeOpenIcecatGreekProduct(
  payload: Readonly<Record<string, unknown>>,
  requestedGtin: string,
  minimumGreekScore = 0.9
): OpenIcecatProductDraft {
  const data = unwrapData(payload);
  const general = asRecord(data.GeneralInfo);
  const description = asRecord(general.Description);
  const titleInfo = asRecord(general.TitleInfo);
  const productNameInfo = asRecord(general.ProductNameInfo);
  const localTitle = localizedValue(titleInfo.GeneratedLocalTitle);
  const brandTitle = localizedValue(titleInfo.BrandLocalTitle);
  const localProductName = localizedValue(productNameInfo.ProductLocalName);
  const rawTitle = firstText(localTitle.value, brandTitle.value, general.Title, general.ProductName);
  if (!rawTitle) throw new Error("Icecat product does not contain a usable title");

  const titleLocale = normalizeLocale(firstText(localTitle.locale, brandTitle.locale), "UND");
  const title = localizedText(rawTitle, titleLocale, titleLocale === "EL" ? "ICECAT_NATIVE_EL" : "ICECAT_SOURCE_FALLBACK");

  const rawDescription = firstText(description.LongDesc, description.MiddleDesc, description.LongProductName);
  const descriptionLocale = normalizeLocale(firstText(description.Language), "UND");
  const normalizedDescription = rawDescription
    ? localizedText(rawDescription, descriptionLocale, descriptionLocale === "EL" ? "ICECAT_NATIVE_EL" : "ICECAT_SOURCE_FALLBACK")
    : undefined;

  const categoryObject = asRecord(general.Category);
  const categoryName = localizedValue(categoryObject.Name);
  const rawCategory = firstText(categoryName.value, categoryObject.Name, categoryObject.Value);
  const categoryLocale = normalizeLocale(categoryName.locale, "UND");
  const category = rawCategory
    ? localizedText(rawCategory, categoryLocale, categoryLocale === "EL" ? "ICECAT_NATIVE_EL" : "ICECAT_SOURCE_FALLBACK")
    : undefined;

  const productName = localProductName.value
    ? localizedText(
        localProductName.value,
        normalizeLocale(localProductName.locale, "UND"),
        normalizeLocale(localProductName.locale, "UND") === "EL" ? "ICECAT_NATIVE_EL" : "ICECAT_SOURCE_FALLBACK"
      )
    : undefined;

  const gtins = approvedGtins(general);
  const primaryGtin = gtins.includes(requestedGtin) ? requestedGtin : gtins[0] ?? requestedGtin;
  if (!isValidGtin(primaryGtin)) throw new Error("Icecat response does not contain a valid GTIN");

  const specifications = extractSpecifications(data);
  const images = extractImages(data);
  const variants = extractVariants(data);
  const greekQuality = assessGreekProductContent({ title, description: normalizedDescription, category, specifications }, minimumGreekScore);

  return {
    icecatId: firstText(general.IcecatId, general.IcecatID, data.IcecatId, data.IcecatID),
    gtins: gtins.length ? gtins : [primaryGtin],
    primaryGtin,
    brand: firstText(general.Brand, asRecord(general.BrandInfo).BrandName),
    brandPartCode: firstText(general.BrandPartCode, general.ProductCode),
    productName,
    title,
    description: normalizedDescription,
    category,
    specifications,
    images,
    variants,
    sourceLocale: "EL",
    sourcePayload: sanitizeIcecatPayload(payload),
    greekQuality
  };
}

export function normalizeOpenIcecatSourceProduct(
  payload: Readonly<Record<string, unknown>>,
  requestedGtin: string
): OpenIcecatSourceProduct {
  const data = unwrapData(payload);
  const general = asRecord(data.GeneralInfo);
  const description = asRecord(general.Description);
  const titleInfo = asRecord(general.TitleInfo);
  const category = asRecord(general.Category);
  const categoryName = localizedValue(category.Name);
  const title = firstText(
    localizedValue(titleInfo.GeneratedLocalTitle).value,
    localizedValue(titleInfo.BrandLocalTitle).value,
    titleInfo.GeneratedIntTitle,
    general.Title,
    general.ProductName
  );
  if (!title) throw new Error(`Icecat fallback product ${requestedGtin} has no title`);
  return {
    brand: firstText(general.Brand, asRecord(general.BrandInfo).BrandName),
    brandPartCode: firstText(general.BrandPartCode, general.ProductCode),
    title,
    description: firstText(description.LongDesc, description.MiddleDesc, description.LongProductName),
    category: firstText(categoryName.value, category.Name, category.Value),
    specifications: extractSpecifications(data).map((spec) => ({
      key: spec.key,
      name: spec.name.value,
      value: spec.value.value,
      rawValue: spec.rawValue,
      unit: spec.unit,
      searchable: spec.searchable
    }))
  };
}

function extractSpecifications(data: Record<string, unknown>): IcecatSpecification[] {
  const groups = firstArray(data.FeaturesGroups, data.FeatureGroups, data.Features);
  const features: unknown[] = [];
  for (const group of groups) {
    const record = asRecord(group);
    const nested = firstArray(record.Features, record.Feature, record.ProductFeatures);
    if (nested.length) features.push(...nested);
    else if (record.Feature || record.Name || record.PresentationValue) features.push(group);
  }

  const result: IcecatSpecification[] = [];
  for (const item of features) {
    const feature = asRecord(item);
    const detail = asRecord(feature.Feature);
    const nameObject = localizedValue(detail.Name ?? feature.Name);
    const name = firstText(nameObject.value, detail.Name, feature.Name);
    const presentation = firstText(feature.PresentationValue, feature.LocalValue, feature.Value, feature.RawValue);
    if (!name || !presentation) continue;
    const locale = normalizeLocale(nameObject.locale, "UND");
    const valueLocale = locale === "EL" ? "EL" : normalizeLocale(firstText(asRecord(feature.LocalValue).Language), locale);
    result.push({
      key: firstText(feature.ID, detail.ID) || normalizeKey(name),
      name: localizedText(name, locale, locale === "EL" ? "ICECAT_NATIVE_EL" : "ICECAT_SOURCE_FALLBACK"),
      value: localizedText(presentation, valueLocale, valueLocale === "EL" ? "ICECAT_NATIVE_EL" : "ICECAT_SOURCE_FALLBACK"),
      rawValue: firstText(feature.RawValue, feature.Value),
      unit: firstText(asRecord(detail.Measure).Sign, asRecord(asRecord(detail.Measure).Signs)._, feature.Sign),
      searchable: asBoolean(feature.Searchable)
    });
  }
  return dedupeSpecifications(result);
}

function extractImages(data: Record<string, unknown>): IcecatImage[] {
  const gallery = firstArray(data.Gallery, asRecord(data.Gallery).Images, data.Images);
  const output: IcecatImage[] = [];
  const primaryImage = asRecord(data.Image);
  const primary = firstText(primaryImage.HighPic, primaryImage.OriginalPic, primaryImage.Pic, primaryImage.Pic500x500);
  if (primary) output.push({ url: stripContentToken(primary), kind: "primary" });
  for (const item of gallery) {
    const image = asRecord(item);
    const url = firstText(image.Pic, image.HighPic, image.OriginalPic, image.Pic500x500, image.ThumbPic, image.URL, image.Url);
    if (!url) continue;
    const safeUrl = stripContentToken(url);
    if (!output.some((candidate) => candidate.url === safeUrl)) {
      output.push({ url: safeUrl, kind: output.length ? "gallery" : "primary" });
    }
  }
  return output;
}

function extractVariants(data: Record<string, unknown>): OpenIcecatProductDraft["variants"] {
  return firstArray(data.Variants).map((item) => {
    const variant = asRecord(item);
    return {
      id: firstText(variant.VariantID, variant.ID),
      identifiers: firstArray(variant.VariantIdentifiers, variant.Identifiers)
        .map((identifier) => {
          const value = asRecord(identifier);
          return {
            type: firstText(value["Identifier Type"], value.Type, value.IdentifierType) || "unknown",
            value: firstText(value.Value, value.GTIN) || "",
            approved: asBoolean(value.IsApproved)
          };
        })
        .filter((identifier) => identifier.value)
    };
  });
}

function approvedGtins(general: Record<string, unknown>): string[] {
  const candidates: string[] = [];
  for (const value of firstArray(general.GTIN)) {
    const text = firstText(value);
    if (text) candidates.push(text);
  }
  for (const item of firstArray(general.GTINs)) {
    const record = asRecord(item);
    if (record.IsApproved === false) continue;
    const text = firstText(record.GTIN, record.Value);
    if (text) candidates.push(text);
  }
  return [...new Set(candidates.map(normalizeGtin).filter(isValidGtin))];
}

function unwrapData(payload: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const data = asRecord(payload.data);
  return Object.keys(data).length ? data : payload as Record<string, unknown>;
}

function dedupeSpecifications(values: readonly IcecatSpecification[]): IcecatSpecification[] {
  const byKey = new Map<string, IcecatSpecification>();
  for (const value of values) if (!byKey.has(value.key)) byKey.set(value.key, value);
  return [...byKey.values()];
}
