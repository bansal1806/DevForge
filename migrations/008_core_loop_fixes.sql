-- DEVFORGE MIGRATION 008: Core Loop Fixes (branch-scoped files, stars, user roles)

-- 1. Files must be unique per BRANCH, not per repo.
--    The original UNIQUE(repo_id, path) made it impossible for the same path
--    to exist on two branches, which broke branch copies and PR merges.
ALTER TABLE public.files DROP CONSTRAINT IF EXISTS files_repo_id_path_key;
CREATE UNIQUE INDEX IF NOT EXISTS files_repo_branch_path_key
    ON public.files (repo_id, branch_id, path);

-- 2. Stars
CREATE TABLE IF NOT EXISTS public.stars (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    repo_id UUID REFERENCES public.repositories(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, repo_id)
);

ALTER TABLE public.stars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view stars" ON public.stars
    FOR SELECT USING (true);
CREATE POLICY "Users can star repositories" ON public.stars
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unstar repositories" ON public.stars
    FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS stars_repo_id_idx ON public.stars (repo_id);
CREATE INDEX IF NOT EXISTS stars_user_id_idx ON public.stars (user_id);

-- 3. User roles (admin gate for /api/admin/*)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user' NOT NULL;

-- To promote yourself to admin, run:
-- UPDATE public.users SET role = 'admin' WHERE email = 'you@example.com';
