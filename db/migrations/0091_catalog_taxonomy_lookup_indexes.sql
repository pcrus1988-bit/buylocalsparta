CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON public.categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_category_product_types_product_type_id ON public.category_product_types(product_type_id);
CREATE INDEX IF NOT EXISTS idx_category_attributes_attribute_id ON public.category_attributes(attribute_id);
CREATE INDEX IF NOT EXISTS idx_product_type_attributes_attribute_id ON public.product_type_attributes(attribute_id);
CREATE INDEX IF NOT EXISTS idx_canonical_variant_attribute_values_attribute_id ON public.canonical_variant_attribute_values(attribute_id);
CREATE INDEX IF NOT EXISTS idx_product_family_attribute_values_attribute_id ON public.product_family_attribute_values(attribute_id);
