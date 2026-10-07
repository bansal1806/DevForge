import { useMemo, useState } from 'react'
import { ChevronRight, FileCode2, FileJson, FileText, Folder, FolderOpen } from 'lucide-react'
import type { FileNode } from '../../lib/api'
import { fileColor } from '../../lib/fileLang'
import styles from './FileTree.module.css'

interface TreeNode {
  name: string
  path: string
  file?: FileNode
  children: TreeNode[]
}

function FileIcon({ path }: { path: string }) {
  const ext = path.split('.').pop()?.toLowerCase() || ''
  const color = fileColor(path)
  if (ext === 'json') return <FileJson size={15} className={styles.icon} color={color} />
  if (ext === 'md' || ext === 'txt') return <FileText size={15} className={styles.icon} color={color} />
  return <FileCode2 size={15} className={styles.icon} color={color} />
}

function buildTree(files: FileNode[]): TreeNode[] {
  const root: TreeNode[] = []
  for (const file of files) {
    const parts = file.path.split('/')
    let level = root
    parts.forEach((part, i) => {
      const path = parts.slice(0, i + 1).join('/')
      let node = level.find((n) => n.name === part)
      if (!node) {
        node = { name: part, path, children: [], file: i === parts.length - 1 ? file : undefined }
        level.push(node)
      }
      level = node.children
    })
  }
  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => (!!a.file === !!b.file ? a.name.localeCompare(b.name) : a.file ? 1 : -1))
    nodes.forEach((n) => sort(n.children))
    return nodes
  }
  return sort(root)
}

interface FileTreeProps {
  files: FileNode[]
  activePath?: string | null
  dirtyPath?: string | null
  onOpen: (file: FileNode) => void
}

/** Repository file explorer: folders first, language-colored icons, keyboard accessible. */
export function FileTree({ files, activePath, dirtyPath, onOpen }: FileTreeProps) {
  const tree = useMemo(() => buildTree(files), [files])
  // Top-level folders start expanded; the rest open on demand
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())

  const toggle = (path: string) => {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const render = (nodes: TreeNode[], depth: number) =>
    nodes.map((node) => {
      const isFolder = !node.file
      // Folders below the top level start collapsed (the set stores toggled paths)
      const expanded = isFolder && (depth === 0 ? !collapsed.has(node.path) : collapsed.has(node.path))
      const active = node.file && node.file.path === activePath
      return (
        <li key={node.path}>
          <button
            type="button"
            className={`${styles.row} ${active ? styles.active : ''}`}
            style={{ paddingLeft: 8 + depth * 14 }}
            onClick={() => (isFolder ? toggle(node.path) : onOpen(node.file!))}
            aria-expanded={isFolder ? expanded : undefined}
            aria-current={active ? 'true' : undefined}
            title={node.path}
          >
            {isFolder ? (
              <>
                <ChevronRight size={13} className={`${styles.chevron} ${expanded ? styles.open : ''}`} />
                {expanded ? <FolderOpen size={15} className={`${styles.icon} ${styles.folderIcon}`} /> : <Folder size={15} className={`${styles.icon} ${styles.folderIcon}`} />}
              </>
            ) : (
              <>
                <span style={{ width: 13 }} />
                <FileIcon path={node.path} />
              </>
            )}
            <span className={`${styles.name} ${isFolder ? styles.folderName : ''}`}>{node.name}</span>
            {node.file && node.file.path === dirtyPath && <span className={styles.dirty} aria-label="Unsaved changes" />}
          </button>
          {isFolder && expanded && <ul className={styles.tree} style={{ padding: 0 }}>{render(node.children, depth + 1)}</ul>}
        </li>
      )
    })

  return <ul className={styles.tree} aria-label="Files">{render(tree, 0)}</ul>
}
