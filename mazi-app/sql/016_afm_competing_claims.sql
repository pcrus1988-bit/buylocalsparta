-- MAZI / 016: avoid public AFM squatting.
-- One unverified prospect must never reserve a Greek tax number forever and
-- prevent a different legitimate representative from applying.
-- A contact can make only one claim for each AFM; distinct claims may coexist
-- for independent Admin review.
ALTER TABLE public.mazi_interest_applications
 DROP CONSTRAINT mazi_interest_applications_tax_number_key;

CREATE UNIQUE INDEX mazi_interest_unique_afm_contact
 ON public.mazi_interest_applications(tax_number,contact_email);
CREATE INDEX mazi_interest_afm_review_idx
 ON public.mazi_interest_applications(tax_number,status,submitted_at);

-- No new browser/Data API privileges, no automatic approval.
REVOKE ALL ON public.mazi_interest_applications FROM PUBLIC,anon,authenticated,service_role;
