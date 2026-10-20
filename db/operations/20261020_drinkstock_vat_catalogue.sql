-- Additive and fail-closed beverage tax classification and partner-selected import log.
-- Existing drinks stay unreviewed. No payment/checkout privileges are created.
BEGIN;
ALTER TABLE public.drinkstock_products
 ADD COLUMN IF NOT EXISTS vat_class text NOT NULL DEFAULT 'review_required';
ALTER TABLE public.drinkstock_products
 ADD COLUMN IF NOT EXISTS vat_reviewed boolean NOT NULL DEFAULT false;
ALTER TABLE public.drinkstock_products
 ADD COLUMN IF NOT EXISTS catalogue_key text;
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='drinkstock_products_vat_class_check'
   AND conrelid='public.drinkstock_products'::regclass)
 THEN
  ALTER TABLE public.drinkstock_products ADD CONSTRAINT drinkstock_products_vat_class_check
   CHECK (vat_class IN ('alcoholic','non_alcoholic','water','review_required'));
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS public.drinkstock_catalogue_imports(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 venue_id uuid NOT NULL,
 partner_id uuid NOT NULL,
 actor_user_id text NOT NULL,
 request_key uuid NOT NULL,
 selected_count int NOT NULL CHECK(selected_count BETWEEN 1 AND 60),
 imported_count int NOT NULL CHECK(imported_count BETWEEN 0 AND 60),
 skipped_count int NOT NULL CHECK(skipped_count BETWEEN 0 AND 60),
 selections jsonb NOT NULL CHECK(jsonb_typeof(selections)='array'),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(venue_id,request_key),
 FOREIGN KEY(venue_id,partner_id) REFERENCES public.hospitality_venues(id,partner_id)
);
ALTER TABLE public.drinkstock_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drinkstock_catalogue_imports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.drinkstock_catalogue_imports FROM anon,authenticated;
COMMIT;
