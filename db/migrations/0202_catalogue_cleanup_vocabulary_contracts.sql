-- Buy Local Sparta — durable catalogue cleanup vocabulary and Product Type contracts.
-- Freezes the canonical attribute semantics produced by the governed Nikolaou cleanup on 2026-09-02.
-- Source observations, review decisions and parser-artifact rows remain operational catalogue data and are not hardcoded here.

BEGIN;

CREATE TEMP TABLE _catalogue_attribute_spec (
  code text PRIMARY KEY,
  data_type text NOT NULL,
  unit text,
  filterable boolean NOT NULL,
  group_code text NOT NULL
) ON COMMIT DROP;

INSERT INTO _catalogue_attribute_spec (code,data_type,unit,filterable,group_code)
VALUES
  ('abrasive_media_size_range_mm','dimension',NULL,true,'compatibility'),
  ('adapter_diameter_spec_mm','text','mm',false,'tools'),
  ('adapter_thread_length_spec','text',NULL,false,'tools'),
  ('adjustable_height_range_cm','text','cm',false,'furniture'),
  ('auger_diameter_length_mm','dimension',NULL,true,'dimensions'),
  ('auger_diameter_mm','number','mm',true,'garden'),
  ('auger_length_cm','number','cm',true,'garden'),
  ('axle_bore_diameter_mm','number','mm',true,'compatibility'),
  ('bandsaw_blade_dimensions_mm','dimension','mm',false,'tools'),
  ('bandsaw_blade_length_mm','number','mm',true,'tools'),
  ('bandsaw_capacity_pair_mm','dimension',NULL,true,'performance'),
  ('bandsaw_cutting_width_mm','number','mm',true,'performance'),
  ('bandsaw_teeth_range_tpi','text','TPI',false,'tools'),
  ('bandsaw_width_blade_length_mm','dimension','mm',false,'tools'),
  ('basin_wrench_capacity_range_mm','dimension',NULL,true,'compatibility'),
  ('blade_dimensions_mm','dimension',NULL,true,'dimensions'),
  ('blade_length_mm','number','mm',true,'dimensions'),
  ('blade_material_grade','text',NULL,true,'tools'),
  ('blade_width_mm','number','mm',true,'tools'),
  ('brush_width_mm','number','mm',true,'dimensions'),
  ('bulb_shape','text',NULL,true,'appearance'),
  ('cable_color_set','text',NULL,false,'electrical'),
  ('cable_conductor_spec','text',NULL,false,'electrical'),
  ('canopy_depth_cm','number','cm',true,'home'),
  ('cartridge_capacity_set_ml','text','ml',false,'tools'),
  ('chain_diameter_mm','number','mm',true,'technical'),
  ('chain_pitch_gauge_spec','text',NULL,true,'compatibility'),
  ('charging_current_a','number','A',true,'electrical'),
  ('collet_diameter_mm','number','mm',true,'technical'),
  ('compatible_generator_kva','text','kVA',false,'electrical'),
  ('compatible_pole_diameters_mm','number','mm',true,'compatibility'),
  ('cooking_surface_dimensions_cm','dimension','cm',false,'bbq'),
  ('core_drill_max_diameter_mm','number','mm',true,'tools'),
  ('cutter_diameter_mm','number','mm',true,'technical'),
  ('cutter_length_blade_width_mm','dimension','mm',false,'tools'),
  ('cutting_area_dimensions_cm','dimension','cm',false,'tools'),
  ('cutting_disc_dimensions_mm','dimension','mm',false,'tools'),
  ('cutting_disc_segment_bore_mm','dimension','mm',false,'tools'),
  ('cutting_width_cm','number','cm',true,'garden'),
  ('dc_output_current_a','number','A',true,'electrical'),
  ('diameter_pair_mm','dimension',NULL,true,'dimensions'),
  ('disc_bore_diameter_mm','number','mm',true,'tools'),
  ('disc_bore_thickness_mm','dimension','mm',false,'tools'),
  ('drill_press_chuck_height_dimensions_mm','dimension','mm',false,'tools'),
  ('dust_bag_diameter_mm','number','mm',true,'cleaning'),
  ('dust_bag_diameter_set_mm','text','mm',false,'cleaning'),
  ('engine_stroke_type','text',NULL,true,'engine'),
  ('engine_type','text',NULL,true,'engine'),
  ('extension_diameter_mm','number','mm',true,'tools'),
  ('extension_length_cm','number','cm',true,'tools'),
  ('extension_length_mm','number','mm',true,'tools'),
  ('fabric_density_t','number','T',true,'material'),
  ('fastener_height_mm','number','mm',true,'dimensions'),
  ('fastener_length_ranges_mm','dimension',NULL,true,'compatibility'),
  ('fence_screen_height_m','number','m',true,'garden'),
  ('filter_diameter_range_mm','dimension',NULL,true,'compatibility'),
  ('fork_dimensions_mm','dimension',NULL,true,'dimensions'),
  ('glue_stick_diameter_range_mm','dimension',NULL,true,'compatibility'),
  ('grafting_tape_thickness_mm','number','mm',true,'garden'),
  ('grease_capacity_ml','number','ml',true,'capacity'),
  ('grinding_disc_bore_thickness_mm','dimension','mm',false,'tools'),
  ('grinding_disc_dimensions_mm','dimension','mm',false,'tools'),
  ('guide_rail_length_set_cm','dimension',NULL,true,'dimensions'),
  ('handle_diameter_cm','number','cm',true,'tools'),
  ('handle_interface_diameter_mm','number','mm',true,'compatibility'),
  ('handle_length_diameter_thread_spec_cm','text',NULL,false,'tools'),
  ('hoist_arm_length_cm','number','cm',true,'dimensions'),
  ('knit_gauge','number','G',true,'material'),
  ('ladder_max_length_m','number','m',true,'dimensions'),
  ('lift_height_range_mm','text','mm',false,'automotive'),
  ('lifting_capacity_t','number','t',true,'capacity'),
  ('light_colours','text',NULL,true,'appearance'),
  ('low_oil_sensor','boolean',NULL,true,'engine'),
  ('mallet_head_diameter_mm','number','mm',true,'technical'),
  ('material_roll_length_m','number','m',true,'garden'),
  ('material_text','text',NULL,true,'material'),
  ('max_cutting_depth_mm','number','mm',true,'tools'),
  ('max_cutting_length_mm','number','mm',true,'tools'),
  ('max_fastener_length_mm','number','mm',true,'fasteners'),
  ('max_hose_capacity_m','number','m',true,'garden'),
  ('max_output_piece_length_cm','number','cm',true,'garden'),
  ('max_supported_strap_width_mm','number','mm',true,'packaging'),
  ('max_supported_wire_diameter_mm','number','mm',true,'welding'),
  ('mesh_cell_dimensions_cm','dimension',NULL,true,'dimensions'),
  ('mesh_opening_mm','number','mm',true,'dimensions'),
  ('min_lift_height_mm','number','mm',true,'automotive'),
  ('nail_staple_length_ranges_mm','text','mm',false,'fasteners'),
  ('nail_staple_max_lengths_mm','text','mm',false,'fasteners'),
  ('net_length_m','number','m',true,'garden'),
  ('nozzle_diameter_mm','number','mm',true,'tools'),
  ('output_piece_length_range_cm','text','cm',false,'garden'),
  ('package_dimensions_cm','dimension',NULL,true,'package'),
  ('payload_capacity_kg','number','kg',true,'capacity'),
  ('pipe_diameter_range_mm','dimension',NULL,true,'compatibility'),
  ('plasma_current_range_a','dimension',NULL,true,'electrical'),
  ('plasma_cut_thickness_range_mm','dimension',NULL,true,'performance'),
  ('platform_dimensions_cm','dimension',NULL,true,'dimensions'),
  ('polisher_disc_orbit_dimensions_mm','dimension','mm',false,'tools'),
  ('product_height_cm','number','cm',true,'dimensions'),
  ('production_capacity_kg_h','number','kg/h',true,'performance'),
  ('propeller_diameter_mm','number','mm',true,'engine'),
  ('pruning_tool_length_cutting_diameter_mm','dimension','mm',false,'garden'),
  ('pull_capacity_kg','number','kg',true,'capacity'),
  ('reflective_strip_width_cm','number','cm',true,'ppe'),
  ('rotational_speed_range_rpm','text','rpm',false,'tools'),
  ('router_bit_shank_diameter_mm','number','mm',true,'tools'),
  ('sanding_belt_dimensions_mm','dimension',NULL,true,'dimensions'),
  ('saw_blade_length_thickness_mm','dimension','mm',false,'tools'),
  ('scale_capacity_kg','number','kg',true,'capacity'),
  ('shaft_tube_diameter_mm','number','mm',true,'technical'),
  ('shaft_type','text',NULL,true,'engine'),
  ('sharpening_stone_thickness_mm','number','mm',true,'tools'),
  ('shower_head_diameter_mm','number','mm',true,'home'),
  ('shower_hose_head_spec','text',NULL,false,'home'),
  ('socket_size_mm','number','mm',true,'technical'),
  ('spark_plug_socket_size_mm','number','mm',true,'technical'),
  ('stamp_character_height_mm','number','mm',true,'tools'),
  ('stapler_fastener_dimensions_mm','dimension','mm',false,'fasteners'),
  ('start_method','text',NULL,true,'engine'),
  ('step_drill_diameter_range_mm','dimension',NULL,true,'compatibility'),
  ('strap_width_mm','number','mm',true,'dimensions'),
  ('strap_width_thickness_mm','dimension','mm',false,'packaging'),
  ('suction_cup_diameter_mm','number','mm',true,'tools'),
  ('suction_lift_capacity_kg','number','kg',true,'tools'),
  ('supported_battery_capacity_mah','number','mAh',true,'battery'),
  ('supported_die_sizes_mm','number','mm',true,'compatibility'),
  ('supported_nozzle_diameters_mm','number','mm',true,'compatibility'),
  ('supported_polishing_pad_diameters_mm','text','mm',false,'tools'),
  ('supported_screen_size_range_in','text','in',true,'electronics'),
  ('supported_spool_weights_g','number','g',true,'technical'),
  ('supported_strap_width_range_mm','text','mm',false,'packaging'),
  ('supported_thickness_range_mm','text','mm',false,'tools'),
  ('supported_wire_diameter_range_mm','text','mm',false,'welding'),
  ('telescopic_length_range','text',NULL,false,'tools'),
  ('telescopic_max_length_m','number','m',true,'tools'),
  ('temperature_range_c','dimension',NULL,true,'performance'),
  ('tile_cutter_rail_section_spec','text',NULL,false,'tools'),
  ('tile_transport_capacity_kg','number','kg',true,'tools'),
  ('tile_transport_dimensions_mm','dimension','mm',false,'tools'),
  ('tool_length_m','number','m',true,'tools'),
  ('tool_set_member_lengths_mm','text','mm',false,'tools'),
  ('tool_width_mm','number','mm',true,'tools'),
  ('trampoline_diameter_m','number','m',true,'outdoor'),
  ('tripod_height_range_cm','dimension',NULL,true,'dimensions'),
  ('vibrator_head_diameter_mm','number','mm',true,'technical'),
  ('voltage_range_v','dimension',NULL,true,'electrical'),
  ('weatherstrip_length_m','number','m',true,'home'),
  ('weighing_capacity_resolution','text',NULL,false,'measurement'),
  ('welding_mask_lens_dimensions_mm','dimension',NULL,true,'dimensions'),
  ('welding_wire_classification','text',NULL,true,'welding'),
  ('wheel_width_mm','number','mm',true,'transport'),
  ('wire_length_m','number','m',true,'dimensions'),
  ('wire_thickness_mm','number','mm',true,'tools'),
  ('working_height_range_mm','dimension',NULL,true,'dimensions'),
  ('working_width_cm','number','cm',true,'performance'),
  ('wrench_size_mm','number','mm',true,'technical'),
  ('wrench_size_set_mm','text','mm',false,'tools');

