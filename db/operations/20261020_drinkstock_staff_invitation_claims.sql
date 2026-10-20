-- A one-time staff invitation has only a SHA-256 token digest at rest.
-- No client role, no public reads, no implicit email invitation delivery.
BEGIN;
CREATE TABLE IF NOT EXISTS public.drinkstock_staff_invitations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 partner_id uuid NOT NULL,
 venue_id uuid NOT NULL,
 email public.citext NOT NULL,
 token_sha256 char(64) NOT NULL UNIQUE CHECK(token_sha256 ~ '^[a-f0-9]{64}$'),
 bar boolean NOT NULL DEFAULT false,
 waiter boolean NOT NULL DEFAULT false,
 created_by text NOT NULL,
 request_key uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 accepted_at timestamptz,
 accepted_user_id text,
 revoked_at timestamptz,
 revoked_by text,
 CONSTRAINT drinkstock_staff_invitation_station_check CHECK (bar OR waiter),
 CONSTRAINT drinkstock_staff_invitation_terminal_check CHECK (NOT (accepted_at IS NOT NULL AND revoked_at IS NOT NULL)),
 CONSTRAINT drinkstock_staff_invitation_acceptor_check CHECK ((accepted_at IS NULL)=(accepted_user_id IS NULL)),
 UNIQUE(venue_id,request_key),
 FOREIGN KEY(venue_id,partner_id) REFERENCES public.hospitality_venues(id,partner_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS drinkstock_invites_pending_scope_idx
 ON public.drinkstock_staff_invitations(partner_id,venue_id,expires_at DESC)
 WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE TABLE IF NOT EXISTS public.drinkstock_staff_invitation_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 partner_id uuid NOT NULL,
 venue_id uuid NOT NULL,
 invitation_id uuid NOT NULL REFERENCES public.drinkstock_staff_invitations(id) ON DELETE CASCADE,
 actor_user_id text NOT NULL,
 action text NOT NULL CHECK(action IN ('created','revoked','accepted')),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(venue_id,partner_id) REFERENCES public.hospitality_venues(id,partner_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS drinkstock_staff_invite_events_venue
 ON public.drinkstock_staff_invitation_events(partner_id,venue_id,created_at DESC);
ALTER TABLE public.drinkstock_staff_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drinkstock_staff_invitation_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.drinkstock_staff_invitations,public.drinkstock_staff_invitation_events FROM anon,authenticated;
COMMIT;
