-- DEVFORGE MIGRATION: Collaborators Schema & RLS Refactoring (Phase 10)

-- 1. Create Collaborators Table
CREATE TABLE IF NOT EXISTS public.repo_collaborators (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    repo_id UUID REFERENCES public.repositories(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    permission TEXT DEFAULT 'write' CHECK (permission IN ('read', 'write', 'admin')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(repo_id, user_id)
);

ALTER TABLE public.repo_collaborators ENABLE ROW LEVEL SECURITY;

-- Collaborators table visibility
CREATE POLICY "Collaborators are visible to repository readers" ON public.repo_collaborators
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.repositories r 
        WHERE r.id = repo_id AND (r.is_private = false OR r.owner_id = auth.uid() OR EXISTS (
            SELECT 1 FROM public.repo_collaborators rc WHERE rc.repo_id = r.id AND rc.user_id = auth.uid()
        ))
    ));

-- Only repo owners can manage collaborators
CREATE POLICY "Only owners can manage collaborators" ON public.repo_collaborators
    FOR ALL USING (EXISTS (
        SELECT 1 FROM public.repositories r WHERE r.id = repo_id AND r.owner_id = auth.uid()
    ));

-- 2. Update Repositories Policies
DROP POLICY IF EXISTS "Repositories are viewable by owner or if public" ON public.repositories;
CREATE POLICY "Repositories are viewable by owner, collaborators, or if public" ON public.repositories
    FOR SELECT USING (
        is_private = false 
        OR owner_id = auth.uid() 
        OR EXISTS (SELECT 1 FROM public.repo_collaborators rc WHERE rc.repo_id = id AND rc.user_id = auth.uid())
    );

-- (Insert, Update, Delete still restricted to owner for now, except maybe Update if we wanted admins)
-- We'll keep Update to owner for simplicity.

-- 3. Update Branches Policies
DROP POLICY IF EXISTS "Branches are visible if repository is visible" ON public.branches;
CREATE POLICY "Branches are visible if repository is visible" ON public.branches
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.repositories r 
        WHERE r.id = repo_id AND (r.is_private = false OR r.owner_id = auth.uid() OR EXISTS (
            SELECT 1 FROM public.repo_collaborators rc WHERE rc.repo_id = r.id AND rc.user_id = auth.uid()
        ))
    ));

DROP POLICY IF EXISTS "Users can create branches in their repositories" ON public.branches;
CREATE POLICY "Users and collaborators can create branches" ON public.branches
    FOR INSERT WITH CHECK (EXISTS (
        SELECT 1 FROM public.repositories r 
        WHERE r.id = repo_id AND (r.owner_id = auth.uid() OR EXISTS (
            SELECT 1 FROM public.repo_collaborators rc WHERE rc.repo_id = r.id AND rc.user_id = auth.uid() AND rc.permission IN ('write', 'admin')
        ))
    ));

DROP POLICY IF EXISTS "Users can update branches in their repositories" ON public.branches;
CREATE POLICY "Users and collaborators can update branches" ON public.branches
    FOR UPDATE USING (EXISTS (
        SELECT 1 FROM public.repositories r 
        WHERE r.id = repo_id AND (r.owner_id = auth.uid() OR EXISTS (
            SELECT 1 FROM public.repo_collaborators rc WHERE rc.repo_id = r.id AND rc.user_id = auth.uid() AND rc.permission IN ('write', 'admin')
        ))
    ));

DROP POLICY IF EXISTS "Users can delete branches in their repositories" ON public.branches;
CREATE POLICY "Users and collaborators can delete branches" ON public.branches
    FOR DELETE USING (EXISTS (
        SELECT 1 FROM public.repositories r 
        WHERE r.id = repo_id AND (r.owner_id = auth.uid() OR EXISTS (
            SELECT 1 FROM public.repo_collaborators rc WHERE rc.repo_id = r.id AND rc.user_id = auth.uid() AND rc.permission IN ('write', 'admin')
        ))
    ));

-- 4. Update Files Policies
DROP POLICY IF EXISTS "Files are visible if repository is visible" ON public.files;
CREATE POLICY "Files are visible if repository is visible" ON public.files
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.repositories r 
        WHERE r.id = repo_id AND (r.is_private = false OR r.owner_id = auth.uid() OR EXISTS (
            SELECT 1 FROM public.repo_collaborators rc WHERE rc.repo_id = r.id AND rc.user_id = auth.uid()
        ))
    ));