INSERT INTO public.attribute_definitions (
  code,data_type,unit,variant_identity,filterable,values,value_mode,active,group_code,updated_at
)
SELECT code,data_type,unit,false,filterable,'[]'::jsonb,'free',true,group_code,now()
FROM _catalogue_attribute_spec
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.attribute_definitions (
  code,data_type,unit,variant_identity,filterable,values,value_mode,active,group_code,updated_at
)
VALUES ('laser_beam_color','enum',NULL,false,true,'["red","green"]'::jsonb,'controlled',true,'measurement',now())
ON CONFLICT (code) DO NOTHING;

UPDATE public.attribute_definitions
SET values = values || CASE WHEN values ? 'green' THEN '[]'::jsonb ELSE '["green"]'::jsonb END,
    updated_at = now()
WHERE code='colour' AND active=true AND data_type='enum' AND value_mode='controlled';

UPDATE public.attribute_definitions
SET values = values || CASE WHEN values ? 'red' THEN '[]'::jsonb ELSE '["red"]'::jsonb END || CASE WHEN values ? 'green' THEN '[]'::jsonb ELSE '["green"]'::jsonb END,
    updated_at = now()
WHERE code='laser_beam_color' AND active=true AND data_type='enum' AND value_mode='controlled';

DO $$
DECLARE v_invalid integer;
BEGIN
  SELECT count(*)::integer INTO v_invalid FROM _catalogue_attribute_spec spec LEFT JOIN public.attribute_definitions ad ON ad.code=spec.code
  WHERE ad.id IS NULL OR ad.active IS DISTINCT FROM true OR ad.data_type IS DISTINCT FROM spec.data_type OR ad.unit IS DISTINCT FROM spec.unit OR ad.variant_identity IS DISTINCT FROM false OR ad.filterable IS DISTINCT FROM spec.filterable OR ad.value_mode IS DISTINCT FROM 'free' OR ad.group_code IS DISTINCT FROM spec.group_code;
  IF v_invalid <> 0 THEN RAISE EXCEPTION 'Catalogue cleanup attribute vocabulary conflicts with governed semantics: % rows', v_invalid; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.attribute_definitions WHERE code='colour' AND active=true AND data_type='enum' AND value_mode='controlled' AND variant_identity=true AND filterable=true AND values ? 'green') THEN RAISE EXCEPTION 'Colour vocabulary did not retain governed semantics with green support'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.attribute_definitions WHERE code='laser_beam_color' AND active=true AND data_type='enum' AND value_mode='controlled' AND variant_identity=false AND filterable=true AND values ? 'red' AND values ? 'green' AND group_code='measurement') THEN RAISE EXCEPTION 'Laser beam colour vocabulary did not match governed semantics'; END IF;
