-- DrinkStock POS self-managed, venue-scoped preparation drafts.
-- Deliberately cannot store credentials, external URLs, payment status or approval.
-- No writes to DrinkStock orders, trade events, fiscal receipts or payments.
BEGIN;
CREATE TABLE IF NOT EXISTS public.drinkstock_pos_setup_drafts (
  partner_id uuid NOT NULL,
  venue_id uuid NOT NULL,
  provider_id varchar(64) NOT NULL,
  other_name varchar(90) NOT NULL DEFAULT '',
  setup_path varchar(32) NOT NULL CHECK (setup_path IN ('cloud','local_bridge','vendor_assisted')),
  menu jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(menu)='array' AND jsonb_array_length(menu)<=500),
  mappings jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(mappings)='array' AND jsonb_array_length(mappings)<=500),
  revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
  updated_by text NOT NULL CHECK (length(updated_by) BETWEEN 1 AND 200),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (partner_id,venue_id),
  CONSTRAINT drinkstock_pos_drafts_venue_fk FOREIGN KEY (venue_id,partner_id)
    REFERENCES public.hospitality_venues (id,partner_id) ON DELETE CASCADE,
  CONSTRAINT drinkstock_pos_drafts_provider_ck CHECK (length(btrim(provider_id)) BETWEEN 2 AND 64)
);
ALTER TABLE public.drinkstock_pos_setup_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.drinkstock_pos_setup_drafts FROM PUBLIC,anon,authenticated;
COMMENT ON TABLE public.drinkstock_pos_setup_drafts IS
 'Owner-managed POS provider and SKU mapping PREPARATION only; never vendor authorization, payment verification or activated POS connection. Access exclusively via venue-verified server API.';
COMMIT;
