import axios from 'axios'
import apiClient from './apiClient'
export { apiClient }

/** Best user-facing message for a failed API call. */
export function getErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: unknown } | undefined
    if (typeof data?.error === 'string') return data.error
  }
  if (err instanceof Error && err.message) return err.message
  return fallback
}

/** Conflicting paths returned by a 409 merge response, if any. */
export function getMergeConflicts(err: unknown): string[] {
  if (axios.isAxiosError(err) && err.response?.status === 409) {
    const conflicts = (err.response.data as { conflicts?: unknown })?.conflicts
    if (Array.isArray(conflicts)) return conflicts.filter((c): c is string => typeof c === 'string')
  }
  return []
}

export type RepoPermission = 'read' | 'write' | 'admin'

export interface PublicUser {
  id: string
  name: string | null
  avatar_url: string | null
}

export interface Repository {
  id: string
  name: string
  description: string | null
  is_private: boolean
  default_branch: string
  owner_id: string
  created_at: string
  updated_at: string
  // Metadata (optional or joined)
  stars_count?: number
  starred_by_me?: boolean
  /** Caller's effective permission (null when anonymous or no access) */
  permission?: RepoPermission | null
  forks_count?: number
  language?: string
  owner?: PublicUser | null
}

export interface Branch {
  id: string
  repo_id: string
  name: string
  is_default: boolean
  last_commit_id: string | null
  created_at: string
}

export interface FileNode {
  id: string
  repo_id: string
  branch_id: string
  path: string
  content: string | null
  updated_at: string
}

export interface PullRequest {
  id: string
  repo_id: string
  author_id: string | null
  source_branch_id: string
  target_branch_id: string
  title: string
  description: string | null
  status: 'open' | 'closed' | 'merged'
  created_at: string
  updated_at: string
  merged_at: string | null
  author?: PublicUser | null
  source?: { id: string, name: string, last_commit_id?: string | null } | null
  target?: { id: string, name: string, last_commit_id?: string | null } | null
  repo?: {
    id: string
    name: string
  }
}

export interface DiffEntry {
  status: 'added' | 'modified' | 'deleted'
  content: string | null
  originalContent: string | null
}

export type DiffMap = Record<string, DiffEntry>

export interface MergePreview {
  mergeable: boolean
  conflicts: string[]
  /** Files the merge would change on the target branch */
  changes: number
}

export interface PullRequestDetail {
  pr: PullRequest
  diff: DiffMap
  /** Dry-run of the merge; null when not applicable (closed, no commits) */
  mergePreview: MergePreview | null
  permissions: { canMerge: boolean, canClose: boolean }
}

export type ReviewStatus = 'approved' | 'changes_requested' | 'commented'

export interface DiscussionItem {
  id: string
  type: 'comment' | 'review'
  content: string | null
  status?: ReviewStatus
  created_at: string
  author?: PublicUser | null
}

export interface Issue {
  id: string
  repo_id: string
  author_id: string
  title: string
  description: string | null
  status: 'open' | 'closed'
  created_at: string
  updated_at: string
  author?: PublicUser | null
  repo?: {
    id: string
    name: string
  }
  permissions?: { canEdit: boolean }
}

export interface Gist {
  id: string
  user_id: string
  title: string | null
  description: string | null
  is_public: boolean
  created_at: string
  user?: PublicUser | null
  files?: GistFile[]
}

export interface GistFile {
  id: string
  gist_id: string
  filename: string
  content: string
  language: string | null
}

export interface ActivityItem {
  id: string
  type: 'commit' | 'pr' | 'issue'
  message?: string
  title?: string
  created_at: string
  repo_id?: string
  repo?: { name: string }
  author?: { name: string | null, avatar_url?: string | null }
}

export interface Commit {
  id: string
  repo_id: string
  branch_id: string
  author_id: string | null
  message: string
  created_at: string
  parent_id?: string | null
  merge_parent_id?: string | null
  author?: PublicUser | null
  branch?: { id: string, name: string } | null
}

export interface CommitDetail {
  commit: Commit
  /** Changes introduced by the commit (vs. its first parent) */
  diff: DiffMap
}

