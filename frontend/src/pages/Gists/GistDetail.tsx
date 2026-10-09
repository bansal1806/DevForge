import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronLeft, Calendar, FileCode, Copy, Download, Globe, Link2, Lock } from 'lucide-react'
import Editor from '@monaco-editor/react'
import { getGistById, getErrorMessage, type Gist, type GistFile } from '../../lib/api'
import { Avatar, Badge, EmptyState, IconButton, LinkButton, Skeleton, Spinner, toast } from '../../components/ui'
import { useTheme } from '../../contexts/ThemeContext'
import { fileColor, languageLabel, monacoLanguage } from '../../lib/fileLang'
import { fadeUp, stagger } from '../../lib/motion'
import { timeAgo } from '../../lib/time'
import detail from '../shared/Detail.module.css'
import styles from './GistDetail.module.css'

/** Editor height bounds, in lines, so short files stay compact and long ones scroll. */
const MIN_LINES = 3
const MAX_LINES = 32
const LINE_HEIGHT = 20

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${what} copied`)
  } catch {
    toast.error('Could not copy — your browser blocked clipboard access.')
  }
}

function download(file: GistFile) {
  const url = URL.createObjectURL(new Blob([file.content], { type: 'text/plain;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = file.filename.split('/').pop() || 'snippet.txt'
  a.click()
  URL.revokeObjectURL(url)
}

export default function GistDetail() {
  const { id } = useParams<{ id: string }>()
  const [gist, setGist] = useState<Gist | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [now] = useState(() => Date.now())
  const { resolved } = useTheme()

  useEffect(() => {
    async function fetchGist() {
      if (!id) return
      setLoading(true)
      try {
        setGist(await getGistById(id))
      } catch (err) {
        setError(getErrorMessage(err, 'Could not load this gist.'))
      } finally {
        setLoading(false)
      }
    }
    fetchGist()
  }, [id])

  if (loading) {
    return (
      <div className={detail.page} aria-busy="true">
        <Skeleton width={100} height={14} />
        <div className={detail.header}>
          <Skeleton width="45%" height={34} />
          <Skeleton width={280} height={20} />
        </div>
        <Skeleton height={240} radius="var(--radius-lg)" />
      </div>
    )
  }

  if (error || !gist) {
    return (
      <div className={detail.page}>
        <EmptyState
          title={error || 'Gist not found'}
          description="It may have been deleted, or it’s a secret gist that belongs to someone else."
          action={<LinkButton to="/gists" variant="secondary" size="sm"><ChevronLeft size={14} /> All gists</LinkButton>}
        />
      </div>
    )
  }

  const files = gist.files || []

  return (
    <motion.div className={detail.page} initial="hidden" animate="visible" variants={stagger(0.05)}>
      <motion.div variants={fadeUp}>
        <Link to="/gists" className={detail.back}><ChevronLeft size={16} /> All gists</Link>
      </motion.div>

      <motion.header variants={fadeUp} className={detail.header}>
        <div className={detail.titleRow}>
          <h1 className={detail.title}>{gist.title || files[0]?.filename || 'Untitled gist'}</h1>
          <div className={detail.titleActions}>
            <IconButton label="Copy link" icon={<Link2 size={16} />} variant="secondary" size="sm" onClick={() => copy(window.location.href, 'Link')} />
          </div>
        </div>
        <div className={detail.meta}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Avatar name={gist.user?.name} src={gist.user?.avatar_url} size={20} />
            <Link to={`/profile/${gist.user_id}`}>{gist.user?.name || 'Deleted user'}</Link>
          </span>
          {gist.is_public
            ? <Badge tone="steel" icon={<Globe size={11} />}>public</Badge>
            : <Badge tone="neutral" icon={<Lock size={11} />}>secret</Badge>}
          <span title={new Date(gist.created_at).toLocaleString()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Calendar size={14} /> {timeAgo(gist.created_at, now)}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <FileCode size={14} /> {files.length} file{files.length === 1 ? '' : 's'}
          </span>
        </div>
        {gist.description && <p className={styles.description}>{gist.description}</p>}
      </motion.header>

      <div className={styles.files}>
        {files.map((file) => {
          const lines = Math.min(MAX_LINES, Math.max(MIN_LINES, file.content.split('\n').length))
          return (
            <motion.section key={file.id} variants={fadeUp} className={styles.file} aria-label={file.filename}>
              <header className={styles.fileHead}>
                <span className={styles.dot} style={{ background: fileColor(file.filename) }} />
                <span className={styles.fileName}>{file.filename}</span>
                <span className={styles.lang}>{file.language || languageLabel(file.filename)}</span>
                <IconButton size="sm" label={`Copy ${file.filename}`} icon={<Copy size={14} />} onClick={() => copy(file.content, file.filename)} />
                <IconButton size="sm" label={`Download ${file.filename}`} icon={<Download size={14} />} onClick={() => download(file)} />
              </header>
              <div style={{ height: lines * LINE_HEIGHT + 24 }}>
                <Editor
                  height="100%"
                  language={file.language || monacoLanguage(file.filename)}
                  theme={resolved === 'light' ? 'light' : 'vs-dark'}
                  value={file.content}
                  loading={<div className={styles.loading}><Spinner /> Loading…</div>}
                  options={{
                    readOnly: true,
                    domReadOnly: true,
                    minimap: { enabled: false },
                    fontSize: 13,
                    lineHeight: LINE_HEIGHT,
                    fontFamily: 'JetBrains Mono, monospace',
                    fontLigatures: true,
                    scrollBeyondLastLine: false,
                    lineNumbers: 'on',
                    renderLineHighlight: 'none',
                    padding: { top: 12, bottom: 12 },
                  }}
                />
              </div>
            </motion.section>
          )
        })}
      </div>
    </motion.div>
  )
}
