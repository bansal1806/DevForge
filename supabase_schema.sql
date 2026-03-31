-- DevForge Database Schema

-- 1. Users Profile Table (Extensions for Supabase Auth)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID REFERENCES auth.users(id) PRIMARY KEY,
    name TEXT,
    email TEXT UNIQUE,
    avatar_url TEXT,
    bio TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Repositories Table
CREATE TABLE IF NOT EXISTS public.repositories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    owner_id UUID REFERENCES public.users(id) NOT NULL,
    is_private BOOLEAN DEFAULT false NOT NULL,
    default_branch TEXT DEFAULT 'main' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(owner_id, name)
);

-- 3. Files Table (Logical file structure)
CREATE TABLE IF NOT EXISTS public.files (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    repo_id UUID REFERENCES public.repositories(id) ON DELETE CASCADE NOT NULL,
    path TEXT NOT NULL,
    content TEXT,
    last_commit_id UUID, -- Will be referenced later in Phase 4
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(repo_id, path)
);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repositories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

-- 5. Policies for Users
CREATE POLICY "Users can view any profile" ON public.users FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE USING (auth.uid() = id);

-- 6. Policies for Repositories
CREATE POLICY "Anyone can view public repositories" ON public.repositories 
    FOR SELECT USING (is_private = false);
CREATE POLICY "Owners can view private repositories" ON public.repositories 
    FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Owners can insert repositories" ON public.repositories 
    FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners can update repositories" ON public.repositories 
    FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Owners can delete repositories" ON public.repositories 
    FOR DELETE USING (auth.uid() = owner_id);

-- 7. Policies for Files
CREATE POLICY "Anyone can view files of public repos" ON public.files 
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.repositories WHERE id = repo_id AND is_private = false
    ));
CREATE POLICY "Owners can view files of private repos" ON public.files 
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.repositories WHERE id = repo_id AND owner_id = auth.uid()
    ));
CREATE POLICY "Owners can manage files" ON public.files 
    FOR ALL USING (EXISTS (
        SELECT 1 FROM public.repositories WHERE id = repo_id AND owner_id = auth.uid()
    ));

-- 8. Functions & Triggers for Profiles
-- Automatically create a profile when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, name, email, avatar_url)
    VALUES (new.id, new.raw_user_meta_data->>'full_name', new.email, new.raw_user_meta_data->>'avatar_url');
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
