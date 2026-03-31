'use client';

import { useState, useEffect } from 'react';
import { GitBranch, Check, Plus, ChevronDown } from 'lucide-react';

interface Branch {
  id: string;
  name: string;
  is_default: boolean;
}

interface BranchSelectorProps {
  repoId: string;
  activeBranchId: string | null;
  onSelect: (branch: Branch) => void;
}

export default function BranchSelector({ repoId, activeBranchId, onSelect }: BranchSelectorProps) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchBranches() {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/repos/${repoId}/branches`);
        const data = await res.json();
        setBranches(data);
        if (!activeBranchId && data.length > 0 && onSelect) {
          const defaultBranch = data.find((b: Branch) => b.is_default) || data[0];
          onSelect(defaultBranch);
        }
      } catch (err) {
        console.error('Failed to fetch branches:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchBranches();
  }, [repoId, activeBranchId, onSelect]);

  if (loading) return (
    <div className="h-8 w-32 animate-pulse rounded-lg bg-surface-hover" />
  );

  const activeBranch = branches.find(b => b.id === activeBranchId) || branches[0];

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium hover:bg-surface-hover transition-colors min-w-[120px] justify-between"
      >
        <div className="flex items-center gap-2">
          <GitBranch className="h-3.5 w-3.5 text-muted" />
          <span>{activeBranch?.name || 'Loading...'}</span>
        </div>
        <ChevronDown className={`h-3 w-3 text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setIsOpen(false)} 
          />
          <div className="absolute left-0 top-full z-20 mt-2 w-64 rounded-xl border border-border bg-surface p-1 shadow-xl animate-in fade-in zoom-in-95 duration-200">
            <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted/50">
              Switch branches
            </div>
            <div className="max-h-60 overflow-y-auto">
              {branches.map((branch) => (
                <button
                  key={branch.id}
                  onClick={() => {
                    onSelect(branch);
                    setIsOpen(false);
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs hover:bg-primary/10 hover:text-primary transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <GitBranch className="h-3.5 w-3.5" />
                    <span className={branch.id === activeBranchId ? 'font-bold' : ''}>
                      {branch.name}
                    </span>
                  </div>
                  {branch.id === activeBranchId && (
                    <Check className="h-3 w-3" />
                  )}
                </button>
              ))}
            </div>
            <div className="border-t border-border mt-1">
              <button
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-muted hover:text-foreground transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Create new branch</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