// Repositories
export async function getRepositories(): Promise<Repository[]> {
  const { data } = await apiClient.get<Repository[]>('/api/repos')
  return data || []
}

export async function createRepository(repoData: { name: string, description: string, isPrivate: boolean }): Promise<Repository> {
  const { data } = await apiClient.post<Repository>('/api/repos', repoData)
  return data
}

export async function getActivity(): Promise<ActivityItem[]> {
  const { data } = await apiClient.get<ActivityItem[]>('/api/activity')
  return data || []
}

export async function getRepositoryById(repoId: string): Promise<Repository | null> {
  try {
    const { data } = await apiClient.get<Repository>(`/api/repos/${repoId}`)
    return data
  } catch (err) {
    console.error('Error fetching repository:', err)
    return null
  }
}

export async function getExploreRepos(query?: string): Promise<Repository[]> {
  const { data } = await apiClient.get<Repository[]>('/api/repos/explore', {
    params: query ? { q: query } : undefined
  })
  return data || []
}

export async function getStarredRepos(): Promise<Repository[]> {
  const { data } = await apiClient.get<Repository[]>('/api/repos/starred')
  return data || []
}

export async function toggleStar(repoId: string): Promise<{ starred: boolean, stars_count: number }> {
  const { data } = await apiClient.post<{ starred: boolean, stars_count: number }>(`/api/repos/${repoId}/star`)
  return data
}

export async function getRepoMetrics(repoId: string): Promise<ExecutionStat[]> {
  const { data } = await apiClient.get<ExecutionStat[]>(`/api/repos/${repoId}/metrics`)
  return data || []
}

export async function updateRepository(
  repoId: string,
  updates: { name?: string, description?: string | null, is_private?: boolean, default_branch?: string }
): Promise<Repository> {
  const { data } = await apiClient.patch<Repository>(`/api/repos/${repoId}`, updates)
  return data
}

export async function deleteRepository(repoId: string): Promise<void> {
  await apiClient.delete(`/api/repos/${repoId}`)
}

// Branches & Files
export async function getBranches(repoId: string): Promise<Branch[]> {
  const { data } = await apiClient.get<Branch[]>(`/api/repos/${repoId}/branches`)
  return data || []
}

export async function getFiles(repoId: string, branchId: string): Promise<FileNode[]> {
  const { data } = await apiClient.get<FileNode[]>(`/api/repos/${repoId}/files`, {
    params: { branchId }
  })
  return data || []
}

export async function saveFile(repoId: string, branchId: string, path: string, content: string): Promise<FileNode> {
  const { data } = await apiClient.post<FileNode>(`/api/repos/${repoId}/files`, { path, content, branchId })
  return data
}

export async function deleteFile(repoId: string, branchId: string, path: string): Promise<void> {
  await apiClient.delete(`/api/repos/${repoId}/files`, { data: { path, branchId } })
}

export async function createCommit(repoId: string, branchId: string, message: string): Promise<Commit> {
  const { data } = await apiClient.post<Commit>(`/api/repos/${repoId}/commits`, { message, branchId })
  return data
}

export async function getCommits(repoId: string, branchId?: string): Promise<Commit[]> {
  const { data } = await apiClient.get<Commit[]>(`/api/repos/${repoId}/commits`, {
    params: branchId ? { branchId } : undefined
  })
  return data || []
}

export async function getCommitDetail(repoId: string, commitId: string): Promise<CommitDetail> {
  const { data } = await apiClient.get<CommitDetail>(`/api/repos/${repoId}/commits/${commitId}`)
  return data
}

export async function createBranch(repoId: string, name: string, fromBranchId?: string): Promise<Branch> {
  const { data } = await apiClient.post<Branch>(`/api/repos/${repoId}/branches`, { name, fromBranchId })
  return data
}

// Pull Requests
export async function getPullRequests(): Promise<PullRequest[]> {
  const { data } = await apiClient.get<PullRequest[]>('/api/pull-requests')
  return data || []
}

export async function getRepoPullRequests(repoId: string): Promise<PullRequest[]> {
  const { data } = await apiClient.get<PullRequest[]>(`/api/pull-requests/repo/${repoId}`)
  return data || []
}

