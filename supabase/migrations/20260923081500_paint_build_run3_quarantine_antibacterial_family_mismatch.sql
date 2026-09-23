
UPDATE public.vitex_commerce_products
SET manufacturer_product_id = NULL,
    manufacturer_variant_id = NULL,
    match_status = 'review_required',
    match_confidence = 0,
    match_method = 'family_identity_conflict_quarantine',
    match_evidence = COALESCE(match_evidence,'{}'::jsonb) || jsonb_build_object(
      'quarantined_at','2026-09-23T05:12:00+03:00',
      'quarantine_reason','Commerce title explicitly identifies VITEX Antibacterial but prior family_media_cluster link pointed to Vitex Kitchen & Bath. No exact Antibacterial manufacturer record currently exists; technical inheritance is blocked pending manufacturer identity verification.',
      'previous_manufacturer_product_id','bf5f42b2-9f72-4c79-976d-c17aeab3dec4',
      'previous_match_method',match_method
    ),
    updated_at = now()
WHERE id IN (
  '60f9fd17-c339-44ce-9527-74b10f30b91a'::uuid,
  '3c51cbfc-5faf-4187-ae0e-51a0c4bb39fc'::uuid
)
AND manufacturer_product_id = 'bf5f42b2-9f72-4c79-976d-c17aeab3dec4'::uuid
AND match_method = 'family_media_cluster'
AND normalized_title ILIKE '%antibacterial%';

DO $verify$
DECLARE v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public.vitex_commerce_products
  WHERE id IN (
    '60f9fd17-c339-44ce-9527-74b10f30b91a'::uuid,
    '3c51cbfc-5faf-4187-ae0e-51a0c4bb39fc'::uuid
  )
  AND manufacturer_product_id IS NOT NULL;
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'Antibacterial family mismatch quarantine did not complete';
  END IF;
END
$verify$;
