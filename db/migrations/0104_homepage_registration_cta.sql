-- Manage the promotional registration call-to-action shown immediately below the homepage hero.
-- Content is server-private and editable only through the Admin content workspace.
BEGIN;

CREATE TABLE bls_private.homepage_promo_ctas (
  id text PRIMARY KEY,
  eyebrow text NOT NULL CHECK (length(trim(eyebrow)) BETWEEN 1 AND 120),
  headline text NOT NULL CHECK (length(trim(headline)) BETWEEN 1 AND 240),
  body text NOT NULL DEFAULT '' CHECK (length(body) <= 1200),
  button_label text NOT NULL CHECK (length(trim(button_label)) BETWEEN 1 AND 120),
  link_url text NOT NULL CHECK (length(trim(link_url)) BETWEEN 1 AND 1000),
  supporting_text text NOT NULL DEFAULT '' CHECK (length(supporting_text) <= 500),
  sort_order integer NOT NULL DEFAULT 100,
  is_visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX homepage_promo_ctas_order_idx
  ON bls_private.homepage_promo_ctas(sort_order, created_at, id);

INSERT INTO bls_private.homepage_promo_ctas (
  id,
  eyebrow,
  headline,
  body,
  button_label,
  link_url,
  supporting_text,
  sort_order,
  is_visible
) VALUES (
  'konta-mou-launch-registration',
  'Η ΣΠΑΡΤΗ ΞΕΚΙΝΑ ΕΔΩ',
  'Γίνε από τους πρώτους που θα γεμίσουν το ΚΟΝΤΑ ΜΟΥ — και κέρδισε!',
  'Κάνε την εγγραφή σου τώρα, βοήθησε να γεμίσει η νέα τοπική αγορά της Σπάρτης και μπες στη μεγάλη κλήρωση για κουπόνια ΚΟΝΤΑ ΜΟΥ, έτοιμα να χρησιμοποιηθούν μόλις ανοίξει η πλατφόρμα.',
  'Εγγραφή & συμμετοχή',
  'https://kontamou.site/register?next=%2Faccount',
  'Δωρεάν εγγραφή · Οι νικητές ανακοινώνονται 1 Σεπτεμβρίου',
  0,
  true
)
ON CONFLICT (id) DO NOTHING;

REVOKE ALL ON TABLE bls_private.homepage_promo_ctas
  FROM PUBLIC, anon, authenticated, service_role, bls_app_runtime, bls_platform_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE bls_private.homepage_promo_ctas
  TO bls_app_runtime, bls_platform_runtime;

COMMIT;