export async function createPullRequest(prData: {
  repoId: string,
  sourceBranchId: string,
  targetBranchId: string,
  title: string,
  description: string
}): Promise<PullRequest> {
  const { data } = await apiClient.post<PullRequest>('/api/pull-requests', prData)
  return data
}

export async function getPullRequestById(id: string): Promise<PullRequestDetail> {
  const { data } = await apiClient.get<PullRequestDetail>(`/api/pull-requests/${id}`)
  return data
}

export async function updatePullRequest(id: string, updates: { status?: 'open' | 'closed', title?: string, description?: string }): Promise<PullRequest> {
  const { data } = await apiClient.patch<PullRequest>(`/api/pull-requests/${id}`, updates)
  return data
}

export async function getPRActivity(prId: string): Promise<DiscussionItem[]> {
  const { data } = await apiClient.get<DiscussionItem[]>(`/api/pull-requests/${prId}/activity`)
  return data || []
}

export async function postPRComment(prId: string, content: string): Promise<DiscussionItem> {
  const { data } = await apiClient.post<DiscussionItem>(`/api/pull-requests/${prId}/comments`, { content })
  return data
}

export async function postPRReview(prId: string, status: ReviewStatus, content: string): Promise<DiscussionItem> {
  const { data } = await apiClient.post<DiscussionItem>(`/api/pull-requests/${prId}/reviews`, { status, content })
  return data
}

/** Throws on conflicts; read the conflicting paths with getMergeConflicts(err). */
export async function mergePullRequest(prId: string): Promise<{ message: string, commitId: string }> {
  const { data } = await apiClient.post<{ message: string, commitId: string }>(`/api/pull-requests/${prId}/merge`)
  return data
}

// Issues
export async function getIssues(): Promise<Issue[]> {
  const { data } = await apiClient.get<Issue[]>('/api/issues')
  return data || []
}

export async function getRepoIssues(repoId: string): Promise<Issue[]> {
  const { data } = await apiClient.get<Issue[]>(`/api/issues/repos/${repoId}`)
  return data || []
}

export async function createIssue(repoId: string, issueData: { title: string, description: string }): Promise<Issue> {
  const { data } = await apiClient.post<Issue>(`/api/issues/repos/${repoId}`, issueData)
  return data
}

export async function getIssueById(id: string): Promise<Issue> {
  const { data } = await apiClient.get<Issue>(`/api/issues/${id}`)
  return data
}

export async function updateIssue(id: string, updates: { status?: 'open' | 'closed', title?: string, description?: string }): Promise<Issue> {
  const { data } = await apiClient.patch<Issue>(`/api/issues/${id}`, updates)
  return data
}

export async function getIssueComments(issueId: string): Promise<DiscussionItem[]> {
  const { data } = await apiClient.get<DiscussionItem[]>(`/api/issues/${issueId}/comments`)
  return data || []
}

export async function postIssueComment(issueId: string, content: string): Promise<DiscussionItem> {
  const { data } = await apiClient.post<DiscussionItem>(`/api/issues/${issueId}/comments`, { content })
  return data
}

// Gists
export async function getGists(): Promise<Gist[]> {
  const { data } = await apiClient.get<Gist[]>('/api/gists')
  return data || []
}

export async function getMyGists(): Promise<Gist[]> {
  const { data } = await apiClient.get<Gist[]>('/api/gists/mine')
  return data || []
}

export async function createGist(gistData: {
  title: string,
  description: string,
  is_public: boolean,
  files: { filename: string, content: string, language: string }[]
}): Promise<Gist> {
  const { data } = await apiClient.post<Gist>('/api/gists', gistData)
  return data
}

export async function getGistById(id: string): Promise<Gist> {
  const { data } = await apiClient.get<Gist>(`/api/gists/${id}`)
  return data
}

export async function deleteGist(id: string): Promise<void> {
  await apiClient.delete(`/api/gists/${id}`)
}

// AI Service
export interface AIExplainResponse {
  explanation: string;
}

export interface AIFixResponse {
  fix: string;
}

export interface AISummarizeResponse {
  summary: string;
}

