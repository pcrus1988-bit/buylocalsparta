-- MAZI / 017 — bounded invitation lifetime, nonfinancial only.
-- Supabase Auth invite links use Email OTP expiry (default one hour). This
-- hard upper bound leaves a buffer rather than falsely advertising 24 hours.
-- Always revalidate the project's actual Auth OTP expiry before public release.
-- Additive, no user creation, no payment/fund changes or legacy data rewrites.
ALTER TABLE public.mazi_invitations
 ADD CONSTRAINT mazi_invitation_max_45_minute_lifetime
 CHECK (expires_at <= issued_at + interval '45 minutes');

COMMENT ON CONSTRAINT mazi_invitation_max_45_minute_lifetime
 ON public.mazi_invitations IS
 'Prevents MAZI admissions from outliving the normal Supabase invite token; actual OTP validity may be shorter and must be verified before launch.';
