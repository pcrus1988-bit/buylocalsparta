-- NYXI Agent 3: fail-closed digital color regression (read-only, synthetic).
-- Do not interpret these tests as physical calibration, rights or publication approval.
WITH cases(name,h,l,a,b,ol,oa,ob,expected) AS (VALUES
('hex_only','#AABBCC',NULL,NULL,NULL,NULL,NULL,NULL,true),
('lab_only',NULL,55,0,1,NULL,NULL,NULL,true),
('oklab_only',NULL,NULL,NULL,NULL,0.5,0.1,-0.1,true),
('all_valid','#000000',50,10,-10,0.5,0.2,-0.2,true),
('none',NULL,NULL,NULL,NULL,NULL,NULL,NULL,false),
('bad_hex','#GGGGGG',NULL,NULL,NULL,NULL,NULL,NULL,false),
('bad_hex_length','#AABB',NULL,NULL,NULL,NULL,NULL,NULL,false),
('lab_l_negative',NULL,-1,0,0,NULL,NULL,NULL,false),
('lab_l_over',NULL,101,0,0,NULL,NULL,NULL,false),
('lab_a_over',NULL,50,201,0,NULL,NULL,NULL,false),
('lab_b_under',NULL,50,0,-201,NULL,NULL,NULL,false),
('lab_incomplete',NULL,50,NULL,0,NULL,NULL,NULL,false),
('oklab_l_under',NULL,NULL,NULL,NULL,-0.1,0,0,false),
('oklab_l_over',NULL,NULL,NULL,NULL,1.1,0,0,false),
('oklab_a_over',NULL,NULL,NULL,NULL,0.5,1.1,0,false),
('oklab_b_under',NULL,NULL,NULL,NULL,0.5,0,-1.1,false),
('oklab_incomplete',NULL,NULL,NULL,NULL,0.5,NULL,0,false),
('hex_masks_bad_lab','#123ABC',101,0,0,NULL,NULL,NULL,false),
('lab_masks_bad_hex','#12345G',50,0,0,NULL,NULL,NULL,false),
('hex_masks_bad_oklab','#123ABC',NULL,NULL,NULL,1.1,0,0,false),
('oklab_masks_bad_hex','#12345G',NULL,NULL,NULL,0.5,0,0,false),
('lab_masks_bad_oklab',NULL,50,0,0,0.5,0,1.1,false),
('oklab_masks_bad_lab',NULL,50,201,0,0.5,0,0,false),
('lab_boundaries',NULL,100,-200,200,NULL,NULL,NULL,true),
('oklab_boundaries',NULL,NULL,NULL,NULL,1,-1,1,true),
('hex_lower','#abcdef',NULL,NULL,NULL,NULL,NULL,NULL,true),
('hex_upper','#ABCDEF',NULL,NULL,NULL,NULL,NULL,NULL,true),
('whitespace_hex',' #ABCDEF',NULL,NULL,NULL,NULL,NULL,NULL,false),
('lab_partial_hex','#AABBCC',50,NULL,0,NULL,NULL,NULL,false),
('oklab_partial_lab',NULL,50,0,0,0.5,NULL,0,false),
('invalid_lab_valid_oklab',NULL,101,0,0,0.5,0,0,false),
('hex_alpha','#11223344',NULL,NULL,NULL,NULL,NULL,NULL,false)
), checked AS (
 SELECT name, expected,
 ((h IS NULL OR (h ~ '^#[0-9a-fA-F]{6}$') IS TRUE)
 AND ((l IS NULL AND a IS NULL AND b IS NULL) OR (l BETWEEN 0 AND 100 AND a BETWEEN -200 AND 200 AND b BETWEEN -200 AND 200) IS TRUE)
 AND ((ol IS NULL AND oa IS NULL AND ob IS NULL) OR (ol BETWEEN 0 AND 1 AND oa BETWEEN -1 AND 1 AND ob BETWEEN -1 AND 1) IS TRUE)
 AND (h IS NOT NULL OR l IS NOT NULL OR a IS NOT NULL OR b IS NOT NULL OR ol IS NOT NULL OR oa IS NOT NULL OR ob IS NOT NULL)) IS TRUE AS actual
 FROM cases
)
SELECT count(*)::int AS total, count(*) FILTER (WHERE actual=expected)::int AS passed,
 count(*) FILTER (WHERE actual<>expected)::int AS failed, bool_and(actual=expected) AS all_passed FROM checked;
