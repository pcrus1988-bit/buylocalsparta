-- DrinkStock venue owner VAT classification decisions.
-- NO payments enabled. Backend-only event log, per-venue request deduplication.
BEGIN;
CREATE TABLE IF NOT EXISTS public.drinkstock_vat_review_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 partner_id uuid NOT NULL,
 venue_id uuid NOT NULL,
 product_id uuid NOT NULL,
 request_key uuid NOT NULL,
 actor_user_id text NOT NULL CHECK (length(btrim(actor_user_id)) BETWEEN 1 AND 200),
 previous_vat_class text NOT NULL CHECK (previous_vat_class IN ('alcoholic','non_alcoholic','water','review_required')),
 previous_reviewed boolean NOT NULL,
 vat_class text NOT NULL CHECK (vat_class IN ('alcoholic','non_alcoholic','water','review_required')),
 reviewed boolean NOT NULL,
 review_basis text NOT NULL CHECK (length(btrim(review_basis)) BETWEEN 15 AND 500),
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT drinkstock_vat_review_consistency CHECK (reviewed=(vat_class<>'review_required')),
 CONSTRAINT drinkstock_vat_review_unique UNIQUE (venue_id,request_key),
 FOREIGN KEY (venue_id,partner_id) REFERENCES public.hospitality_venues(id,partner_id) ON DELETE CASCADE,
 FOREIGN KEY (product_id,venue_id,partner_id) REFERENCES public.drinkstock_products(id,venue_id,partner_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS drinkstock_vat_review_history_idx
 ON public.drinkstock_vat_review_events(partner_id,venue_id,product_id,created_at DESC);
ALTER TABLE public.drinkstock_vat_review_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.drinkstock_vat_review_events FROM anon,authenticated;
COMMIT;