DROP POLICY IF EXISTS "Users can manage files in their repositories" ON public.files;
CREATE POLICY "Users and collaborators can manage files" ON public.files
    FOR ALL USING (EXISTS (
        SELECT 1 FROM public.repositories r 
        WHERE r.id = repo_id AND (r.owner_id = auth.uid() OR EXISTS (
            SELECT 1 FROM public.repo_collaborators rc WHERE rc.repo_id = r.id AND rc.user_id = auth.uid() AND rc.permission IN ('write', 'admin')
        ))
    ));

-- 5. Update Pull Requests Policies
DROP POLICY IF EXISTS "Pull Requests are visible if repository is visible" ON public.pull_requests;
CREATE POLICY "Pull Requests are visible if repository is visible" ON public.pull_requests
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.repositories r 
        WHERE r.id = repo_id AND (r.is_private = false OR r.owner_id = auth.uid() OR EXISTS (
            SELECT 1 FROM public.repo_collaborators rc WHERE rc.repo_id = r.id AND rc.user_id = auth.uid()
        ))
    ));

DROP POLICY IF EXISTS "Authenticated users can create PRs in their repositories" ON public.pull_requests;
CREATE POLICY "Collaborators can create PRs" ON public.pull_requests
    FOR INSERT WITH CHECK (EXISTS (
        SELECT 1 FROM public.repositories r 
        WHERE r.id = repo_id AND (r.owner_id = auth.uid() OR EXISTS (
            SELECT 1 FROM public.repo_collaborators rc WHERE rc.repo_id = r.id AND rc.user_id = auth.uid() AND rc.permission IN ('write', 'admin')
        ))
    ));

DROP POLICY IF EXISTS "Users can update PRs in their repositories" ON public.pull_requests;
CREATE POLICY "Collaborators can update PRs" ON public.pull_requests
    FOR UPDATE USING (EXISTS (
        SELECT 1 FROM public.repositories r 
        WHERE r.id = repo_id AND (r.owner_id = auth.uid() OR EXISTS (
            SELECT 1 FROM public.repo_collaborators rc WHERE rc.repo_id = r.id AND rc.user_id = auth.uid() AND rc.permission IN ('write', 'admin')
        ))
    ));

-- PR Comments
DROP POLICY IF EXISTS "PR Comments are visible if repository is visible" ON public.pr_comments;
CREATE POLICY "PR Comments are visible if repository is visible" ON public.pr_comments
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.pull_requests pr
        JOIN public.repositories r ON pr.repo_id = r.id
        WHERE pr.id = pr_id AND (r.is_private = false OR r.owner_id = auth.uid() OR EXISTS (
            SELECT 1 FROM public.repo_collaborators rc WHERE rc.repo_id = r.id AND rc.user_id = auth.uid()
        ))
    ));

-- (Leave Insert/Update/Delete on comments generally up to the author, which is already handled via auth.uid() = author_id)

-- 6. Update Issues Policies
DROP POLICY IF EXISTS "Issues are visible if repository is visible" ON public.issues;
CREATE POLICY "Issues are visible if repository is visible" ON public.issues 
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.repositories r 
        WHERE r.id = repo_id AND (r.is_private = false OR r.owner_id = auth.uid() OR EXISTS (
            SELECT 1 FROM public.repo_collaborators rc WHERE rc.repo_id = r.id AND rc.user_id = auth.uid()
        ))
    ));

DROP POLICY IF EXISTS "Users can update their own issues" ON public.issues;
CREATE POLICY "Users and collaborators can update issues" ON public.issues 
    FOR UPDATE USING (auth.uid() = author_id OR EXISTS (
        SELECT 1 FROM public.repositories r 
        WHERE r.id = repo_id AND (r.owner_id = auth.uid() OR EXISTS (
            SELECT 1 FROM public.repo_collaborators rc WHERE rc.repo_id = r.id AND rc.user_id = auth.uid() AND rc.permission IN ('write', 'admin')
        ))
    ));

DROP POLICY IF EXISTS "Issue comments are visible if repository is visible" ON public.issue_comments;
CREATE POLICY "Issue comments are visible if repository is visible" ON public.issue_comments 
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.issues i
        JOIN public.repositories r ON i.repo_id = r.id
        WHERE i.id = issue_id AND (r.is_private = false OR r.owner_id = auth.uid() OR EXISTS (
            SELECT 1 FROM public.repo_collaborators rc WHERE rc.repo_id = r.id AND rc.user_id = auth.uid()
        ))
    ));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_repo_collaborators_repo_id ON public.repo_collaborators(repo_id);
CREATE INDEX IF NOT EXISTS idx_repo_collaborators_user_id ON public.repo_collaborators(user_id);
