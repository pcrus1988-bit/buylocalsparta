-- MAZI 004: real business verification and public founding-cycle status
-- Existing marketplace roles and all non-MAZI records stay untouched.
-- A member account is not a verified business until manual ΓΕΜΗ checks finish.
ALTER TABLE public.mazi_members
  ADD COLUMN IF NOT EXISTS gemi_number text,
  ADD COLUMN IF NOT EXISTS identity_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS identity_verified_by uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS identity_verification_note text;

ALTER TABLE public.mazi_members
  ADD CONSTRAINT mazi_member_verified_business_identity
  CHECK (
    (gemi_number IS NULL AND identity_verified_at IS NULL AND identity_verified_by IS NULL AND identity_verification_note IS NULL)
    OR (
      gemi_number ~ '^[0-9]{12}$'
      AND identity_verified_at IS NOT NULL
      AND identity_verified_by IS NOT NULL
      AND char_length(trim(identity_verification_note)) BETWEEN 20 AND 1000
    )
  );
ALTER TABLE public.mazi_members
  ADD CONSTRAINT mazi_member_vote_requires_business_verification
  CHECK (voting_eligible = false OR (status = 'verified' AND identity_verified_at IS NOT NULL));

-- ΓΕΜΗ assigns an identity to each legal entity; a registered branch may
-- carry the same 9-digit legal-entity prefix as its main establishment.
-- Prevent branch duplicates from silently creating multiple ballots.
CREATE UNIQUE INDEX mazi_verified_legal_entity_key_unique
  ON public.mazi_members ((left(gemi_number,9)))
  WHERE gemi_number IS NOT NULL;

-- Gate real proposal intake on actual KYB, not merely a self-created Auth user.
DROP POLICY IF EXISTS "mazi_proposal_verified_insert" ON public.mazi_proposals;
CREATE POLICY "mazi_proposal_business_verified_insert"
  ON public.mazi_proposals FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND status='submitted'
    AND reviewed_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.mazi_members m
      JOIN public.mazi_membership_applications a ON a.id=m.application_id
      WHERE m.user_id=(SELECT auth.uid()) AND m.status='verified'
        AND m.identity_verified_at IS NOT NULL
        AND m.gemi_number IS NOT NULL AND a.status='approved'
    )
    AND EXISTS (
      SELECT 1 FROM public.mazi_cycles c WHERE c.id=cycle_id
        AND c.status='submissions' AND c.starts_at <= now() AND c.ends_at > now()
    )
  );

DROP POLICY IF EXISTS "mazi_vote_verified_insert" ON public.mazi_votes;
CREATE POLICY "mazi_vote_business_verified_insert"
  ON public.mazi_votes FOR INSERT TO authenticated
  WITH CHECK (
    voter_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.mazi_members m
      JOIN public.mazi_membership_applications a ON a.id=m.application_id
      WHERE m.user_id=(SELECT auth.uid()) AND m.status='verified'
        AND m.voting_eligible=true AND m.identity_verified_at IS NOT NULL
        AND m.gemi_number IS NOT NULL AND a.status='approved'
    )
    AND EXISTS (
      SELECT 1 FROM public.mazi_proposals p
      JOIN public.mazi_cycles c ON c.id=p.cycle_id
      WHERE p.id=proposal_id AND p.cycle_id=mazi_votes.cycle_id
        AND p.status='approved' AND p.created_by<>(SELECT auth.uid())
        AND c.status='voting' AND c.starts_at <= now() AND c.ends_at > now()
    )
  );

-- Read-only public founding-cycle metadata; no member applications, vote
-- records, funding ledger or unlaunched future financial cycles are exposed.
GRANT SELECT ON public.mazi_cycles TO anon;
CREATE POLICY "mazi_public_nonfinancial_founding_status"
  ON public.mazi_cycles FOR SELECT TO anon
  USING (
    slug='founding-needs-2026'
    AND kind='needs_assessment'
    AND finance_activated=false AND funding_budget_cents=0
  );
