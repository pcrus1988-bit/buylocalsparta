export type PaintBuildProjectKitRole = "required_system" | "recommended_working" | "optional_extra";
export type PaintBuildProjectKitSource = "MANUFACTURER_VITEX" | "MANUFACTURER" | "KONTA_MOU_RULE";

export type PaintBuildProjectKitItem = Readonly<{
  key: string;
  role: PaintBuildProjectKitRole;
  sourceLayer: PaintBuildProjectKitSource;
  requiredForVerifiedSystem: boolean;
  selected: boolean;
  catalogueResolved: boolean;
  canonicalVariantId?: string;
  title: string;
  reason?: string;
  unitPriceMinor?: number;
  unitPriceLabel?: string;
  quantity: number;
  recommendedQuantity: number;
  packLitres?: number;
  imageUrl?: string;
  imageAlt?: string;
}>;

export type PaintBuildProjectKitSnapshot = Readonly<{
  status: "complete" | "incomplete";
  currency: "EUR";
  totalMinor: number;
  items: readonly PaintBuildProjectKitItem[];
}>;
