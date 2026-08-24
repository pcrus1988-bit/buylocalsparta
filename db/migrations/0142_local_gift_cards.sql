-- KONTA MOU — governed local gift cards and immutable stored-value ledger.
-- Purchase activation remains application feature-gated until PSP/accounting treatment is approved.

BEGIN;

CREATE TABLE public.gift_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  market_id uuid NOT NULL REFERENCES public.markets(id),
  code_hash text NOT NULL UNIQUE,
  code_suffix text NOT NULL,
  currency text NOT NULL DEFAULT 'EUR' CHECK (currency = 'EUR'),
  initial_value_minor integer NOT NULL CHECK (initial_value_minor > 0),
  balance_minor integer NOT NULL CHECK (balance_minor >= 0 AND balance_minor <= initial_value_minor),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','depleted','suspended','revoked','expired')),
  purchaser_user_id uuid REFERENCES public.users(id),
  holder_user_id uuid REFERENCES public.users(id),
  recipient_name text,
  recipient_email citext,
  message text,
  issued_by_user_id uuid REFERENCES public.users(id),
  issued_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (char_length(code_suffix) BETWEEN 4 AND 8),
  CHECK (recipient_name IS NULL OR char_length(recipient_name) <= 160),
  CHECK (message IS NULL OR char_length(message) <= 500)
);

CREATE INDEX gift_cards_holder_idx ON public.gift_cards(holder_user_id, created_at DESC);
CREATE INDEX gift_cards_market_status_idx ON public.gift_cards(market_id, status, created_at DESC);

CREATE TABLE public.gift_card_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  gift_card_id uuid NOT NULL REFERENCES public.gift_cards(id),
  entry_type text NOT NULL CHECK (entry_type IN ('issue','redeem','refund','adjustment','revoke')),
  amount_minor integer NOT NULL CHECK (amount_minor <> 0),
  balance_after_minor integer NOT NULL CHECK (balance_after_minor >= 0),
  currency text NOT NULL DEFAULT 'EUR' CHECK (currency = 'EUR'),
  idempotency_key text NOT NULL UNIQUE,
  order_public_id text,
  actor_user_id uuid REFERENCES public.users(id),
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (reason IS NULL OR char_length(reason) <= 500)
);

CREATE INDEX gift_card_ledger_card_time_idx ON public.gift_card_ledger(gift_card_id, created_at DESC);

ALTER TABLE public.gift_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_cards FORCE ROW LEVEL SECURITY;
ALTER TABLE public.gift_card_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_card_ledger FORCE ROW LEVEL SECURITY;

CREATE POLICY gift_cards_platform_all ON public.gift_cards
  FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE POLICY gift_cards_holder_read ON public.gift_cards
  FOR SELECT
  USING (
    holder_user_id IS NOT NULL
    AND holder_user_id = nullif(current_setting('app.actor_user_id', true), '')::uuid
  );

CREATE POLICY gift_card_ledger_platform_all ON public.gift_card_ledger
  FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE POLICY gift_card_ledger_holder_read ON public.gift_card_ledger
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.gift_cards gc
      WHERE gc.id = gift_card_ledger.gift_card_id
        AND gc.holder_user_id = nullif(current_setting('app.actor_user_id', true), '')::uuid
    )
  );

COMMENT ON TABLE public.gift_cards IS
  'KONTA MOU stored-value cards. Raw redemption codes are never persisted; only a keyed application hash and short display suffix are stored.';
COMMENT ON TABLE public.gift_card_ledger IS
  'Immutable gift-card value movements. Application code must lock the parent card and insert an idempotent ledger entry in the same transaction.';

COMMIT;
