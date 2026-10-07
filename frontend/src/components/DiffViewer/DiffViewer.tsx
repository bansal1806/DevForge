import { Fragment, useMemo, useState } from 'react'
import * as Diff from 'diff'
import { ChevronDown, ChevronRight, FoldVertical } from 'lucide-react'
import { Badge, Card, EmptyState } from '../ui'
import type { BadgeTone } from '../ui'
import { fileColor } from '../../lib/fileLang'
import styles from './DiffViewer.module.css'

interface DiffFile {
  status: 'added' | 'modified' | 'deleted'
  content: string | null
  originalContent: string | null
}

interface DiffViewerProps {
  diff: Record<string, DiffFile>
}

interface DiffLine {
  type: 'added' | 'deleted' | 'normal'
  content: string
  /** Line number in the old file (null for additions) */
  oldLn: number | null
  /** Line number in the new file (null for deletions) */
  newLn: number | null
}

/** A run of lines to show, or a fold of unchanged lines the reader can expand. */
type Chunk = { kind: 'lines', lines: DiffLine[] } | { kind: 'fold', id: number, lines: DiffLine[] }

/** Unchanged lines kept around every change before folding the rest. */
const CONTEXT = 3

const STATUS_TONE: Record<DiffFile['status'], BadgeTone> = { added: 'success', modified: 'info', deleted: 'danger' }

// Split file content into lines without a phantom empty line after a final newline
function splitLines(text: string) {
  const lines = text.split('\n')
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

function diffLines(file: DiffFile): DiffLine[] {
  const { status, content, originalContent } = file
  if (status === 'added') {
    return splitLines(content || '').map((line, i) => ({ type: 'added', content: line, oldLn: null, newLn: i + 1 }))
  }
  if (status === 'deleted') {
    return splitLines(originalContent || '').map((line, i) => ({ type: 'deleted', content: line, oldLn: i + 1, newLn: null }))
  }

  const result: DiffLine[] = []
  let oldLn = 1
  let newLn = 1
  for (const part of Diff.diffLines(originalContent || '', content || '')) {
    const partLines = part.value.split('\n')
    if (partLines[partLines.length - 1] === '' && part.value.endsWith('\n')) partLines.pop()
    for (const line of partLines) {
      if (part.added) result.push({ type: 'added', content: line, oldLn: null, newLn: newLn++ })
      else if (part.removed) result.push({ type: 'deleted', content: line, oldLn: oldLn++, newLn: null })
      else result.push({ type: 'normal', content: line, oldLn: oldLn++, newLn: newLn++ })
    }
  }
  return result
}

/** Fold unchanged runs that sit further than CONTEXT lines from any change. */
function chunk(lines: DiffLine[]): Chunk[] {
  const keep = lines.map(() => false)
  lines.forEach((line, i) => {
    if (line.type === 'normal') return
    for (let j = Math.max(0, i - CONTEXT); j <= Math.min(lines.length - 1, i + CONTEXT); j++) keep[j] = true
  })

  const chunks: Chunk[] = []
  let i = 0
  while (i < lines.length) {
    const visible = keep[i]
    let j = i
    while (j < lines.length && keep[j] === visible) j++
    const run = lines.slice(i, j)
    // Folding fewer than 4 lines saves nothing — show them
    if (visible || run.length < 4) {
      const last = chunks[chunks.length - 1]
      if (last?.kind === 'lines') last.lines.push(...run)
      else chunks.push({ kind: 'lines', lines: run })
    } else {
      chunks.push({ kind: 'fold', id: i, lines: run })
    }
    i = j
  }
  return chunks
}

export default function DiffViewer({ diff }: DiffViewerProps) {
  const files = useMemo(
    () => Object.entries(diff).map(([path, file]) => {
      const lines = diffLines(file)
      return {
        path,
        file,
        lines,
        additions: lines.filter((l) => l.type === 'added').length,
        deletions: lines.filter((l) => l.type === 'deleted').length,
      }
    }),
    [diff]
  )

  if (files.length === 0) {
    return (
      <Card padding="none">
        <EmptyState title="No file changes" description="The source branch matches the target — there is nothing to review." />
      </Card>
    )
  }

  const additions = files.reduce((n, f) => n + f.additions, 0)
  const deletions = files.reduce((n, f) => n + f.deletions, 0)

  return (
    <div className={styles.container}>
      <div className={styles.summary}>
        <span>
          <strong>{files.length}</strong> file{files.length === 1 ? '' : 's'} changed
        </span>
        <span className={styles.additions}>+{additions}</span>
        <span className={styles.deletions}>−{deletions}</span>
        <DiffBar additions={additions} deletions={deletions} />
      </div>
      {files.map((f) => (
        <FileDiff key={f.path} {...f} />
      ))}
    </div>
  )
}

/** Five-block proportion bar, like a familiar code host — purely decorative. */
function DiffBar({ additions, deletions }: { additions: number, deletions: number }) {
  const total = additions + deletions
  const added = total ? Math.round((additions / total) * 5) : 0
  return (
    <span className={styles.bar} aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < added ? styles.barAdd : total ? styles.barDel : styles.barNone} />
      ))}
    </span>
  )
}

interface FileDiffProps {
  path: string
  file: DiffFile
  lines: DiffLine[]
  additions: number
  deletions: number
}

function FileDiff({ path, file, lines, additions, deletions }: FileDiffProps) {
  const [open, setOpen] = useState(true)
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set())
  const chunks = useMemo(() => chunk(lines), [lines])

  return (
    <section className={styles.file} aria-label={path}>
      <header className={styles.fileHeader}>
        <button className={styles.fileToggle} onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          <span className={styles.fileDot} style={{ background: fileColor(path) }} />
          <span className={styles.fileName}>{path}</span>
        </button>
        <Badge tone={STATUS_TONE[file.status]}>{file.status}</Badge>
        <span className={styles.fileStats}>
          <span className={styles.additions}>+{additions}</span>
          <span className={styles.deletions}>−{deletions}</span>
        </span>
      </header>

      {open && (
        <div className={styles.code} role="table" aria-label={`Changes in ${path}`}>
          {chunks.map((c, ci) => {
            if (c.kind === 'fold' && !expanded.has(c.id)) {
              return (
                <button
                  key={`fold-${c.id}`}
                  className={styles.fold}
                  onClick={() => setExpanded((prev) => new Set(prev).add(c.id))}
                >
                  <FoldVertical size={13} /> Show {c.lines.length} unchanged lines
                </button>
              )
            }
            return (
              <Fragment key={ci}>
                {c.lines.map((line, li) => (
                  <div
                    key={li}
                    role="row"
                    className={`${styles.line} ${line.type === 'added' ? styles.lineAdded : line.type === 'deleted' ? styles.lineDeleted : ''}`}
                  >
                    <span className={styles.ln} role="cell">{line.oldLn ?? ''}</span>
                    <span className={styles.ln} role="cell">{line.newLn ?? ''}</span>
                    <span className={styles.content} role="cell">
                      <span className={styles.prefix} aria-hidden="true">
                        {line.type === 'added' ? '+' : line.type === 'deleted' ? '−' : ' '}
                      </span>
                      <span className="sr-only">{line.type === 'added' ? 'Added: ' : line.type === 'deleted' ? 'Removed: ' : ''}</span>
                      {line.content}
                    </span>
                  </div>
                ))}
              </Fragment>
            )
          })}
        </div>
      )}
    </section>
  )
}
