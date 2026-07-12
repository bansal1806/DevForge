import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Variants } from 'framer-motion'
import { useParams, Link, useNavigate } from 'react-router-dom'
import Editor from '@monaco-editor/react'
import socket from '../../lib/socket'
import { useStore } from '../../store/useStore'
import { supabase } from '../../lib/supabase'
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
  getRepoMetrics
} from '../../lib/api'
import type { FileNode, Issue, PullRequest, ExecutionResult, ExecutionStat } from '../../lib/api'
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie 
} from 'recharts'
import {
  Code2,
  GitPullRequest,
  Bug,
  Shield,
  Settings,
  GitBranch,
  ChevronDown,
  ChevronRight,
  Folder,
  FileText,
  Star,
  Terminal,
  Loader2,
  Play,
  Save,
  GitCommitHorizontal,
  X,
  Plus,
  Sparkles,
  Users,
  Activity,
  LineChart as LineChartIcon,
  Clock,
  PieChart as PieChartIcon
} from 'lucide-react'
import styles from './RepoView.module.css'
import NewIssueModal from '../../components/Modals/NewIssueModal'
import NewPRModal from '../../components/Modals/NewPRModal'

const tabDefs = [
  { icon: Code2, label: 'Code' },
  { icon: Bug, label: 'Issues' },
  { icon: GitPullRequest, label: 'Pull Requests' },
  { icon: LineChartIcon, label: 'Insights' },
  { icon: Settings, label: 'Settings' },
]

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.04 } },
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
}

interface TreeNode {
  name: string;
  path: string;
  isFolder: boolean;
  children: TreeNode[];
  id?: string;
  updated_at?: string;
}

