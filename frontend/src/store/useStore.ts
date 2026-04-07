import { create } from 'zustand'
import type { Repository, Branch, FileNode, PullRequest, Issue, Gist, ActivityItem } from '../lib/api'

interface AppState {
  // Repositories
  repositories: Repository[]
  activeRepo: Repository | null
  
  // Branches & Files
  branches: Branch[]
  activeBranch: Branch | null
  files: FileNode[]
  activeFile: FileNode | null
  
  // Pull Requests
  pullRequests: PullRequest[]
  activePR: PullRequest | null
  
  // Issues
  issues: Issue[]
  activeIssue: Issue | null
  
  // Gists
  gists: Gist[]
  activeGist: Gist | null

  // Activity
  activity: ActivityItem[]
  
  // Global UI State
  loading: boolean
  error: string | null

  // Actions
  setRepositories: (repos: Repository[]) => void
  setActiveRepo: (repo: Repository | null) => void
  setBranches: (branches: Branch[]) => void
  setActiveBranch: (branch: Branch | null) => void
  setFiles: (files: FileNode[]) => void
  setActiveFile: (file: FileNode | null) => void
  setPullRequests: (prs: PullRequest[]) => void
  setActivePR: (pr: PullRequest | null) => void
  setIssues: (issues: Issue[]) => void
  setActiveIssue: (issue: Issue | null) => void
  setGists: (gists: Gist[]) => void
  setActiveGist: (gist: Gist | null) => void
  setActivity: (activity: ActivityItem[]) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
}

export const useStore = create<AppState>((set) => ({
  // Repositories
  repositories: [],
  activeRepo: null,
  
  // Branches & Files
  branches: [],
  activeBranch: null,
  files: [],
  activeFile: null,
  
  // Pull Requests
  pullRequests: [],
  activePR: null,
  
  // Issues
  issues: [],
  activeIssue: null,
  
  // Gists
  gists: [],
  activeGist: null,

  // Activity
  activity: [],
  
  // Global UI State
  loading: false,
  error: null,

  setRepositories: (repositories) => set({ repositories }),
  setActiveRepo: (activeRepo) => set({ activeRepo }),
  setBranches: (branches) => set({ branches }),
  setActiveBranch: (activeBranch) => set({ activeBranch }),
  setFiles: (files) => set({ files }),
  setActiveFile: (activeFile) => set({ activeFile }),
  setPullRequests: (pullRequests) => set({ pullRequests }),
  setActivePR: (activePR) => set({ activePR }),
  setIssues: (issues) => set({ issues }),
  setActiveIssue: (activeIssue) => set({ activeIssue }),
  setGists: (gists) => set({ gists }),
  setActiveGist: (activeGist) => set({ activeGist }),
  setActivity: (activity) => set({ activity }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}))
