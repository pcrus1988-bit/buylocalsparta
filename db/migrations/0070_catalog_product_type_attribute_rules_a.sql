BEGIN;
CREATE TEMP TABLE _pta_seed (
 product_type_code text NOT NULL,
 attribute_code text NOT NULL,
 requirement_level text NOT NULL,
 value_level text NOT NULL,
 filterable boolean NOT NULL,
 searchable boolean NOT NULL,
 customer_visible boolean NOT NULL,
 comparable boolean NOT NULL,
 variant_defining boolean NOT NULL,
 allow_multiple boolean NOT NULL,
 sort_order integer NOT NULL,
 variant_axis_order integer,
 unit_override text,
 PRIMARY KEY(product_type_code,attribute_code)
) ON COMMIT DROP;

WITH t(code) AS (VALUES
('plumbing_fixture'),('building_material'),('door_window'),('hardware_item'),('ppe'),('vehicle_accessory'),('vehicle_electronics'),('bicycle_component'),('stationery_supply'),('art_craft_supply'),('gift_item'),('collectible'),('bag'),('musical_instrument'),('outdoor_equipment'),('agricultural_supply'),('pet_supply'),('aquatics_supply'),('beekeeping_supply'),('business_supply'),('business_equipment'),('sports_equipment'),('watch'),('eyewear'),('fashion_accessory'),('beauty_tool'),('garden_supply'),('heating_cooling_appliance'),('small_appliance'),('large_appliance'),('home_textile'),('home_decor'),('lighting_component'),('security_device'),('camera_accessory'),('camera'),('camera_lens'),('consumer_electronics'),('mobile_accessory'),('computer_peripheral'),('printer_scanner'),('monitor'),('desktop_computer')
), r(attribute_code,requirement_level,value_level,filterable,searchable,customer_visible,comparable,variant_defining,allow_multiple,sort_order,variant_axis_order) AS (VALUES
 ('material','recommended','family',true,true,true,true,false,true,10,NULL),
 ('product_dimensions','optional','family',false,false,true,true,false,false,20,NULL),
 ('product_weight_kg','optional','family',true,false,true,true,false,false,30,NULL),
 ('manufacturer_colour','optional','variant',false,true,true,false,true,false,40,1),
 ('colour','optional','variant',true,true,true,false,false,false,50,NULL)
)
INSERT INTO _pta_seed
SELECT t.code,r.attribute_code,r.requirement_level,r.value_level,r.filterable,r.searchable,r.customer_visible,r.comparable,r.variant_defining,r.allow_multiple,r.sort_order::integer,r.variant_axis_order::integer,NULL::text
FROM t CROSS JOIN r;

WITH t(code) AS (VALUES ('hand_tool'),('irrigation_equipment'),('network_device')),
r(attribute_code,requirement_level,value_level,filterable,searchable,customer_visible,comparable,variant_defining,allow_multiple,sort_order,variant_axis_order) AS (VALUES
 ('material','recommended','family',true,true,true,true,false,true,10,NULL),
 ('product_dimensions','optional','family',false,false,true,true,false,false,20,NULL),
 ('product_weight_kg','optional','family',true,false,true,true,false,false,30,NULL)
)
INSERT INTO _pta_seed
SELECT t.code,r.attribute_code,r.requirement_level,r.value_level,r.filterable,r.searchable,r.customer_visible,r.comparable,r.variant_defining,r.allow_multiple,r.sort_order::integer,r.variant_axis_order::integer,NULL::text
FROM t CROSS JOIN r;

WITH t(code) AS (VALUES ('computer_component'),('computer_storage'),('electrical_supply')),
r(attribute_code,requirement_level,value_level,filterable,searchable,customer_visible,comparable,variant_defining,allow_multiple,sort_order,variant_axis_order) AS (VALUES
 ('product_dimensions','optional','family',false,false,true,true,false,false,10,NULL),
 ('product_weight_kg','optional','family',true,false,true,true,false,false,20,NULL)
)
INSERT INTO _pta_seed
SELECT t.code,r.attribute_code,r.requirement_level,r.value_level,r.filterable,r.searchable,r.customer_visible,r.comparable,r.variant_defining,r.allow_multiple,r.sort_order::integer,r.variant_axis_order::integer,NULL::text
FROM t CROSS JOIN r;

