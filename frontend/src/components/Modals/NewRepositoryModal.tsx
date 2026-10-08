import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Globe, Lock } from 'lucide-react'
import apiClient from '../../lib/apiClient'
import { getErrorMessage } from '../../lib/api'
import type { Repository } from '../../lib/api'
import { Button, Input, Modal, Textarea, toast } from '../ui'
import { sparkBurst } from '../../lib/sparks'
import styles from './Modals.module.css'

interface NewRepositoryModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

/** Mirrors the backend's isValidRepoName. */
const REPO_NAME = /^[A-Za-z0-9._-]{1,100}$/

function nameError(name: string) {
  const trimmed = name.trim()
  if (!trimmed) return null
  if (trimmed === '.' || trimmed === '..' || !REPO_NAME.test(trimmed)) return 'Use letters, numbers, ".", "-" and "_" only (max 100).'
  return null
}

export default function NewRepositoryModal({ isOpen, onClose, onSuccess }: NewRepositoryModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submitRef = useRef<HTMLButtonElement>(null)
  const navigate = useNavigate()
  const invalid = nameError(name)

  const reset = () => {
    setName('')
    setDescription('')
    setIsPrivate(false)
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || invalid) return
    setLoading(true)
    setError(null)
    try {
      const { data } = await apiClient.post<Repository>('/api/repos', { name: name.trim(), description: description.trim(), isPrivate })
      sparkBurst(submitRef.current, { count: 48, power: 9 })
      toast.success(`Forged ${name.trim()}`, { description: 'Your repository is ready with a README on main.' })
      onSuccess()
      onClose()
      reset()
      if (data?.id) navigate(`/repo/${data.id}`)
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to create the repository.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      dismissible={!loading}
      title="Create a repository"
      description="A repository holds your files, branches, history and pull requests."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button ref={submitRef} variant="primary" type="submit" form="new-repo-form" loading={loading} disabled={!name.trim() || !!invalid}>
            Create repository
          </Button>
        </>
      }
    >
      <form id="new-repo-form" className={styles.form} onSubmit={handleSubmit}>
        <Input
          label="Repository name"
          mono
          placeholder="my-awesome-project"
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
          error={invalid}
          hint="Short and memorable works best."
          autoComplete="off"
          spellCheck={false}
          data-autofocus
        />
        <Textarea
          label="Description"
          optional
          placeholder="What are you building?"
          value={description}
          maxLength={500}
          rows={3}
          onChange={(e) => setDescription(e.target.value)}
        />
        <fieldset className={styles.choices}>
          <legend className={styles.choicesLegend}>Visibility</legend>
          <label className={styles.choice}>
            <input type="radio" name="visibility" checked={!isPrivate} onChange={() => setIsPrivate(false)} />
            <Globe size={18} />
            <strong>Public</strong>
            <span>Anyone can see it. You choose who can commit.</span>
          </label>
          <label className={styles.choice}>
            <input type="radio" name="visibility" checked={isPrivate} onChange={() => setIsPrivate(true)} />
            <Lock size={18} />
            <strong>Private</strong>
            <span>Only you and collaborators can see it.</span>
          </label>
        </fieldset>
        {error && <p className={styles.error} role="alert">{error}</p>}
      </form>
    </Modal>
  )
}
