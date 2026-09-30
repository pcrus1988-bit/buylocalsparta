-- Case-insensitive correction for audited official VITEX primer records.
update public.manufacturer_products mp
set verification_status='verified', last_verified_at=now(), updated_at=now()
where lower(mp.manufacturer)='vitex'
  and mp.product_name in ('Anti-Rust Primer','Blanco Eco','Durovit','Primer 100% Acrylic')
  and mp.product_system_status='current'
  and exists (select 1 from public.manufacturer_technical_sources ts join public.manufacturer_instruction_evidence ie on ie.source_id=ts.id and ie.product_id=mp.id where ts.product_id=mp.id and ts.source_type='tds' and ts.is_current=true and ie.is_current=true and ie.confidence=1);
update public.manufacturer_application_profiles ap
set verification_status='verified', last_verified_at=now(), updated_at=now()
from public.manufacturer_products mp
where ap.product_id=mp.id and ap.is_current=true and ap.source_layer='manufacturer'
  and lower(mp.manufacturer)='vitex' and mp.product_name in ('Anti-Rust Primer','Blanco Eco','Durovit','Primer 100% Acrylic') and mp.verification_status='verified';