INSERT INTO _pta_seed VALUES
('automotive_fluid','product_weight_kg','optional','family',true,false,true,true,false,false,10,NULL,NULL),
('writing_instrument','material','recommended','family',true,true,true,true,false,true,10,NULL,NULL),
('plumbing_fixture','pipe_diameter_mm','optional','family',true,false,true,true,false,false,70,NULL,NULL),
('plumbing_fixture','finish','recommended','family',true,true,true,true,false,false,80,NULL,NULL),
('building_material','finish','optional','family',true,true,true,true,false,false,70,NULL,NULL),
('building_material','pack_quantity','optional','variant',true,false,true,true,true,false,80,2,NULL),
('door_window','door_width_cm','recommended','variant',true,false,true,true,true,false,70,2,NULL),
('door_window','door_height_cm','recommended','variant',true,false,true,true,true,false,80,3,NULL),
('door_window','opening_type','optional','family',true,true,true,true,false,false,90,NULL,NULL),
('door_window','glass_type','optional','family',true,true,true,true,false,false,100,NULL,NULL),
('door_window','finish','optional','family',true,true,true,true,false,false,110,NULL,NULL),
('hardware_item','pack_quantity','recommended','variant',true,false,true,true,true,false,70,2,NULL),
('hardware_item','compatibility','optional','family',true,true,true,false,false,false,80,NULL,NULL),
('hand_tool','compatibility','optional','family',true,true,true,false,false,false,50,NULL,NULL),
('ppe','apparel_size','optional','variant',true,false,true,true,true,false,70,2,NULL),
('vehicle_accessory','compatibility','recommended','family',true,true,true,true,false,false,70,NULL,NULL),
('vehicle_electronics','compatibility','recommended','family',true,true,true,true,false,false,70,NULL,NULL),
('bicycle_component','compatibility','recommended','family',true,true,true,true,false,false,70,NULL,NULL),
('vehicle_electronics','power_w','optional','family',true,false,true,true,false,false,80,NULL,NULL),
('vehicle_electronics','connectivity','optional','family',true,true,true,true,false,true,90,NULL,NULL),
('bicycle_component','pack_quantity','optional','variant',true,false,true,false,true,false,80,2,NULL),
('automotive_fluid','volume_ml','recommended','variant',true,false,true,true,true,false,20,1,NULL),
('automotive_fluid','compatibility','recommended','family',true,true,true,true,false,false,30,NULL,NULL),
('vehicle','fuel_type','recommended','family',true,true,true,true,false,false,10,NULL,NULL),
('vehicle','transmission','recommended','family',true,true,true,true,false,false,20,NULL,NULL),
('vehicle','engine_displacement_cc','optional','family',true,false,true,true,false,false,30,NULL,NULL),
('vehicle','model_year','recommended','family',true,true,true,true,false,false,40,NULL,NULL),
('vehicle','manufacturer_colour','optional','variant',false,true,true,false,false,false,50,NULL,NULL),
('vehicle','colour','optional','variant',true,true,true,false,false,false,60,NULL,NULL),
('stationery_supply','pack_quantity','optional','variant',true,false,true,true,true,false,70,2,NULL),
('art_craft_supply','pack_quantity','optional','variant',true,false,true,true,true,false,70,2,NULL),
('gift_item','pack_quantity','optional','variant',true,false,true,true,true,false,70,2,NULL),
('collectible','pack_quantity','optional','variant',true,false,true,true,true,false,70,2,NULL),
('bag','capacity_l','optional','family',true,false,true,true,false,false,70,NULL,NULL),
('bag','apparel_size','optional','variant',true,false,true,true,false,false,80,NULL,NULL),
('writing_instrument','ink_colour','optional','variant',true,true,true,true,true,false,20,1,NULL),
('writing_instrument','tip_size','optional','variant',true,false,true,true,true,false,30,2,NULL),
('writing_instrument','pack_quantity','optional','variant',true,false,true,true,true,false,40,3,NULL),
('writing_instrument','manufacturer_colour','optional','variant',false,true,true,false,false,false,50,NULL,NULL),
('writing_instrument','colour','optional','variant',true,true,true,false,false,false,60,NULL,NULL),
('musical_instrument','manufacturer_variant','optional','variant',false,true,true,false,true,false,70,2,NULL),
('musical_instrument','compatibility','optional','family',true,true,true,false,false,false,80,NULL,NULL),
('outdoor_equipment','tent_capacity_people','optional','family',true,false,true,true,false,false,70,NULL,NULL),
('outdoor_equipment','manufacturer_variant','optional','variant',false,true,true,false,true,false,80,2,NULL),
('irrigation_equipment','pipe_diameter_mm','recommended','variant',true,false,true,true,true,false,50,1,NULL),
('irrigation_equipment','irrigation_flow_l_min','optional','family',true,false,true,true,false,false,60,NULL,NULL),
('irrigation_equipment','compatibility','optional','family',true,true,true,true,false,false,70,NULL,NULL),
('agricultural_supply','compatibility','optional','family',true,true,true,true,false,false,70,NULL,NULL),
('agricultural_supply','pack_quantity','optional','variant',true,false,true,true,true,false,80,2,NULL),
('pet_supply','pet_type','recommended','family',true,true,true,true,false,false,70,NULL,NULL),
('pet_supply','apparel_size','optional','variant',true,false,true,true,true,false,80,2,NULL),
('aquatics_supply','capacity_l','optional','variant',true,false,true,true,true,false,70,2,NULL),
('beekeeping_supply','apparel_size','optional','variant',true,false,true,true,true,false,70,2,NULL),
('beekeeping_supply','pack_quantity','optional','variant',true,false,true,true,true,false,80,3,NULL),
('business_supply','pack_quantity','optional','variant',true,false,true,true,true,false,70,2,NULL),
('business_equipment','connectivity','optional','family',true,true,true,true,false,true,70,NULL,NULL),
('business_equipment','compatibility','optional','family',true,true,true,true,false,false,80,NULL,NULL),
('sports_equipment','apparel_size','optional','variant',true,false,true,true,true,false,70,2,NULL),
('watch','watch_movement','recommended','family',true,true,true,true,false,false,70,NULL,NULL),
('watch','case_size_mm','optional','family',true,false,true,true,false,false,80,NULL,NULL),
('watch','water_resistance_m','optional','family',true,false,true,true,false,false,90,NULL,NULL),
('watch','connectivity','optional','family',true,true,true,true,false,true,100,NULL,NULL),
('eyewear','lens_type','recommended','family',true,true,true,true,false,false,70,NULL,NULL),
('beauty_tool','power_source','optional','family',true,true,true,true,false,false,70,NULL,NULL),
('beauty_tool','power_w','optional','family',true,false,true,true,false,false,80,NULL,NULL),
('beauty_care','formulation','recommended','family',true,true,true,true,false,false,10,NULL,NULL),
('beauty_care','volume_ml','recommended','variant',true,false,true,true,true,false,20,1,NULL),
('beauty_care','manufacturer_variant','optional','variant',false,true,true,false,true,false,30,2,NULL),
('haircare','formulation','recommended','family',true,true,true,true,false,false,10,NULL,NULL),
('haircare','volume_ml','recommended','variant',true,false,true,true,true,false,20,1,NULL),
('haircare','manufacturer_variant','optional','variant',false,true,true,false,true,false,30,2,NULL),
('skincare','formulation','recommended','family',true,true,true,true,false,false,10,NULL,NULL),
('skincare','volume_ml','recommended','variant',true,false,true,true,true,false,20,1,NULL),
('skincare','manufacturer_variant','optional','variant',false,true,true,false,true,false,30,2,NULL),
('sun_care','formulation','recommended','family',true,true,true,true,false,false,10,NULL,NULL),
('sun_care','volume_ml','recommended','variant',true,false,true,true,true,false,20,1,NULL),
('sun_care','manufacturer_variant','optional','variant',false,true,true,false,true,false,30,2,NULL);

