-- DEVFORGE MIGRATION 009: Security hardening, commit ancestry, atomic commit/merge
--
-- Run AFTER 008. Idempotent: safe to re-run.
--
-- 1. Users: column-level grants hide email/role from the public API and make
--    role/email immutable for end users (fixes self-promotion to admin).
-- 2. RLS: every policy is dropped and recreated from one consistent model built
--    on SECURITY DEFINER helpers in a non-exposed `private` schema. This removes
--    the repositories <-> repo_collaborators policy recursion and the permissive
--    leftovers from 003/004 (PR/comment/review impersonation).
-- 3. Integrity triggers: branch/commit rows must belong to the same repo; PR
--    identity columns are immutable.
-- 4. Commit ancestry (parent_id / merge_parent_id) + merge_base(), so merges are
--    real three-way merges with conflict detection.
-- 5. Atomic create_commit() and merge_pull_request() (service_role only).
-- 6. Indexes, FK delete behaviour, safer signup trigger.

-- ============================================================================
-- 0. Private helper schema (not exposed through PostgREST)
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO anon, authenticated, service_role;

-- Effective access level of the current user on a repo:
-- 0 = none, 1 = read, 2 = write, 3 = admin/owner. NULL repo -> 0.
CREATE OR REPLACE FUNCTION private.repo_access_level(p_repo uuid)
RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT GREATEST(
      CASE WHEN r.is_private THEN 0 ELSE 1 END,
      CASE WHEN auth.uid() IS NOT NULL AND r.owner_id = auth.uid() THEN 3 ELSE 0 END,
      COALESCE((
        SELECT CASE rc.permission WHEN 'admin' THEN 3 WHEN 'write' THEN 2 ELSE 1 END
        FROM public.repo_collaborators rc
        WHERE rc.repo_id = r.id AND rc.user_id = auth.uid()
      ), 0)
    )
    FROM public.repositories r
    WHERE r.id = p_repo
  ), 0);
$$;

