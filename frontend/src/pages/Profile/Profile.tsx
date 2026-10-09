import { useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Bug, Calendar, GitCommitHorizontal, GitFork, GitPullRequest, Pencil, Star, UserX } from 'lucide-react'
import type { UserProfile, ActivityItem, Repository } from '../../lib/api'
import { getUserProfile, getUserActivity, getUserRepos, updateProfile, getErrorMessage } from '../../lib/api'
import { useAuth } from '../../contexts/AuthContext'
import { Avatar, Button, Card, EmptyState, Input, LinkButton, Modal, Skeleton, SkeletonText, Tabs, Textarea, toast } from '../../components/ui'
import { RepoCard, RepoGrid } from '../../components/RepoCard/RepoCard'
import { fadeUp, stagger } from '../../lib/motion'
import { heatOf, timeAgo } from '../../lib/time'
import styles from './Profile.module.css'

const ACTIVITY_ICON = { commit: GitCommitHorizontal, pr: GitPullRequest, issue: Bug }

function ProfileEditor({ profile, open, onClose, onSaved }: {
  profile: UserProfile
  open: boolean
  onClose: () => void
  onSaved: (updated: UserProfile) => void
}) {
  const [name, setName] = useState(profile.name || '')
  const [bio, setBio] = useState(profile.bio || '')
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const avatarError = avatarUrl && !/^https:\/\//i.test(avatarUrl.trim()) ? 'Avatar URL must start with https://' : null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (avatarError) return
    setSaving(true)
    setError(null)
    try {
      onSaved(await updateProfile({ name: name.trim(), bio: bio.trim(), avatar_url: avatarUrl.trim() }))
      toast.success('Profile updated')
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to update profile.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!saving}
      title="Edit profile"
      description="This is what other developers see on your profile and next to your work."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" type="submit" form="profile-form" loading={saving} disabled={!!avatarError}>Save profile</Button>
        </>
      }
    >
      <form id="profile-form" onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.avatarPreview}>
          {/* Keyed on the URL so a previously broken image gets retried */}
          <Avatar key={avatarUrl} name={name || profile.name} src={avatarError ? null : avatarUrl.trim() || null} size={56} />
          <span>Preview</span>
        </div>
        <Input label="Name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} autoFocus />
        <Textarea label="Bio" optional value={bio} maxLength={500} rows={4} onChange={(e) => setBio(e.target.value)} hint={`${bio.length}/500`} />
        <Input label="Avatar URL" optional value={avatarUrl} maxLength={2048} placeholder="https://…" onChange={(e) => setAvatarUrl(e.target.value)} error={avatarError} />
        {error && <p className={styles.error} role="alert">{error}</p>}
      </form>
    </Modal>
  )
}