INSERT INTO product_type_attributes(
 product_type_id,attribute_id,requirement_level,value_level,filterable,searchable,
 customer_visible,comparable,variant_defining,allow_multiple,sort_order,variant_axis_order,unit_override,updated_at
)
SELECT pt.id,ad.id,s.requirement_level,s.value_level,s.filterable,s.searchable,s.customer_visible,s.comparable,s.variant_defining,s.allow_multiple,s.sort_order,s.variant_axis_order,s.unit_override,now()
FROM _pta_seed s
JOIN product_types pt ON pt.code=s.product_type_code
JOIN attribute_definitions ad ON ad.code=s.attribute_code AND ad.active=true
ON CONFLICT (product_type_id,attribute_id) DO UPDATE SET
 requirement_level=EXCLUDED.requirement_level,
 value_level=EXCLUDED.value_level,
 filterable=EXCLUDED.filterable,
 searchable=EXCLUDED.searchable,
 customer_visible=EXCLUDED.customer_visible,
 comparable=EXCLUDED.comparable,
 variant_defining=EXCLUDED.variant_defining,
 allow_multiple=EXCLUDED.allow_multiple,
 sort_order=EXCLUDED.sort_order,
 variant_axis_order=EXCLUDED.variant_axis_order,
 unit_override=EXCLUDED.unit_override,
 updated_at=now();
COMMIT;
