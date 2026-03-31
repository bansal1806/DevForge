'use client';

import { useState } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import {
  Plus,
  Search,
  GitFork,
  Lock,
  Globe,
  Star,
  Clock,
  BookOpen,
  TrendingUp,
  Zap,
  ArrowRight,
  FolderGit2,
} from 'lucide-react';

interface Repository {
  id: string;
  name: string;
  description?: string;
  is_private: boolean;
  created_at: string;
  updated_at: string;
  language?: string;
  stars_count?: number;
}

interface DashboardProps {
  user: {
    id: string;
    email: string;
    name: string;
    avatar_url: string;
  };
  repositories: Repository[];
}

const languageColors: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572A5',
  Rust: '#dea584',
  Go: '#00ADD8',
  Java: '#b07219',
  C: '#555555',
  'C++': '#f34b7d',
  Ruby: '#701516',
  PHP: '#4F5D95',
  Swift: '#F05138',
  Kotlin: '#A97BFF',
};

export default function DashboardClient({ user, repositories }: DashboardProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'public' | 'private'>('all');

  const filteredRepos = repositories.filter((repo) => {
    const matchesSearch = repo.name
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesFilter =
      filter === 'all' ||
      (filter === 'public' && !repo.is_private) ||
      (filter === 'private' && repo.is_private);
    return matchesSearch && matchesFilter;
  });

  const getTimeAgo = (dateStr: string) => {
    const now = new Date();
    const date = new Date(dateStr);
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 30) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          {/* Welcome Header */}
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                Welcome back,{' '}
                <span className="gradient-text">
                  {user.name.split(' ')[0] || 'Developer'}
                </span>
              </h1>
              <p className="mt-1 text-sm text-muted">
                Here&apos;s what&apos;s happening across your repositories
              </p>
            </div>
            <Link
              href="/new"
              className="flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/20 hover:bg-primary-hover transition-colors"
              id="dashboard-new-repo"
            >
              <Plus className="h-4 w-4" />
              New Repository
            </Link>
          </div>

          {/* Stats Cards */}
          <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              {
                icon: FolderGit2,
                label: 'Repositories',
                value: repositories.length,
                color: 'text-primary',
                bg: 'bg-primary/10',
                border: 'border-primary/20',
              },
              {
                icon: Globe,
                label: 'Public',
                value: repositories.filter((r) => !r.is_private).length,
                color: 'text-success',
                bg: 'bg-success/10',
                border: 'border-success/20',
              },
              {
                icon: Lock,
                label: 'Private',
                value: repositories.filter((r) => r.is_private).length,
                color: 'text-warning',
                bg: 'bg-warning/10',
                border: 'border-warning/20',
              },
              {
                icon: TrendingUp,
                label: 'Total Stars',
                value: repositories.reduce(
                  (sum, r) => sum + (r.stars_count || 0),
                  0
                ),
                color: 'text-accent',
                bg: 'bg-accent/10',
                border: 'border-accent/20',
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl bg-surface border border-border p-4 hover:border-border-bright transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-lg ${stat.bg} border ${stat.border}`}
                  >
                    <stat.icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">
                      {stat.value}
                    </p>
                    <p className="text-xs text-muted">{stat.label}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Repository List */}
          <div className="rounded-2xl bg-surface border border-border overflow-hidden">
            {/* Search & Filter Bar */}
            <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background py-2 pl-10 pr-4 text-sm text-foreground placeholder:text-muted/50 focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                  placeholder="Find a repository..."
                  id="dashboard-search"
                />
              </div>
              <div className="flex gap-1 rounded-lg bg-background border border-border p-0.5">
                {(['all', 'public', 'private'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                      filter === f
                        ? 'bg-surface-hover text-foreground'
                        : 'text-muted hover:text-foreground'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {/* Repository Items */}
            {filteredRepos.length > 0 ? (
              <div className="divide-y divide-border">
                {filteredRepos.map((repo) => (
                  <Link
                    key={repo.id}
                    href={`/repo/${repo.id}`}
                    className="flex items-center justify-between px-5 py-4 hover:bg-surface-hover transition-colors group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5">
                        <GitFork className="h-4 w-4 text-muted shrink-0" />
                        <h3 className="text-sm font-semibold text-primary group-hover:text-primary-hover transition-colors truncate">
                          {repo.name}
                        </h3>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium border ${
                            repo.is_private
                              ? 'bg-warning/10 border-warning/20 text-warning'
                              : 'bg-success/10 border-success/20 text-success'
                          }`}
                        >
                          {repo.is_private ? 'Private' : 'Public'}
                        </span>
                      </div>
                      {repo.description && (
                        <p className="mt-1 text-xs text-muted truncate max-w-lg">
                          {repo.description}
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-4">
                        {repo.language && (
                          <span className="flex items-center gap-1.5 text-xs text-muted">
                            <span
                              className="h-2.5 w-2.5 rounded-full bg-[var(--lang-color)]"
                              style={{
                                '--lang-color': languageColors[repo.language] || '#888',
                              } as React.CSSProperties}
                            />
                            {repo.language}
                          </span>
                        )}
                        {(repo.stars_count ?? 0) > 0 && (
                          <span className="flex items-center gap-1 text-xs text-muted">
                            <Star className="h-3 w-3" />
                            {repo.stars_count}
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-xs text-muted">
                          <Clock className="h-3 w-3" />
                          Updated {getTimeAgo(repo.updated_at)}
                        </span>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-4" />
                  </Link>
                ))}
              </div>
            ) : repositories.length === 0 ? (
              /* Empty state — no repos at all */
              <div className="flex flex-col items-center justify-center py-20 px-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 mb-4">
                  <BookOpen className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">
                  No repositories yet
                </h3>
                <p className="mt-2 text-sm text-muted text-center max-w-sm">
                  Create your first repository to start building something
                  awesome with DevForge.
                </p>
                <Link
                  href="/new"
                  className="mt-6 flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/20 hover:bg-primary-hover transition-colors"
                  id="dashboard-empty-cta"
                >
                  <Zap className="h-4 w-4" />
                  Create Repository
                </Link>
              </div>
            ) : (
              /* Empty state — search/filter returned nothing */
              <div className="flex flex-col items-center justify-center py-16 px-4">
                <Search className="h-10 w-10 text-muted/30 mb-3" />
                <p className="text-sm text-muted">
                  No repositories match your search
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
