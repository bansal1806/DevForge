import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import Navbar from '@/components/Navbar';
import RepoClient from './RepoClient';

export const metadata = {
  title: 'Repository — DevForge',
};

export default async function RepoPage({ params }: { params: { id: string } }) {
  const { id } = await params;
  const supabase = await createClient();

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();

  // Get repository details
  const { data: repo, error: repoError } = await supabase
    .from('repositories')
    .select('*, owner:users(*)')
    .eq('id', id)
    .single();

  if (repoError || !repo) {
    return notFound();
  }

  // Check visibility/permissions
  if (repo.is_private && (!user || user.id !== repo.owner_id)) {
    return redirect('/login?error=unauthorized');
  }

  // Get initial files (default branch)
  const { data: files } = await supabase
    .from('files')
    .select('*')
    .eq('repo_id', id)
    .order('path', { ascending: true });

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <RepoClient repo={repo} initialFiles={files || []} />
      </main>
    </div>
  );
}