END;
$$;

CREATE TEMP TABLE _catalogue_contract_spec (
  product_type_code text NOT NULL, attribute_code text NOT NULL, requirement_level text NOT NULL, value_level text NOT NULL,
  filterable boolean NOT NULL, searchable boolean NOT NULL, customer_visible boolean NOT NULL, comparable boolean NOT NULL,
  variant_defining boolean NOT NULL, allow_multiple boolean NOT NULL, PRIMARY KEY (product_type_code,attribute_code)
) ON COMMIT DROP;

INSERT INTO _catalogue_contract_spec (product_type_code,attribute_code,requirement_level,value_level,filterable,searchable,customer_visible,comparable,variant_defining,allow_multiple)
VALUES
  ('agricultural_supply','auger_diameter_mm','optional','family',true,false,true,true,false,false),
  ('agricultural_supply','auger_length_cm','optional','family',true,false,true,true,false,false),
  ('agricultural_supply','telescopic_length_range','optional','family',false,false,true,false,false,false),
  ('agricultural_supply','telescopic_max_length_m','optional','family',true,false,true,true,false,false),
  ('agricultural_supply','thread_interface','optional','family',true,false,true,true,false,false),
  ('display_mount','supported_screen_size_range_in','optional','family',true,false,true,true,false,false),
  ('garden_supply','net_length_m','optional','family',true,false,true,true,false,false),
  ('hand_tool','blade_width_mm','optional','family',true,false,true,true,false,false),
  ('hand_tool','sharpening_stone_thickness_mm','optional','family',true,false,true,true,false,false),
  ('hand_tool','telescopic_length_range','optional','family',false,false,true,false,false,false),
  ('hand_tool','tool_width_mm','optional','family',true,false,true,true,false,false),
  ('hardware_item','wheel_width_mm','optional','family',true,false,true,true,false,false),
  ('homeware','hose_length_m','optional','family',true,false,true,true,false,false),
  ('homeware','pack_quantity','optional','family',true,false,true,true,false,false),
  ('homeware','weatherstrip_length_m','optional','family',true,false,true,true,false,false),
  ('irrigation_equipment','cable_length_m','optional','family',true,false,true,true,false,false),
  ('power_tool','cable_length_m','optional','family',true,false,true,true,false,false),
  ('power_tool','disc_bore_diameter_mm','optional','family',true,false,true,true,false,false),
  ('power_tool','fluid_capacity_ml','optional','family',true,false,true,true,false,false),
  ('power_tool','load_capacity_ton','optional','family',true,false,true,true,false,false),
  ('power_tool','material_thickness_mm','optional','family',true,false,true,true,false,false),
  ('power_tool','max_cutting_length_mm','optional','family',true,false,true,true,false,false),
  ('power_tool','nozzle_diameter_mm','optional','family',true,false,true,true,false,false),
  ('power_tool','suction_cup_diameter_mm','optional','family',true,false,true,true,false,false),
  ('power_tool','tool_width_mm','optional','family',true,false,true,true,false,false),
  ('tool_accessory','fluid_capacity_ml','optional','family',true,false,true,true,false,false),
  ('tool_accessory','nozzle_diameter_mm','optional','family',true,false,true,true,false,false),
  ('tool_accessory','overall_length_mm','optional','family',true,false,true,true,false,false),
  ('tool_accessory','welding_wire_classification','optional','family',true,true,true,true,false,false),
  ('vehicle_accessory','lift_height_range_mm','optional','family',false,false,true,false,false,false),
  ('vehicle_accessory','max_lift_height_mm','optional','family',true,false,true,true,false,false),
  ('vehicle_accessory','min_lift_height_mm','optional','family',true,false,true,true,false,false);

