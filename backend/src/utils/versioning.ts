import { supabaseAdmin } from '../index';

/**
 * Shared versioning helpers. Supabase SQL is the source of truth for file
 * content, branches, commits, and snapshots. (A best-effort git mirror runs
 * on long-running hosts — see routes/repos.ts.)
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
  const { data } = await supabaseAdmin
    .from('branches')
    .select('*')
    .eq('id', branchId)
    .eq('repo_id', repoId)
    .maybeSingle();
  return data;
}

/**
 * Records a commit for a branch, snapshots every file on that branch, and
 * advances the branch pointer. Snapshots are what PR diffs are computed from.
 */
export async function createCommitWithSnapshots(
  repoId: string,
  branchId: string,
  authorId: string,
  message: string
) {
  const { data: commit, error } = await supabaseAdmin
    .from('commits')
    .insert({ repo_id: repoId, branch_id: branchId, author_id: authorId, message })
    .select()
    .single();

  if (error || !commit) {
    throw new Error(`Failed to record commit: ${error?.message || 'unknown error'}`);
  }

  const { data: branchFiles, error: filesError } = await supabaseAdmin
    .from('files')
    .select('path, content')
    .eq('repo_id', repoId)
    .eq('branch_id', branchId);

  if (filesError) {
    throw new Error(`Failed to read branch files for snapshot: ${filesError.message}`);
  }

  if (branchFiles && branchFiles.length > 0) {
    const snapshots = branchFiles.map((f) => ({
      commit_id: commit.id,
      repo_id: repoId,
      path: f.path,
      content: f.content,
    }));
    const { error: snapError } = await supabaseAdmin.from('file_snapshots').insert(snapshots);
    if (snapError) {
      throw new Error(`Failed to snapshot files: ${snapError.message}`);
    }
  }

  await supabaseAdmin.from('branches').update({ last_commit_id: commit.id }).eq('id', branchId);

  return commit;
}

export interface DiffEntry {
  status: 'added' | 'modified' | 'deleted';
  content: string | null;
  originalContent: string | null;
}

/**
 * Computes a path-keyed diff between the snapshot sets of two commits.
 */
export async function buildCommitDiff(
  sourceCommitId: string | null,
  targetCommitId: string | null
): Promise<Record<string, DiffEntry>> {
  const [sourceSnapshots, targetSnapshots] = await Promise.all([
    sourceCommitId
      ? supabaseAdmin.from('file_snapshots').select('*').eq('commit_id', sourceCommitId)
      : Promise.resolve({ data: [] as any[] }),
    targetCommitId
      ? supabaseAdmin.from('file_snapshots').select('*').eq('commit_id', targetCommitId)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const sourceFiles = sourceSnapshots.data || [];
  const targetFiles = targetSnapshots.data || [];
  const diffMap: Record<string, DiffEntry> = {};

  sourceFiles.forEach((sf: any) => {
    const tf = targetFiles.find((t: any) => t.path === sf.path);
    if (!tf) diffMap[sf.path] = { status: 'added', content: sf.content, originalContent: null };
    else if (tf.content !== sf.content)
      diffMap[sf.path] = { status: 'modified', content: sf.content, originalContent: tf.content };
  });

  targetFiles.forEach((tf: any) => {
    const sf = sourceFiles.find((s: any) => s.path === tf.path);
    if (!sf) diffMap[tf.path] = { status: 'deleted', content: null, originalContent: tf.content };
  });

  return diffMap;
}

/**
 * Rejects paths that could escape the repo directory when mirrored to disk.
 */
export function isSafeRepoPath(filePath: string): boolean {
  if (!filePath || typeof filePath !== 'string') return false;
  if (filePath.length > 512) return false;
  if (filePath.startsWith('/') || filePath.startsWith('\\')) return false;
  if (/^[a-zA-Z]:/.test(filePath)) return false;
  const segments = filePath.split(/[\\/]/);
  return segments.every((s) => s !== '' && s !== '.' && s !== '..');
}
