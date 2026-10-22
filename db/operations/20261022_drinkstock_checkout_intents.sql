-- Additive only. Apply after the DrinkStock foundation, VAT context and fallback
-- operations. No existing customer, product, price or order rows are changed.
BEGIN;
CREATE TABLE IF NOT EXISTS public.drinkstock_checkout_intents (
 order_id uuid PRIMARY KEY REFERENCES public.drinkstock_orders(id),
 request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[0-9a-f]{64}$'),
 payment_request_key uuid NOT NULL UNIQUE,
 intent jsonb NOT NULL CHECK(jsonb_typeof(intent)='object'),
 created_at timestamptz NOT NULL DEFAULT now()
);
-- Updates/deletes would destroy the immutable prices/VAT used by PSP and fiscal
-- retries. Operational states belong to payment attempts, not to this snapshot.
CREATE OR REPLACE FUNCTION public.drinkstock_checkout_intent_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 RAISE EXCEPTION 'DrinkStock checkout intent is immutable' USING ERRCODE='23000';
END;
$$;
DROP TRIGGER IF EXISTS drinkstock_checkout_intent_immutable ON public.drinkstock_checkout_intents;
CREATE TRIGGER drinkstock_checkout_intent_immutable BEFORE UPDATE OR DELETE
 ON public.drinkstock_checkout_intents FOR EACH ROW
 EXECUTE FUNCTION public.drinkstock_checkout_intent_immutable();
ALTER TABLE public.drinkstock_checkout_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.drinkstock_checkout_intents FROM anon,authenticated;
REVOKE ALL ON FUNCTION public.drinkstock_checkout_intent_immutable() FROM PUBLIC,anon,authenticated;
COMMIT;
