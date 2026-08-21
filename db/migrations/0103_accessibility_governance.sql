BEGIN;

CREATE TABLE accessibility_criteria (
  criterion_id text PRIMARY KEY
    CONSTRAINT accessibility_criteria_id_check CHECK (criterion_id ~ '^[1-4][.][1-9][.][0-9]{1,2}$'),
  wcag_version text NOT NULL DEFAULT '2.2'
    CONSTRAINT accessibility_criteria_version_check CHECK (wcag_version = '2.2'),
  level text NOT NULL
    CONSTRAINT accessibility_criteria_level_check CHECK (level IN ('A','AA')),
  principle text NOT NULL
    CONSTRAINT accessibility_criteria_principle_check CHECK (principle IN ('perceivable','operable','understandable','robust')),
  name text NOT NULL
    CONSTRAINT accessibility_criteria_name_length_check CHECK (length(name) BETWEEN 2 AND 160),
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO accessibility_criteria (criterion_id, level, principle, name) VALUES
  ('1.1.1','A','perceivable','Non-text Content'),
  ('1.2.1','A','perceivable','Audio-only and Video-only (Prerecorded)'),
  ('1.2.2','A','perceivable','Captions (Prerecorded)'),
  ('1.2.3','A','perceivable','Audio Description or Media Alternative (Prerecorded)'),
  ('1.2.4','AA','perceivable','Captions (Live)'),
  ('1.2.5','AA','perceivable','Audio Description (Prerecorded)'),
  ('1.3.1','A','perceivable','Info and Relationships'),
  ('1.3.2','A','perceivable','Meaningful Sequence'),
  ('1.3.3','A','perceivable','Sensory Characteristics'),
  ('1.3.4','AA','perceivable','Orientation'),
  ('1.3.5','AA','perceivable','Identify Input Purpose'),
  ('1.4.1','A','perceivable','Use of Color'),
  ('1.4.2','A','perceivable','Audio Control'),
  ('1.4.3','AA','perceivable','Contrast (Minimum)'),
  ('1.4.4','AA','perceivable','Resize Text'),
  ('1.4.5','AA','perceivable','Images of Text'),
  ('1.4.10','AA','perceivable','Reflow'),
  ('1.4.11','AA','perceivable','Non-text Contrast'),
  ('1.4.12','AA','perceivable','Text Spacing'),
  ('1.4.13','AA','perceivable','Content on Hover or Focus'),
  ('2.1.1','A','operable','Keyboard'),
  ('2.1.2','A','operable','No Keyboard Trap'),
  ('2.1.4','A','operable','Character Key Shortcuts'),
  ('2.2.1','A','operable','Timing Adjustable'),
  ('2.2.2','A','operable','Pause, Stop, Hide'),
  ('2.3.1','A','operable','Three Flashes or Below Threshold'),
  ('2.4.1','A','operable','Bypass Blocks'),
  ('2.4.2','A','operable','Page Titled'),
  ('2.4.3','A','operable','Focus Order'),
  ('2.4.4','A','operable','Link Purpose (In Context)'),
  ('2.4.5','AA','operable','Multiple Ways'),
  ('2.4.6','AA','operable','Headings and Labels'),
  ('2.4.7','AA','operable','Focus Visible'),
  ('2.4.11','AA','operable','Focus Not Obscured (Minimum)'),
  ('2.5.1','A','operable','Pointer Gestures'),
  ('2.5.2','A','operable','Pointer Cancellation'),
  ('2.5.3','A','operable','Label in Name'),
  ('2.5.4','A','operable','Motion Actuation'),
  ('2.5.7','AA','operable','Dragging Movements'),
  ('2.5.8','AA','operable','Target Size (Minimum)'),
  ('3.1.1','A','understandable','Language of Page'),
  ('3.1.2','AA','understandable','Language of Parts'),
  ('3.2.1','A','understandable','On Focus'),
  ('3.2.2','A','understandable','On Input'),
  ('3.2.3','AA','understandable','Consistent Navigation'),
  ('3.2.4','AA','understandable','Consistent Identification'),
  ('3.2.6','A','understandable','Consistent Help'),
  ('3.3.1','A','understandable','Error Identification'),
  ('3.3.2','A','understandable','Labels or Instructions'),
  ('3.3.3','AA','understandable','Error Suggestion'),
  ('3.3.4','AA','understandable','Error Prevention (Legal, Financial, Data)'),
  ('3.3.7','A','understandable','Redundant Entry'),
  ('3.3.8','AA','understandable','Accessible Authentication (Minimum)'),
  ('4.1.2','A','robust','Name, Role, Value'),
  ('4.1.3','AA','robust','Status Messages');

CREATE TABLE accessibility_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  criterion_id text NOT NULL REFERENCES accessibility_criteria(criterion_id) ON DELETE RESTRICT,
  scope text NOT NULL
    CONSTRAINT accessibility_assessments_scope_check CHECK (scope IN ('public','customer','checkout','vendor','daily','admin')),
  status text NOT NULL DEFAULT 'not_tested'
    CONSTRAINT accessibility_assessments_status_check CHECK (status IN ('not_tested','pass','fail','not_applicable')),
  evidence text,
  method text NOT NULL DEFAULT 'manual'
    CONSTRAINT accessibility_assessments_method_check CHECK (method IN ('manual','automated','mixed','user_report')),
  tested_at timestamptz,
  tested_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accessibility_assessments_unique UNIQUE (criterion_id, scope),
  CONSTRAINT accessibility_assessments_evidence_check CHECK (
    status = 'not_tested' OR length(COALESCE(evidence,'')) >= 3
  )
);

