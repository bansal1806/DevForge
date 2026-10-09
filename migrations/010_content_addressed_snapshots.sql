-- DEVFORGE MIGRATION 010: Content-addressed snapshot storage + merge preview
--
-- Run AFTER 009. Idempotent: safe to re-run.
--
-- Before: every commit copied the full text of every file into file_snapshots,
-- so storage grew as files x commits even when nothing changed.
-- After: file contents live once in `blobs`, keyed by SHA-256 (like git's
-- object store); snapshots reference a blob by hash. Diffs compare hashes in
-- SQL and only load content for paths that actually changed.
--
-- Also: merge_pull_request(..., p_dry_run) powers an honest "can this merge?"
-- preview on the PR page without touching any data.

-- ============================================================================
-- 1. Blob store (service role only — not exposed to end users)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.blobs (
    hash TEXT PRIMARY KEY CHECK (hash ~ '^[0-9a-f]{64}$'),
    content TEXT NOT NULL,
    size INTEGER GENERATED ALWAYS AS (octet_length(content)) STORED,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    last_used_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.blobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.blobs FROM anon, authenticated;

CREATE OR REPLACE FUNCTION private.blob_hash(p_content text)
RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$ SELECT encode(sha256(convert_to(p_content, 'UTF8')), 'hex') $$;

ALTER TABLE public.file_snapshots ADD COLUMN IF NOT EXISTS blob_hash TEXT REFERENCES public.blobs(hash);
CREATE INDEX IF NOT EXISTS file_snapshots_blob_hash_idx ON public.file_snapshots (blob_hash);

-- Snapshot rows must reference a blob, or record a NULL-content file
-- (content NULL and blob_hash NULL). Legacy inline content is migrated below.

-- ============================================================================
-- 2. Backfill: move inline snapshot content into blobs
-- ============================================================================
INSERT INTO public.blobs (hash, content)
SELECT DISTINCT private.blob_hash(s.content), s.content
FROM public.file_snapshots s
WHERE s.content IS NOT NULL AND s.blob_hash IS NULL
ON CONFLICT (hash) DO NOTHING;

UPDATE public.file_snapshots
SET blob_hash = private.blob_hash(content), content = NULL
WHERE content IS NOT NULL AND blob_hash IS NULL;

-- ============================================================================
-- 3. Read helpers
-- ============================================================================

-- Path-level diff between two commits' trees (base -> head). Unchanged paths
-- are skipped by hash comparison; content is only read for changed paths.
CREATE OR REPLACE FUNCTION public.diff_commits(p_head uuid, p_base uuid)
RETURNS TABLE (path text, status text, content text, original_content text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  WITH h AS (SELECT s.path, s.blob_hash FROM public.file_snapshots s WHERE s.commit_id = p_head),
       b AS (SELECT s.path, s.blob_hash FROM public.file_snapshots s WHERE s.commit_id = p_base),
       changed AS (
         SELECT COALESCE(h.path, b.path) AS path,
                h.path IS NOT NULL AS in_head, h.blob_hash AS head_hash,
                b.path IS NOT NULL AS in_base, b.blob_hash AS base_hash
         FROM h FULL OUTER JOIN b ON b.path = h.path
         WHERE h.path IS NULL OR b.path IS NULL OR h.blob_hash IS DISTINCT FROM b.blob_hash
       )
  SELECT c.path,
         CASE WHEN NOT c.in_base THEN 'added' WHEN NOT c.in_head THEN 'deleted' ELSE 'modified' END,
         hb.content,
         bb.content
  FROM changed c
  LEFT JOIN public.blobs hb ON hb.hash = c.head_hash
  LEFT JOIN public.blobs bb ON bb.hash = c.base_hash
  ORDER BY c.path;
$$;

-- Full file tree of a commit (path + content).
CREATE OR REPLACE FUNCTION public.commit_tree(p_commit uuid)
RETURNS TABLE (path text, content text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT s.path, COALESCE(bl.content, s.content)
  FROM public.file_snapshots s
  LEFT JOIN public.blobs bl ON bl.hash = s.blob_hash
  WHERE s.commit_id = p_commit
  ORDER BY s.path;
$$;

-- Storage efficiency, for the admin dashboard.
CREATE OR REPLACE FUNCTION public.snapshot_storage_stats()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'snapshot_rows', (SELECT count(*) FROM public.file_snapshots),
    'blob_count', (SELECT count(*) FROM public.blobs),
    'stored_bytes', (SELECT COALESCE(sum(size), 0) FROM public.blobs),
    'logical_bytes', (
      SELECT COALESCE(sum(bl.size), 0)
      FROM public.file_snapshots s JOIN public.blobs bl ON bl.hash = s.blob_hash
    )
  );
$$;

-- Deletes blobs no snapshot references that haven't been used for a day.
-- Writers bump last_used_at under a row lock, so a blob being reused by an
-- in-flight commit is never collected.
CREATE OR REPLACE FUNCTION public.gc_blobs()
RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  WITH deleted AS (
    DELETE FROM public.blobs bl
    WHERE bl.last_used_at < now() - interval '1 day'
      AND NOT EXISTS (SELECT 1 FROM public.file_snapshots s WHERE s.blob_hash = bl.hash)
    RETURNING 1
  )
  SELECT count(*)::int FROM deleted;
$$;

-- ============================================================================
-- 4. create_commit: snapshot by hash
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_commit(p_repo uuid, p_branch uuid, p_author uuid, p_message text)
RETURNS public.commits
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_branch public.branches;
  v_commit public.commits;
BEGIN
  SELECT * INTO v_branch FROM public.branches WHERE id = p_branch AND repo_id = p_repo FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'branch not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.commits (repo_id, branch_id, author_id, message, parent_id)
  VALUES (p_repo, p_branch, p_author, p_message, v_branch.last_commit_id)
  RETURNING * INTO v_commit;

  -- Store each distinct content once; touching last_used_at locks the row
  -- against concurrent garbage collection.
  INSERT INTO public.blobs (hash, content)
  SELECT DISTINCT private.blob_hash(f.content), f.content
  FROM public.files f
  WHERE f.repo_id = p_repo AND f.branch_id = p_branch AND f.content IS NOT NULL
  ON CONFLICT (hash) DO UPDATE SET last_used_at = now();

  INSERT INTO public.file_snapshots (commit_id, repo_id, path, blob_hash)
  SELECT v_commit.id, p_repo, f.path, CASE WHEN f.content IS NULL THEN NULL ELSE private.blob_hash(f.content) END
  FROM public.files f
  WHERE f.repo_id = p_repo AND f.branch_id = p_branch;

  UPDATE public.branches SET last_commit_id = v_commit.id WHERE id = p_branch;
  UPDATE public.repositories SET updated_at = now() WHERE id = p_repo;

  RETURN v_commit;
END;
$$;

-- ============================================================================
-- 5. merge_pull_request: hash-based three-way merge + dry run
-- ============================================================================
DROP FUNCTION IF EXISTS public.merge_pull_request(uuid, uuid);

CREATE OR REPLACE FUNCTION public.merge_pull_request(p_pr uuid, p_user uuid, p_dry_run boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_pr public.pull_requests;
  v_src public.branches;
  v_tgt public.branches;
  v_base uuid;
  v_conflicts text[];
  v_changes integer;
  v_commit public.commits;
BEGIN
  IF p_dry_run THEN
    SELECT * INTO v_pr FROM public.pull_requests WHERE id = p_pr;
  ELSE
    SELECT * INTO v_pr FROM public.pull_requests WHERE id = p_pr FOR UPDATE;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pull request not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_pr.status <> 'open' THEN
    RAISE EXCEPTION 'pull request is not open' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_src FROM public.branches WHERE id = v_pr.source_branch_id;
  IF p_dry_run THEN
    SELECT * INTO v_tgt FROM public.branches WHERE id = v_pr.target_branch_id;
  ELSE
    SELECT * INTO v_tgt FROM public.branches WHERE id = v_pr.target_branch_id FOR UPDATE;
  END IF;
  IF v_src.last_commit_id IS NULL THEN
    RAISE EXCEPTION 'source branch has no commits to merge' USING ERRCODE = '22023';
  END IF;

  v_base := public.merge_base(v_src.last_commit_id, v_tgt.last_commit_id);

  DROP TABLE IF EXISTS pg_temp.merge_plan;
  CREATE TEMP TABLE merge_plan ON COMMIT DROP AS
  WITH s AS (SELECT path, blob_hash FROM public.file_snapshots WHERE commit_id = v_src.last_commit_id),
       t AS (SELECT path, blob_hash FROM public.file_snapshots WHERE commit_id = v_tgt.last_commit_id),
       b AS (SELECT path, blob_hash FROM public.file_snapshots WHERE commit_id = v_base),
       w AS (
         SELECT path, CASE WHEN content IS NULL THEN NULL ELSE private.blob_hash(content) END AS blob_hash
         FROM public.files WHERE repo_id = v_pr.repo_id AND branch_id = v_tgt.id
       ),
       paths AS (SELECT path FROM s UNION SELECT path FROM t UNION SELECT path FROM b)
  SELECT p.path,
         s.path IS NOT NULL AS s_has, s.blob_hash AS s_h,
         t.path IS NOT NULL AS t_has, t.blob_hash AS t_h,
         b.path IS NOT NULL AS b_has, b.blob_hash AS b_h,
         w.path IS NOT NULL AS w_has, w.blob_hash AS w_h,
         NULL::text AS action
  FROM paths p
  LEFT JOIN s ON s.path = p.path
  LEFT JOIN t ON t.path = p.path
  LEFT JOIN b ON b.path = p.path
  LEFT JOIN w ON w.path = p.path;

  UPDATE merge_plan SET action = CASE
    WHEN s_has = t_has AND s_h IS NOT DISTINCT FROM t_h THEN 'keep'      -- identical
    WHEN s_has = b_has AND s_h IS NOT DISTINCT FROM b_h THEN 'keep'      -- only target changed
    WHEN t_has = b_has AND t_h IS NOT DISTINCT FROM b_h THEN 'take'      -- only source changed
    ELSE 'conflict'
  END;

  -- Taking a path is unsafe if the target has uncommitted edits to it
  UPDATE merge_plan SET action = 'conflict'
  WHERE action = 'take' AND NOT (w_has = t_has AND w_h IS NOT DISTINCT FROM t_h);

  SELECT array_agg(path ORDER BY path) INTO v_conflicts FROM merge_plan WHERE action = 'conflict';
  SELECT count(*) INTO v_changes FROM merge_plan WHERE action = 'take';

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'mergeable', v_conflicts IS NULL,
      'conflicts', COALESCE(to_jsonb(v_conflicts), '[]'::jsonb),
      'changes', v_changes
    );
  END IF;

  IF v_conflicts IS NOT NULL THEN
    RETURN jsonb_build_object('merged', false, 'conflicts', to_jsonb(v_conflicts));
  END IF;

  -- Apply source changes to the target's working files
  DELETE FROM public.files f
  USING merge_plan m
  WHERE m.action = 'take' AND NOT m.s_has
    AND f.repo_id = v_pr.repo_id AND f.branch_id = v_tgt.id AND f.path = m.path;

  INSERT INTO public.files (repo_id, branch_id, path, content, updated_at)
  SELECT v_pr.repo_id, v_tgt.id, m.path, bl.content, now()
  FROM merge_plan m
  LEFT JOIN public.blobs bl ON bl.hash = m.s_h
  WHERE m.action = 'take' AND m.s_has
  ON CONFLICT (repo_id, branch_id, path) DO UPDATE
    SET content = EXCLUDED.content, updated_at = EXCLUDED.updated_at;

  -- Keep every blob the merge commit will reference safe from GC
  UPDATE public.blobs SET last_used_at = now()
  WHERE hash IN (
    SELECT CASE WHEN action = 'take' THEN s_h ELSE t_h END FROM merge_plan
    WHERE (action = 'take' AND s_has) OR (action = 'keep' AND t_has)
  );

  INSERT INTO public.commits (repo_id, branch_id, author_id, message, parent_id, merge_parent_id)
  VALUES (v_pr.repo_id, v_tgt.id, p_user,
          format('Merge pull request "%s" (%s → %s)', v_pr.title, v_src.name, v_tgt.name),
          v_tgt.last_commit_id, v_src.last_commit_id)
  RETURNING * INTO v_commit;

  -- Merge commit tree = committed target tree with source changes applied
  INSERT INTO public.file_snapshots (commit_id, repo_id, path, blob_hash)
  SELECT v_commit.id, v_pr.repo_id, m.path, CASE WHEN m.action = 'take' THEN m.s_h ELSE m.t_h END
  FROM merge_plan m
  WHERE (m.action = 'take' AND m.s_has) OR (m.action = 'keep' AND m.t_has);

  UPDATE public.branches SET last_commit_id = v_commit.id WHERE id = v_tgt.id;
  UPDATE public.pull_requests SET status = 'merged', merged_at = now() WHERE id = p_pr;
  UPDATE public.repositories SET updated_at = now() WHERE id = v_pr.repo_id;

  RETURN jsonb_build_object('merged', true, 'commit_id', v_commit.id);
END;
$$;

-- ============================================================================
-- 6. Privileges: service role only
-- ============================================================================
REVOKE EXECUTE ON FUNCTION public.diff_commits(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.commit_tree(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.snapshot_storage_stats() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gc_blobs() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_commit(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.merge_pull_request(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.diff_commits(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.commit_tree(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.snapshot_storage_stats() TO service_role;
GRANT EXECUTE ON FUNCTION public.gc_blobs() TO service_role;
GRANT EXECUTE ON FUNCTION public.create_commit(uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.merge_pull_request(uuid, uuid, boolean) TO service_role;