interface PresenceUser {
  id: string;
  name: string;
  color: string;
}

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
  const [activeUsers, setActiveUsers] = useState<PresenceUser[]>([])
  
  // Execution State
  const [isRunning, setIsRunning] = useState(false)
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null)
  const [showTerminal, setShowTerminal] = useState(false)
  const [repoMetrics, setRepoMetrics] = useState<ExecutionStat[]>([])

  // Editing / Versioning State
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isCommitting, setIsCommitting] = useState(false)
  const [commitMessage, setCommitMessage] = useState('')
  const [showCommitBox, setShowCommitBox] = useState(false)
  const [isStarring, setIsStarring] = useState(false)

  useEffect(() => {
    if (activeRepo) setNewRepoName(activeRepo.name)
  }, [activeRepo])

  const handleRename = async () => {
    if (!activeRepo || !newRepoName.trim() || newRepoName === activeRepo.name) return
    try {
      const updated = await updateRepository(activeRepo.id, { name: newRepoName })
      if (updated) {
        alert('Repository renamed successfully.')
        window.location.reload()
      }
    } catch (err) {
      console.error(err)
      alert('Failed to rename repository.')
    }
  }

  const handleDelete = async () => {
    if (!activeRepo) return
    const confirmed = window.confirm(`Are you absolutely sure you want to delete ${activeRepo.name}? This action cannot be undone.`)
    if (confirmed) {
      try {
        await deleteRepository(activeRepo.id)
        navigate('/dashboard')
      } catch (err) {
        console.error(err)
        alert('Failed to delete repository.')
      }
    }
  }
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['']))
  const branchRef = useRef<HTMLDivElement>(null)

  const toggleFolder = (path: string) => {
    const newExpanded = new Set(expandedFolders)
    if (newExpanded.has(path)) {
      newExpanded.delete(path)
    } else {
      newExpanded.add(path)
    }
    setExpandedFolders(newExpanded)
  }

  // Save the active file's content to the current branch
  const handleSave = async () => {
    if (!activeFile || !id || !activeBranch) return
    setIsSaving(true)
    try {
      await saveFile(id, activeBranch.id, activeFile.path, activeFile.content || '')
      setIsDirty(false)
      showNotification('File saved. Commit your changes to record them in history.')
      setFiles(files.map(f => (f.id === activeFile.id ? { ...f, content: activeFile.content } : f)))
    } catch (err) {
      console.error(err)
      showNotification('Error: failed to save file.')
    } finally {
      setIsSaving(false)
    }
  }

  // Commit the current branch state (snapshots power PR diffs)
  const handleCommit = async () => {
    if (!id || !activeBranch || !commitMessage.trim()) return
    setIsCommitting(true)
    try {
      if (isDirty && activeFile) {
        await saveFile(id, activeBranch.id, activeFile.path, activeFile.content || '')
        setIsDirty(false)
      }
      await createCommit(id, activeBranch.id, commitMessage.trim())
      setCommitMessage('')
      setShowCommitBox(false)
      showNotification('Changes committed.')
    } catch (err) {
      console.error(err)
      showNotification('Error: failed to commit changes.')
    } finally {
      setIsCommitting(false)
    }
  }

  const handleNewBranch = async () => {
    if (!id) return
    const name = window.prompt('New branch name (branched from ' + (activeBranch?.name || 'default') + '):')
    if (!name || !name.trim()) return
    try {
      const branch = await createBranch(id, name.trim(), activeBranch?.id)
      const updated = await getBranches(id)
      setBranches(updated)
      setActiveBranch(branch)
      setIsBranchOpen(false)
      showNotification(`Branch "${branch.name}" created.`)
    } catch (err: any) {
      showNotification(err.response?.data?.error || 'Error: failed to create branch.')
    }
  }

  const handleToggleStar = async () => {
    if (!id || !activeRepo || isStarring) return
    setIsStarring(true)
    try {
      const result = await toggleStar(id)
      setActiveRepo({ ...activeRepo, starred_by_me: result.starred, stars_count: result.stars_count })
    } catch (err) {
      console.error(err)
    } finally {
      setIsStarring(false)
    }
  }

  const handleNewFile = async () => {
    if (!id || !activeBranch) return
    const path = window.prompt('New file path (e.g. src/main.py):')
    if (!path || !path.trim()) return
    try {
      const file = await saveFile(id, activeBranch.id, path.trim(), '')
      const updated = await getFiles(id, activeBranch.id)
      setFiles(updated)
      const created = updated.find(f => f.path === file.path)
      if (created) setActiveFile(created)
      showNotification(`Created ${file.path}.`)
    } catch (err: any) {
      showNotification(err.response?.data?.error || 'Error: failed to create file.')
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
      showNotification('Error: AI explanation failed.')
    } finally {
      setIsAIExplaining(false)
    }
  }

  const handleRun = async () => {
    if (!activeFile || !id) return
    setIsRunning(true)
    setShowTerminal(true)
    setExecutionResult(null)

    try {
      // Persist unsaved edits first so what runs is what's on screen
      if (isDirty && activeBranch) {
        await saveFile(id, activeBranch.id, activeFile.path, activeFile.content || '')
        setIsDirty(false)
      }
      const result = await runFile(id, activeFile.path)
      setExecutionResult(result)
    } catch (err: any) {
      setExecutionResult({
        stdout: '',
        stderr: err.response?.data?.error || 'Execution failed to start.',
        exitCode: 1
      })
    } finally {
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

        // Fetch Issues & PRs for this repo
        const [issuesData, prsData] = await Promise.all([
          getRepoIssues(id!),
          getRepoPullRequests(id!)
        ])
        setRepoIssues(issuesData)
        setRepoPRs(prsData)

        // Socket logic with user info
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          socket.connect()
          socket.emit('join-room', id, { 
            id: user.id, 
            name: user.email?.split('@')[0] || 'User',
            color: `hsl(${Math.random() * 360}, 70%, 50%)`
          })
        }

        // Fetch Metrics
        const metricsRes = await getRepoMetrics(id!)
        setRepoMetrics(metricsRes)

      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    init()
    
    return () => {
      socket.disconnect()
      setActiveRepo(null)
      setActiveFile(null)
    }
  }, [id, setActiveRepo, setBranches, setActiveBranch, setActiveFile, setLoading])

  const refreshIssues = async () => {
    const issuesData = await getRepoIssues(id!)
    setRepoIssues(issuesData)
  }

  const refreshPRs = async () => {
    const prsData = await getRepoPullRequests(id!)
    setRepoPRs(prsData)
  }

  // 2. Fetch Files when activeBranch changes
  useEffect(() => {
    if (!id || !activeBranch) return

    getFiles(id, activeBranch.id).then((fileData) => {
      setFiles(fileData)
      setIsDirty(false)
    })
  }, [id, activeBranch?.id, setFiles])

  // 3. Socket listeners
  useEffect(() => {
    socket.on('file-sync', (content: string) => {
      if (activeFile) {
        setActiveFile({ ...activeFile, content })
      }
    })

    socket.on('room-users', (users: PresenceUser[]) => {
      setActiveUsers(users)
    })

    return () => {
      socket.off('file-sync')
      socket.off('room-users')
    }
  }, [activeFile, setActiveFile])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (branchRef.current && !branchRef.current.contains(event.target as Node)) {
        setIsBranchOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const [notification, setNotification] = useState<string | null>(null)

  const showNotification = (msg: string) => {
    setNotification(msg)
    setTimeout(() => setNotification(null), 3000)
  }

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined && activeFile) {
      setActiveFile({ ...activeFile, content: value })
      setIsDirty(true)
      socket.emit('file-change', { roomId: id, content: value })
    }
  }

  const monacoLanguage = (() => {
    const ext = activeFile?.path.split('.').pop()?.toLowerCase()
    switch (ext) {
      case 'ts': case 'tsx': return 'typescript'
      case 'js': case 'jsx': case 'mjs': case 'cjs': return 'javascript'
      case 'py': return 'python'
      case 'cpp': case 'cc': case 'cxx': case 'h': case 'hpp': return 'cpp'
      case 'json': return 'json'
      case 'md': return 'markdown'
      case 'css': return 'css'
      case 'html': return 'html'
      case 'yml': case 'yaml': return 'yaml'
      case 'sql': return 'sql'
      case 'sh': return 'shell'
      default: return 'plaintext'
    }
  })()

  // Build file tree
  const buildTree = (files: FileNode[]): TreeNode[] => {
    const root: TreeNode[] = []
    files.forEach(file => {
      const parts = file.path.split('/')
      let currentLevel = root
      let currentPath = ''

      parts.forEach((part, index) => {
        currentPath = currentPath ? `${currentPath}/${part}` : part
        const isLast = index === parts.length - 1
        let node = currentLevel.find(n => n.name === part)

        if (!node) {
          node = {
            name: part,
            path: currentPath,
            isFolder: !isLast,
            children: [],
            id: isLast ? file.id : undefined,
            updated_at: isLast ? file.updated_at : undefined
          }
          currentLevel.push(node)
        }
        currentLevel = node.children
      })
    })
    return root.sort((a, b) => {
      if (a.isFolder === b.isFolder) return a.name.localeCompare(b.name)
      return a.isFolder ? -1 : 1
    })
  }

  const renderTree = (nodes: TreeNode[], depth = 0) => {
    return nodes.map(node => {
      const isExpanded = expandedFolders.has(node.path)
      const isActive = activeFile?.id === node.id

      return (
        <div key={node.path}>
          <motion.div 
            className={`${styles['file-tree-item']} ${isActive ? styles['file-tree-item--active'] : ''}`}
            style={{ paddingLeft: `${depth * 12 + 12}px`, cursor: 'pointer' }}
            onClick={() => {
              if (node.isFolder) {
                toggleFolder(node.path)
              } else {
                const file = files.find(f => f.id === node.id)
                if (file) {
                  setActiveFile(file)
                  setIsDirty(false)
                  setAIExplanation(null) // Reset AI box for NEW file
                }
              }
            }}
            variants={itemVariants}
          >
            <div className={styles['file-tree-item-main']}>
              {node.isFolder ? (
                <>
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <Folder size={16} className={`${styles['file-tree-item-icon']} ${styles['file-tree-item-icon--folder']}`} />
                </>
              ) : (
                <FileText size={16} className={styles['file-tree-item-icon']} />
              )}
              <span className={`${styles['file-tree-item-name']} ${node.isFolder ? styles['file-tree-item-name--folder'] : ''}`}>
                {node.name}
              </span>
            </div>
            {!node.isFolder && (
              <>
                <span className={styles['file-tree-item-msg']}>Updates</span>
                <span className={styles['file-tree-item-time']}>{node.updated_at ? new Date(node.updated_at).toLocaleDateString() : ''}</span>
              </>
            )}
          </motion.div>
          {node.isFolder && isExpanded && (
            <div>{renderTree(node.children, depth + 1)}</div>
          )}
        </div>
      )
    })
  }

  const treeData = buildTree(files)

  return (
    <div className={styles['repo-view']}>
      {/* Header */}
      <motion.div
        className={styles['repo-view-header']}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
      >
        <div className={styles['repo-view-header-top']}>
          <div className={styles['repo-view-breadcrumb']}>
            <Link to="/dashboard">Developer</Link> / <span style={{ color: 'var(--accent-neon)', fontWeight: 600 }}>{activeRepo?.name || id}</span>
          </div>
          
          <div className={styles['presence-indicator']}>
            <Users size={16} />
            <div className={styles['presence-stack']}>
              {activeUsers.map(user => (
                <div 
                  key={user.id} 
                  className={styles['presence-avatar']} 
                  style={{ backgroundColor: user.color }}
                  title={user.name}
                >
                  {user.name.charAt(0).toUpperCase()}
                </div>
              ))}
              {activeUsers.length === 0 && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Only you</span>}
            </div>
          </div>
        </div>

        <h1 className={styles['repo-view-title']}>
          {activeRepo?.name || 'Loading repository...'}
          <span className={styles['repo-view-visibility']}>{activeRepo?.is_private ? 'Private' : 'Public'}</span>
        </h1>
        <p className={styles['repo-view-desc']}>
          {activeRepo?.description || 'No description provided.'}
        </p>
      </motion.div>

      {/* Tabs */}
      <motion.div
        className={styles['repo-tabs']}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.15 }}
      >
        {tabDefs.map((tab) => {
          const badge =
            tab.label === 'Issues' ? repoIssues.filter(i => i.status === 'open').length :
            tab.label === 'Pull Requests' ? repoPRs.filter(p => p.status === 'open').length :
            null
          return (
            <button
              key={tab.label}
              className={`${styles['repo-tab']} ${activeTab === tab.label ? styles['repo-tab--active'] : ''}`}
              onClick={() => setActiveTab(tab.label)}
            >
              <tab.icon size={16} />
              {tab.label}
              {badge !== null && badge > 0 && <span className={styles['repo-tab-badge']}>{badge}</span>}
            </button>
          )
        })}
      </motion.div>

      {/* Main Layout */}
      <div className={styles['repo-layout']}>
        {/* Left: Branch + File Tree */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          {/* Branch Bar */}
          <div className={styles['branch-bar']}>
            <div style={{ position: 'relative' }} ref={branchRef}>
              <button 
                className={styles['branch-selector']}
                onClick={() => setIsBranchOpen(!isBranchOpen)}
              >
                <GitBranch size={14} />
                {activeBranch?.name || 'main'}
                <ChevronDown size={14} />
              </button>
              
              <AnimatePresence>
                {isBranchOpen && (
                  <motion.div 
                    className="dropdown-menu" 
                    style={{ left: 0, right: 'auto', transformOrigin: 'top left', minWidth: '180px' }}
                    initial={{ opacity: 0, scale: 0.95, y: -5 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -5 }}
                  >
                    <div style={{ padding: '8px 12px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Switch branches</div>
                    <div className="dropdown-divider" />
                    {branches.map((b) => (
                      <button 
                        key={b.id} 
                        className={`dropdown-item ${activeBranch?.id === b.id ? 'active' : ''}`} 
                        onClick={() => { setActiveBranch(b); setIsBranchOpen(false) }}
                      >
                        {b.name} {b.is_default && '(default)'}
                      </button>
                    ))}
                    {branches.length === 0 && <div style={{ padding: '8px 12px', fontSize: '0.8rem', color: 'var(--text-muted)'}}>No branches found.</div>}
                    <div className="dropdown-divider" />
                    <button className="dropdown-item" onClick={handleNewBranch}>
                      + New branch
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className={styles['branch-bar-actions']}>
              <motion.button className="btn-ghost" whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} onClick={handleNewFile}>
                <Plus size={14} /> New file
              </motion.button>
              <motion.button className="btn-ghost" whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} onClick={() => setShowCommitBox(!showCommitBox)}>
                <GitCommitHorizontal size={14} /> Commit
              </motion.button>
            </div>
          </div>

          {/* Commit Box */}
          <AnimatePresence>
            {showCommitBox && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{ display: 'flex', gap: '8px', padding: '10px 0', alignItems: 'center' }}
              >
                <input
                  className={styles['settings-input']}
                  style={{ flex: 1 }}
                  placeholder="Commit message (e.g. Add sorting to leaderboard)"
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCommit() }}
                />
                <motion.button
                  className="btn-ghost"
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={handleCommit}
                  disabled={isCommitting || !commitMessage.trim()}
                >
                  {isCommitting ? <Loader2 size={14} className="animate-spin" /> : <GitCommitHorizontal size={14} />}
                  Commit to {activeBranch?.name || 'branch'}
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Notification Toast */}
          <AnimatePresence>
            {notification && (
              <motion.div 
                initial={{ opacity: 0, y: 50 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0, y: 50 }}
                className={styles['notification-toast']}
              >
                {notification}
              </motion.div>
            )}
          </AnimatePresence>

          <NewIssueModal
            isOpen={isIssueModalOpen}
            onClose={() => setIsIssueModalOpen(false)}
            onSuccess={refreshIssues}
            repoId={id!}
          />

          <NewPRModal
            isOpen={isPRModalOpen}
            onClose={() => setIsPRModalOpen(false)}
            onSuccess={refreshPRs}
            repoId={id!}
            branches={branches}
          />

          {/* dynamic Tab Content */}
          {activeTab === 'Code' ? (
            <div className={styles['code-editor-wrapper']}>
              <div className={styles['file-explorer-container']}>
                <div className={styles['file-tree']}>
                  <div className={styles['file-tree-header']}>
                    <GitBranch size={14} />
                    <span className={styles['file-tree-commit-msg']}>Real-time sync active</span>
                    <span className={styles['file-tree-commit-time']}>Just now</span>
                  </div>
                  <motion.div variants={containerVariants} initial="hidden" animate="visible">
                    {loading ? (
                      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading files...</div>
                    ) : files.length === 0 ? (
                      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>This repository is empty.</div>
                    ) : (
                      renderTree(treeData)
                    )}
                  </motion.div>
                </div>

                {/* Monaco Editor Overlay/Pane */}
                <AnimatePresence mode="wait">
                  {activeFile && (
                    <motion.div 
                      className={styles['editor-pane']}
                      key={activeFile.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                    >
                      <div className={styles['editor-header']}>
                        <div className={styles['editor-title']}>
                          <FileText size={14} />
                          {activeFile.path}
                        </div>
                        <div className={styles['editor-actions']}>
                          <motion.button
                            className={styles['ai-action-btn']}
                            onClick={handleSave}
                            disabled={isSaving || !isDirty}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            title={isDirty ? 'Save changes to this branch' : 'No unsaved changes'}
                          >
                            {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                            {isDirty ? 'Save*' : 'Saved'}
                          </motion.button>

                          <motion.button
                            className={styles['ai-action-btn']}
                            onClick={handleAIExplain}
                            disabled={isAIExplaining}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            {isAIExplaining ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                            AI Explain
                          </motion.button>
                          
                          <motion.button 
                             className={`${styles['ai-action-btn']} ${styles['run-btn']}`}
                             onClick={handleRun}
                             disabled={isRunning}
                             whileHover={{ scale: 1.05 }}
                             whileTap={{ scale: 0.95 }}
                           >
                             {isRunning ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                             Run
                           </motion.button>

                          <button className={styles['editor-close']} onClick={() => setActiveFile(null)}>
                            <X size={16} />
                          </button>
                        </div>
                      </div>
                      <div className={styles['editor-body-wrapper']}>
                        <div className={styles['editor-body']}>
                          <Editor
                            height="100%"
                            theme="vs-dark"
                            language={monacoLanguage}
                            value={activeFile.content ?? ''}
                            onChange={handleEditorChange}
                            options={{
                              minimap: { enabled: false },
                              fontSize: 14,
                              lineNumbers: 'on',
                              roundedSelection: true,
                              fontFamily: 'JetBrains Mono, monospace',
                              padding: { top: 16, bottom: 16 },
                              scrollBeyondLastLine: false,
                              smoothScrolling: true,
                              cursorBlinking: 'smooth',
                              cursorSmoothCaretAnimation: 'on',
                            }}
                          />
                        </div>

                        {/* Execution Terminal */}
                        <AnimatePresence>
                          {showTerminal && (
                            <motion.div 
                              className={styles['terminal-panel']}
                              initial={{ height: 0 }}
                              animate={{ height: 250 }}
                              exit={{ height: 0 }}
                            >
                              <div className={styles['terminal-header']}>
                                <div className={styles['terminal-title']}>
                                  <Terminal size={14} /> Terminal Output
                                </div>
                                <div className={styles['terminal-actions']}>
                                  <button onClick={() => setExecutionResult(null)}>Clear</button>
                                  <button onClick={() => setShowTerminal(false)}><X size={14} /></button>
                                </div>
                              </div>
                              <div className={styles['terminal-body']}>
                                {isRunning && (
                                  <div className={styles['terminal-loading']}>
                                    <Loader2 size={16} className="animate-spin" />
                                    Executing environment...
                                  </div>
                                )}
                                {executionResult && (
                                  <pre className={styles['terminal-pre']}>
                                    {executionResult.stdout && <div className={styles['stdout']}>{executionResult.stdout}</div>}
                                    {executionResult.stderr && <div className={styles['stderr']}>{executionResult.stderr}</div>}
                                    <div className={styles['exit-line']}>
                                      Process exited with code {executionResult.exitCode}
                                    </div>
                                  </pre>
                                )}
                                {!isRunning && !executionResult && (
                                  <div className={styles['terminal-empty']}>Ready for execution. Click "Run" to start.</div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {/* AI Explanation Drawer */}
                        <AnimatePresence>
                          {aiExplanation && (
                            <motion.div 
                              className={styles['ai-explanation-drawer']}
                              initial={{ y: '100%' }}
                              animate={{ y: 0 }}
                              exit={{ y: '100%' }}
                            >
                              <div className={styles['ai-drawer-header']}>
                                <div className={styles['ai-drawer-title']}>
                                  <Sparkles size={16} /> AI Code Analysis
                                </div>
                                <button onClick={() => setAIExplanation(null)}><X size={16} /></button>
                              </div>
                              <div className={styles['ai-drawer-content']}>
                                {aiExplanation}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          ) : activeTab === 'Issues' ? (
            <div className={styles['tab-content-list']}>
              <div className={styles['tab-list-header']}>
                <h3 className={styles['tab-list-title']}>Issues</h3>
                <motion.button 
                  className={styles['new-item-btn']}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setIsIssueModalOpen(true)}
                >
                  <Plus size={16} /> New Issue
                </motion.button>
              </div>

              {repoIssues.length === 0 ? (
                <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>No issues found.</div>
              ) : (
                repoIssues.map((issue, i) => (
                  <motion.div key={issue.id} custom={i} variants={itemVariants} initial="hidden" animate="visible">
                    <Link to={`/repo/${id}/issues/${issue.id}`} className={styles['tab-list-item']}>
                      <Bug size={18} style={{ color: issue.status === 'open' ? 'var(--accent-amber)' : 'var(--accent-purple)' }} />
                      <div className={styles['tab-list-item-content']}>
                        <div className={styles['tab-list-item-title']}>{issue.title} <span style={{ color: 'var(--text-muted)' }}>#{issue.id.slice(0, 8)}</span></div>
                        <div className={styles['tab-list-item-meta']}>
                          opened {new Date(issue.created_at).toLocaleDateString()} by 
                          <span className={styles['author-link']}>{issue.author?.name || 'Developer'}</span>
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                ))
              )}
            </div>
          ) : activeTab === 'Pull Requests' ? (
            <div className={styles['tab-content-list']}>
              <div className={styles['tab-list-header']}>
                <h3 className={styles['tab-list-title']}>Pull Requests</h3>
                <motion.button 
                  className={styles['new-item-btn']}
                  style={{ background: 'linear-gradient(135deg, #10b981 0%, #3b82f6 100%)' }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setIsPRModalOpen(true)}
                >
                  <Plus size={16} /> New PR
                </motion.button>
              </div>

              {repoPRs.length === 0 ? (
                <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>No pull requests found.</div>
              ) : (
                repoPRs.map((pr, i) => (
                  <motion.div key={pr.id} custom={i} variants={itemVariants} initial="hidden" animate="visible">
                    <Link to={`/repo/${id}/pull-requests/${pr.id}`} className={styles['tab-list-item']}>
                      <GitPullRequest size={18} style={{ color: pr.status === 'open' ? 'var(--accent-emerald)' : 'var(--accent-purple)' }} />
                      <div className={styles['tab-list-item-content']}>
                        <div className={styles['tab-list-item-title']}>{pr.title} <span style={{ color: 'var(--text-muted)' }}>#{pr.id.slice(0, 8)}</span></div>
                        <div className={styles['tab-list-item-meta']}>
                          opened {new Date(pr.created_at).toLocaleDateString()} by 
                          <span className={styles['author-link']}>{pr.author?.name || 'Developer'}</span>
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                ))
              )}
            </div>
          ) : activeTab === 'Insights' ? (
            <div className={styles['tab-content-list']}>
              <div className={styles['tab-list-header']}>
                <h3 className={styles['tab-list-title']}>Repository Insights</h3>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  <Activity size={14} style={{ marginRight: 6 }} /> 
                  {repoMetrics.length} total executions
                </div>
              </div>

              <div className={styles['insights-grid']}>
                <div className={styles['insights-card']}>
                   <div className={styles['insights-card-header']}>
                      <Clock size={16} color="var(--accent-neon)" /> Performance History (Success vs Error)
                   </div>
                   <div style={{ width: '100%', height: 250, marginTop: 20 }}>
                     <ResponsiveContainer>
                       <AreaChart data={repoMetrics.slice(-10) as any[]}>
                         <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                         <XAxis 
                           dataKey="created_at" 
                           stroke="var(--text-muted)" 
                           tick={{ fontSize: 10 }} 
                           tickFormatter={(str) => new Date(str).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                         />
                         <YAxis stroke="var(--text-muted)" tick={{ fontSize: 10 }} />
                         <Tooltip 
                            contentStyle={{ background: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                            itemStyle={{ fontSize: '10px' }}
                         />
                         <Area type="monotone" dataKey="duration" stroke="var(--accent-neon)" fill="rgba(0, 255, 242, 0.1)" strokeWidth={2} />
                       </AreaChart>
                     </ResponsiveContainer>
                   </div>
                </div>

                <div className={styles['insights-card']}>
                   <div className={styles['insights-card-header']}>
                      <PieChartIcon size={16} color="var(--accent-purple)" /> Language Distribution
                   </div>
                   <div style={{ width: '100%', height: 250, marginTop: 20 }}>
                     <ResponsiveContainer>
                       <PieChart>
                         <Pie
                           data={(() => {
                             const langs: any = {}
                             repoMetrics.forEach(m => {
                               if (!langs[m.language]) langs[m.language] = { name: m.language, value: 0 }
                               langs[m.language].value++
                             })
                             return Object.values(langs)
                           })() as any[]}
                           cx="50%"
                           cy="50%"
                           innerRadius={40}
                           outerRadius={60}
                           paddingAngle={4}
                           dataKey="value"
                         >
                            <Cell fill="var(--accent-neon)" />
                            <Cell fill="var(--accent-purple)" />
                            <Cell fill="var(--accent-amber)" />
                         </Pie>
                         <Tooltip />
                       </PieChart>
                     </ResponsiveContainer>
                   </div>
                </div>
              </div>

              <div className={styles['audit-list']}>
                <h4 style={{ fontSize: '0.9rem', marginBottom: 16, color: 'var(--text-secondary)' }}>Recent Activity</h4>
                {repoMetrics.slice(-5).reverse().map((m, i) => (
                  <div key={i} className={styles['audit-list-item']}>
                    <div className={styles['audit-list-dot']} style={{ backgroundColor: m.status === 'success' ? '#10b981' : '#ef4444' }} />
                    <div style={{ flex: 1 }}>
                       Run <strong>{m.language}</strong> 
                       <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{m.duration}ms</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {new Date(m.created_at).toLocaleString()}
                    </div>
                  </div>
                ))}
                {repoMetrics.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No execution metrics recorded yet.</div>}
              </div>
            </div>
          ) : activeTab === 'Settings' ? (
            <motion.div 
              className={styles['settings-pane']}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className={styles['settings-card']}>
                <div className={styles['settings-card-title']}>General</div>
                <div className={styles['settings-form-group']}>
                  <label>Repository Name</label>
                  <input 
                    className={styles['settings-input']} 
                    value={newRepoName}
                    onChange={(e) => setNewRepoName(e.target.value)}
                  />
                  <button className={styles['settings-save-btn']} onClick={handleRename}>Save Changes</button>
                </div>
              </div>

              <div className={`${styles['settings-card']} ${styles['danger-zone']}`}>
                <div className={styles['settings-card-title']}>Danger Zone</div>
                <button className={styles['delete-btn']} onClick={handleDelete}>Delete this repository</button>
              </div>
            </motion.div>
          ) : (
            <div className={styles['coming-soon']}>
              <Terminal size={40} />
              <p>{activeTab} module is being initialized...</p>
            </div>
          )}
        </motion.div>

        {/* Right Panel */}
        <motion.div
          className={styles['repo-about']}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <div className={styles['repo-about-card']}>
            <div className={styles['repo-about-title']}>About</div>
            <p className={styles['repo-about-text']}>{activeRepo?.description || 'Build something amazing.'}</p>
          </div>

          <div className={styles['repo-about-card']}>
            <div className={styles['repo-about-title']}>Health & Insights</div>
            <div className={styles['repo-stats-grid']}>
              <button
                className={styles['stat-item']}
                onClick={handleToggleStar}
                disabled={isStarring}
                style={{ cursor: 'pointer', background: 'none', border: 'none', color: 'inherit', font: 'inherit', padding: 0, display: 'flex', alignItems: 'center', gap: 'inherit' }}
                title={activeRepo?.starred_by_me ? 'Unstar this repository' : 'Star this repository'}
              >
                <Star size={14} fill={activeRepo?.starred_by_me ? 'currentColor' : 'none'} style={{ color: activeRepo?.starred_by_me ? '#eab308' : 'inherit' }} />
                <span>{activeRepo?.stars_count || 0} Stars</span>
              </button>
              <div className={styles['stat-item']}>
                <GitBranch size={14} />
                <span>{branches.length} Branches</span>
              </div>
              <div className={styles['stat-item']}>
                <Shield size={14} style={{ color: 'var(--accent-emerald)' }} />
                <span>{activeRepo?.is_private ? 'Private' : 'Public'}</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}

