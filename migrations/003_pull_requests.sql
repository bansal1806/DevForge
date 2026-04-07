-- DEVFORGE MIGRATION: Pull Requests (Phase 5)

-- 1. Create Pull Requests Table
CREATE TABLE IF NOT EXISTS public.pull_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    repo_id UUID REFERENCES public.repositories(id) ON DELETE CASCADE NOT NULL,
    author_id UUID REFERENCES public.users(id) NOT NULL,
    source_branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE NOT NULL,
    target_branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'merged', 'closed')) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    merged_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Enable RLS
ALTER TABLE public.pull_requests ENABLE ROW LEVEL SECURITY;

-- 3. Policies
CREATE POLICY "Anyone can view PRs of public repos" ON public.pull_requests 
    FOR SELECT USING (EXISTS (SELECT 1 FROM public.repositories WHERE id = repo_id AND is_private = false));

CREATE POLICY "Owners can view PRs of private repos" ON public.pull_requests 
    FOR SELECT USING (EXISTS (SELECT 1 FROM public.repositories WHERE id = repo_id AND owner_id = auth.uid()));

CREATE POLICY "Authenticated users can create PRs" ON public.pull_requests 
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Owners or Authors can update PRs" ON public.pull_requests 
    FOR UPDATE USING (
        auth.uid() = author_id OR 
        EXISTS (SELECT 1 FROM public.repositories WHERE id = repo_id AND owner_id = auth.uid())
    );

-- 4. Indexing for performance
CREATE INDEX IF NOT EXISTS idx_pr_repo ON public.pull_requests(repo_id);
CREATE INDEX IF NOT EXISTS idx_pr_status ON public.pull_requests(status);
