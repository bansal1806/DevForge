import { useMemo } from 'react'
import * as Diff from 'diff'
import { FileCode } from 'lucide-react'
import styles from './DiffViewer.module.css'

interface DiffFile {
  status: 'added' | 'modified' | 'deleted'
  content: string | null
  originalContent: string | null
}

interface DiffViewerProps {
  diff: Record<string, DiffFile>
}

export default function DiffViewer({ diff }: DiffViewerProps) {
  const filePaths = useMemo(() => Object.keys(diff), [diff])

  if (filePaths.length === 0) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border-glass)', borderRadius: '12px' }}>
        No changes detected in this pull request.
      </div>
    )
  }

  return (
    <div className={styles['diff-container']}>
      {filePaths.map((path) => (
        <FileDiff key={path} path={path} file={diff[path]} />
      ))}
    </div>
  )
}

function FileDiff({ path, file }: { path: string, file: DiffFile }) {
  const lines = useMemo(() => {
    const { status, content, originalContent } = file
    
    if (status === 'added') {
      return (content || '').split('\n').map((line, i) => ({
        type: 'added' as const,
        content: line,
        ln: i + 1
      }))
    }
    
    if (status === 'deleted') {
      return (originalContent || '').split('\n').map((line, i) => ({
        type: 'deleted' as const,
        content: line,
        ln: i + 1
      }))
    }
    
    if (status === 'modified') {
      const changes = Diff.diffLines(originalContent || '', content || '')
      const result: { type: 'added' | 'deleted' | 'normal', content: string, lnSource?: number, lnTarget?: number }[] = []
      
      let lnS = 1
      let lnT = 1
      
      changes.forEach((part) => {
        const partLines = part.value.split('\n')
        // Remove empty line at the end if it exists from split
        if (partLines[partLines.length - 1] === '' && part.value.endsWith('\n')) {
          partLines.pop()
        }
        
        partLines.forEach((line) => {
          if (part.added) {
            result.push({ type: 'added', content: line, lnTarget: lnT++ })
          } else if (part.removed) {
            result.push({ type: 'deleted', content: line, lnSource: lnS++ })
          } else {
            result.push({ type: 'normal', content: line, lnSource: lnS++, lnTarget: lnT++ })
          }
        })
      })
      
      return result
    }
    
    return []
  }, [file])

  const stats = useMemo(() => {
    const additions = lines.filter(l => l.type === 'added').length
    const deletions = lines.filter(l => l.type === 'deleted').length
    return { additions, deletions }
  }, [lines])

  return (
    <div className={styles['file-diff']}>
      <div className={styles['file-header']}>
        <div className={styles['file-info']}>
          <FileCode size={16} className={styles['meta-text']} />
          <span className={styles['file-name']}>{path}</span>
        </div>
        <div className={styles['diff-stats']}>
          <span className={styles['addition-count']}>+{stats.additions}</span>
          <span className={styles['deletion-count']}>-{stats.deletions}</span>
        </div>
      </div>
      
      <div className={styles['diff-code']}>
        {lines.map((line, i) => (
          <div 
            key={i} 
            className={`${styles['diff-line']} ${line.type === 'added' ? styles['line--added'] : line.type === 'deleted' ? styles['line--deleted'] : ''}`}
          >
            <div className={styles['line-number']}>
              {(line as any).lnTarget || (line as any).lnSource || (line as any).ln || ''}
            </div>
            <div className={styles['line-content']}>
              <span className={styles['line-prefix']}>
                {line.type === 'added' ? '+' : line.type === 'deleted' ? '-' : ' '}
              </span>
              {line.content}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
