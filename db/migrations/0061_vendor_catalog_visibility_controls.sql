ALTER TABLE public.vendor_offers
  ADD COLUMN IF NOT EXISTS merchant_visible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS merchant_pause_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS merchant_visibility_updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS merchant_visibility_updated_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.vendor_category_visibility (
  vendor_id uuid NOT NULL REFERENCES public.vendor_businesses(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  visible boolean NOT NULL DEFAULT true,
  updated_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (vendor_id, category_id)
);

CREATE TABLE IF NOT EXISTS public.vendor_catalog_visibility_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL DEFAULT gen_random_uuid()::text UNIQUE,
  vendor_id uuid NOT NULL REFERENCES public.vendor_businesses(id) ON DELETE CASCADE,
  offer_id uuid NULL REFERENCES public.vendor_offers(id) ON DELETE CASCADE,
  category_id uuid NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('product','category')),
  visible boolean NOT NULL,
  actor_id uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((scope='product' AND offer_id IS NOT NULL) OR (scope='category' AND category_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS vendor_offers_merchant_pause_idx ON public.vendor_offers(vendor_id,merchant_pause_active,status);
CREATE INDEX IF NOT EXISTS vendor_category_visibility_category_idx ON public.vendor_category_visibility(category_id,vendor_id);
CREATE INDEX IF NOT EXISTS vendor_catalog_visibility_events_vendor_created_idx ON public.vendor_catalog_visibility_events(vendor_id,created_at DESC);

ALTER TABLE public.vendor_category_visibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_catalog_visibility_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vendor_category_visibility_vendor_scope ON public.vendor_category_visibility;
CREATE POLICY vendor_category_visibility_vendor_scope ON public.vendor_category_visibility
FOR ALL USING ((SELECT bls_private.is_platform_runtime()) OR vendor_id=NULLIF(current_setting('app.vendor_id',true),'')::uuid)
WITH CHECK ((SELECT bls_private.is_platform_runtime()) OR vendor_id=NULLIF(current_setting('app.vendor_id',true),'')::uuid);

DROP POLICY IF EXISTS vendor_category_visibility_platform_scope ON public.vendor_category_visibility;
CREATE POLICY vendor_category_visibility_platform_scope ON public.vendor_category_visibility
FOR ALL USING ((SELECT bls_private.is_platform_runtime())) WITH CHECK ((SELECT bls_private.is_platform_runtime()));

DROP POLICY IF EXISTS vendor_catalog_visibility_events_vendor_read ON public.vendor_catalog_visibility_events;
CREATE POLICY vendor_catalog_visibility_events_vendor_read ON public.vendor_catalog_visibility_events
FOR SELECT USING ((SELECT bls_private.is_platform_runtime()) OR vendor_id=NULLIF(current_setting('app.vendor_id',true),'')::uuid);

DROP POLICY IF EXISTS vendor_catalog_visibility_events_vendor_insert ON public.vendor_catalog_visibility_events;
CREATE POLICY vendor_catalog_visibility_events_vendor_insert ON public.vendor_catalog_visibility_events
FOR INSERT WITH CHECK ((SELECT bls_private.is_platform_runtime()) OR vendor_id=NULLIF(current_setting('app.vendor_id',true),'')::uuid);

DROP POLICY IF EXISTS vendor_catalog_visibility_events_platform_scope ON public.vendor_catalog_visibility_events;
CREATE POLICY vendor_catalog_visibility_events_platform_scope ON public.vendor_catalog_visibility_events
FOR ALL USING ((SELECT bls_private.is_platform_runtime())) WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE OR REPLACE FUNCTION bls_private.vendor_category_effectively_visible(p_vendor_id uuid,p_category_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,bls_private,pg_catalog AS $$
  WITH RECURSIVE ancestors AS (
    SELECT c.id,c.parent_id FROM public.categories c WHERE c.id=p_category_id
    UNION ALL
    SELECT parent.id,parent.parent_id FROM public.categories parent JOIN ancestors child ON child.parent_id=parent.id
  )
  SELECT NOT EXISTS(
    SELECT 1 FROM ancestors a JOIN public.vendor_category_visibility vcv
      ON vcv.category_id=a.id AND vcv.vendor_id=p_vendor_id
    WHERE vcv.visible=false
  );
$$;

CREATE OR REPLACE FUNCTION bls_private.enforce_vendor_offer_merchant_visibility()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,bls_private,pg_catalog AS $$
DECLARE v_category_id uuid; v_category_visible boolean:=true;
BEGIN
  SELECT cv.category_id INTO v_category_id FROM public.canonical_variants cv WHERE cv.id=NEW.canonical_variant_id;
  IF v_category_id IS NOT NULL THEN v_category_visible:=bls_private.vendor_category_effectively_visible(NEW.vendor_id,v_category_id); END IF;

  IF TG_OP='UPDATE' AND NEW.merchant_visible=true AND OLD.merchant_visible=false AND OLD.merchant_pause_active=true AND NEW.status='archived' AND v_category_visible THEN
    NEW.status:='approved'; NEW.merchant_pause_active:=false;
  END IF;

  IF NEW.status='approved' THEN
    IF NOT NEW.merchant_visible OR NOT v_category_visible THEN NEW.status:='archived'; NEW.merchant_pause_active:=true;
    ELSE NEW.merchant_pause_active:=false; END IF;
  END IF;

  IF TG_OP='INSERT' OR NEW.merchant_visible IS DISTINCT FROM OLD.merchant_visible THEN NEW.merchant_visibility_updated_at:=now(); END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vendor_offer_merchant_visibility ON public.vendor_offers;
CREATE TRIGGER trg_vendor_offer_merchant_visibility
BEFORE INSERT OR UPDATE OF status,merchant_visible ON public.vendor_offers
FOR EACH ROW EXECUTE FUNCTION bls_private.enforce_vendor_offer_merchant_visibility();

CREATE OR REPLACE FUNCTION bls_private.sync_vendor_category_visibility()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,bls_private,pg_catalog AS $$
BEGIN
  WITH RECURSIVE descendants AS (
    SELECT c.id FROM public.categories c WHERE c.id=NEW.category_id
    UNION ALL
    SELECT child.id FROM public.categories child JOIN descendants parent ON child.parent_id=parent.id
  ), impacted AS (
    SELECT vo.id,vo.status,vo.merchant_visible,vo.merchant_pause_active,
           bls_private.vendor_category_effectively_visible(vo.vendor_id,cv.category_id) category_visible
    FROM public.vendor_offers vo JOIN public.canonical_variants cv ON cv.id=vo.canonical_variant_id
    WHERE vo.vendor_id=NEW.vendor_id AND cv.category_id IN(SELECT id FROM descendants)
  )
  UPDATE public.vendor_offers vo
  SET status=CASE
        WHEN i.status='approved' AND (NOT i.merchant_visible OR NOT i.category_visible) THEN 'archived'::public.offer_status
        WHEN i.status='archived' AND i.merchant_pause_active AND i.merchant_visible AND i.category_visible THEN 'approved'::public.offer_status
        ELSE i.status END,
      merchant_pause_active=CASE
        WHEN i.status='approved' AND (NOT i.merchant_visible OR NOT i.category_visible) THEN true
        WHEN i.status='archived' AND i.merchant_pause_active AND i.merchant_visible AND i.category_visible THEN false
        ELSE i.merchant_pause_active END,
      merchant_visibility_updated_at=now(),
      merchant_visibility_updated_by=COALESCE(NEW.updated_by,vo.merchant_visibility_updated_by),updated_at=now()
  FROM impacted i WHERE vo.id=i.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_vendor_category_visibility ON public.vendor_category_visibility;
CREATE TRIGGER trg_sync_vendor_category_visibility
AFTER INSERT OR UPDATE OF visible ON public.vendor_category_visibility
FOR EACH ROW EXECUTE FUNCTION bls_private.sync_vendor_category_visibility();

COMMENT ON COLUMN public.vendor_offers.merchant_visible IS 'Vendor product-level visibility intent. Public commerce remains status=approved; merchant-hidden offers are safely paused as archived.';
COMMENT ON COLUMN public.vendor_offers.merchant_pause_active IS 'True only when the visibility-control system archived an otherwise approved offer, allowing safe automatic restoration without overriding platform suppression.';
COMMENT ON TABLE public.vendor_category_visibility IS 'Vendor-controlled category visibility. A false rule hides the category and all descendants for that vendor.';
COMMENT ON TABLE public.vendor_catalog_visibility_events IS 'Audit log of vendor product/category visibility changes.';
