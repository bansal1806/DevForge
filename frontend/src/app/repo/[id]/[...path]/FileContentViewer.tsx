'use client';

import { 
  FileCode, 
  Copy, 
  Trash2, 
  Pencil, 
  Check, 
  Download,
  Info,
  Terminal,
  GitFork,
} from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import Editor, { DiffEditor, OnMount } from '@monaco-editor/react';
import { useSocket } from '@/hooks/useSocket';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface FileContentViewerProps {
  file: {
    id: string;
    path: string;
    content: string | null;
    updated_at: string;
  };
}

export default function FileContentViewer({ file }: FileContentViewerProps) {
  const params = useParams();
  const repoId = params.id as string;
  const path = (params.path as string[]).join('/');
  const roomId = `repo:${repoId}:file:${path}`;

  const [isEditing, setIsEditing] = useState(false);
  const [isDiffing, setIsDiffing] = useState(false);
  const [content, setContent] = useState(file.content || '');
  const [baselineContent, setBaselineContent] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const { isConnected, emitEvent, onEvent } = useSocket(roomId);

  const lines = content.split('\n');
  const size = new TextEncoder().encode(content).length;
  const fileName = file.path.split('/').pop();

  // Language detection
  const getLanguage = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    const map: Record<string, string> = {
      js: 'javascript', ts: 'typescript', tsx: 'typescript',
      py: 'python', md: 'markdown', html: 'html', css: 'css',
      json: 'json', go: 'go', rs: 'rust', cpp: 'cpp',
    };
    return map[ext!] || 'plaintext';
  };

  // Real-time synchronization
  useEffect(() => {
    const cleanup = onEvent('file-sync', (newContent: string) => {
      if (!isEditing) {
        setContent(newContent);
      }
    });
    return cleanup;
  }, [onEvent, isEditing]);

  // Fetch baseline for diffing
  useEffect(() => {
    if (isDiffing && baselineContent === null) {
      // Fetch latest commit snapshot for this file
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/repos/${repoId}/commits`)
        .then(res => res.json())
        .then(commits => {
          if (commits.length > 0) {
            const lastCommitId = commits[0].id;
            return fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/repos/${repoId}/commits/${lastCommitId}/files?path=${path}`);
          }
          return null;
        })
        .then(res => res ? res.json() : null)
        .then(data => {
          setBaselineContent(data?.[0]?.content || '');
        })
        .catch(err => console.error('Failed to fetch diff baseline:', err));
    }
  }, [isDiffing, repoId, path, baselineContent]);

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      setContent(value);
      emitEvent('file-change', { content: value });
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/repos/${repoId}/files`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({ path, content }),
      });

      if (!response.ok) throw new Error('Failed to save');
      setIsEditing(false);
    } catch (err) {
      console.error(err);
      alert('Failed to save changes. Make sure you are logged in and own this repo.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  return (
    <div className="animate-fade-in group space-y-4">
      {/* File Header Info */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl glass border border-border px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface border border-border">
            <FileCode className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">{fileName}</h3>
            <p className="text-[10px] text-muted flex items-center gap-2">
              <span>{lines.length} lines</span>
              <span className="h-1 w-1 rounded-full bg-border" />
              <span>{formatSize(size)}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border bg-surface p-1">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[10px] font-medium text-muted hover:text-foreground hover:bg-surface-hover transition-colors"
              title="Copy content"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 text-success" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  <span>Copy</span>
                </>
              )}
            </button>
            <div className="mx-1 w-px bg-border my-1" />
            <button
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[10px] font-medium text-muted hover:text-foreground hover:bg-surface-hover transition-colors"
              title="Download file"
            >
              <Download className="h-3 w-3" />
            </button>
          </div>

          <div className="flex rounded-lg border border-border bg-surface p-1">
            <button
              onClick={() => setIsEditing(!isEditing)}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[10px] font-medium transition-colors ${
                isEditing ? 'bg-primary text-white' : 'text-primary hover:bg-primary/10'
              }`}
              title="Edit file"
            >
              <Pencil className="h-3 w-3" />
              <span>{isEditing ? 'Editing' : 'Edit'}</span>
            </button>
            {isEditing && (
              <>
                <div className="mx-1 w-px bg-border my-1" />
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[10px] font-medium text-success hover:bg-success/10 transition-colors disabled:opacity-50"
                  title="Save changes"
                >
                  <Check className="h-3 w-3" />
                  <span>{isSaving ? 'Saving...' : 'Save'}</span>
                </button>
              </>
            )}
            <div className="mx-1 w-px bg-border my-1" />
            <button
              onClick={() => {
                setIsDiffing(!isDiffing);
                setIsEditing(false);
              }}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[10px] font-medium transition-colors ${
                isDiffing ? 'bg-primary text-white' : 'text-primary hover:bg-primary/10'
              }`}
              title="Compare with last commit"
            >
              <GitFork className="h-3 w-3" />
              <span>{isDiffing ? 'Diffing' : 'Diff'}</span>
            </button>
            <div className="mx-1 w-px bg-border my-1" />
            <button
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[10px] font-medium text-danger hover:bg-danger/10 transition-colors"
              title="Delete file"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Connection Indicator */}
      {isConnected && (
        <div className="flex items-center gap-2 px-1">
          <div className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
          <span className="text-[10px] text-muted font-medium">Live Sync Active</span>
        </div>
      )}

      {/* Editor / Content */}
      <div className="relative rounded-2xl border border-border bg-black/40 overflow-hidden min-h-[500px]">
        {isEditing ? (
          <Editor
            height="500px"
            theme="vs-dark"
            language={getLanguage(fileName || '')}
            value={content}
            onChange={handleEditorChange}
            onMount={(editor) => {
              editorRef.current = editor;
              editor.focus();
            }}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              fontFamily: 'var(--font-mono)',
              lineNumbers: 'on',
              roundedSelection: false,
              scrollBeyondLastLine: false,
              readOnly: false,
              automaticLayout: true,
              padding: { top: 16, bottom: 16 },
            }}
          />
        ) : isDiffing ? (
          <DiffEditor
            height="500px"
            theme="vs-dark"
            language={getLanguage(fileName || '')}
            original={baselineContent || ''}
            modified={content}
            options={{
              renderSideBySide: true,
              minimap: { enabled: false },
              fontSize: 12,
              readOnly: true,
              automaticLayout: true,
            }}
          />
        ) : (
          <div className="flex">
            {/* Gutter / Line Numbers */}
            <div className="w-12 shrink-0 select-none border-r border-border bg-surface/30 px-2 py-4 text-right font-mono text-xs text-muted/30">
              {lines.map((_, i) => (
                <div key={i} className="leading-6">
                  {i + 1}
                </div>
              ))}
            </div>
            
            {/* Main content */}
            <div className="flex-1 overflow-x-auto overflow-y-hidden p-4 font-mono text-xs leading-6 text-foreground/90 selection:bg-primary/30">
              <pre className="whitespace-pre">
                <code>{content}</code>
              </pre>
            </div>
          </div>
        )}

        {/* Empty state protection */}
        {!isEditing && content.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Info className="h-8 w-8 text-muted/20 mb-2" />
            <p className="text-xs text-muted">This file is empty</p>
          </div>
        )}
      </div>

      {/* Tips / Info */}
      <div className="rounded-xl border border-primary/10 bg-primary/5 px-4 py-3 flex gap-3">
        <Terminal className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <p className="text-[10px] text-muted italic leading-relaxed">
          TIP: Use the &quot;Diff&quot; mode to compare your current changes with the latest committed version. Multi-branch support is now active.
        </p>
      </div>
    </div>
  );
}