WITH resolved AS (
  SELECT pt.id AS product_type_id, ad.id AS attribute_id, spec.requirement_level, spec.value_level, spec.filterable, spec.searchable, spec.customer_visible, spec.comparable, spec.variant_defining, spec.allow_multiple,
    COALESCE((SELECT max(existing.sort_order) FROM public.product_type_attributes existing WHERE existing.product_type_id=pt.id),0) + row_number() over (partition by pt.id order by spec.attribute_code) * 10 AS sort_order
  FROM _catalogue_contract_spec spec JOIN public.product_types pt ON pt.code=spec.product_type_code AND pt.status='active' JOIN public.attribute_definitions ad ON ad.code=spec.attribute_code AND ad.active=true
)
INSERT INTO public.product_type_attributes (product_type_id,attribute_id,requirement_level,value_level,filterable,searchable,customer_visible,comparable,variant_defining,allow_multiple,sort_order,variant_axis_order,unit_override,created_at,updated_at)
SELECT product_type_id,attribute_id,requirement_level,value_level,filterable,searchable,customer_visible,comparable,variant_defining,allow_multiple,sort_order,NULL,NULL,now(),now() FROM resolved
ON CONFLICT (product_type_id,attribute_id) DO NOTHING;

DO $$
DECLARE v_expected integer; v_resolved integer; v_invalid integer;
BEGIN
  SELECT count(*)::integer INTO v_expected FROM _catalogue_contract_spec;
  SELECT count(*)::integer INTO v_resolved FROM _catalogue_contract_spec spec JOIN public.product_types pt ON pt.code=spec.product_type_code AND pt.status='active' JOIN public.attribute_definitions ad ON ad.code=spec.attribute_code AND ad.active=true JOIN public.product_type_attributes pta ON pta.product_type_id=pt.id AND pta.attribute_id=ad.id;
  IF v_resolved <> v_expected THEN RAISE EXCEPTION 'Expected % governed catalogue contracts, resolved %', v_expected, v_resolved; END IF;
  SELECT count(*)::integer INTO v_invalid FROM _catalogue_contract_spec spec JOIN public.product_types pt ON pt.code=spec.product_type_code AND pt.status='active' JOIN public.attribute_definitions ad ON ad.code=spec.attribute_code AND ad.active=true JOIN public.product_type_attributes pta ON pta.product_type_id=pt.id AND pta.attribute_id=ad.id
  WHERE pta.requirement_level IS DISTINCT FROM spec.requirement_level OR pta.value_level IS DISTINCT FROM spec.value_level OR pta.filterable IS DISTINCT FROM spec.filterable OR pta.searchable IS DISTINCT FROM spec.searchable OR pta.customer_visible IS DISTINCT FROM spec.customer_visible OR pta.comparable IS DISTINCT FROM spec.comparable OR pta.variant_defining IS DISTINCT FROM spec.variant_defining OR pta.allow_multiple IS DISTINCT FROM spec.allow_multiple OR pta.variant_axis_order IS NOT NULL OR pta.unit_override IS NOT NULL;
  IF v_invalid <> 0 THEN RAISE EXCEPTION 'Catalogue cleanup Product Type contracts conflict with governed semantics: % rows', v_invalid; END IF;
END;
$$;

COMMIT;
