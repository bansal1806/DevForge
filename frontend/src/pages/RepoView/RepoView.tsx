import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useParams, Link, useNavigate } from 'react-router-dom'
import Editor from '@monaco-editor/react'
import type { OnMount } from '@monaco-editor/react'
import ReactMarkdown from 'react-markdown'
import { useRepoRealtime, type FileChange } from '../../lib/useRepoRealtime'
import {
  AvatarStack, Badge, Button, Card, EmptyState, IconButton, Input, Modal, Skeleton, Spinner, Tabs, toast, useDialog,
} from '../../components/ui'
import { CommitGraph } from '../../components/CommitGraph/CommitGraph'
import { TerminalOutput } from '../../components/TerminalOutput/TerminalOutput'
import { FileTree } from '../../components/FileTree/FileTree'
import { InsightsPanel } from './InsightsPanel'
import { sparkBurst } from '../../lib/sparks'
import { useRegisterCommands } from '../../contexts/CommandPalette'
import { useMenu } from '../../lib/useMenu'
import type { PaletteCommand } from '../../contexts/CommandPalette'
import { useStore } from '../../store/useStore'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { fileColor, isRunnable, languageLabel, monacoLanguage } from '../../lib/fileLang'
import { timeAgo } from '../../lib/time'
import {
  getRepositoryById,
  getBranches,
  getFiles,
  saveFile,
  createCommit,
  createBranch,
  toggleStar,
  updateRepository,
  deleteRepository,
  getRepoIssues,
  getRepoPullRequests,
  explainFile,
  runFile,
  getRepoMetrics,
  getCommits,
  getErrorMessage
} from '../../lib/api'
import type { FileNode, Issue, PullRequest, ExecutionResult, ExecutionStat, Commit } from '../../lib/api'
import {
  Bug, CheckCircle2, ChevronDown, ChevronRight, CircleDot, Code2, FilePlus, FileText, GitBranch,
  GitCommitHorizontal, GitMerge, GitPullRequest, History, LineChart as LineChartIcon, Loader2, Lock, Play,
  Plus, Save, Settings, Sparkles, Star, Trash2, Users, X,
} from 'lucide-react'
import styles from './RepoView.module.css'
import NewIssueModal from '../../components/Modals/NewIssueModal'
import NewPRModal from '../../components/Modals/NewPRModal'

const tabDefs = [
  { icon: Code2, label: 'Code' },
  { icon: Bug, label: 'Issues' },
  { icon: GitPullRequest, label: 'Pull Requests' },
  { icon: History, label: 'Commits' },
  { icon: LineChartIcon, label: 'Insights' },
  { icon: Settings, label: 'Settings' },
]