export async function explainFile(path: string, content: string): Promise<AIExplainResponse> {
  const { data } = await apiClient.post<AIExplainResponse>('/api/ai/explain', { path, content });
  return data;
}

export async function fixCode(path: string, content: string, error?: string): Promise<AIFixResponse> {
  const { data } = await apiClient.post<AIFixResponse>('/api/ai/fix', { path, content, error });
  return data;
}

export async function summarizeRepo(repoName: string, description: string, filePaths?: string[]): Promise<AISummarizeResponse> {
  const { data } = await apiClient.post<AISummarizeResponse>('/api/ai/summarize', { repoName, description, filePaths });
  return data;
}

export async function reviewPullRequest(prId: string): Promise<{ review: string }> {
  const { data } = await apiClient.post<{ review: string }>('/api/ai/review-pr', { prId });
  return data;
}

// Execution Service
export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut?: boolean;
}

export async function runFile(repoId: string, filePath: string, branchId?: string): Promise<ExecutionResult> {
  const { data } = await apiClient.post<ExecutionResult>(`/api/execute/${repoId}/run`, { filePath, branchId });
  return data;
}

// Users & Profile
export interface UserProfile {
  id: string
  name: string | null
  avatar_url: string | null
  bio?: string | null
  created_at: string
}

export async function getUserProfile(userId: string): Promise<UserProfile> {
  const { data } = await apiClient.get<UserProfile>(`/api/users/${userId}`)
  return data
}

export async function getUserActivity(userId: string): Promise<ActivityItem[]> {
  const { data } = await apiClient.get<ActivityItem[]>(`/api/users/${userId}/activity`)
  return data || []
}

export async function getUserRepos(userId: string): Promise<Repository[]> {
  const { data } = await apiClient.get<Repository[]>(`/api/users/${userId}/repos`)
  return data || []
}

export interface CurrentUser {
  id: string
  email: string
  name: string
  avatar_url: string
  bio: string
  role: 'user' | 'admin'
  created_at: string | null
}

export async function getCurrentUser(): Promise<CurrentUser> {
  const { data } = await apiClient.get<CurrentUser>('/api/auth/me')
  return data
}

export async function updateProfile(updates: { name?: string, bio?: string, avatar_url?: string }): Promise<UserProfile> {
  const { data } = await apiClient.put<UserProfile>('/api/auth/profile', updates)
  return data
}

// Public platform stats (landing page)
export interface PlatformStats {
  publicRepositories: number
  commits: number
  mergedPullRequests: number
  developers: number
}

export async function getPlatformStats(): Promise<PlatformStats> {
  const { data } = await apiClient.get<PlatformStats>('/api/stats')
  return data
}

// Admin & Observability
export interface SystemHealth {
  api: 'online' | 'offline' | 'error'
  supabase: 'online' | 'offline' | 'error'
  docker: 'online' | 'offline' | 'error'
  timestamp: string
}

export interface ExecutionStat {
  language: string
  status: 'success' | 'error' | 'timeout'
  duration: number
  created_at: string
}

export interface AuditLog {
  id: string
  action: string
  metadata: Record<string, unknown> | null
  created_at: string
  user?: { name: string | null, email: string | null } | null
  repository?: { name: string } | null
}

export interface StorageStats {
  snapshot_rows: number
  blob_count: number
  /** Bytes actually stored (each distinct file content once) */
  stored_bytes: number
  /** Bytes a naive copy-every-file-per-commit design would store */
  logical_bytes: number
}

export interface AdminMetrics {
  executions: ExecutionStat[]
  users: number
  repos: number
  storage: StorageStats | null
}

export async function getSystemHealth(): Promise<SystemHealth> {
  const { data } = await apiClient.get<SystemHealth>('/api/admin/system-health')
  return data
}

export async function getAdminMetrics(): Promise<AdminMetrics> {
  const { data } = await apiClient.get<AdminMetrics>('/api/admin/metrics')
  return data
}

export async function getAdminLogs(): Promise<AuditLog[]> {
  const { data } = await apiClient.get<AuditLog[]>('/api/admin/logs')
  return data || []
}
