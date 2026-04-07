-- DEVFORGE MIGRATION: Issues Schema (Phase 9)

-- 1. Create Issues Table
CREATE TABLE IF NOT EXISTS public.issues (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    repo_id UUID REFERENCES public.repositories(id) ON DELETE CASCADE NOT NULL,
    author_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create Issue Comments Table
CREATE TABLE IF NOT EXISTS public.issue_comments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    issue_id UUID REFERENCES public.issues(id) ON DELETE CASCADE NOT NULL,
    author_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Enable RLS
ALTER TABLE public.issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issue_comments ENABLE ROW LEVEL SECURITY;

-- 4. Policies for Issues
-- Anyone who can see the repository can see its issues
CREATE POLICY "Issues are visible if repository is visible" ON public.issues 
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.repositories r 
        WHERE r.id = repo_id AND (r.is_private = false OR r.owner_id = auth.uid())
    ));

-- Any authenticated user can create an issue
CREATE POLICY "Authenticated users can create issues" ON public.issues 
    FOR INSERT WITH CHECK (auth.uid() = author_id);

-- Authors and Repo Owners can update issues (e.g. close/reopen or edit)
CREATE POLICY "Users can update their own issues" ON public.issues 
    FOR UPDATE USING (auth.uid() = author_id OR EXISTS (
        SELECT 1 FROM public.repositories r WHERE r.id = repo_id AND r.owner_id = auth.uid()
    ));

-- 5. Policies for Issue Comments
-- Anyone who can see the repository can see its issue comments
CREATE POLICY "Issue comments are visible if repository is visible" ON public.issue_comments 
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.issues i
        JOIN public.repositories r ON i.repo_id = r.id
        WHERE i.id = issue_id AND (r.is_private = false OR r.owner_id = auth.uid())
    ));

-- Any authenticated user can comment on visible issues
CREATE POLICY "Authenticated users can comment on issues" ON public.issue_comments 
    FOR INSERT WITH CHECK (auth.uid() = author_id);

-- Authors can update their own comments
CREATE POLICY "Users can update their own comments" ON public.issue_comments 
    FOR UPDATE USING (auth.uid() = author_id);

-- Authors or repo owners can delete comments
CREATE POLICY "Users can delete comments" ON public.issue_comments
    FOR DELETE USING (auth.uid() = author_id OR EXISTS (
        SELECT 1 FROM public.issues i
        JOIN public.repositories r ON i.repo_id = r.id
        WHERE i.id = issue_id AND r.owner_id = auth.uid()
    ));

-- 6. Indexing for performance
CREATE INDEX IF NOT EXISTS idx_issues_repo_id ON public.issues(repo_id);
CREATE INDEX IF NOT EXISTS idx_issues_author_id ON public.issues(author_id);
CREATE INDEX IF NOT EXISTS idx_issue_comments_issue_id ON public.issue_comments(issue_id);
