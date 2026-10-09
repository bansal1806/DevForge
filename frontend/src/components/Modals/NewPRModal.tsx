import { useRef, useState } from 'react'
import { ArrowRight, Info } from 'lucide-react'
import { createPullRequest, getErrorMessage } from '../../lib/api'
import type { Branch } from '../../lib/api'
import { sparkBurst } from '../../lib/sparks'
import { Button, Input, Modal, Select, Textarea, toast } from '../ui'
import styles from './Modals.module.css'

interface NewPRModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  repoId: string
  branches: Branch[]
}

export default function NewPRModal({ isOpen, onClose, onSuccess, repoId, branches }: NewPRModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [sourceId, setSourceId] = useState('')
  const [targetId, setTargetId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submitRef = useRef<HTMLButtonElement>(null)

  // Target defaults to the default branch; source to the first other branch
  const defaultBranch = branches.find((b) => b.is_default) || branches[0]
  const target = targetId || defaultBranch?.id || ''
  const source = sourceId || branches.find((b) => b.id !== target)?.id || ''
  const sameBranch = !!source && source === target
  const onlyOneBranch = branches.length < 2

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !source || !target || sameBranch) return
    setLoading(true)
    setError(null)
    try {
      await createPullRequest({ repoId, sourceBranchId: source, targetBranchId: target, title: title.trim(), description: description.trim() })
      sparkBurst(submitRef.current, { count: 36, power: 8 })
      toast.success('Pull request opened')
      onSuccess()
      onClose()
      setTitle('')
      setDescription('')
      setSourceId('')
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to open the pull request.'))
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
      title="Open a pull request"
      description="Propose merging the changes on one branch into another."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button ref={submitRef} variant="primary" type="submit" form="new-pr-form" loading={loading} disabled={!title.trim() || sameBranch || onlyOneBranch}>
            Open pull request
          </Button>
        </>
      }
    >
      <form id="new-pr-form" className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.branchFlow}>
          <Select label="Merge from" mono value={source} onChange={(e) => setSourceId(e.target.value)} error={sameBranch ? 'Pick two different branches' : undefined}>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
          <span className={styles.flowArrow} aria-hidden="true"><ArrowRight size={18} /></span>
          <Select label="Into" mono value={target} onChange={(e) => setTargetId(e.target.value)}>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}{b.is_default ? ' (default)' : ''}</option>)}
          </Select>
        </div>
        {onlyOneBranch && (
          <p className={styles.hint}><Info size={14} /> This repository has one branch. Create a branch from the branch menu and commit to it first.</p>
        )}
        <Input label="Title" placeholder="What does this change do?" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} data-autofocus />
        <Textarea
          label="Description"
          optional
          placeholder="Why this change, how to test it, anything reviewers should know…"
          value={description}
          maxLength={20000}
          rows={5}
          hint="Markdown supported"
          onChange={(e) => setDescription(e.target.value)}
        />
        {error && <p className={styles.error} role="alert">{error}</p>}
      </form>
    </Modal>
  )
}
