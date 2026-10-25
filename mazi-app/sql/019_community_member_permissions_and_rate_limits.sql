-- MAZI / 019: real member-to-member marketplace, forum and livechat protection.
-- The community tables already exist. Add measured indexes and a locked,
-- database-level anti-spam/authorization guard without changing financial data.
-- Only the JWT-validating Edge gateway writes with the restricted service role.
CREATE INDEX IF NOT EXISTS mazi_listings_live_created_idx
  ON public.mazi_marketplace_listings(status,created_at DESC);
CREATE INDEX IF NOT EXISTS mazi_listings_author_time_idx
  ON public.mazi_marketplace_listings(member_user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS mazi_forum_threads_created_idx
  ON public.mazi_forum_threads(created_at DESC);
CREATE INDEX IF NOT EXISTS mazi_forum_threads_author_time_idx
  ON public.mazi_forum_threads(member_user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS mazi_forum_replies_thread_time_idx
  ON public.mazi_forum_replies(thread_id,created_at ASC);
CREATE INDEX IF NOT EXISTS mazi_forum_replies_author_time_idx
  ON public.mazi_forum_replies(member_user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS mazi_chat_lobby_created_idx
  ON public.mazi_chat_messages(channel,created_at DESC);
CREATE INDEX IF NOT EXISTS mazi_chat_author_time_idx
  ON public.mazi_chat_messages(member_user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS mazi_reports_author_time_idx
  ON public.mazi_community_reports(reporter_user_id,created_at DESC);

CREATE OR REPLACE FUNCTION mazi_private.guard_community_submission()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE
  actor uuid;
  last_post timestamptz;
  volume integer;
BEGIN
  IF TG_TABLE_NAME='mazi_community_reports' THEN
    actor:=NEW.reporter_user_id;
  ELSE
    actor:=NEW.member_user_id;
  END IF;
  IF actor IS NULL THEN RAISE EXCEPTION 'MAZI_MEMBER_REQUIRED'; END IF;

  -- Lock per member/table, serializing simultaneous attempts. No JWT metadata
  -- or client-supplied "verified" flag can assert permission.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('mazi-community:'||TG_TABLE_NAME||':'||actor::text, 1279));
  IF NOT EXISTS (
    SELECT 1 FROM public.mazi_members m
    JOIN public.mazi_membership_applications a ON a.id=m.application_id
    WHERE m.user_id=actor AND m.status='verified'
      AND m.identity_verified_at IS NOT NULL AND m.gemi_number IS NOT NULL
      AND a.status='approved' AND a.applicant_user_id=actor
  ) THEN
    RAISE EXCEPTION 'MAZI_MEMBER_NOT_VERIFIED';
  END IF;

  IF TG_TABLE_NAME='mazi_chat_messages' THEN
    SELECT max(created_at),count(*)::integer INTO last_post,volume
    FROM public.mazi_chat_messages WHERE member_user_id=actor
      AND created_at>now()-interval '1 hour';
    IF last_post>now()-interval '3 seconds' OR volume>=40 THEN
      RAISE EXCEPTION 'MAZI_CHAT_RATE_LIMIT';
    END IF;
  ELSIF TG_TABLE_NAME='mazi_forum_threads' THEN
    SELECT max(created_at),count(*)::integer INTO last_post,volume
    FROM public.mazi_forum_threads WHERE member_user_id=actor
      AND created_at>now()-interval '24 hours';
    IF last_post>now()-interval '1 minute' OR volume>=6 THEN
      RAISE EXCEPTION 'MAZI_FORUM_RATE_LIMIT';
    END IF;
  ELSIF TG_TABLE_NAME='mazi_forum_replies' THEN
    IF NOT EXISTS(SELECT 1 FROM public.mazi_forum_threads
                  WHERE id=NEW.thread_id AND NOT locked) THEN
      RAISE EXCEPTION 'MAZI_FORUM_THREAD_LOCKED';
    END IF;
    SELECT max(created_at),count(*)::integer INTO last_post,volume
    FROM public.mazi_forum_replies WHERE member_user_id=actor
      AND created_at>now()-interval '24 hours';
    IF last_post>now()-interval '10 seconds' OR volume>=50 THEN
      RAISE EXCEPTION 'MAZI_REPLY_RATE_LIMIT';
    END IF;
  ELSIF TG_TABLE_NAME='mazi_marketplace_listings' THEN
    SELECT max(created_at),count(*)::integer INTO last_post,volume
    FROM public.mazi_marketplace_listings WHERE member_user_id=actor
      AND created_at>now()-interval '24 hours';
    IF last_post>now()-interval '1 minute' OR volume>=12 THEN
      RAISE EXCEPTION 'MAZI_LISTING_RATE_LIMIT';
    END IF;
    IF (SELECT count(*) FROM public.mazi_marketplace_listings
        WHERE member_user_id=actor AND status='active')>=20 THEN
      RAISE EXCEPTION 'MAZI_LISTING_ACTIVE_LIMIT';
    END IF;
  ELSIF TG_TABLE_NAME='mazi_community_reports' THEN
    SELECT max(created_at),count(*)::integer INTO last_post,volume
    FROM public.mazi_community_reports WHERE reporter_user_id=actor
      AND created_at>now()-interval '24 hours';
    IF last_post>now()-interval '15 seconds' OR volume>=10 THEN
      RAISE EXCEPTION 'MAZI_REPORT_RATE_LIMIT';
    END IF;
  ELSE
    RAISE EXCEPTION 'MAZI_UNSUPPORTED_COMMUNITY_TABLE';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION mazi_private.guard_community_submission()
 FROM PUBLIC,anon,authenticated;
CREATE TRIGGER mazi_guard_listing_submit BEFORE INSERT ON public.mazi_marketplace_listings
 FOR EACH ROW EXECUTE FUNCTION mazi_private.guard_community_submission();
CREATE TRIGGER mazi_guard_forum_thread_submit BEFORE INSERT ON public.mazi_forum_threads
 FOR EACH ROW EXECUTE FUNCTION mazi_private.guard_community_submission();
CREATE TRIGGER mazi_guard_forum_reply_submit BEFORE INSERT ON public.mazi_forum_replies
 FOR EACH ROW EXECUTE FUNCTION mazi_private.guard_community_submission();
CREATE TRIGGER mazi_guard_chat_submit BEFORE INSERT ON public.mazi_chat_messages
 FOR EACH ROW EXECUTE FUNCTION mazi_private.guard_community_submission();
CREATE TRIGGER mazi_guard_community_report_submit BEFORE INSERT ON public.mazi_community_reports
 FOR EACH ROW EXECUTE FUNCTION mazi_private.guard_community_submission();

-- Anonymous and authenticated browser clients still have NO direct table
-- access. The Edge service role remains insert/select-only, except existing
-- listing UPDATE for an author-controlled close operation.
REVOKE ALL ON public.mazi_marketplace_listings,public.mazi_forum_threads,
 public.mazi_forum_replies,public.mazi_chat_messages,public.mazi_community_reports
 FROM PUBLIC,anon,authenticated;
