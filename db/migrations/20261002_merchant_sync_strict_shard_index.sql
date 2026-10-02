-- Bound Google Merchant catalogue selection to the declared 144-way shard.
-- The previous candidate path allowed unsynced products to bypass the shard
-- predicate, forcing a catalogue-wide live-offer scan every ten minutes.
CREATE INDEX IF NOT EXISTS canonical_variants_merchant_shard_144_idx
ON public.canonical_variants (
  (mod(abs(hashtext(public_id)::bigint), 144))
)
WHERE active=true AND suppressed=false AND recalled=false;
