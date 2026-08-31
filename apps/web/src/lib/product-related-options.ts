export type ProductRelatedOption = Readonly<{
  canonicalVariantId: string;
  slug: string;
  title: string;
  choiceLabel: string;
  imageSrc?: string;
  imageAlt?: string;
}>;

export type ProductRelatedOptionGroup = Readonly<{
  key: string;
  title: string;
  description: string;
  products: readonly ProductRelatedOption[];
}>;
