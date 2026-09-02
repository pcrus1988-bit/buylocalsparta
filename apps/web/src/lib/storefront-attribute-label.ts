export function formatStorefrontAttributeAdvisory(label: string, value: string): string {
  const cleanLabel = label.trim();
  const cleanValue = value.trim();
  if (!cleanLabel) return cleanValue ? `Ζητούμενο: ${cleanValue}` : "Ζητούμενο";
  if (!cleanValue || comparable(cleanLabel) === comparable(cleanValue)) return `Ζητούμενο: ${cleanLabel}`;
  return `Ζητούμενο: ${cleanLabel} ${cleanValue}`;
}

function comparable(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("el-GR")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "");
}
