export const DEFAULT_VENDOR_PRIMARY_COLOR = "#0f766e";
export const DEFAULT_VENDOR_SECONDARY_COLOR = "#b29661";

export type VendorStorefrontTheme = Readonly<{
  primaryColor: string;
  secondaryColor: string;
}>;

export type VendorStorefrontThemeTokens = Readonly<{
  primaryColor: string;
  secondaryColor: string;
  onPrimary: "#ffffff" | "#111111";
  onSecondary: "#ffffff" | "#111111";
  primarySoft: string;
  primarySurface: string;
  secondarySoft: string;
  secondarySurface: string;
}>;

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function normalizeVendorBrandColor(value: unknown, fallback: string): string {
  return typeof value === "string" && HEX_COLOR.test(value)
    ? value.toLowerCase()
    : fallback.toLowerCase();
}

export function readableTextColor(background: string): "#ffffff" | "#111111" {
  const normalized = normalizeVendorBrandColor(background, DEFAULT_VENDOR_PRIMARY_COLOR);
  const [red, green, blue] = hexRgb(normalized);
  const luminance = relativeLuminance(red, green, blue);
  const whiteContrast = contrastRatio(luminance, 1);
  const darkContrast = contrastRatio(luminance, relativeLuminance(17, 17, 17));
  return whiteContrast >= darkContrast ? "#ffffff" : "#111111";
}

export function vendorStorefrontThemeTokens(theme: VendorStorefrontTheme): VendorStorefrontThemeTokens {
  const primaryColor = normalizeVendorBrandColor(theme.primaryColor, DEFAULT_VENDOR_PRIMARY_COLOR);
  const secondaryColor = normalizeVendorBrandColor(theme.secondaryColor, DEFAULT_VENDOR_SECONDARY_COLOR);
  return {
    primaryColor,
    secondaryColor,
    onPrimary: readableTextColor(primaryColor),
    onSecondary: readableTextColor(secondaryColor),
    primarySoft: rgba(primaryColor, 0.14),
    primarySurface: rgba(primaryColor, 0.065),
    secondarySoft: rgba(secondaryColor, 0.16),
    secondarySurface: rgba(secondaryColor, 0.08)
  };
}

function hexRgb(hex: string): readonly [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16)
  ];
}

function rgba(hex: string, alpha: number): string {
  const [red, green, blue] = hexRgb(hex);
  return `rgba(${red},${green},${blue},${alpha})`;
}

function relativeLuminance(red: number, green: number, blue: number): number {
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

function contrastRatio(first: number, second: number): number {
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}
