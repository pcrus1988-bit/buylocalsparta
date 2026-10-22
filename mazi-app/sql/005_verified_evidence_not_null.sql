-- 005: enforce documented identity evidence at the database level.
-- A nullable expression inside CHECK is not enough: SQL CHECK accepts UNKNOWN.
ALTER TABLE public.mazi_members ADD CONSTRAINT mazi_gemi_verification_note_not_null
 CHECK (
   identity_verified_at IS NULL OR
   (identity_verification_note IS NOT NULL
    AND char_length(trim(identity_verification_note)) BETWEEN 20 AND 1000)
 );
