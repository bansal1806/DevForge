-- DEVFORGE MIGRATION 011: Shared rate-limit counters
--
-- Run AFTER 010. Idempotent: safe to re-run.
--
-- In-memory rate limits reset per serverless instance, so on Vercel they are
-- only a soft limit. These fixed-window counters live in Postgres and are
-- shared by every instance. Keys are hashed by the API (no raw IPs stored).

CREATE TABLE IF NOT EXISTS public.rate_limits (
    key TEXT NOT NULL CHECK (char_length(key) <= 200),
    window_start TIMESTAMPTZ NOT NULL,
    hits INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (key, window_start)
);

CREATE INDEX IF NOT EXISTS rate_limits_window_idx ON public.rate_limits (window_start);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limits FROM anon, authenticated;

CREATE OR REPLACE FUNCTION private.rate_window_start(p_window_ms integer)
RETURNS timestamptz
LANGUAGE sql STABLE SET search_path = ''
AS $$
  SELECT to_timestamp(floor(extract(epoch FROM now()) * 1000 / p_window_ms) * p_window_ms / 1000.0)
$$;

-- Counts a hit in the current window atomically.
-- Returns {"hits": n, "reset_at": "<timestamp>"}.
CREATE OR REPLACE FUNCTION public.rate_limit_hit(p_key text, p_window_ms integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_start timestamptz := private.rate_window_start(p_window_ms);
  v_hits integer;
BEGIN
  IF p_window_ms IS NULL OR p_window_ms < 1000 THEN
    RAISE EXCEPTION 'window must be at least 1000ms' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.rate_limits AS r (key, window_start, hits)
  VALUES (p_key, v_start, 1)
  ON CONFLICT (key, window_start) DO UPDATE SET hits = r.hits + 1
  RETURNING hits INTO v_hits;

  -- Opportunistic cleanup of expired windows (~1% of calls)
  IF random() < 0.01 THEN
    DELETE FROM public.rate_limits WHERE window_start < now() - interval '1 day';
  END IF;

  RETURN jsonb_build_object('hits', v_hits, 'reset_at', v_start + make_interval(secs => p_window_ms / 1000.0));
END;
$$;

-- Undo a hit (express-rate-limit calls this for skipped requests).
CREATE OR REPLACE FUNCTION public.rate_limit_decrement(p_key text, p_window_ms integer)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  UPDATE public.rate_limits
  SET hits = GREATEST(hits - 1, 0)
  WHERE key = p_key AND window_start = private.rate_window_start(p_window_ms);
$$;

CREATE OR REPLACE FUNCTION public.rate_limit_reset(p_key text)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$ DELETE FROM public.rate_limits WHERE key = p_key; $$;

REVOKE EXECUTE ON FUNCTION public.rate_limit_hit(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rate_limit_decrement(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rate_limit_reset(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rate_limit_hit(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.rate_limit_decrement(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.rate_limit_reset(text) TO service_role;
