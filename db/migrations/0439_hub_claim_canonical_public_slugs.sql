-- Public HUB CLAIM listings use permanent, human-readable slugs, never internal prospect IDs.
-- Approval generates the slug once; name edits cannot silently break inbound links.
BEGIN;

ALTER TABLE public.hub_expansion_prospects
  ADD COLUMN IF NOT EXISTS public_slug text;

CREATE OR REPLACE FUNCTION bls_private.hub_claim_slugify(business_name text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT COALESCE(NULLIF(btrim(
    regexp_replace(
      left(translate(lower(coalesce(business_name, '')),
        'αάβγδεέζηήθιίϊΐκλμνξοόπρσςτυύϋΰφχψωώ',
        'aavgdeeziitiiiiklmnxooprsstyyyyfxpoo'), 70),
      '[^a-z0-9]+', '-', 'g'), '-'), ''), 'business');
$$;

CREATE OR REPLACE FUNCTION bls_private.hub_claim_assign_public_slug()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  stem text;
  candidate text;
  suffix integer := 2;
BEGIN
  -- Slugs are immutable. Preserve links even if the display name is subsequently changed.
  IF TG_OP = 'UPDATE' AND OLD.public_slug IS NOT NULL THEN
    NEW.public_slug := OLD.public_slug;
    RETURN NEW;
  END IF;
  IF NEW.plan_code <> 'claim' OR NEW.status <> 'converted' OR NEW.owner_user_id IS NULL THEN
    RETURN NEW;
  END IF;
  stem := bls_private.hub_claim_slugify(NEW.business_name);
  -- Serialize allocations for a hub/stem to avoid racing on duplicate business names.
  PERFORM pg_advisory_xact_lock(hashtext('hub-claim:' || NEW.hub_slug || ':' || stem));
  candidate := stem;
  WHILE EXISTS (
    SELECT 1 FROM public.hub_expansion_prospects h
    WHERE h.hub_slug = NEW.hub_slug AND h.public_slug = candidate AND h.id <> NEW.id
  ) LOOP
    candidate := left(stem, 70 - length(suffix::text) - 1) || '-' || suffix::text;
    suffix := suffix + 1;
  END LOOP;
  NEW.public_slug := candidate;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hub_claim_set_public_slug ON public.hub_expansion_prospects;
CREATE TRIGGER hub_claim_set_public_slug
  BEFORE INSERT OR UPDATE OF status, owner_user_id, public_slug, hub_slug
  ON public.hub_expansion_prospects
  FOR EACH ROW EXECUTE FUNCTION bls_private.hub_claim_assign_public_slug();

-- Existing active, owner-verified CLAIM pages receive their permanent names immediately.
UPDATE public.hub_expansion_prospects
SET public_slug = NULL
WHERE plan_code = 'claim' AND status = 'converted'
  AND owner_user_id IS NOT NULL AND public_slug IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS hub_claim_public_slug_hub_uidx
  ON public.hub_expansion_prospects(hub_slug, public_slug)
  WHERE public_slug IS NOT NULL;

-- The live schema may have received this patch before the checked-in migrator runs.
DO $
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.hub_expansion_prospects'::regclass
      AND conname = 'hub_claim_public_slug_format_check'
  ) THEN
    ALTER TABLE public.hub_expansion_prospects
      ADD CONSTRAINT hub_claim_public_slug_format_check
      CHECK (public_slug IS NULL OR public_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*

COMMENT ON COLUMN public.hub_expansion_prospects.public_slug IS
  'Immutable, hub-scoped public route name for a verified CLAIM listing. Internal public_id remains admin-only.';

COMMIT;
);
  END IF;
END;
$;

COMMENT ON COLUMN public.hub_expansion_prospects.public_slug IS
  'Immutable, hub-scoped public route name for a verified CLAIM listing. Internal public_id remains admin-only.';

COMMIT;