CREATE OR REPLACE FUNCTION private.can_read_repo(p_repo uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = ''
AS $$ SELECT private.repo_access_level(p_repo) >= 1 $$;

CREATE OR REPLACE FUNCTION private.can_write_repo(p_repo uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = ''
AS $$ SELECT private.repo_access_level(p_repo) >= 2 $$;

CREATE OR REPLACE FUNCTION private.is_repo_owner(p_repo uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.repositories r WHERE r.id = p_repo AND r.owner_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION private.pr_repo_id(p_pr uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT repo_id FROM public.pull_requests WHERE id = p_pr $$;

CREATE OR REPLACE FUNCTION private.issue_repo_id(p_issue uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT repo_id FROM public.issues WHERE id = p_issue $$;

CREATE OR REPLACE FUNCTION private.owns_gist(p_gist uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.gists g WHERE g.id = p_gist AND g.user_id = auth.uid()) $$;

CREATE OR REPLACE FUNCTION private.can_read_gist(p_gist uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.gists g
    WHERE g.id = p_gist AND (g.is_public OR g.user_id = auth.uid())
  );
$$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO anon, authenticated, service_role;

-- ============================================================================
-- 1. Users: hide email/role, lock down writable columns
-- ============================================================================
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user' NOT NULL;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'admin'));

REVOKE ALL ON public.users FROM anon, authenticated;
GRANT SELECT (id, name, avatar_url, bio, created_at, updated_at) ON public.users TO anon, authenticated;
GRANT UPDATE (name, avatar_url, bio, updated_at) ON public.users TO authenticated;

-- ============================================================================
-- 2. Commit ancestry
-- ============================================================================
ALTER TABLE public.commits ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.commits(id) ON DELETE SET NULL;
ALTER TABLE public.commits ADD COLUMN IF NOT EXISTS merge_parent_id UUID REFERENCES public.commits(id) ON DELETE SET NULL;

-- Backfill (best effort, only touches rows without a parent):
-- a) each commit's parent is the previous commit on the same branch
WITH ordered AS (
  SELECT id, LAG(id) OVER (PARTITION BY branch_id ORDER BY created_at, id) AS prev
  FROM public.commits
)
UPDATE public.commits c
SET parent_id = o.prev
FROM ordered o
WHERE c.id = o.id AND c.parent_id IS NULL AND o.prev IS NOT NULL;

-- b) the first commit on a non-default branch descends from the default
--    branch's head at the time the branch was created
UPDATE public.commits c
SET parent_id = (
  SELECT d.id
  FROM public.commits d
  JOIN public.branches db ON db.id = d.branch_id AND db.is_default
  WHERE d.repo_id = c.repo_id AND d.created_at <= b.created_at
  ORDER BY d.created_at DESC
  LIMIT 1
)
FROM public.branches b
WHERE b.id = c.branch_id
  AND NOT COALESCE(b.is_default, false)
  AND c.parent_id IS NULL;

-- ============================================================================
-- 3. Integrity: one default branch per repo, name formats, cross-repo guards
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS branches_one_default_per_repo
  ON public.branches (repo_id) WHERE is_default;

ALTER TABLE public.repositories DROP CONSTRAINT IF EXISTS repositories_name_format;
ALTER TABLE public.repositories ADD CONSTRAINT repositories_name_format
  CHECK (name ~ '^[A-Za-z0-9._-]{1,100}$') NOT VALID;

ALTER TABLE public.branches DROP CONSTRAINT IF EXISTS branches_name_format;
ALTER TABLE public.branches ADD CONSTRAINT branches_name_format
  CHECK (name ~ '^[A-Za-z0-9._/-]{1,100}$' AND name !~ '(^/|/$|//|\.\.)') NOT VALID;

-- Rows carrying (repo_id, branch_id) must reference a branch of that repo.
CREATE OR REPLACE FUNCTION private.check_branch_in_repo()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NEW.branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.branches b WHERE b.id = NEW.branch_id AND b.repo_id = NEW.repo_id
  ) THEN
    RAISE EXCEPTION 'branch % does not belong to repository %', NEW.branch_id, NEW.repo_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS files_branch_in_repo ON public.files;
CREATE TRIGGER files_branch_in_repo BEFORE INSERT OR UPDATE OF repo_id, branch_id ON public.files
  FOR EACH ROW EXECUTE FUNCTION private.check_branch_in_repo();

DROP TRIGGER IF EXISTS commits_branch_in_repo ON public.commits;
CREATE TRIGGER commits_branch_in_repo BEFORE INSERT OR UPDATE OF repo_id, branch_id ON public.commits
  FOR EACH ROW EXECUTE FUNCTION private.check_branch_in_repo();

-- Snapshots must belong to a commit of the same repo.
CREATE OR REPLACE FUNCTION private.check_snapshot_in_repo()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.commits c WHERE c.id = NEW.commit_id AND c.repo_id = NEW.repo_id) THEN
    RAISE EXCEPTION 'commit % does not belong to repository %', NEW.commit_id, NEW.repo_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS snapshots_commit_in_repo ON public.file_snapshots;
CREATE TRIGGER snapshots_commit_in_repo BEFORE INSERT OR UPDATE OF repo_id, commit_id ON public.file_snapshots
  FOR EACH ROW EXECUTE FUNCTION private.check_snapshot_in_repo();

-- Pull requests: both branches in the PR's repo, distinct, identity immutable.
CREATE OR REPLACE FUNCTION private.check_pull_request()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
       NEW.repo_id IS DISTINCT FROM OLD.repo_id
    OR NEW.author_id IS DISTINCT FROM OLD.author_id
    OR NEW.source_branch_id IS DISTINCT FROM OLD.source_branch_id
    OR NEW.target_branch_id IS DISTINCT FROM OLD.target_branch_id
  ) THEN
    RAISE EXCEPTION 'pull request repository, author and branches are immutable' USING ERRCODE = '23514';
  END IF;

  IF NEW.source_branch_id = NEW.target_branch_id THEN
    RAISE EXCEPTION 'source and target branches must differ' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.branches b WHERE b.id = NEW.source_branch_id AND b.repo_id = NEW.repo_id)
     OR NOT EXISTS (SELECT 1 FROM public.branches b WHERE b.id = NEW.target_branch_id AND b.repo_id = NEW.repo_id) THEN
    RAISE EXCEPTION 'pull request branches must belong to the repository' USING ERRCODE = '23514';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pull_requests_integrity ON public.pull_requests;
