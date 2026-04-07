-- DEVFORGE MIGRATION: PR Interactions (Phase 6)

-- 1. Create Pull Request Comments Table
CREATE TABLE IF NOT EXISTS public.pr_comments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    pr_id UUID REFERENCES public.pull_requests(id) ON DELETE CASCADE NOT NULL,
    author_id UUID REFERENCES public.users(id) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create Pull Request Reviews Table
CREATE TABLE IF NOT EXISTS public.pr_reviews (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    pr_id UUID REFERENCES public.pull_requests(id) ON DELETE CASCADE NOT NULL,
    reviewer_id UUID REFERENCES public.users(id) NOT NULL,
    status TEXT CHECK (status IN ('approved', 'changes_requested', 'commented')) NOT NULL,
    content TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Enable RLS
ALTER TABLE public.pr_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pr_reviews ENABLE ROW LEVEL SECURITY;

-- 4. Policies for Comments
CREATE POLICY "Anyone can view comments of public repos" ON public.pr_comments 
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.pull_requests pr 
        JOIN public.repositories r ON pr.repo_id = r.id 
        WHERE pr.id = pr_id AND r.is_private = false
    ));

CREATE POLICY "Authenticated users can post comments" ON public.pr_comments 
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 5. Policies for Reviews
CREATE POLICY "Anyone can view reviews of public repos" ON public.pr_reviews 
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.pull_requests pr 
        JOIN public.repositories r ON pr.repo_id = r.id 
        WHERE pr.id = pr_id AND r.is_private = false
    ));

CREATE POLICY "Authenticated users can post reviews" ON public.pr_reviews 
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 6. Indexing
CREATE INDEX IF NOT EXISTS idx_pr_comments_id ON public.pr_comments(pr_id);
CREATE INDEX IF NOT EXISTS idx_pr_reviews_id ON public.pr_reviews(pr_id);
