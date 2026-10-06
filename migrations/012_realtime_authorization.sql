-- DEVFORGE MIGRATION 012: Supabase Realtime authorization for live collaboration
--
-- Run AFTER 011. Idempotent: safe to re-run.
--
-- Live collaboration moved from a Socket.IO server (impossible on serverless)
-- to Supabase Realtime private channels, which work wherever the frontend runs.
-- Channel topic: `repo:<repository uuid>`. Authorization reuses the access
-- model from migration 009:
--   * receive broadcasts / presence ......... read access to the repo
--   * track presence ........................ read access to the repo
--   * send broadcasts (live edits, cursors) . write access to the repo
--
-- Also required in the dashboard: Realtime Settings → disable
-- "Allow public access" so only private (authorized) channels can be joined.
-- Realtime caches these checks per connection until the client's JWT is
-- refreshed, so revoked access lapses within one token lifetime.

-- Parses `repo:<uuid>` topics; NULL for anything else (so policies deny).
CREATE OR REPLACE FUNCTION private.topic_repo_id(p_topic text)
RETURNS uuid
LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_topic ~ '^repo:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    THEN substring(p_topic FROM 6)::uuid
  END
$$;

GRANT EXECUTE ON FUNCTION private.topic_repo_id(text) TO anon, authenticated, service_role;

DO $$
BEGIN
  -- Skip cleanly on databases without Supabase Realtime (e.g. plain Postgres)
  IF to_regclass('realtime.messages') IS NULL THEN
    RAISE NOTICE 'realtime.messages not found; skipping Realtime policies';
    RETURN;
  END IF;

  DROP POLICY IF EXISTS devforge_repo_receive ON realtime.messages;
  DROP POLICY IF EXISTS devforge_repo_presence ON realtime.messages;
  DROP POLICY IF EXISTS devforge_repo_broadcast ON realtime.messages;

  EXECUTE $p$
    CREATE POLICY devforge_repo_receive ON realtime.messages
      FOR SELECT TO authenticated
      USING (
        realtime.messages.extension IN ('broadcast', 'presence')
        AND private.can_read_repo(private.topic_repo_id((SELECT realtime.topic())))
      )
  $p$;

  EXECUTE $p$
    CREATE POLICY devforge_repo_presence ON realtime.messages
      FOR INSERT TO authenticated
      WITH CHECK (
        realtime.messages.extension = 'presence'
        AND private.can_read_repo(private.topic_repo_id((SELECT realtime.topic())))
      )
  $p$;

  EXECUTE $p$
    CREATE POLICY devforge_repo_broadcast ON realtime.messages
      FOR INSERT TO authenticated
      WITH CHECK (
        realtime.messages.extension = 'broadcast'
        AND private.can_write_repo(private.topic_repo_id((SELECT realtime.topic())))
      )
  $p$;
END $$;