CREATE TRIGGER pull_requests_integrity BEFORE INSERT OR UPDATE ON public.pull_requests
  FOR EACH ROW EXECUTE FUNCTION private.check_pull_request();

-- ============================================================================
-- 4. RLS: drop every existing policy, recreate one consistent set
-- ============================================================================
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN (
      'users', 'repositories', 'files', 'branches', 'commits', 'file_snapshots',
      'pull_requests', 'pr_comments', 'pr_reviews', 'gists', 'gist_files',
      'issues', 'issue_comments', 'repo_collaborators', 'stars',
      'audit_logs', 'execution_stats'
    )
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
  END LOOP;
END $$;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repositories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pull_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pr_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pr_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gist_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issue_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repo_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.execution_stats ENABLE ROW LEVEL SECURITY;

-- Users (column grants above restrict WHICH columns are visible/writable)
CREATE POLICY users_select ON public.users FOR SELECT USING (true);
CREATE POLICY users_update_own ON public.users FOR UPDATE
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- Repositories
CREATE POLICY repos_select ON public.repositories FOR SELECT USING (private.can_read_repo(id));
CREATE POLICY repos_insert ON public.repositories FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY repos_update ON public.repositories FOR UPDATE
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY repos_delete ON public.repositories FOR DELETE USING (owner_id = auth.uid());

-- Repo content tables: read with read access, write with write access
CREATE POLICY files_select ON public.files FOR SELECT USING (private.can_read_repo(repo_id));
CREATE POLICY files_write ON public.files FOR ALL
  USING (private.can_write_repo(repo_id)) WITH CHECK (private.can_write_repo(repo_id));

CREATE POLICY branches_select ON public.branches FOR SELECT USING (private.can_read_repo(repo_id));
CREATE POLICY branches_write ON public.branches FOR ALL
  USING (private.can_write_repo(repo_id)) WITH CHECK (private.can_write_repo(repo_id));

CREATE POLICY commits_select ON public.commits FOR SELECT USING (private.can_read_repo(repo_id));
CREATE POLICY commits_insert ON public.commits FOR INSERT
  WITH CHECK (private.can_write_repo(repo_id) AND author_id = auth.uid());

CREATE POLICY snapshots_select ON public.file_snapshots FOR SELECT USING (private.can_read_repo(repo_id));
CREATE POLICY snapshots_insert ON public.file_snapshots FOR INSERT WITH CHECK (private.can_write_repo(repo_id));

-- Collaborators
CREATE POLICY collaborators_select ON public.repo_collaborators FOR SELECT USING (private.can_read_repo(repo_id));
CREATE POLICY collaborators_manage ON public.repo_collaborators FOR ALL
  USING (private.is_repo_owner(repo_id)) WITH CHECK (private.is_repo_owner(repo_id));

-- Pull requests
CREATE POLICY prs_select ON public.pull_requests FOR SELECT USING (private.can_read_repo(repo_id));
CREATE POLICY prs_insert ON public.pull_requests FOR INSERT
  WITH CHECK (author_id = auth.uid() AND status = 'open' AND private.can_write_repo(repo_id));
CREATE POLICY prs_update ON public.pull_requests FOR UPDATE
  USING (private.can_write_repo(repo_id) OR author_id = auth.uid())
  WITH CHECK (private.can_write_repo(repo_id) OR (author_id = auth.uid() AND status IN ('open', 'closed')));

CREATE POLICY pr_comments_select ON public.pr_comments FOR SELECT
  USING (private.can_read_repo(private.pr_repo_id(pr_id)));
CREATE POLICY pr_comments_insert ON public.pr_comments FOR INSERT
  WITH CHECK (author_id = auth.uid() AND private.can_read_repo(private.pr_repo_id(pr_id)));
CREATE POLICY pr_comments_update ON public.pr_comments FOR UPDATE
  USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());
CREATE POLICY pr_comments_delete ON public.pr_comments FOR DELETE
  USING (author_id = auth.uid() OR private.can_write_repo(private.pr_repo_id(pr_id)));

CREATE POLICY pr_reviews_select ON public.pr_reviews FOR SELECT
  USING (private.can_read_repo(private.pr_repo_id(pr_id)));
