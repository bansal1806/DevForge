-- DEVFORGE MIGRATION: Branching & Versioning (v2)

-- 1. Create Branches Table
CREATE TABLE IF NOT EXISTS public.branches (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    repo_id UUID REFERENCES public.repositories(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    is_default BOOLEAN DEFAULT false,
    last_commit_id UUID, -- Updated automatically on commit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(repo_id, name)
);

-- 2. Update Files Table to support branching
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE;

-- 3. Create Commits Table
CREATE TABLE IF NOT EXISTS public.commits (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    repo_id UUID REFERENCES public.repositories(id) ON DELETE CASCADE NOT NULL,
    branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE NOT NULL,
    author_id UUID REFERENCES public.users(id) NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Create File Snapshots Table
CREATE TABLE IF NOT EXISTS public.file_snapshots (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    commit_id UUID REFERENCES public.commits(id) ON DELETE CASCADE NOT NULL,
    repo_id UUID REFERENCES public.repositories(id) ON DELETE CASCADE NOT NULL,
    path TEXT NOT NULL,
    content TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Enable RLS
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_snapshots ENABLE ROW LEVEL SECURITY;

-- 6. Policies for Branches
CREATE POLICY "Anyone can view branches of public repos" ON public.branches 
    FOR SELECT USING (EXISTS (SELECT 1 FROM public.repositories WHERE id = repo_id AND is_private = false));
CREATE POLICY "Owners can manage branches" ON public.branches 
    FOR ALL USING (EXISTS (SELECT 1 FROM public.repositories WHERE id = repo_id AND owner_id = auth.uid()));

-- 7. Policies for Commits
CREATE POLICY "Anyone can view commits of public repos" ON public.commits 
    FOR SELECT USING (EXISTS (SELECT 1 FROM public.repositories WHERE id = repo_id AND is_private = false));
CREATE POLICY "Owners can manage commits" ON public.commits 
    FOR ALL USING (EXISTS (SELECT 1 FROM public.repositories WHERE id = repo_id AND owner_id = auth.uid()));

-- 8. Policies for File Snapshots
CREATE POLICY "Anyone can view snapshots of public repos" ON public.file_snapshots 
    FOR SELECT USING (EXISTS (SELECT 1 FROM public.repositories WHERE id = repo_id AND is_private = false));
CREATE POLICY "Owners can manage snapshots" ON public.file_snapshots 
    FOR ALL USING (EXISTS (SELECT 1 FROM public.repositories WHERE id = repo_id AND owner_id = auth.uid()));

-- 9. Utility: Default Branch initialization (Run manually for existing repos if needed)
-- INSERT INTO public.branches (repo_id, name, is_default)
-- SELECT id, 'main', true FROM public.repositories;
