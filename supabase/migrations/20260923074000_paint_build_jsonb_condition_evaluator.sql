CREATE OR REPLACE FUNCTION public.jsonb_condition_matches(p_facts jsonb, p_condition jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  k text;
  expected jsonb;
  actual jsonb;
  child jsonb;
  op text;
  rhs jsonb;
  actual_num numeric;
  rhs_num numeric;
  matched boolean;
BEGIN
  IF p_condition IS NULL OR p_condition = '{}'::jsonb THEN RETURN true; END IF;
  IF jsonb_typeof(p_condition) <> 'object' THEN RETURN false; END IF;

  IF p_condition ? 'any' THEN
    IF jsonb_typeof(p_condition->'any') <> 'array' THEN RETURN false; END IF;
    matched := false;
    FOR child IN SELECT value FROM jsonb_array_elements(p_condition->'any') LOOP
      IF public.jsonb_condition_matches(p_facts, child) THEN matched := true; EXIT; END IF;
    END LOOP;
    IF NOT matched THEN RETURN false; END IF;
  END IF;

  IF p_condition ? 'all' THEN
    IF jsonb_typeof(p_condition->'all') <> 'array' THEN RETURN false; END IF;
    FOR child IN SELECT value FROM jsonb_array_elements(p_condition->'all') LOOP
      IF NOT public.jsonb_condition_matches(p_facts, child) THEN RETURN false; END IF;
    END LOOP;
  END IF;

  IF p_condition ? 'not' THEN
    IF public.jsonb_condition_matches(p_facts, p_condition->'not') THEN RETURN false; END IF;
  END IF;

  FOR k, expected IN SELECT key, value FROM jsonb_each(p_condition) LOOP
    IF k IN ('any','all','not') THEN CONTINUE; END IF;
    IF NOT COALESCE(p_facts ? k, false) THEN RETURN false; END IF;
    actual := p_facts->k;

    IF jsonb_typeof(expected) = 'array' THEN
      IF jsonb_typeof(actual) = 'array' THEN
        IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(expected) e JOIN jsonb_array_elements(actual) a ON a.value = e.value) THEN RETURN false; END IF;
      ELSE
        IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(expected) e WHERE e.value = actual) THEN RETURN false; END IF;
      END IF;
      CONTINUE;
    END IF;

    IF jsonb_typeof(expected) = 'object' AND EXISTS (
      SELECT 1 FROM jsonb_object_keys(expected) x(opkey)
      WHERE opkey IN ('gt','gte','lt','lte','eq','neq','not_in')
    ) THEN
      FOR op, rhs IN SELECT key, value FROM jsonb_each(expected) LOOP
        IF op IN ('gt','gte','lt','lte') THEN
          BEGIN
            actual_num := trim(both '"' from actual::text)::numeric;
            rhs_num := trim(both '"' from rhs::text)::numeric;
          EXCEPTION WHEN others THEN
            RETURN false;
          END;
          IF op='gt' AND NOT (actual_num > rhs_num) THEN RETURN false; END IF;
          IF op='gte' AND NOT (actual_num >= rhs_num) THEN RETURN false; END IF;
          IF op='lt' AND NOT (actual_num < rhs_num) THEN RETURN false; END IF;
          IF op='lte' AND NOT (actual_num <= rhs_num) THEN RETURN false; END IF;
        ELSIF op='eq' THEN
          IF actual <> rhs THEN RETURN false; END IF;
        ELSIF op='neq' THEN
          IF actual = rhs THEN RETURN false; END IF;
        ELSIF op='not_in' THEN
          IF jsonb_typeof(rhs) <> 'array' THEN RETURN false; END IF;
          IF EXISTS (SELECT 1 FROM jsonb_array_elements(rhs) e WHERE e.value = actual) THEN RETURN false; END IF;
        ELSE
          RETURN false;
        END IF;
      END LOOP;
      CONTINUE;
    END IF;

    IF jsonb_typeof(expected)='object' THEN
      IF jsonb_typeof(actual)<>'object' OR NOT public.jsonb_condition_matches(actual, expected) THEN RETURN false; END IF;
      CONTINUE;
    END IF;

    IF actual <> expected THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.jsonb_condition_matches(jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.jsonb_condition_matches(jsonb,jsonb) TO service_role;

COMMENT ON FUNCTION public.jsonb_condition_matches(jsonb,jsonb) IS
'Fail-closed evaluator for reviewed JSONB condition vocabulary: equality, array membership, gt/gte/lt/lte, eq/neq/not_in, nested objects, any/all/not.';