CREATE POLICY pr_reviews_insert ON public.pr_reviews FOR INSERT
  WITH CHECK (reviewer_id = auth.uid() AND private.can_read_repo(private.pr_repo_id(pr_id)));

-- Issues (anyone who can read a repo may open issues, like GitHub)
CREATE POLICY issues_select ON public.issues FOR SELECT USING (private.can_read_repo(repo_id));
CREATE POLICY issues_insert ON public.issues FOR INSERT
  WITH CHECK (author_id = auth.uid() AND private.can_read_repo(repo_id));
CREATE POLICY issues_update ON public.issues FOR UPDATE
  USING (author_id = auth.uid() OR private.can_write_repo(repo_id))
  WITH CHECK (author_id = auth.uid() OR private.can_write_repo(repo_id));

CREATE POLICY issue_comments_select ON public.issue_comments FOR SELECT
  USING (private.can_read_repo(private.issue_repo_id(issue_id)));
CREATE POLICY issue_comments_insert ON public.issue_comments FOR INSERT
  WITH CHECK (author_id = auth.uid() AND private.can_read_repo(private.issue_repo_id(issue_id)));
CREATE POLICY issue_comments_update ON public.issue_comments FOR UPDATE
  USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());
CREATE POLICY issue_comments_delete ON public.issue_comments FOR DELETE
  USING (author_id = auth.uid() OR private.can_write_repo(private.issue_repo_id(issue_id)));

-- Gists
CREATE POLICY gists_select ON public.gists FOR SELECT USING (is_public OR user_id = auth.uid());
CREATE POLICY gists_insert ON public.gists FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY gists_update ON public.gists FOR UPDATE
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY gists_delete ON public.gists FOR DELETE USING (user_id = auth.uid());

CREATE POLICY gist_files_select ON public.gist_files FOR SELECT USING (private.can_read_gist(gist_id));
CREATE POLICY gist_files_write ON public.gist_files FOR ALL
  USING (private.owns_gist(gist_id)) WITH CHECK (private.owns_gist(gist_id));

-- Stars: your own stars, or stars on repos you can read
CREATE POLICY stars_select ON public.stars FOR SELECT
  USING (user_id = auth.uid() OR private.can_read_repo(repo_id));
CREATE POLICY stars_insert ON public.stars FOR INSERT
  WITH CHECK (user_id = auth.uid() AND private.can_read_repo(repo_id));
CREATE POLICY stars_delete ON public.stars FOR DELETE USING (user_id = auth.uid());

-- Telemetry: read-only for end users, written by the service role
CREATE POLICY audit_logs_select_own ON public.audit_logs FOR SELECT USING (user_id = auth.uid());
CREATE POLICY execution_stats_select ON public.execution_stats FOR SELECT USING (private.can_read_repo(repo_id));

-- ============================================================================
-- 5. Versioning functions (service_role only — the API authorizes first)
-- ============================================================================