INSERT INTO accessibility_assessments (criterion_id, scope)
SELECT criterion_id, scope
FROM accessibility_criteria
CROSS JOIN unnest(ARRAY['public','customer','checkout','vendor','daily','admin']::text[]) AS s(scope);

CREATE TABLE accessibility_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text UNIQUE NOT NULL
    CONSTRAINT accessibility_reports_public_id_check CHECK (public_id ~ '^a11y_report_[a-f0-9]{32}$'),
  page_path text NOT NULL
    CONSTRAINT accessibility_reports_page_path_length_check CHECK (length(page_path) BETWEEN 1 AND 500),
  barrier text NOT NULL
    CONSTRAINT accessibility_reports_barrier_length_check CHECK (length(barrier) BETWEEN 10 AND 4000),
  expected text,
  assistive_technology text,
  browser_context text,
  contact_email text,
  consent_to_contact boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'submitted'
    CONSTRAINT accessibility_reports_status_check CHECK (status IN ('submitted','acknowledged','in_review','resolved','dismissed')),
  resolution text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accessibility_reports_contact_check CHECK (
    consent_to_contact = false OR length(COALESCE(contact_email,'')) >= 3
  )
);

COMMENT ON TABLE accessibility_reports IS
  'User-submitted accessibility barriers. The application intentionally does not store IP addresses, device fingerprints or hidden tracking identifiers in this workflow.';

CREATE TABLE accessibility_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text UNIQUE NOT NULL
    CONSTRAINT accessibility_findings_public_id_check CHECK (public_id ~ '^a11y_find_[a-f0-9]{32}$'),
  criterion_id text REFERENCES accessibility_criteria(criterion_id) ON DELETE RESTRICT,
  scope text NOT NULL
    CONSTRAINT accessibility_findings_scope_check CHECK (scope IN ('public','customer','checkout','vendor','daily','admin')),
  severity text NOT NULL DEFAULT 'medium'
    CONSTRAINT accessibility_findings_severity_check CHECK (severity IN ('low','medium','high','critical')),
  title text NOT NULL
    CONSTRAINT accessibility_findings_title_length_check CHECK (length(title) BETWEEN 3 AND 200),
  details text NOT NULL
    CONSTRAINT accessibility_findings_details_length_check CHECK (length(details) BETWEEN 3 AND 4000),
  status text NOT NULL DEFAULT 'open'
    CONSTRAINT accessibility_findings_status_check CHECK (status IN ('open','in_progress','resolved','accepted_risk')),
  source text NOT NULL DEFAULT 'manual'
    CONSTRAINT accessibility_findings_source_check CHECK (source IN ('manual','automated','user_report')),
  report_id uuid REFERENCES accessibility_reports(id) ON DELETE SET NULL,
  opened_by text,
  resolved_by text,
  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX accessibility_findings_open_criterion_scope_idx
  ON accessibility_findings(criterion_id, scope)
  WHERE criterion_id IS NOT NULL AND status IN ('open','in_progress');

CREATE INDEX accessibility_findings_status_idx
  ON accessibility_findings(status, severity, opened_at DESC);

CREATE INDEX accessibility_reports_status_idx
  ON accessibility_reports(status, created_at DESC);

CREATE TABLE accessibility_audit_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text UNIQUE NOT NULL
    CONSTRAINT accessibility_audit_runs_public_id_check CHECK (public_id ~ '^a11y_audit_[a-f0-9]{32}$'),
  scope text NOT NULL
    CONSTRAINT accessibility_audit_runs_scope_check CHECK (scope IN ('public','customer','checkout','vendor','daily','admin','all')),
  method text NOT NULL
    CONSTRAINT accessibility_audit_runs_method_check CHECK (method IN ('manual','automated','mixed')),
  pass_count integer NOT NULL DEFAULT 0 CHECK (pass_count >= 0),
  fail_count integer NOT NULL DEFAULT 0 CHECK (fail_count >= 0),
  not_applicable_count integer NOT NULL DEFAULT 0 CHECK (not_applicable_count >= 0),
  not_tested_count integer NOT NULL DEFAULT 0 CHECK (not_tested_count >= 0),
  summary text,
  performed_by text,
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL PRIVILEGES ON TABLE accessibility_criteria, accessibility_assessments, accessibility_reports, accessibility_findings, accessibility_audit_runs
  FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE accessibility_criteria TO bls_app_runtime, bls_platform_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE accessibility_assessments, accessibility_reports, accessibility_findings, accessibility_audit_runs
  TO bls_app_runtime, bls_platform_runtime;

COMMIT;
