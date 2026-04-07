-- DEVFORGE MIGRATION: Gists Schema (Phase 7)

-- 1. Create Gists Table
CREATE TABLE IF NOT EXISTS public.gists (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    title TEXT,
    description TEXT,
    is_public BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create Gist Files Table
CREATE TABLE IF NOT EXISTS public.gist_files (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    gist_id UUID REFERENCES public.gists(id) ON DELETE CASCADE NOT NULL,
    filename TEXT NOT NULL,
    content TEXT NOT NULL,
    language TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Enable RLS
ALTER TABLE public.gists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gist_files ENABLE ROW LEVEL SECURITY;

-- 4. Policies for Gists
CREATE POLICY "Public gists are visible to everyone" ON public.gists 
    FOR SELECT USING (is_public = true OR auth.uid() = user_id);

CREATE POLICY "Users can create their own gists" ON public.gists 
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can edit their own gists" ON public.gists 
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own gists" ON public.gists 
    FOR DELETE USING (auth.uid() = user_id);

-- 5. Policies for Gist Files
CREATE POLICY "Files are visible if Gist is visible" ON public.gist_files 
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.gists g 
        WHERE g.id = gist_id AND (g.is_public = true OR g.user_id = auth.uid())
    ));

CREATE POLICY "Users can add files to their gists" ON public.gist_files 
    FOR INSERT WITH CHECK (EXISTS (
        SELECT 1 FROM public.gists g 
        WHERE g.id = gist_id AND g.user_id = auth.uid()
    ));

-- 6. Indexing
CREATE INDEX IF NOT EXISTS idx_gists_user_id ON public.gists(user_id);
CREATE INDEX IF NOT EXISTS idx_gist_files_gist_id ON public.gist_files(gist_id);
