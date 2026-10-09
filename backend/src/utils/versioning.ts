import { supabaseAdmin } from '../lib/supabase';
import { isUuid } from '../lib/validation';

/**
 * Shared versioning helpers. Supabase SQL is the source of truth for file
 * content, branches, commits, and snapshots. Commit and merge are atomic SQL
 * functions (migration 009). A best-effort git mirror runs on long-running
 * hosts — see routes/repos.ts.
 */

export async function getDefaultBranch(repoId: string) {
  const { data } = await supabaseAdmin
    .from('branches')
    .select('*')
    .eq('repo_id', repoId)
    .eq('is_default', true)
    .maybeSingle();
  return data;
}

export async function getBranchById(repoId: string, branchId: string) {
  if (!isUuid(branchId)) return null;
  const { data } = await supabaseAdmin
    .from('branches')
    .select('*')
    .eq('id', branchId)
    .eq('repo_id', repoId)
    .maybeSingle();
  return data;
}

/** Resolves an optional branchId to a branch of the repo (default branch when omitted). */
export async function resolveBranch(repoId: string, branchId?: unknown) {
  if (branchId === undefined || branchId === null || branchId === '') return getDefaultBranch(repoId);
  if (!isUuid(branchId)) return null;
  return getBranchById(repoId, branchId);
}

/**
 * Records a commit of the branch's working files, snapshots them (PR diffs
 * read these snapshots) and advances the branch pointer — atomically.
 */
export async function createCommitWithSnapshots(
  repoId: string,
  branchId: string,
  authorId: string,
  message: string
) {
  const { data, error } = await supabaseAdmin.rpc('create_commit', {
    p_repo: repoId,
    p_branch: branchId,
    p_author: authorId,
    p_message: message,
  });

  if (error || !data) {
    throw new Error(`Failed to record commit: ${error?.message || 'unknown error'}`);
  }
  return data as { id: string; repo_id: string; branch_id: string; message: string; created_at: string };
}

export async function getMergeBase(a: string | null, b: string | null): Promise<string | null> {
  if (!a || !b) return null;
  const { data, error } = await supabaseAdmin.rpc('merge_base', { p_a: a, p_b: b });
  if (error) throw new Error(`Failed to compute merge base: ${error.message}`);
  return (data as string | null) || null;
}

export interface DiffEntry {
  status: 'added' | 'modified' | 'deleted';
  content: string | null;
  originalContent: string | null;
}

/**
 * Path-keyed diff from `baseCommitId`'s tree to `headCommitId`'s tree.
 * Computed in SQL (migration 010): unchanged files are skipped by comparing
 * content hashes, so only changed files are ever loaded.
 */
export async function buildCommitDiff(
  headCommitId: string | null,
  baseCommitId: string | null
): Promise<Record<string, DiffEntry>> {
  if (!headCommitId && !baseCommitId) return {};

  const { data, error } = await supabaseAdmin.rpc('diff_commits', {
    p_head: headCommitId,
    p_base: baseCommitId,
  });
  if (error) throw new Error(`Failed to diff commits: ${error.message}`);

  const diffMap: Record<string, DiffEntry> = {};
  for (const row of (data || []) as { path: string; status: DiffEntry['status']; content: string | null; original_content: string | null }[]) {
    diffMap[row.path] = { status: row.status, content: row.content, originalContent: row.original_content };
  }
  return diffMap;
}

/**
 * The changes a pull request introduces: source head vs. the merge base of
 * source and target (what GitHub shows), falling back to the target head for
 * histories without a common ancestor.
 */
export async function buildPullRequestDiff(sourceHead: string | null, targetHead: string | null) {
  const base = await getMergeBase(sourceHead, targetHead);
  return buildCommitDiff(sourceHead, base ?? targetHead);
}

export interface MergePreview {
  mergeable: boolean;
  conflicts: string[];
  /** Number of files the merge would change on the target */
  changes: number;
}

/**
 * Dry-runs the three-way merge without changing anything. Returns null when a
 * preview isn't meaningful (PR not open, source branch has no commits).
 */
export async function previewMerge(prId: string, userId: string): Promise<MergePreview | null> {
  const { data, error } = await supabaseAdmin.rpc('merge_pull_request', { p_pr: prId, p_user: userId, p_dry_run: true });
  if (error) return null;
  return data as MergePreview;
}

/**
 * Rejects paths that could escape the repo directory when mirrored to disk,
 * or that contain control characters.
 */
export function isSafeRepoPath(filePath: unknown): filePath is string {
  if (!filePath || typeof filePath !== 'string') return false;
  if (filePath.length > 512) return false;
  if (/[\x00-\x1f\x7f]/.test(filePath)) return false;
  if (filePath.startsWith('/') || filePath.startsWith('\\')) return false;
  if (/^[a-zA-Z]:/.test(filePath)) return false;
  const segments = filePath.split(/[\\/]/);
  return segments.every((s) => s !== '' && s !== '.' && s !== '..' && s.trim() === s);
}
