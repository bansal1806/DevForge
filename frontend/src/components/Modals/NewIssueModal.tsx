import { useState } from 'react'
import { createIssue, getErrorMessage } from '../../lib/api'
import { Button, Input, Modal, Textarea, toast } from '../ui'
import styles from './Modals.module.css'

interface NewIssueModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  repoId: string
}

export default function NewIssueModal({ isOpen, onClose, onSuccess, repoId }: NewIssueModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setLoading(true)
    setError(null)
    try {
      await createIssue(repoId, { title: title.trim(), description: description.trim() })
      toast.success('Issue opened')
      onSuccess()
      onClose()
      setTitle('')
      setDescription('')
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to create the issue.'))
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
      title="New issue"
      description="Report a bug, propose an idea, or track a to-do."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button variant="primary" type="submit" form="new-issue-form" loading={loading} disabled={!title.trim()}>Open issue</Button>
        </>
      }
    >
      <form id="new-issue-form" className={styles.form} onSubmit={handleSubmit}>
        <Input label="Title" placeholder="Short, specific summary" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} data-autofocus />
        <Textarea
          label="Description"
          optional
          placeholder="What happened, what you expected, and how to reproduce it…"
          value={description}
          maxLength={20000}
          rows={7}
          hint="Markdown supported"
          onChange={(e) => setDescription(e.target.value)}
        />
        {error && <p className={styles.error} role="alert">{error}</p>}
      </form>
    </Modal>
  )
}
