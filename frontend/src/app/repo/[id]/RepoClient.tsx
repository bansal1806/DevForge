'use client';

import { useState, useEffect } from 'react';
import RepoHeader from './RepoHeader';
import FileList from './FileList';
import BranchSelector from './BranchSelector';
import CommitHistory from './CommitHistory';
import { useParams } from 'next/navigation';

interface RepoClientProps {
  repo: {
    id: string;
    name: string;
    owner: { name: string; id: string };
    is_private: boolean;
    description?: string;
    created_at: string;
  };
  initialFiles: {
    id: string;
    path: string;
    content: string | null;
    updated_at: string;
  }[];
}

export default function RepoClient({ repo, initialFiles }: RepoClientProps) {
  const params = useParams();
  const repoId = params.id as string;
  
  const [activeBranch, setActiveBranch] = useState<{ id: string; name: string } | null>(null);
  const [files, setFiles] = useState(initialFiles);
  const [activeTab, setActiveTab] = useState('Code');
  const [loadingFiles, setLoadingFiles] = useState(false);

  // Fetch files when branch changes
  useEffect(() => {
    if (activeBranch) {
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/repos/${repoId}/files?branchId=${activeBranch.id}`)
        .then(res => res.json())
        .then(data => {
          setFiles(data);
          setLoadingFiles(false);
        })
        .catch(err => {
          console.error(err);
          setLoadingFiles(false);
        });
    }
  }, [activeBranch, repoId]);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-col gap-6">
        <RepoHeader 
          repo={repo} 
          activeTab={activeTab} 
          onTabChange={setActiveTab} 
        />
        
        <div className="flex items-center gap-4">
          <BranchSelector 
            repoId={repoId} 
            activeBranchId={activeBranch?.id || null} 
            onSelect={setActiveBranch} 
          />
          {/* Tag selector or other metadata could go here */}
        </div>

        <div className="mt-4">
          {activeTab === 'Code' ? (
            <div className={loadingFiles ? 'opacity-50 transition-opacity' : 'transition-opacity'}>
              <FileList repoId={repoId} files={files} />
            </div>
          ) : activeTab === 'History' ? (
            <CommitHistory repoId={repoId} branchId={activeBranch?.id || null} />
          ) : (
            <div className="rounded-xl border border-border bg-surface p-20 text-center text-muted italic">
              {activeTab} view coming soon in Phase 4 execution...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
