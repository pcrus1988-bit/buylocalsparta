-- Build 0.11: persistent modular CMS, merchant storytelling, navigation, redirects and SEO publishing state.

ALTER TABLE cms_pages ADD COLUMN IF NOT EXISTS public_id text;
UPDATE cms_pages SET public_id = 'page_' || replace(id::text, '-', '') WHERE public_id IS NULL;
ALTER TABLE cms_pages ALTER COLUMN public_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS cms_pages_public_id_uidx ON cms_pages(public_id);
ALTER TABLE cms_pages ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1 CHECK (version > 0);
ALTER TABLE cms_pages ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;
ALTER TABLE cms_pages ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id);
ALTER TABLE cms_pages ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES users(id);
CREATE INDEX IF NOT EXISTS cms_pages_publish_idx ON cms_pages(market_id, status, published_at, scheduled_at);

ALTER TABLE cms_page_translations ADD COLUMN IF NOT EXISTS noindex boolean NOT NULL DEFAULT false;
ALTER TABLE cms_page_translations ADD COLUMN IF NOT EXISTS og_title text;
ALTER TABLE cms_page_translations ADD COLUMN IF NOT EXISTS og_description text;
ALTER TABLE cms_page_translations ADD COLUMN IF NOT EXISTS og_image text;

CREATE TABLE cms_page_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  page_id uuid NOT NULL REFERENCES cms_pages(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  actor_user_id uuid REFERENCES users(id),
  actor_public_id text NOT NULL,
  reason text NOT NULL,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(page_id, version)
);
CREATE INDEX cms_page_revisions_page_idx ON cms_page_revisions(page_id, version DESC);

CREATE TABLE cms_navigation_menus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  market_id uuid NOT NULL REFERENCES markets(id),
  menu_key text NOT NULL CHECK (menu_key IN ('primary','footer','merchant')),
  locale text NOT NULL CHECK (locale IN ('el','en')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(market_id, menu_key, locale)
);

CREATE TABLE cms_redirects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  market_id uuid NOT NULL REFERENCES markets(id),
  from_path text NOT NULL,
  to_path text NOT NULL,
  status_code integer NOT NULL DEFAULT 301 CHECK (status_code IN (301,302,307,308)),
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_path <> to_path)
);
CREATE UNIQUE INDEX cms_redirects_active_source_uidx ON cms_redirects(market_id, from_path) WHERE active;

CREATE TABLE merchant_stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  market_id uuid NOT NULL REFERENCES markets(id),
  vendor_id uuid NOT NULL REFERENCES vendor_businesses(id),
  slug text NOT NULL,
  locale text NOT NULL CHECK (locale IN ('el','en')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','vendor_review','approved','published','archived')),
  title text NOT NULL,
  excerpt text NOT NULL,
  blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  seo_title text NOT NULL,
  seo_description text NOT NULL,
  seo_noindex boolean NOT NULL DEFAULT false,
  og_title text,
  og_description text,
  og_image text,
  author_label text NOT NULL,
  vendor_approved_at timestamptz,
  vendor_approved_by uuid REFERENCES users(id),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(market_id, locale, slug)
);
CREATE INDEX merchant_stories_public_idx ON merchant_stories(market_id, locale, status, published_at DESC);
CREATE INDEX merchant_stories_vendor_idx ON merchant_stories(vendor_id, status, updated_at DESC);

CREATE TABLE product_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  market_id uuid NOT NULL REFERENCES markets(id),
  slug text NOT NULL,
  locale text NOT NULL CHECK (locale IN ('el','en')),
  title text NOT NULL,
  description text,
  canonical_variant_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','published','archived')),
  seo_title text NOT NULL,
  seo_description text NOT NULL,
  seo_noindex boolean NOT NULL DEFAULT false,
  og_title text,
  og_description text,
  og_image text,
  published_at timestamptz,
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(market_id, locale, slug)
);
CREATE INDEX product_collections_public_idx ON product_collections(market_id, locale, status, published_at DESC);

ALTER TABLE cms_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_page_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_page_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_navigation_menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_redirects ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY cms_pages_public_read ON cms_pages FOR SELECT
  USING (status='published' OR (status='scheduled' AND scheduled_at <= now()) OR current_setting('app.platform_access', true)='true');
CREATE POLICY cms_pages_platform_write ON cms_pages FOR ALL
  USING (current_setting('app.platform_access', true)='true')
  WITH CHECK (current_setting('app.platform_access', true)='true');

CREATE POLICY cms_page_translations_public_read ON cms_page_translations FOR SELECT
  USING (EXISTS (SELECT 1 FROM cms_pages p WHERE p.id=cms_page_translations.page_id AND (p.status='published' OR (p.status='scheduled' AND p.scheduled_at <= now()) OR current_setting('app.platform_access', true)='true')));
CREATE POLICY cms_page_translations_platform_write ON cms_page_translations FOR ALL
  USING (current_setting('app.platform_access', true)='true')
  WITH CHECK (current_setting('app.platform_access', true)='true');

CREATE POLICY cms_revisions_platform_only ON cms_page_revisions FOR ALL
  USING (current_setting('app.platform_access', true)='true')
  WITH CHECK (current_setting('app.platform_access', true)='true');

CREATE POLICY cms_navigation_public_read ON cms_navigation_menus FOR SELECT USING (true);
CREATE POLICY cms_navigation_platform_write ON cms_navigation_menus FOR ALL
  USING (current_setting('app.platform_access', true)='true')
  WITH CHECK (current_setting('app.platform_access', true)='true');

CREATE POLICY cms_redirects_public_read ON cms_redirects FOR SELECT USING (active OR current_setting('app.platform_access', true)='true');
CREATE POLICY cms_redirects_platform_write ON cms_redirects FOR ALL
  USING (current_setting('app.platform_access', true)='true')
  WITH CHECK (current_setting('app.platform_access', true)='true');

CREATE POLICY merchant_stories_public_read ON merchant_stories FOR SELECT
  USING (status='published' OR vendor_id=nullif(current_setting('app.vendor_id', true),'')::uuid OR current_setting('app.platform_access', true)='true');
CREATE POLICY merchant_stories_vendor_review ON merchant_stories FOR UPDATE
  USING (vendor_id=nullif(current_setting('app.vendor_id', true),'')::uuid AND status IN ('draft','vendor_review'))
  WITH CHECK (vendor_id=nullif(current_setting('app.vendor_id', true),'')::uuid AND status IN ('vendor_review','approved'));
CREATE POLICY merchant_stories_platform_write ON merchant_stories FOR ALL
  USING (current_setting('app.platform_access', true)='true')
  WITH CHECK (current_setting('app.platform_access', true)='true');

CREATE POLICY product_collections_public_read ON product_collections FOR SELECT
  USING (status='published' OR current_setting('app.platform_access', true)='true');
CREATE POLICY product_collections_platform_write ON product_collections FOR ALL
  USING (current_setting('app.platform_access', true)='true')
  WITH CHECK (current_setting('app.platform_access', true)='true');

CREATE TRIGGER cms_page_revisions_append_only BEFORE UPDATE OR DELETE ON cms_page_revisions
  FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
