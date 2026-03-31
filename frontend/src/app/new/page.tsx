'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { createClient } from '@/lib/supabase/client';
import {
  FolderGit2,
  Lock,
  Globe,
  Loader2,
  ArrowRight,
  Info,
} from 'lucide-react';

export default function NewRepoPage() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [initReadme, setInitReadme] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const supabase = createClient();

  const slugifiedName = name
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!slugifiedName) {
      setError('Please enter a valid repository name');
      return;
    }

    setLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError('You must be signed in');
        setLoading(false);
        return;
      }

      // Check for duplicate name
      const { data: existing } = await supabase
        .from('repositories')
        .select('id')
        .eq('owner_id', user.id)
        .eq('name', slugifiedName)
        .single();

      if (existing) {
        setError(`You already have a repository named "${slugifiedName}"`);
        setLoading(false);
        return;
      }

      // Create the repository
      const { data: repo, error: createError } = await supabase
        .from('repositories')
        .insert({
          name: slugifiedName,
          description: description.trim() || null,
          owner_id: user.id,
          is_private: isPrivate,
          default_branch: 'main',
        })
        .select()
        .single();

      if (createError) {
        setError(createError.message);
        setLoading(false);
        return;
      }

      // Optionally create a README
      if (initReadme && repo) {
        await supabase.from('files').insert({
          repo_id: repo.id,
          path: 'README.md',
          content: `# ${name}\n\n${description || 'A new DevForge repository.'}\n`,
          last_commit_id: null,
        });
      }

      router.push(`/repo/${repo.id}`);
    } catch {
      setError('An unexpected error occurred');
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-foreground">
              Create a new repository
            </h1>
            <p className="mt-2 text-sm text-muted">
              A repository contains all project files, including the revision history.
            </p>
          </div>

          <div className="rounded-2xl bg-surface border border-border p-6 sm:p-8 animate-fade-in">
            {error && (
              <div className="mb-6 rounded-lg bg-danger/10 border border-danger/20 px-4 py-3 text-sm text-danger animate-fade-in">
                {error}
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-6">
              {/* Repo Name */}
              <div>
                <label
                  htmlFor="repo-name"
                  className="mb-1.5 block text-sm font-medium text-foreground"
                >
                  Repository name <span className="text-danger">*</span>
                </label>
                <input
                  id="repo-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background py-2.5 px-4 text-sm text-foreground placeholder:text-muted/50 focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors font-mono"
                  placeholder="my-awesome-project"
                  required
                  autoFocus
                />
                {name && slugifiedName !== name.toLowerCase() && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
                    <Info className="h-3 w-3" />
                    Will be created as{' '}
                    <code className="rounded bg-background px-1.5 py-0.5 font-mono text-primary">
                      {slugifiedName}
                    </code>
                  </p>
                )}
              </div>

              {/* Description */}
              <div>
                <label
                  htmlFor="repo-desc"
                  className="mb-1.5 block text-sm font-medium text-foreground"
                >
                  Description{' '}
                  <span className="text-muted font-normal">(optional)</span>
                </label>
                <input
                  id="repo-desc"
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background py-2.5 px-4 text-sm text-foreground placeholder:text-muted/50 focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                  placeholder="A short description of your repository"
                />
              </div>

              {/* Visibility */}
              <div>
                <p className="mb-3 text-sm font-medium text-foreground">
                  Visibility
                </p>
                <div className="space-y-2">
                  <label
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
                      !isPrivate
                        ? 'border-primary/30 bg-primary/5'
                        : 'border-border hover:border-border-bright'
                    }`}
                  >
                    <input
                      type="radio"
                      name="visibility"
                      checked={!isPrivate}
                      onChange={() => setIsPrivate(false)}
                      className="mt-0.5 accent-primary"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-success" />
                        <span className="text-sm font-medium text-foreground">
                          Public
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted">
                        Anyone can see this repository. You choose who can commit.
                      </p>
                    </div>
                  </label>

                  <label
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
                      isPrivate
                        ? 'border-primary/30 bg-primary/5'
                        : 'border-border hover:border-border-bright'
                    }`}
                  >
                    <input
                      type="radio"
                      name="visibility"
                      checked={isPrivate}
                      onChange={() => setIsPrivate(true)}
                      className="mt-0.5 accent-primary"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Lock className="h-4 w-4 text-warning" />
                        <span className="text-sm font-medium text-foreground">
                          Private
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted">
                        Only you and people you invite can see and commit.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Init with README */}
              <div className="border-t border-border pt-6">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={initReadme}
                    onChange={(e) => setInitReadme(e.target.checked)}
                    className="mt-0.5 accent-primary rounded"
                  />
                  <div>
                    <span className="text-sm font-medium text-foreground">
                      Initialize with a README
                    </span>
                    <p className="mt-0.5 text-xs text-muted">
                      This will create a README.md file so you can start editing
                      right away.
                    </p>
                  </div>
                </label>
              </div>

              {/* Submit */}
              <div className="flex items-center justify-end gap-3 border-t border-border pt-6">
                <Link
                  href="/dashboard"
                  className="rounded-xl px-5 py-2.5 text-sm font-medium text-muted hover:text-foreground transition-colors"
                >
                  Cancel
                </Link>
                <button
                  type="submit"
                  disabled={loading || !name.trim()}
                  className="flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/20 hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  id="create-repo-submit"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <FolderGit2 className="h-4 w-4" />
                      Create Repository
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
