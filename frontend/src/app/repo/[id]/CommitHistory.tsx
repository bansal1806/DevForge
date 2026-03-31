'use client';

import { useState, useEffect } from 'react';
import { GitCommit, User, Calendar, ArrowRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface Commit {
  id: string;
  message: string;
  created_at: string;
  author: {
    name: string;
  };
}

interface CommitHistoryProps {
  repoId: string;
  branchId: string | null;
}

export default function CommitHistory({ repoId, branchId }: CommitHistoryProps) {
  const [commits, setCommits] = useState<Commit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCommits() {
      setLoading(true);
      try {
        const url = branchId 
          ? `${process.env.NEXT_PUBLIC_API_URL}/api/repos/${repoId}/commits?branchId=${branchId}`
          : `${process.env.NEXT_PUBLIC_API_URL}/api/repos/${repoId}/commits`;
        const res = await fetch(url);
        const data = await res.json();
        setCommits(data);
      } catch (err) {
        console.error('Failed to fetch commits:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchCommits();
  }, [repoId, branchId]);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-20 animate-pulse rounded-xl border border-border bg-surface/50" />
        ))}
      </div>
    );
  }

  if (commits.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-20 text-center">
        <GitCommit className="mx-auto h-12 w-12 text-muted/20 mb-4" />
        <h3 className="text-sm font-semibold text-foreground">No commits yet</h3>
        <p className="text-xs text-muted mt-1">Changes you commit will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-2">
        <h3 className="text-sm font-bold text-foreground">Commit History</h3>
        <span className="text-[10px] text-muted">{commits.length} commits</span>
      </div>

      <div className="relative space-y-3 before:absolute before:left-6 before:top-4 before:h-[calc(100%-32px)] before:w-px before:bg-border">
        {commits.map((commit) => (
          <div 
            key={commit.id}
            className="group relative flex items-start gap-4 rounded-xl border border-border bg-surface p-4 hover:border-primary/30 hover:bg-primary/5 transition-all cursor-pointer"
          >
            <div className="relative z-10 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-surface border border-border mt-1 group-hover:border-primary group-hover:scale-110 transition-transform">
              <div className="h-1.5 w-1.5 rounded-full bg-muted group-hover:bg-primary" />
            </div>
            
            <div className="flex-1 space-y-1">
              <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                {commit.message}
              </p>
              <div className="flex items-center gap-4 text-[10px] text-muted">
                <div className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  <span>{commit.author.name}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span>{formatDistanceToNow(new Date(commit.created_at), { addSuffix: true })}</span>
                </div>
                <div className="font-mono text-[9px] bg-surface-hover px-1.5 py-0.5 rounded border border-border">
                  {commit.id.substring(0, 7)}
                </div>
              </div>
            </div>

            <ArrowRight className="h-4 w-4 text-muted group-hover:text-primary group-hover:translate-x-1 transition-all opacity-0 group-hover:opacity-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
