import { useState } from 'react'
import { flushSync } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import { createGist, getErrorMessage } from '../../lib/api'
import { Button, IconButton, Input, Modal, Segmented, toast } from '../ui'
import { fileColor, languageLabel, monacoLanguage } from '../../lib/fileLang'
import styles from './Modals.module.css'

interface NewGistModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

/** Matches the backend's per-gist limit. */
const MAX_FILES = 20

interface DraftFile { key: number, filename: string, content: string }

let nextKey = 1
const blankFile = (): DraftFile => ({ key: nextKey++, filename: '', content: '' })

export default function NewGistModal({ isOpen, onClose, onSuccess }: NewGistModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'secret'>('public')
  const [files, setFiles] = useState<DraftFile[]>(() => [blankFile()])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const update = (key: number, patch: Partial<DraftFile>) => setFiles((fs) => fs.map((f) => (f.key === key ? { ...f, ...patch } : f)))
  const incomplete = files.some((f) => !f.filename.trim() || !f.content.trim())
  const duplicate = new Set(files.map((f) => f.filename.trim())).size !== files.length

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (incomplete) {
      setError('Every file needs a name and some content.')
      return
    }
    if (files.some((f) => /[\\/]/.test(f.filename))) {
      setError('File names can’t contain slashes.')
      return
    }
    if (duplicate) {
      setError('File names must be unique within a gist.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const gist = await createGist({
        title: title.trim(),
        description: description.trim(),
        is_public: visibility === 'public',
        files: files.map((f) => ({ filename: f.filename.trim(), content: f.content, language: monacoLanguage(f.filename.trim()) })),
      })
      toast.success('Gist created')
      onSuccess()
      onClose()
      setTitle('')
      setDescription('')
      setFiles([blankFile()])
      if (gist?.id) navigate(`/gists/${gist.id}`)
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to create the gist.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      dismissible={!loading}
      size="lg"
      title="New gist"
      description="Share a snippet — or keep it secret and just for you."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button variant="primary" type="submit" form="new-gist-form" loading={loading}>
            Create {visibility === 'secret' ? 'secret' : 'public'} gist
          </Button>
        </>
      }
    >
      <form id="new-gist-form" className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.row}>
          <Input label="Title" optional placeholder="Defaults to the first file name" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} data-autofocus />
          <Input label="Description" optional placeholder="What is it for?" value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div className={styles.filesHead}>
          <strong>Files</strong>
          <Segmented
            label="Visibility"
            value={visibility}
            onChange={setVisibility}
            options={[{ value: 'public', label: 'Public' }, { value: 'secret', label: 'Secret' }]}
          />
        </div>

        <div className={styles.files}>
          {files.map((file, i) => (
            <div key={file.key} className={styles.file}>
              <div className={styles.fileHead}>
                <span className={styles.fileDot} style={{ background: file.filename ? fileColor(file.filename) : 'var(--color-border-strong)' }} />
                <input
                  className={styles.filename}
                  placeholder="filename.ext"
                  aria-label={`File ${i + 1} name`}
                  value={file.filename}
                  maxLength={255}
                  spellCheck={false}
                  onChange={(e) => update(file.key, { filename: e.target.value })}
                />
                {file.filename && <span className={styles.lang}>{languageLabel(file.filename)}</span>}
                <IconButton
                  size="sm"
                  label={`Remove file ${i + 1}`}
                  icon={<Trash2 size={14} />}
                  disabled={files.length === 1}
                  onClick={() => setFiles((fs) => fs.filter((f) => f.key !== file.key))}
                />
              </div>
              <textarea
                className={styles.code}
                placeholder="Paste or type your code…"
                aria-label={`File ${i + 1} content`}
                value={file.content}
                spellCheck={false}
                onChange={(e) => update(file.key, { content: e.target.value })}
                onKeyDown={(e) => {
                  // Tab indents instead of leaving the editor; Shift+Tab / Esc still escape
                  if (e.key !== 'Tab' || e.shiftKey) return
                  e.preventDefault()
                  const el = e.currentTarget
                  const { selectionStart: s, selectionEnd: end } = el
                  // Commit synchronously so the caret lands before the next keystroke
                  flushSync(() => update(file.key, { content: `${el.value.slice(0, s)}  ${el.value.slice(end)}` }))
                  el.setSelectionRange(s + 2, s + 2)
                }}
              />
            </div>
          ))}
        </div>

        <Button
          variant="secondary"
          size="sm"
          iconLeft={<Plus size={14} />}
          onClick={() => setFiles((fs) => [...fs, blankFile()])}
          disabled={files.length >= MAX_FILES}
        >
          Add file
        </Button>

        {error && <p className={styles.error} role="alert">{error}</p>}
      </form>
    </Modal>
  )
}