export default function RepoView() {
  const { id } = useParams()
  const {
    activeRepo, setActiveRepo,
    activeBranch, setActiveBranch,
    branches, setBranches,
    files, setFiles,
    activeFile, setActiveFile,
    loading, setLoading,
  } = useStore()

  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('Code')
  const [isBranchOpen, setIsBranchOpen] = useState(false)
  const [repoIssues, setRepoIssues] = useState<Issue[]>([])
  const [repoPRs, setRepoPRs] = useState<PullRequest[]>([])
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false)
  const [isPRModalOpen, setIsPRModalOpen] = useState(false)
  const [newRepoName, setNewRepoName] = useState('')

  // AI State
  const [isAIExplaining, setIsAIExplaining] = useState(false)
  const [aiExplanation, setAIExplanation] = useState<string | null>(null)

  // Execution State
  const [isRunning, setIsRunning] = useState(false)
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null)
  const [runId, setRunId] = useState(0)
  const [runDuration, setRunDuration] = useState<number | null>(null)
  const [showTerminal, setShowTerminal] = useState(false)
  const [repoMetrics, setRepoMetrics] = useState<ExecutionStat[]>([])

  // Editing / Versioning State
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isCommitting, setIsCommitting] = useState(false)
  const [commitMessage, setCommitMessage] = useState('')
  const [showCommitBox, setShowCommitBox] = useState(false)
  const [isStarring, setIsStarring] = useState(false)
  const [repoCommits, setRepoCommits] = useState<Commit[]>([])
  const [commitsLoading, setCommitsLoading] = useState(false)
  const [commitsVersion, setCommitsVersion] = useState(0)
  const [openPaths, setOpenPaths] = useState<string[]>([])
  const [cursor, setCursor] = useState<{ line: number, column: number } | null>(null)
  // Captured once per mount so relative times keep render pure
  const [now] = useState(() => Date.now())
  const { resolved: resolvedTheme } = useTheme()

  const { user } = useAuth()
  const canWrite = activeRepo?.permission === 'write' || activeRepo?.permission === 'admin'
  const isOwner = !!user && activeRepo?.owner_id === user.id

  // Latest values for realtime handlers that are registered once
  const activeFileRef = useRef(activeFile)
  const activeBranchRef = useRef(activeBranch)
  useEffect(() => { activeFileRef.current = activeFile }, [activeFile])
  useEffect(() => { activeBranchRef.current = activeBranch }, [activeBranch])

  const dialog = useDialog()
  const commitButtonRef = useRef<HTMLButtonElement>(null)
  const starButtonRef = useRef<HTMLButtonElement>(null)
  const confirmDiscard = async () =>
    !isDirty || dialog.confirm({
      title: 'Discard unsaved changes?',
      message: `Your edits to ${activeFile?.path || 'this file'} haven't been saved. They'll be lost if you continue.`,
      confirmLabel: 'Discard changes',
      cancelLabel: 'Keep editing',
      tone: 'danger',
    })

  // Warn before closing the tab with unsaved edits
  useEffect(() => {
    if (!isDirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])

  useEffect(() => {
    if (activeRepo) setNewRepoName(activeRepo.name)
  }, [activeRepo])

  const handleRename = async () => {
    if (!activeRepo || !newRepoName.trim() || newRepoName === activeRepo.name) return
    try {
      const updated = await updateRepository(activeRepo.id, { name: newRepoName.trim() })
      setActiveRepo({ ...activeRepo, ...updated })
      toast.success('Repository renamed.')
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to rename repository.'))
    }
  }

  const handleToggleVisibility = async () => {
    if (!activeRepo) return
    const makePrivate = !activeRepo.is_private
    const ok = await dialog.confirm({
      title: `Make ${activeRepo.name} ${makePrivate ? 'private' : 'public'}?`,
      message: makePrivate
        ? 'Only you and collaborators will be able to see it.'
        : 'Anyone on the internet will be able to see its code, issues and pull requests.',
      confirmLabel: makePrivate ? 'Make private' : 'Make public',
    })
    if (!ok) return
    try {
      const updated = await updateRepository(activeRepo.id, { is_private: makePrivate })
      setActiveRepo({ ...activeRepo, ...updated })
      toast.success(`Repository is now ${makePrivate ? 'private' : 'public'}.`)
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to change visibility.'))
    }
  }

  const handleDelete = async () => {
    if (!activeRepo) return
    const confirmed = await dialog.confirm({
      title: `Delete ${activeRepo.name}?`,
      message: 'This permanently deletes the repository with all of its branches, commits, pull requests and issues. It cannot be undone.',
      confirmLabel: 'Delete repository',
      tone: 'danger',
      requireText: activeRepo.name,
    })
    if (confirmed) {
      try {
        await deleteRepository(activeRepo.id)
        navigate('/dashboard')
      } catch (err) {
        toast.error(getErrorMessage(err, 'Failed to delete repository.'))
      }
    }
  }
  const branchButtonRef = useRef<HTMLButtonElement>(null)
  const branchMenuRef = useRef<HTMLDivElement>(null)


  // Persist the open buffer and keep the file list in sync (so switching tabs shows the saved text)
  const persistActiveFile = async () => {
    if (!activeFile || !id || !activeBranch) return
    await saveFile(id, activeBranch.id, activeFile.path, activeFile.content || '')
    setIsDirty(false)
    setFiles(files.map((f) => (f.path === activeFile.path ? { ...f, content: activeFile.content } : f)))
  }

  // Save the active file's content to the current branch
  const handleSave = async () => {
    if (!canWrite || !activeFile || !id || !activeBranch || !isDirty) return
    setIsSaving(true)
    try {
      await persistActiveFile()
      toast.success('File saved. Commit your changes to record them in history.')
    } catch (err) {
      toast.error(getErrorMessage(err, 'Error: failed to save file.'))
    } finally {
      setIsSaving(false)
    }
  }

  // Commit the current branch state (snapshots power PR diffs)
  const handleCommit = async () => {
    if (!id || !activeBranch || !commitMessage.trim()) return
    setIsCommitting(true)
    try {
      if (isDirty) await persistActiveFile()
      await createCommit(id, activeBranch.id, commitMessage.trim())
      setCommitMessage('')
      setShowCommitBox(false)
      setCommitsVersion((v) => v + 1)
      sparkBurst(commitButtonRef.current, { count: 34, power: 7.5 })
      toast.success('Changes committed.')
    } catch (err) {
      toast.error(getErrorMessage(err, 'Error: failed to commit changes.'))
    } finally {
      setIsCommitting(false)
    }
  }

  const handleNewBranch = async () => {
    if (!id || !(await confirmDiscard())) return
    const name = await dialog.prompt({
      title: 'Create a branch',
      description: <>Branches from <strong>{activeBranch?.name || 'the default branch'}</strong> with all of its files.</>,
      label: 'Branch name',
      placeholder: 'feature/my-change',
      hint: 'Letters, numbers, ".", "-", "_" and "/"',
      confirmLabel: 'Create branch',
      mono: true,
      validate: (value) =>
        !/^[A-Za-z0-9._/-]{1,100}$/.test(value) || /(^\/|\/$|\/\/|\.\.)/.test(value)
          ? 'Use letters, numbers, ".", "-", "_" and "/" (no leading/trailing or double slashes)'
          : branches.some((b) => b.name === value) ? 'A branch with that name already exists' : null,
    })
    if (!name) return
    try {
      const branch = await createBranch(id, name, activeBranch?.id)
      const updated = await getBranches(id)
      setBranches(updated)
      setActiveBranch(branch)
      setIsBranchOpen(false)
      toast.success(`Branch "${branch.name}" created.`)
    } catch (err) {
      toast.error(getErrorMessage(err, 'Error: failed to create branch.'))
    }
  }

  const handleToggleStar = async () => {
    if (!id || !activeRepo || isStarring) return
    setIsStarring(true)
    try {
      const result = await toggleStar(id)
      setActiveRepo({ ...activeRepo, starred_by_me: result.starred, stars_count: result.stars_count })
      if (result.starred) sparkBurst(starButtonRef.current, { count: 18, power: 5, spread: 220 })
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not update the star.'))
    } finally {
      setIsStarring(false)
    }
  }

  const handleNewFile = async () => {
    if (!id || !activeBranch || !(await confirmDiscard())) return
    const path = await dialog.prompt({
      title: 'Create a file',
      description: <>On branch <strong>{activeBranch.name}</strong>. Folders are created from the path.</>,
      label: 'File path',
      placeholder: 'src/main.py',
      confirmLabel: 'Create file',
      mono: true,
      validate: (value) =>
        value.startsWith('/') || value.split('/').some((seg) => !seg || seg === '.' || seg === '..')
          ? 'Use a relative path like src/main.py'
          : files.some((f) => f.path === value) ? 'A file with that path already exists' : null,
    })
    if (!path) return
    try {
      const file = await saveFile(id, activeBranch.id, path, '')
      const updated = await getFiles(id, activeBranch.id)
      setFiles(updated)
      const created = updated.find(f => f.path === file.path)
      if (created) {
        setActiveFile(created)
        setOpenPaths((paths) => (paths.includes(created.path) ? paths : [...paths, created.path]))
        setIsDirty(false)
      }
      toast.success(`Created ${file.path}.`)
    } catch (err) {
      toast.error(getErrorMessage(err, 'Error: failed to create file.'))
    }
  }

  // AI Actions
  const handleAIExplain = async () => {
    if (!activeFile?.content) return
    setIsAIExplaining(true)
    setAIExplanation(null)
    try {
      const res = await explainFile(activeFile.path, activeFile.content)
      setAIExplanation(res.explanation)
    } catch (err) {
      console.error(err)
      toast.error('AI explanation failed.')
    } finally {
      setIsAIExplaining(false)
    }
  }

  const handleRun = async () => {
    if (!activeFile || !id) return
    setIsRunning(true)
    setShowTerminal(true)
    setExecutionResult(null)
    setRunDuration(null)
    const started = performance.now()

    try {
      // Persist unsaved edits first so what runs is what's on screen
      if (isDirty && canWrite) await persistActiveFile()
      const result = await runFile(id, activeFile.path, activeBranch?.id)
      setRunDuration(performance.now() - started)
      setExecutionResult(result)
    } catch (err) {
      setExecutionResult({
        stdout: '',
        stderr: getErrorMessage(err, 'Execution failed to start.'),
        exitCode: 1
      })
    } finally {
      setRunId((n) => n + 1)
      setIsRunning(false)
    }
  }

  // 1. Fetch Repo Initial Data
  useEffect(() => {
    if (!id) return

    async function init() {
      setLoading(true)
      try {
        const repoData = await getRepositoryById(id!)
        setActiveRepo(repoData)

        const branchData = await getBranches(id!)
        setBranches(branchData)

        if (branchData.length > 0) {
          const defaultBr = branchData.find(b => b.is_default) || branchData[0]
          setActiveBranch(defaultBr)
          const filesData = await getFiles(id!, defaultBr.id)
          setFiles(filesData)
        }

        // Independent panels: one failing request must not blank the others
        const [issuesRes, prsRes, metricsRes] = await Promise.allSettled([
          getRepoIssues(id!),
          getRepoPullRequests(id!),
          getRepoMetrics(id!),
        ])
        if (issuesRes.status === 'fulfilled') setRepoIssues(issuesRes.value)
        if (prsRes.status === 'fulfilled') setRepoPRs(prsRes.value)
        if (metricsRes.status === 'fulfilled') setRepoMetrics(metricsRes.value)

      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    init()

    return () => {
      setActiveRepo(null)
      setActiveFile(null)
      setActiveBranch(null)
      setBranches([])
      setFiles([])
    }
  }, [id, setActiveRepo, setBranches, setActiveBranch, setActiveFile, setFiles, setLoading])

  const refreshIssues = async () => {
    const issuesData = await getRepoIssues(id!)
    setRepoIssues(issuesData)
  }

  const refreshPRs = async () => {
    const prsData = await getRepoPullRequests(id!)
    setRepoPRs(prsData)
  }

  // 2. Fetch Files when the active branch changes
  // Only a branch of *this* repo: right after navigating between repos the store
  // can still hold the previous repo's branch for one render
  const activeBranchId = activeBranch?.repo_id === id ? activeBranch?.id : undefined
  useEffect(() => {
    if (!id || !activeBranchId) return

    // Ignore late responses after a quick branch switch
    let cancelled = false
    getFiles(id, activeBranchId).then((fileData) => {
      if (cancelled) return
      setFiles(fileData)
      setActiveFile(null)
      setOpenPaths([])
      setCursor(null)
      setIsDirty(false)
    }).catch((err) => console.error('Failed to load files:', err))
    return () => { cancelled = true }
  }, [id, activeBranchId, setFiles, setActiveFile])

  // Commit history for the active branch, loaded when the tab is opened
  useEffect(() => {
    if (activeTab !== 'Commits' || !id || !activeBranchId) return
    let cancelled = false
    setCommitsLoading(true)
    getCommits(id, activeBranchId)
      .then((data) => { if (!cancelled) setRepoCommits(data) })
      .catch((err) => console.error('Failed to load commits:', err))
      .finally(() => { if (!cancelled) setCommitsLoading(false) })
    return () => { cancelled = true }
  }, [activeTab, id, activeBranchId, commitsVersion])

  // 3. Live collaboration (Supabase Realtime, authorized by RLS — migration 012)
  const handleRemoteChange = useCallback((change: FileChange) => {
    const file = activeFileRef.current
    // Only apply edits for the exact branch + file that is open
    if (!file || change.branchId !== activeBranchRef.current?.id || change.path !== file.path) return
    setActiveFile({ ...file, content: change.content })
  }, [setActiveFile])

  const displayName = (user?.user_metadata?.full_name as string | undefined) || user?.email?.split('@')[0] || 'User'
  const { users: activeUsers, sendFileChange } = useRepoRealtime(id, user?.id, displayName, handleRemoteChange)

  useMenu(isBranchOpen, () => setIsBranchOpen(false), branchMenuRef, branchButtonRef)


  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined && activeFile) {
      setActiveFile({ ...activeFile, content: value })
      setIsDirty(true)
      if (activeBranch && canWrite) {
        sendFileChange({ branchId: activeBranch.id, path: activeFile.path, content: value })
      }
    }
  }


  // Ctrl/Cmd+S saves the open file (and never triggers the browser's save dialog)
  const saveRef = useRef(handleSave)
  useEffect(() => { saveRef.current = handleSave })
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        saveRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Repository actions in the command palette (Ctrl/Cmd+K)
  const repoCommands: PaletteCommand[] = [
    ...(canWrite && activeFile && isDirty
      ? [{ id: 'repo-save', label: `Save ${activeFile.path}`, icon: <Save size={16} />, shortcut: ['Ctrl', 'S'], perform: handleSave }]
      : []),
    ...(activeFile
      ? [{ id: 'repo-run', label: `Run ${activeFile.path}`, icon: <Play size={16} />, keywords: ['execute'], perform: handleRun }]
      : []),
    ...(canWrite
      ? [
          { id: 'repo-commit', label: 'Commit changes', icon: <GitCommitHorizontal size={16} />, hint: activeBranch?.name, perform: () => { setActiveTab('Code'); setShowCommitBox(true) } },
          { id: 'repo-new-branch', label: 'New branch', icon: <GitBranch size={16} />, perform: handleNewBranch },
          { id: 'repo-new-file', label: 'New file', icon: <FilePlus size={16} />, perform: handleNewFile },
        ]
      : []),
    {
      id: 'repo-star',
      label: activeRepo?.starred_by_me ? 'Unstar repository' : 'Star repository',
      icon: <Star size={16} />,
      perform: handleToggleStar,
    },
    ...tabDefs
      .filter((tab) => tab.label !== activeTab && (tab.label !== 'Settings' || isOwner))
      .map((tab) => ({
        id: `repo-tab-${tab.label}`,
        label: `Go to ${tab.label}`,
        icon: <tab.icon size={16} />,
        perform: () => setActiveTab(tab.label),
      })),
    ...branches
      .filter((b) => b.id !== activeBranch?.id)
      .map((b) => ({
        id: `repo-branch-${b.id}`,
        label: `Switch to branch ${b.name}`,
        icon: <GitBranch size={16} />,
        keywords: ['checkout', b.name],
        perform: async () => { if (await confirmDiscard()) setActiveBranch(b) },
      })),
  ]
  useRegisterCommands(activeRepo ? `In ${activeRepo.name}` : 'This repository', repoCommands)

  // ---------------------------------------------------------------------
  // Editor tabs: several files can be open, one buffer holds unsaved edits
  // ---------------------------------------------------------------------
  const readme = files.find((f) => f.path.toLowerCase() === 'readme.md')

  const openFile = async (file: FileNode) => {
    if (file.path === activeFile?.path) return
    if (!(await confirmDiscard())) return
    setActiveFile(file)
    setIsDirty(false)
    setAIExplanation(null)
    setCursor(null)
    setOpenPaths((paths) => (paths.includes(file.path) ? paths : [...paths, file.path]))
  }

  const closeTab = async (path: string) => {
    if (path === activeFile?.path) {
      if (!(await confirmDiscard())) return
      const index = openPaths.indexOf(path)
      const remaining = openPaths.filter((p) => p !== path)
      const nextPath = remaining[Math.min(index, remaining.length - 1)]
      setActiveFile((nextPath && files.find((f) => f.path === nextPath)) || null)
      setIsDirty(false)
      setCursor(null)
    }
    setOpenPaths((paths) => paths.filter((p) => p !== path))
  }

  const onEditorMount: OnMount = (editor) => {
    editor.onDidChangeCursorPosition((e) => setCursor({ line: e.position.lineNumber, column: e.position.column }))
  }

  const openIssueCount = repoIssues.filter((i) => i.status === 'open').length
  const openPrCount = repoPRs.filter((p) => p.status === 'open').length
  const visibleTabs = tabDefs.filter((tab) => tab.label !== 'Settings' || isOwner)
  const others = activeUsers.filter((u) => u.id !== user?.id)
  const runnable = isRunnable(activeFile?.path)

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerMain}>
          <div className={styles.crumbs}>
            {activeRepo?.owner_id
              ? <Link to={`/profile/${activeRepo.owner_id}`}>{activeRepo.owner?.name || 'owner'}</Link>
              : <span>…</span>}
            <span aria-hidden="true">/</span>
            <h1 className={styles.repoName}>{activeRepo?.name || <Skeleton width={160} height={24} />}</h1>
            {activeRepo && (
              activeRepo.is_private
                ? <Badge tone="neutral" icon={<Lock size={11} />}>private</Badge>
                : <Badge tone="steel">public</Badge>
            )}
          </div>
          {activeRepo?.description && <p className={styles.description}>{activeRepo.description}</p>}
        </div>

        <div className={styles.headerActions}>
          <div className={styles.presence} aria-live="polite">
            {others.length > 0 ? (
              <>
                <AvatarStack people={others.map((u) => ({ id: u.id, name: u.name, live: true }))} max={4} size={28} />
                <span className={styles.presenceText}>{others.length} here now</span>
              </>
            ) : (
              <span className={styles.presenceText}><Users size={14} /> Only you</span>
            )}
          </div>
          <Button
            ref={starButtonRef}
            onClick={handleToggleStar}
            disabled={isStarring || !activeRepo}
            iconLeft={<Star size={15} fill={activeRepo?.starred_by_me ? 'currentColor' : 'none'} className={activeRepo?.starred_by_me ? styles.starred : undefined} />}
            aria-pressed={!!activeRepo?.starred_by_me}
          >
            {activeRepo?.starred_by_me ? 'Starred' : 'Star'}
            <span className={styles.starCount}>{activeRepo?.stars_count ?? 0}</span>
          </Button>
        </div>
      </header>

      <Tabs
        label="Repository sections"
        value={activeTab}
        onChange={setActiveTab}
        items={visibleTabs.map((tab) => ({
          id: tab.label,
          label: tab.label,
          icon: <tab.icon size={15} />,
          count: tab.label === 'Issues' ? openIssueCount : tab.label === 'Pull Requests' ? openPrCount : undefined,
        }))}
      />

      {activeTab === 'Code' && (
        <div className={styles.workspace}>
          <aside className={styles.explorer} aria-label="Explorer">
            <div className={styles.explorerHead}>
              <div className={styles.branchWrap}>
                <button
                  ref={branchButtonRef}
                  className={styles.branchButton}
                  onClick={() => setIsBranchOpen(!isBranchOpen)}
                  aria-haspopup="menu"
                  aria-expanded={isBranchOpen}
                >
                  <GitBranch size={14} />
                  <span className={styles.branchName}>{activeBranch?.name || 'main'}</span>
                  <ChevronDown size={14} />
                </button>
                <AnimatePresence>
                  {isBranchOpen && (
                    <motion.div
                      ref={branchMenuRef}
                      role="menu"
                      aria-label="Branches"
                      className={`dropdown-menu ${styles.branchMenu}`}
                      initial={{ opacity: 0, scale: 0.96, y: -4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.97, y: -4 }}
                      transition={{ duration: 0.14 }}
                    >
                      <div className={styles.menuLabel} role="presentation">Switch branch</div>
                      {branches.map((b) => (
                        <button
                          key={b.id}
                          role="menuitemradio"
                          aria-checked={activeBranch?.id === b.id}
                          className={`dropdown-item ${activeBranch?.id === b.id ? 'active' : ''}`}
                          onClick={async () => {
                            setIsBranchOpen(false)
                            if (b.id !== activeBranch?.id && (await confirmDiscard())) setActiveBranch(b)
                          }}
                        >
                          <GitBranch size={13} /> {b.name}
                          {b.is_default && <Badge tone="neutral" className={styles.defaultBadge}>default</Badge>}
                        </button>
                      ))}
                      {canWrite && (
                        <>
                          <div className="dropdown-divider" role="separator" />
                          <button role="menuitem" className="dropdown-item" onClick={handleNewBranch}><Plus size={13} /> New branch</button>
                        </>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              {canWrite && (
                <div className={styles.explorerActions}>
                  <IconButton size="sm" label="New file" icon={<FilePlus size={15} />} onClick={handleNewFile} />
                  <IconButton
                    size="sm"
                    label="Commit changes"
                    variant={showCommitBox ? 'secondary' : 'ghost'}
                    icon={<GitCommitHorizontal size={15} />}
                    onClick={() => setShowCommitBox(!showCommitBox)}
                  />
                </div>
              )}
            </div>

            <AnimatePresence initial={false}>
              {showCommitBox && canWrite && (
                <motion.form
                  className={styles.commitBox}
                  onSubmit={(e) => { e.preventDefault(); handleCommit() }}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <input
                    className={styles.commitInput}
                    placeholder="Describe your change…"
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    aria-label="Commit message"
                    maxLength={500}
                    autoFocus
                  />
                  <Button
                    ref={commitButtonRef}
                    type="submit"
                    variant="primary"
                    size="sm"
                    fullWidth
                    loading={isCommitting}
                    disabled={!commitMessage.trim()}
                    iconLeft={<GitCommitHorizontal size={14} />}
                  >
                    Commit to {activeBranch?.name || 'branch'}
                  </Button>
                </motion.form>
              )}
            </AnimatePresence>

            <div className={styles.treeScroll}>
              {loading ? (
                <div className={styles.treeSkeleton}>
                  {[70, 55, 80, 45, 62].map((w, i) => <Skeleton key={i} width={`${w}%`} height={14} />)}
                </div>
              ) : files.length === 0 ? (
                <p className={styles.quiet}>This branch has no files yet.</p>
              ) : (
                <FileTree files={files} activePath={activeFile?.path} dirtyPath={isDirty ? activeFile?.path : null} onOpen={openFile} />
              )}
            </div>
          </aside>

          <section className={styles.editorPane} aria-label="Editor">
            <div className={styles.tabBar}>
              <div className={styles.fileTabs} role="tablist" aria-label="Open files">
                {openPaths.map((path) => {
                  const active = path === activeFile?.path
                  return (
                    <div key={path} className={`${styles.fileTab} ${active ? styles.fileTabActive : ''}`}>
                      <button
                        role="tab"
                        aria-selected={active}
                        className={styles.fileTabButton}
                        title={path}
                        onClick={() => { const f = files.find((x) => x.path === path); if (f) openFile(f) }}
                      >
                        <span className={styles.fileDot} style={{ background: fileColor(path) }} />
                        {path.split('/').pop()}
                        {active && isDirty && <span className={styles.dirtyDot} aria-label="Unsaved changes" />}
                      </button>
                      <button className={styles.fileTabClose} aria-label={`Close ${path}`} onClick={() => closeTab(path)}>
                        <X size={12} />
                      </button>
                    </div>
                  )
                })}
              </div>
              {activeFile && (
                <div className={styles.editorActions}>
                  {canWrite && (
                    <Button size="sm" variant="ghost" iconLeft={<Save size={14} />} onClick={handleSave} loading={isSaving} disabled={!isDirty} title="Save (Ctrl+S)">
                      {isDirty ? 'Save' : 'Saved'}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" iconLeft={<Sparkles size={14} />} onClick={handleAIExplain} loading={isAIExplaining} disabled={!activeFile.content}>
                    Explain
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    iconLeft={<Play size={14} />}
                    onClick={handleRun}
                    loading={isRunning}
                    disabled={!runnable}
                    title={runnable ? 'Run this file' : 'Only .js, .ts, .py and .cpp files can run'}
                  >
                    Run
                  </Button>
                </div>
              )}
            </div>

            <div className={styles.editorBody}>
              {activeFile ? (
                <>
                  <div className={styles.breadcrumb}>
                    {activeFile.path.split('/').map((segment, i, all) => (
                      <span key={i} className={styles.crumb}>
                        {segment}
                        {i < all.length - 1 && <ChevronRight size={12} />}
                      </span>
                    ))}
                  </div>
                  <div className={styles.editor}>
                    <Editor
                      key={activeFile.path}
                      height="100%"
                      theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
                      language={monacoLanguage(activeFile.path)}
                      value={activeFile.content ?? ''}
                      onChange={handleEditorChange}
                      onMount={onEditorMount}
                      loading={<div className={styles.editorLoading}><Spinner /> Loading editor…</div>}
                      options={{
                        readOnly: !canWrite,
                        minimap: { enabled: false },
                        fontSize: 14,
                        fontFamily: 'JetBrains Mono, monospace',
                        fontLigatures: true,
                        lineNumbers: 'on',
                        padding: { top: 12, bottom: 12 },
                        scrollBeyondLastLine: false,
                        smoothScrolling: true,
                        cursorBlinking: 'smooth',
                        cursorSmoothCaretAnimation: 'on',
                        renderLineHighlight: 'all',
                      }}
                    />
                  </div>
                </>
              ) : readme ? (
                <article className={styles.readme}>
                  <div className={styles.readmeHead}><FileText size={14} /> README.md</div>
                  <div className={styles.markdown}><ReactMarkdown>{readme.content || ''}</ReactMarkdown></div>
                </article>
              ) : (
                <EmptyState
                  title="Pick a file to start forging"
                  description="Choose a file from the explorer, or create a new one."
                  action={canWrite ? <Button variant="primary" size="sm" iconLeft={<FilePlus size={14} />} onClick={handleNewFile}>New file</Button> : undefined}
                />
              )}
            </div>

            <AnimatePresence>
              {showTerminal && activeFile && (
                <motion.div
                  className={styles.terminal}
                  initial={{ height: 0 }}
                  animate={{ height: 240 }}
                  exit={{ height: 0 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                >
                  <TerminalOutput
                    fileName={activeFile.path}
                    running={isRunning}
                    result={executionResult}
                    runId={runId}
                    durationMs={runDuration}
                    onClear={() => setExecutionResult(null)}
                    onClose={() => setShowTerminal(false)}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <footer className={styles.statusBar}>
              <span className={styles.statusItem}><GitBranch size={12} /> {activeBranch?.name || 'main'}</span>
              {activeFile && (
                <span className={`${styles.statusItem} ${isDirty ? styles.statusDirty : ''}`}>
                  {isDirty ? <><span className={styles.dirtyDot} /> Unsaved</> : <><CheckCircle2 size={12} /> Saved</>}
                </span>
              )}
              {!canWrite && <span className={styles.statusItem}><Lock size={12} /> Read-only</span>}
              <span className={styles.statusSpacer} />
              {isRunning && <span className={`${styles.statusItem} ${styles.statusRun}`}><Loader2 size={12} className="animate-spin" /> Running</span>}
              {activeFile && cursor && <span className={styles.statusItem}>Ln {cursor.line}, Col {cursor.column}</span>}
              {activeFile && <span className={styles.statusItem}>{languageLabel(activeFile.path)}</span>}
              <span className={styles.statusItem} title="People in this repository"><Users size={12} /> {Math.max(1, activeUsers.length)}</span>
            </footer>
          </section>
        </div>
      )}

      {activeTab === 'Issues' && (
        <section className={styles.listSection}>
          <div className={styles.listHead}>
            <h2>Issues</h2>
            {user && <Button variant="primary" size="sm" iconLeft={<Plus size={14} />} onClick={() => setIsIssueModalOpen(true)}>New issue</Button>}
          </div>
          {repoIssues.length === 0 ? (
            <Card padding="none"><EmptyState title="No issues yet" description="Track bugs, ideas and to-dos for this repository." /></Card>
          ) : (
            <Card padding="none">
              <ul className={styles.rows}>
                {repoIssues.map((issue) => (
                  <li key={issue.id}>
                    <Link to={`/repo/${id}/issues/${issue.id}`} className={styles.row}>
                      {issue.status === 'open'
                        ? <CircleDot size={16} className={styles.openIcon} />
                        : <CheckCircle2 size={16} className={styles.closedIcon} />}
                      <span className={styles.rowMain}>
                        <span className={styles.rowTitle}>{issue.title}</span>
                        <span className={styles.rowMeta}>Opened {timeAgo(issue.created_at, now)} by {issue.author?.name || 'Deleted user'}</span>
                      </span>
                      <Badge tone={issue.status === 'open' ? 'success' : 'neutral'} dot>{issue.status}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>
      )}

      {activeTab === 'Pull Requests' && (
        <section className={styles.listSection}>
          <div className={styles.listHead}>
            <h2>Pull requests</h2>
            {canWrite && <Button variant="primary" size="sm" iconLeft={<Plus size={14} />} onClick={() => setIsPRModalOpen(true)}>New pull request</Button>}
          </div>
          {repoPRs.length === 0 ? (
            <Card padding="none"><EmptyState title="No pull requests yet" description="Create a branch, commit a change, and open a pull request to start a review." /></Card>
          ) : (
            <Card padding="none">
              <ul className={styles.rows}>
                {repoPRs.map((pr) => (
                  <li key={pr.id}>
                    <Link to={`/repo/${id}/pull-requests/${pr.id}`} className={styles.row}>
                      {pr.status === 'merged'
                        ? <GitMerge size={16} className={styles.mergedIcon} />
                        : <GitPullRequest size={16} className={pr.status === 'open' ? styles.openIcon : styles.closedIcon} />}
                      <span className={styles.rowMain}>
                        <span className={styles.rowTitle}>{pr.title}</span>
                        <span className={styles.rowMeta}>
                          <code>{pr.source?.name || '?'}</code> → <code>{pr.target?.name || '?'}</code> · opened {timeAgo(pr.created_at, now)} by {pr.author?.name || 'Deleted user'}
                        </span>
                      </span>
                      <Badge tone={pr.status === 'open' ? 'success' : pr.status === 'merged' ? 'info' : 'neutral'} dot>{pr.status}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>
      )}

      {activeTab === 'Commits' && (
        <section className={styles.listSection}>
          <div className={styles.listHead}>
            <h2>Commits on <span className={styles.branchHighlight}>{activeBranch?.name || 'main'}</span></h2>
          </div>
          {commitsLoading && repoCommits.length === 0 ? (
            <Card>
              <div className={styles.treeSkeleton}>
                {[60, 48, 72, 40].map((w, i) => <Skeleton key={i} width={`${w}%`} height={16} />)}
              </div>
            </Card>
          ) : repoCommits.length === 0 ? (
            <Card padding="none"><EmptyState title="No commits on this branch yet" description="Edit a file and commit it to start this branch's history." /></Card>
          ) : (
            <Card padding="sm"><CommitGraph commits={repoCommits} repoId={id!} /></Card>
          )}
        </section>
      )}

      {activeTab === 'Insights' && (
        <section className={styles.listSection}>
          <div className={styles.listHead}><h2>Insights</h2></div>
          <InsightsPanel metrics={repoMetrics} />
        </section>
      )}

      {activeTab === 'Settings' && isOwner && (
        <section className={styles.settings}>
          <Card className={styles.settingsCard}>
            <h2>General</h2>
            <form className={styles.settingsForm} onSubmit={(e) => { e.preventDefault(); handleRename() }}>
              <Input
                label="Repository name"
                value={newRepoName}
                onChange={(e) => setNewRepoName(e.target.value)}
                hint="Letters, numbers, dot, dash and underscore."
                mono
              />
              <Button type="submit" variant="primary" disabled={!newRepoName.trim() || newRepoName === activeRepo?.name}>Rename</Button>
            </form>
          </Card>

          <Card className={styles.settingsCard}>
            <h2>Visibility</h2>
            <p className={styles.settingsText}>
              This repository is <strong>{activeRepo?.is_private ? 'private' : 'public'}</strong>.{' '}
              {activeRepo?.is_private ? 'Only you and collaborators can see it.' : 'Anyone can see its code, issues and pull requests.'}
            </p>
            <div><Button onClick={handleToggleVisibility}>Make {activeRepo?.is_private ? 'public' : 'private'}</Button></div>
          </Card>

          <Card className={`${styles.settingsCard} ${styles.danger}`}>
            <h2>Danger zone</h2>
            <p className={styles.settingsText}>Deleting a repository removes its branches, commits, pull requests and issues. This cannot be undone.</p>
            <div><Button variant="danger" iconLeft={<Trash2 size={15} />} onClick={handleDelete}>Delete this repository</Button></div>
          </Card>
        </section>
      )}

      <NewIssueModal isOpen={isIssueModalOpen} onClose={() => setIsIssueModalOpen(false)} onSuccess={refreshIssues} repoId={id!} />
      <NewPRModal isOpen={isPRModalOpen} onClose={() => setIsPRModalOpen(false)} onSuccess={refreshPRs} repoId={id!} branches={branches} />

      <Modal
        open={!!aiExplanation}
        onClose={() => setAIExplanation(null)}
        side="right"
        title={<span className={styles.aiTitle}><Sparkles size={18} /> AI explanation</span>}
        description={activeFile?.path}
      >
        <div className={styles.markdown}><ReactMarkdown>{aiExplanation || ''}</ReactMarkdown></div>
      </Modal>
    </div>
  )
}