export default function Profile() {
  const { id } = useParams<{ id: string }>()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [repos, setRepos] = useState<Repository[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [tab, setTab] = useState('overview')
  const [now, setNow] = useState(() => Date.now())
  const { user } = useAuth()
  const isOwnProfile = !!user && user.id === id

  useEffect(() => {
    async function fetchData() {
      if (!id) return
      setLoading(true)
      setError(null)
      try {
        const [profileData, activityData, repoData] = await Promise.all([
          getUserProfile(id),
          getUserActivity(id),
          getUserRepos(id),
        ])
        setProfile(profileData)
        setActivity(activityData)
        setRepos(repoData)
        setNow(Date.now())
      } catch (err) {
        setError(getErrorMessage(err, 'Could not load this profile.'))
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [id])

  if (loading) {
    return (
      <div className={styles.page} aria-busy="true">
        <div className={styles.grid}>
          <div className={styles.side}>
            <Skeleton width={128} height={128} radius="50%" />
            <Skeleton width="70%" height={28} />
            <SkeletonText lines={2} />
          </div>
          <div className={styles.main}><Skeleton height={96} radius="var(--radius-lg)" /><SkeletonText lines={5} /></div>
        </div>
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className={styles.page}>
        <EmptyState
          art={<UserX size={44} />}
          title={error || 'Developer not found'}
          description="The account may have been deleted, or the link is mistyped."
          action={<LinkButton to="/explore" variant="secondary" size="sm">Explore repositories</LinkButton>}
        />
      </div>
    )
  }

  const stars = repos.reduce((sum, r) => sum + (r.stars_count || 0), 0)
  const topRepos = [...repos].sort((a, b) => (b.stars_count || 0) - (a.stars_count || 0) || +new Date(b.updated_at) - +new Date(a.updated_at))
  const displayName = profile.name || 'Unnamed developer'

  return (
    <motion.div className={styles.page} initial="hidden" animate="visible" variants={stagger(0.06)}>
      <div className={styles.grid}>
        <motion.aside variants={fadeUp} className={styles.side} aria-label="Profile">
          <div className={styles.avatarRing}>
            <Avatar name={profile.name} src={profile.avatar_url} size={128} />
          </div>
          <div>
            <h1 className={styles.name}>{displayName}</h1>
            {isOwnProfile && <span className={styles.you}>That’s you</span>}
          </div>
          <p className={profile.bio ? styles.bio : styles.bioEmpty}>
            {profile.bio || (isOwnProfile ? 'Add a bio so people know what you build.' : 'No bio yet.')}
          </p>
          {isOwnProfile && (
            <Button variant="secondary" fullWidth iconLeft={<Pencil size={14} />} onClick={() => setEditing(true)}>Edit profile</Button>
          )}
          <div className={styles.facts}>
            <span title={new Date(profile.created_at).toLocaleDateString()}><Calendar size={15} /> Joined {timeAgo(profile.created_at, now)}</span>
          </div>
        </motion.aside>

        <div className={styles.main}>
          <motion.div variants={fadeUp} className={styles.stats}>
            <Card className={styles.stat}><GitFork size={18} /><strong>{repos.length}</strong><span>public {repos.length === 1 ? 'repository' : 'repositories'}</span></Card>
            <Card className={styles.stat}><Star size={18} /><strong>{stars}</strong><span>stars earned</span></Card>
            <Card className={styles.stat}><GitCommitHorizontal size={18} /><strong>{activity.length}</strong><span>recent contributions</span></Card>
          </motion.div>

          <motion.div variants={fadeUp}>
            <Tabs
              label="Profile sections"
              value={tab}
              onChange={setTab}
              items={[
                { id: 'overview', label: 'Activity' },
                { id: 'repos', label: 'Repositories', count: repos.length },
              ]}
            />
          </motion.div>

          {tab === 'overview' ? (
            <motion.section variants={fadeUp} aria-label="Recent activity">
              {activity.length === 0 ? (
                <Card padding="none"><EmptyState title="Quiet forge" description={`${isOwnProfile ? 'You haven’t' : `${displayName} hasn’t`} done anything public recently.`} /></Card>
              ) : (
                <ol className={styles.timeline}>
                  {activity.map((item) => {
                    const Icon = ACTIVITY_ICON[item.type]
                    const hot = heatOf(item.created_at, now) === 'molten'
                    const repo = item.repo_id
                      ? <Link to={`/repo/${item.repo_id}`}>{item.repo?.name || 'a repository'}</Link>
                      : <b>{item.repo?.name || 'a repository'}</b>
                    return (
                      <li key={`${item.type}-${item.id}`} className={styles.event}>
                        <span className={`${styles.eventIcon} ${hot ? styles.eventHot : ''}`}><Icon size={15} /></span>
                        <div className={styles.eventBody}>
                          <p>
                            {item.type === 'commit' && <>Committed to {repo}</>}
                            {item.type === 'pr' && <>Opened a pull request in {repo}</>}
                            {item.type === 'issue' && <>Opened an issue in {repo}</>}
                          </p>
                          {(item.message || item.title) && <p className={styles.eventDetail}>{item.message || item.title}</p>}
                        </div>
                        <time className={styles.eventTime} dateTime={item.created_at} title={new Date(item.created_at).toLocaleString()}>
                          {timeAgo(item.created_at, now)}
                        </time>
                      </li>
                    )
                  })}
                </ol>
              )}
            </motion.section>
          ) : repos.length === 0 ? (
            <Card padding="none"><EmptyState title="No public repositories" description={isOwnProfile ? 'Public repositories you create will show up here.' : 'Nothing public to show yet.'} /></Card>
          ) : (
            <RepoGrid>
              {topRepos.map((repo) => <RepoCard key={repo.id} repo={repo} now={now} />)}
            </RepoGrid>
          )}
        </div>
      </div>

      {isOwnProfile && (
        <ProfileEditor
          key={editing ? 'open' : 'closed'}
          profile={profile}
          open={editing}
          onClose={() => setEditing(false)}
          onSaved={(updated) => { setProfile({ ...profile, ...updated }); setEditing(false) }}
        />
      )}
    </motion.div>
  )
}
