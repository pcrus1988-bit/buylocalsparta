-- MAZI / 007 — review accountability, strictly within MAZI tables.
-- No fabricated approvals, no changes to marketplace records.
ALTER TABLE public.mazi_membership_applications
 ADD COLUMN IF NOT EXISTS review_reason text,
 ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.users(id);
ALTER TABLE public.mazi_proposals
 ADD COLUMN IF NOT EXISTS review_reason text,
 ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.users(id);
ALTER TABLE public.mazi_membership_applications
 ADD CONSTRAINT mazi_app_review_is_documented
 CHECK (
   status NOT IN ('approved','rejected')
   OR (
     reviewed_by IS NOT NULL
     AND reviewed_at IS NOT NULL
     AND review_reason IS NOT NULL
     AND char_length(trim(review_reason)) BETWEEN 20 AND 1000
   )
 );
ALTER TABLE public.mazi_proposals
 ADD CONSTRAINT mazi_proposal_review_is_documented
 CHECK (
   status NOT IN ('approved','rejected')
   OR (
     reviewed_by IS NOT NULL
     AND reviewed_at IS NOT NULL
     AND review_reason IS NOT NULL
     AND char_length(trim(review_reason)) BETWEEN 20 AND 1000
   )
 );
-- No new client privileges; existing admin-only direct DB writer is unchanged.