-- Most recent common ancestor of two commits (NULL if unrelated/unknown).
CREATE OR REPLACE FUNCTION public.merge_base(p_a uuid, p_b uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  WITH RECURSIVE anc_a(id) AS (
    SELECT p_a WHERE p_a IS NOT NULL
    UNION
    SELECT u.pid
    FROM anc_a
    JOIN public.commits c ON c.id = anc_a.id
    CROSS JOIN LATERAL unnest(ARRAY[c.parent_id, c.merge_parent_id]) AS u(pid)
    WHERE u.pid IS NOT NULL
  ),
  anc_b(id) AS (
    SELECT p_b WHERE p_b IS NOT NULL
    UNION
    SELECT u.pid
    FROM anc_b
    JOIN public.commits c ON c.id = anc_b.id
    CROSS JOIN LATERAL unnest(ARRAY[c.parent_id, c.merge_parent_id]) AS u(pid)
    WHERE u.pid IS NOT NULL
  )
  SELECT c.id
  FROM public.commits c
  JOIN anc_a ON anc_a.id = c.id
  JOIN anc_b ON anc_b.id = c.id
  ORDER BY c.created_at DESC
  LIMIT 1;
$$;

-- Records a commit of a branch's working files atomically (branch row locked).
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

  INSERT INTO public.file_snapshots (commit_id, repo_id, path, content)
  SELECT v_commit.id, p_repo, f.path, f.content
  FROM public.files f
  WHERE f.repo_id = p_repo AND f.branch_id = p_branch;

  UPDATE public.branches SET last_commit_id = v_commit.id WHERE id = p_branch;
  UPDATE public.repositories SET updated_at = now() WHERE id = p_repo;

  RETURN v_commit;
END;
$$;

-- Three-way merges a PR's source head into its target branch.
-- Returns {"merged": true, "commit_id": ...} or {"merged": false, "conflicts": [...]}.
-- Conflicts: a path changed differently on both sides since the merge base, or a
-- path the merge would change has uncommitted edits on the target branch.
CREATE OR REPLACE FUNCTION public.merge_pull_request(p_pr uuid, p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_pr public.pull_requests;
  v_src public.branches;
  v_tgt public.branches;
  v_base uuid;
  v_conflicts text[];
  v_commit public.commits;
BEGIN
  SELECT * INTO v_pr FROM public.pull_requests WHERE id = p_pr FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pull request not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_pr.status <> 'open' THEN
    RAISE EXCEPTION 'pull request is not open' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_src FROM public.branches WHERE id = v_pr.source_branch_id;
  SELECT * INTO v_tgt FROM public.branches WHERE id = v_pr.target_branch_id FOR UPDATE;
  IF v_src.last_commit_id IS NULL THEN
    RAISE EXCEPTION 'source branch has no commits to merge' USING ERRCODE = '22023';
  END IF;

  v_base := public.merge_base(v_src.last_commit_id, v_tgt.last_commit_id);

  DROP TABLE IF EXISTS pg_temp.merge_plan;
  CREATE TEMP TABLE merge_plan ON COMMIT DROP AS
  WITH s AS (SELECT path, content FROM public.file_snapshots WHERE commit_id = v_src.last_commit_id),
       t AS (SELECT path, content FROM public.file_snapshots WHERE commit_id = v_tgt.last_commit_id),
       b AS (SELECT path, content FROM public.file_snapshots WHERE commit_id = v_base),
       w AS (SELECT path, content FROM public.files WHERE repo_id = v_pr.repo_id AND branch_id = v_tgt.id),
       paths AS (SELECT path FROM s UNION SELECT path FROM t UNION SELECT path FROM b)
  SELECT p.path,
         s.path IS NOT NULL AS s_has, s.content AS s_c,
         t.path IS NOT NULL AS t_has, t.content AS t_c,
         b.path IS NOT NULL AS b_has, b.content AS b_c,
         w.path IS NOT NULL AS w_has, w.content AS w_c,
         NULL::text AS action
  FROM paths p
  LEFT JOIN s ON s.path = p.path
  LEFT JOIN t ON t.path = p.path
  LEFT JOIN b ON b.path = p.path
  LEFT JOIN w ON w.path = p.path;

  UPDATE merge_plan SET action = CASE
    WHEN s_has = t_has AND s_c IS NOT DISTINCT FROM t_c THEN 'keep'      -- identical
    WHEN s_has = b_has AND s_c IS NOT DISTINCT FROM b_c THEN 'keep'      -- only target changed
    WHEN t_has = b_has AND t_c IS NOT DISTINCT FROM b_c THEN 'take'      -- only source changed
    ELSE 'conflict'
  END;

  -- Taking a path is unsafe if the target has uncommitted edits to it
  UPDATE merge_plan SET action = 'conflict'
  WHERE action = 'take' AND NOT (w_has = t_has AND w_c IS NOT DISTINCT FROM t_c);

  SELECT array_agg(path ORDER BY path) INTO v_conflicts FROM merge_plan WHERE action = 'conflict';
  IF v_conflicts IS NOT NULL THEN
    RETURN jsonb_build_object('merged', false, 'conflicts', to_jsonb(v_conflicts));
  END IF;

  -- Apply source changes to the target's working files
  DELETE FROM public.files f
  USING merge_plan m
  WHERE m.action = 'take' AND NOT m.s_has
    AND f.repo_id = v_pr.repo_id AND f.branch_id = v_tgt.id AND f.path = m.path;

  INSERT INTO public.files (repo_id, branch_id, path, content, updated_at)
  SELECT v_pr.repo_id, v_tgt.id, m.path, m.s_c, now()
  FROM merge_plan m
  WHERE m.action = 'take' AND m.s_has
  ON CONFLICT (repo_id, branch_id, path) DO UPDATE
    SET content = EXCLUDED.content, updated_at = EXCLUDED.updated_at;

  INSERT INTO public.commits (repo_id, branch_id, author_id, message, parent_id, merge_parent_id)
  VALUES (v_pr.repo_id, v_tgt.id, p_user,
          format('Merge pull request "%s" (%s → %s)', v_pr.title, v_src.name, v_tgt.name),
          v_tgt.last_commit_id, v_src.last_commit_id)
  RETURNING * INTO v_commit;

  -- Merge commit snapshot = committed target tree with source changes applied
  INSERT INTO public.file_snapshots (commit_id, repo_id, path, content)
  SELECT v_commit.id, v_pr.repo_id, m.path, CASE WHEN m.action = 'take' THEN m.s_c ELSE m.t_c END
  FROM merge_plan m
  WHERE (m.action = 'take' AND m.s_has) OR (m.action = 'keep' AND m.t_has);

  UPDATE public.branches SET last_commit_id = v_commit.id WHERE id = v_tgt.id;
  UPDATE public.pull_requests SET status = 'merged', merged_at = now() WHERE id = p_pr;
  UPDATE public.repositories SET updated_at = now() WHERE id = v_pr.repo_id;

  RETURN jsonb_build_object('merged', true, 'commit_id', v_commit.id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.merge_base(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_commit(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.merge_pull_request(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_base(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_commit(uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.merge_pull_request(uuid, uuid) TO service_role;

-- ============================================================================
-- 6. Indexes
-- ============================================================================
CREATE INDEX IF NOT EXISTS file_snapshots_commit_id_idx ON public.file_snapshots (commit_id);
CREATE INDEX IF NOT EXISTS commits_repo_branch_created_idx ON public.commits (repo_id, branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS commits_author_created_idx ON public.commits (author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_user_created_idx ON public.audit_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS execution_stats_repo_created_idx ON public.execution_stats (repo_id, created_at);
CREATE INDEX IF NOT EXISTS pull_requests_author_idx ON public.pull_requests (author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS repositories_public_updated_idx ON public.repositories (updated_at DESC) WHERE NOT is_private;

-- ============================================================================
-- 7. Foreign-key delete behaviour (deleting an account must not be blocked)
-- ============================================================================
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_id_fkey;
ALTER TABLE public.users ADD CONSTRAINT users_id_fkey
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.repositories DROP CONSTRAINT IF EXISTS repositories_owner_id_fkey;
ALTER TABLE public.repositories ADD CONSTRAINT repositories_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- Authored content in other people's repos survives as "deleted user"
ALTER TABLE public.commits ALTER COLUMN author_id DROP NOT NULL;
ALTER TABLE public.commits DROP CONSTRAINT IF EXISTS commits_author_id_fkey;
ALTER TABLE public.commits ADD CONSTRAINT commits_author_id_fkey
  FOREIGN KEY (author_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.pull_requests ALTER COLUMN author_id DROP NOT NULL;
ALTER TABLE public.pull_requests DROP CONSTRAINT IF EXISTS pull_requests_author_id_fkey;
ALTER TABLE public.pull_requests ADD CONSTRAINT pull_requests_author_id_fkey
  FOREIGN KEY (author_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.pr_comments ALTER COLUMN author_id DROP NOT NULL;
ALTER TABLE public.pr_comments DROP CONSTRAINT IF EXISTS pr_comments_author_id_fkey;
ALTER TABLE public.pr_comments ADD CONSTRAINT pr_comments_author_id_fkey
  FOREIGN KEY (author_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.pr_reviews ALTER COLUMN reviewer_id DROP NOT NULL;
ALTER TABLE public.pr_reviews DROP CONSTRAINT IF EXISTS pr_reviews_reviewer_id_fkey;
ALTER TABLE public.pr_reviews ADD CONSTRAINT pr_reviews_reviewer_id_fkey
  FOREIGN KEY (reviewer_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;

-- ============================================================================
-- 8. Signup trigger: pinned search_path, idempotent
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.users (id, name, email, avatar_url)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.email, NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
