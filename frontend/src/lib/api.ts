import apiClient from './apiClient'
export { apiClient }

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
  forks_count?: number
  language?: string
  owner?: {
    id: string
    name: string
    avatar_url: string | null
  }
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
  author_id: string
  source_branch_id: string
  target_branch_id: string
  title: string
  description: string | null
  status: 'open' | 'closed' | 'merged'
  created_at: string
  updated_at: string
  merged_at: string | null
  author?: {
    id: string
    name: string
    avatar_url: string | null
  }
  repo?: {
    id: string
    name: string
  }
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
  author?: {
    id: string
    name: string
    avatar_url: string | null
  }
  repo?: {
    id: string
    name: string
  }
}

export interface Gist {
  id: string
  user_id: string
  title: string
  description: string | null
  is_public: boolean
  created_at: string
  user?: {
    id: string
    name: string
    avatar_url: string | null
  }
  files?: GistFile[]
}

export interface GistFile {
  id: string
  gist_id: string
  filename: string
  content: string
  language: string
}

export interface ActivityItem {
  id: string
  type: 'commit' | 'pr' | 'issue'
  message?: string
  title?: string
  created_at: string
  repo_id?: string
  repo?: { name: string }
  author?: { name: string, avatar_url?: string }
}

export interface Commit {
  id: string
  repo_id: string
  branch_id: string
  author_id: string
  message: string
  created_at: string
  author?: {
    id: string
    name: string
    avatar_url: string | null
  }
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

export async function updateRepository(repoId: string, updates: Partial<Repository>): Promise<Repository> {
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

export async function getPullRequestById(id: string): Promise<{ pr: PullRequest, diff: any }> {
  const { data } = await apiClient.get<{ pr: PullRequest, diff: any }>(`/api/pull-requests/${id}`)
  return data
}

export async function getPRActivity(prId: string): Promise<any[]> {
  const { data } = await apiClient.get<any[]>(`/api/pull-requests/${prId}/activity`)
  return data || []
}

export async function postPRComment(prId: string, content: string): Promise<any> {
  const { data } = await apiClient.post<any>(`/api/pull-requests/${prId}/comments`, { content })
  return data
}

export async function mergePullRequest(prId: string): Promise<{ message: string }> {
  const { data } = await apiClient.post<{ message: string }>(`/api/pull-requests/${prId}/merge`)
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

export async function getIssueComments(issueId: string): Promise<any[]> {
  const { data } = await apiClient.get<any[]>(`/api/issues/${issueId}/comments`)
  return data || []
}

export async function postIssueComment(issueId: string, content: string): Promise<any> {
  const { data } = await apiClient.post<any>(`/api/issues/${issueId}/comments`, { content })
  return data
}

// Gists
export async function getGists(): Promise<Gist[]> {
  const { data } = await apiClient.get<Gist[]>('/api/gists')
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
}

export async function runFile(repoId: string, filePath: string): Promise<ExecutionResult> {
  const { data } = await apiClient.post<ExecutionResult>(`/api/execute/${repoId}/run`, { filePath });
  return data;
}

// Users & Profile
export interface UserProfile {
  id: string
  name: string
  avatar_url: string | null
  bio?: string
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
  metadata: any
  created_at: string
  user?: { name: string, email: string }
  repository?: { name: string }
}

export async function getSystemHealth(): Promise<SystemHealth> {
  const { data } = await apiClient.get<SystemHealth>('/api/admin/system-health')
  return data
}

export async function getAdminMetrics(): Promise<{ 
  executions: ExecutionStat[], 
  users: number, 
  repos: number 
}> {
  const { data } = await apiClient.get<any>('/api/admin/metrics')
  return data
}

export async function getAdminLogs(): Promise<AuditLog[]> {
  const { data } = await apiClient.get<AuditLog[]>('/api/admin/logs')
  return data || []
}
