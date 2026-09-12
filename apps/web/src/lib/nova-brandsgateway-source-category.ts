const LABEL_KEYS = ["name", "label", "title", "category_name", "categoryName", "slug"] as const;
const NESTED_KEYS = ["parent", "parents", "ancestor", "ancestors", "category", "categories", "children"] as const;

function categoryLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || /^\d+$/.test(text)) return null;
  return text.slice(0, 160);
}

function collectLabels(value: unknown, output: string[], depth = 0): void {
  if (depth > 5 || value == null) return;

  if (Array.isArray(value)) {
    for (const item of value) collectLabels(item, output, depth + 1);
    return;
  }

  const scalar = categoryLabel(value);
  if (scalar) {
    output.push(scalar);
    return;
  }

  if (typeof value !== "object") return;
  const record = value as Record<string, unknown>;

  // Prefer explicit human-readable labels from Nova category_details. Do not
  // walk arbitrary object values because provider IDs must never become labels.
  for (const key of LABEL_KEYS) {
    const label = categoryLabel(record[key]);
    if (label) {
      output.push(label);
      break;
    }
  }

  for (const key of NESTED_KEYS) {
    if (key in record) collectLabels(record[key], output, depth + 1);
  }
}

/**
 * Convert Nova/BrandsGateway's provider-native `category_details` / `categories`
 * payload into a stable human-readable path used by the shipping pricing engine.
 * `category_details` is authoritative when it contains labels; `categories` is
 * only a fallback because some API responses expose category IDs there.
 */
export function novaBrandsGatewaySourceCategoryPath(
  categoryDetails: unknown,
  categories: unknown
): string | null {
  const detailed: string[] = [];
  collectLabels(categoryDetails, detailed);

  const fallback: string[] = [];
  if (!detailed.length) collectLabels(categories, fallback);

  const source = detailed.length ? detailed : fallback;
  const seen = new Set<string>();
  const labels = source.filter((label) => {
    const key = label.normalize("NFKC").toLocaleLowerCase("en-US");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return labels.length ? labels.join(" › ") : null;
}
