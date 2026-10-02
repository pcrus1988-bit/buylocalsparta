function normalizedBrand(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("el-GR")
    .replace(/[^\p{L}\p{N}.]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const DISPLAY_ALIASES: Readonly<Record<string,string>> = {
  sketchers: "Skechers"
};

const GUIDE_KEY_ALIASES: Readonly<Record<string,string>> = {
  sketchers: "skechers"
};

export function canonicalSportBrand(value: string | undefined): string | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;
  return DISPLAY_ALIASES[normalizedBrand(raw)] ?? raw;
}

export function sportSizeGuideBrandKey(value: string | undefined): string {
  const normalized = normalizedBrand(value);
  return GUIDE_KEY_ALIASES[normalized] ?? normalized;
}
