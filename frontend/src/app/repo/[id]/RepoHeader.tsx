'use client';

import Link from 'next/link';
import { GitFork, Star, Eye, Code, Settings, Info } from 'lucide-react';

interface RepoHeaderProps {
  repo: {
    id: string;
    name: string;
    description?: string;
    is_private: boolean;
    owner: {
      name: string;
      id: string;
    };
    created_at: string;
  };
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

export default function RepoHeader({
  repo,
  activeTab = 'Code',
  onTabChange = () => {},
}: RepoHeaderProps) {
  return (
    <div className="animate-fade-in">
      {/* Breadcrumbs & Status */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-xl font-medium tracking-tight">
          <Link href={`/profile/${repo.owner.id}`} className="text-primary hover:underline">
            {repo.owner.name}
          </Link>
          <span className="text-muted">/</span>
          <h1 className="font-bold text-foreground">{repo.name}</h1>
          <span className={`ml-2 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
            repo.is_private 
              ? 'bg-warning/10 border-warning/20 text-warning' 
              : 'bg-success/10 border-success/20 text-success'
          }`}>
            {repo.is_private ? 'Private' : 'Public'}
          </span>
        </div>

        {/* Action Buttons (Placeholders) */}
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium hover:bg-surface-hover transition-colors">
            <Eye className="h-3.5 w-3.5 text-muted" />
            Watch <span>0</span>
          </button>
          <button className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium hover:bg-surface-hover transition-colors">
            <GitFork className="h-4 w-4 text-muted" />
            Fork <span>0</span>
          </button>
          <button className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium hover:bg-surface-hover transition-colors">
            <Star className="h-3.5 w-3.5 text-muted" />
            Star <span>0</span>
          </button>
        </div>
      </div>

      {repo.description && (
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted">
          {repo.description}
        </p>
      )}

      {/* Tabs / Navigation */}
      <div className="mt-8 flex border-b border-border">
        <div className="flex gap-1 overflow-x-auto">
          {[
            { name: 'Code', icon: Code },
            { name: 'Issues', icon: Info, count: 0 },
            { name: 'Pull requests', icon: GitFork, count: 0 },
            { name: 'History', icon: GitFork }, // Using GitFork temporarily for history
            { name: 'Settings', icon: Settings },
          ].map((tab) => (
            <button
              key={tab.name}
              onClick={() => onTabChange(tab.name)}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === tab.name
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted hover:border-border-bright hover:text-foreground'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.name}
              {tab.count !== undefined && (
                <span className="rounded-full bg-surface-hover px-2 py-0.5 text-[10px] text-muted">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
