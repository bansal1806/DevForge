import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Navbar from '@/components/Navbar';
import RepoHeader from '../RepoHeader';
import FileContentViewer from './FileContentViewer';
// Note: Relative import should work in App Router, but using absolute if lint persists.
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export async function generateMetadata({ params }: { params: { id: string; path: string[] } }) {
  const { path } = await params;
  return {
    title: `${path[path.length - 1]} — DevForge`,
  };
}

export default async function FilePage({
  params,
}: {
  params: { id: string; path: string[] };
}) {
  const { id, path } = await params;
  const fullPath = path.join('/');
  const supabase = await createClient();

  // Get repo details
  const { data: repo } = await supabase
    .from('repositories')
    .select('*, owner:users(*)')
    .eq('id', id)
    .single();

  if (!repo) return notFound();

  // Get file content
  const { data: file } = await supabase
    .from('files')
    .select('*')
    .eq('repo_id', id)
    .eq('path', fullPath)
    .single();

  if (!file) return notFound();

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <RepoHeader repo={repo} />
          
          {/* File Breadcrumbs */}
          <div className="mt-6 flex items-center gap-2 text-sm text-muted">
            <Link href={`/repo/${id}`} className="hover:text-primary transition-colors">
              {repo.name}
            </Link>
            {path.map((part, i) => (
              <div key={i} className="flex items-center gap-2">
                <ChevronRight className="h-3 w-3" />
                <span className={i === path.length - 1 ? 'text-foreground font-medium' : ''}>
                  {part}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-4">
            <FileContentViewer file={file} />
          </div>
        </div>
      </main>
    </div>
  );
}
