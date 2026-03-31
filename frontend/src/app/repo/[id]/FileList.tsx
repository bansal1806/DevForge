'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  FileText,
  Folder,
  ChevronLeft,
  Plus,
  BookOpen,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface RepoFile {
  id: string;
  path: string;
  content: string | null;
  updated_at: string;
}

type FileEntry = 
  | { name: string; isDir: true }
  | { name: string; isDir: false; id: string; updated_at: string };

interface FileListProps {
  repoId: string;
  files: RepoFile[];
}

export default function FileList({ repoId, files }: FileListProps) {
  const [currentDir, setCurrentDir] = useState<string>('');

  // Transform flat files into the current folder view
  const { entries, readme } = useMemo(() => {
    const folders = new Set<string>();
    const currentFiles: RepoFile[] = [];
    let foundReadme: RepoFile | null = null;

    files.forEach((file) => {
      const path = file.path;
      
      // Check if file is in current directory
      if (path.startsWith(currentDir)) {
        const relativePath = path.slice(currentDir.length);
        const parts = relativePath.split('/');

        if (parts.length === 1 && parts[0]) {
          // It's a file in the current dir
          currentFiles.push(file);
          if (parts[0].toLowerCase() === 'readme.md') {
            foundReadme = file;
          }
        } else if (parts.length > 1 && parts[0]) {
          // It's a folder in the current dir
          folders.add(parts[0]);
        }
      }
    });

    return {
      entries: [
        ...Array.from(folders).map((f): FileEntry => ({ name: f, isDir: true })),
        ...currentFiles.map((f): FileEntry => ({ 
          name: f.path.split('/').pop()!, 
          isDir: false, 
          id: f.id,
          updated_at: f.updated_at 
        })),
      ].sort((a, b) => {
        if (a.isDir && !b.isDir) return -1;
        if (!a.isDir && b.isDir) return 1;
        return a.name.localeCompare(b.name);
      }),
      readme: foundReadme,
    };
  }, [files, currentDir]);

  const handleFolderClick = (folder: string) => {
    setCurrentDir((prev) => (prev ? `${prev}${folder}/` : `${folder}/`));
  };

  const handleBack = () => {
    const parts = currentDir.split('/').filter(Boolean);
    parts.pop();
    setCurrentDir(parts.length > 0 ? `${parts.join('/')}/` : '');
  };

  const getTimeAgo = (dateStr: string) => {
    const now = new Date();
    const date = new Date(dateStr);
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'Recent';
    return `${days}d ago`;
  };

  return (
    <div className="space-y-6">
      {/* File Explorer Card */}
      <div className="rounded-2xl bg-surface border border-border overflow-hidden">
        {/* Navigation Bar */}
        <div className="flex items-center justify-between border-b border-border bg-surface-hover/50 px-5 py-3">
          <div className="flex items-center gap-2 overflow-x-auto">
            {currentDir && (
              <button
                onClick={handleBack}
                className="mr-1 rounded-md p-1 hover:bg-surface transition-colors"
                title="Go back"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <button 
                onClick={() => setCurrentDir('')}
                className="text-muted hover:text-foreground transition-colors"
              >
                root
              </button>
              {currentDir.split('/').filter(Boolean).map((part, i, arr) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="text-muted/30">/</span>
                  <button
                    onClick={() => {
                      const newPath = arr.slice(0, i + 1).join('/') + '/';
                      setCurrentDir(newPath);
                    }}
                    className={i === arr.length - 1 ? 'text-foreground' : 'text-muted hover:text-foreground transition-colors'}
                  >
                    {part}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <button className="flex items-center gap-1.5 rounded-lg bg-primary/10 border border-primary/20 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors">
            <Plus className="h-3.5 w-3.5" />
            Add file
          </button>
        </div>

        {/* File List */}
        <div className="divide-y divide-border">
          {entries.length > 0 ? entries.map((entry) => (
            <div
              key={entry.name}
              className="group flex items-center justify-between px-5 py-3.5 hover:bg-surface-hover/30 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                {entry.isDir ? (
                  <Folder className="h-4 w-4 text-primary shrink-0" />
                ) : (
                  <FileText className="h-4 w-4 text-muted shrink-0" />
                )}
                {entry.isDir ? (
                  <button
                    onClick={() => handleFolderClick(entry.name)}
                    className="text-sm font-medium text-foreground hover:text-primary transition-colors truncate"
                  >
                    {entry.name}
                  </button>
                ) : (
                  <Link
                    href={`/repo/${repoId}/${currentDir}${entry.name}`}
                    className="text-sm text-foreground hover:text-primary transition-colors truncate"
                  >
                    {entry.name}
                  </Link>
                )}
              </div>

              <div className="flex items-center gap-6 shrink-0 ml-4">
                <span className="hidden sm:inline text-xs text-muted/60 truncate max-w-[200px]">
                  Initial commit
                </span>
                <span className="text-[10px] text-muted/40 font-mono w-16 text-right">
                  {!entry.isDir ? getTimeAgo(entry.updated_at) : ''}
                </span>
              </div>
            </div>
          )) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Folder className="h-10 w-10 text-muted/10 mb-3" />
              <p className="text-sm text-muted">This directory is empty</p>
            </div>
          )}
        </div>
      </div>

      {/* README Preview */}
      {readme && (
        <div className="rounded-2xl bg-surface border border-border overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border bg-surface-hover/30 px-5 py-3">
            <BookOpen className="h-4 w-4 text-muted" />
            <span className="text-sm font-semibold text-foreground">README.md</span>
          </div>
          <div className="p-8 prose prose-invert max-w-none prose-pre:bg-background prose-pre:border prose-pre:border-border">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {(readme as RepoFile).content || ''}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}
