import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  User,
  Calendar,
  GitCommit,
  GitPullRequest,
  CircleDot,
  Pencil
} from 'lucide-react'
import type { UserProfile, ActivityItem, Repository } from '../../lib/api'
import { getUserProfile, getUserActivity, getUserRepos, updateProfile, getErrorMessage } from '../../lib/api'
import { useAuth } from '../../contexts/AuthContext'
import styles from './Profile.module.css'

const fieldStyle = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: '8px',
  border: '1px solid var(--border-glass)',
  background: 'rgba(255,255,255,0.03)',
  color: 'inherit',
  font: 'inherit',
} as const

function ProfileEditor({ profile, onSaved, onCancel }: {
  profile: UserProfile
  onSaved: (updated: UserProfile) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(profile.name || '')
  const [bio, setBio] = useState(profile.bio || '')
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (avatarUrl && !/^https:\/\//i.test(avatarUrl)) {
      setError('Avatar URL must start with https://')
      return
    }
    setSaving(true)
    setError(null)
    try {
      onSaved(await updateProfile({ name: name.trim(), bio: bio.trim(), avatar_url: avatarUrl.trim() }))
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to update profile.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
      <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        Name
        <input style={fieldStyle} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
      </label>
      <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        Bio
        <textarea style={{ ...fieldStyle, minHeight: '80px', resize: 'vertical' }} value={bio} maxLength={500} onChange={(e) => setBio(e.target.value)} />
      </label>
      <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        Avatar URL
        <input style={fieldStyle} value={avatarUrl} maxLength={2048} placeholder="https://..." onChange={(e) => setAvatarUrl(e.target.value)} />
      </label>
      {error && <div style={{ color: '#ef4444', fontSize: '0.85rem' }}>{error}</div>}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button type="submit" className="btn-ghost" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button>
        <button type="button" className="btn-ghost" onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </form>
  )
}

export default function Profile() {
  const { id } = useParams<{ id: string }>()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [repos, setRepos] = useState<Repository[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const { user } = useAuth()
  const isOwnProfile = !!user && user.id === id

  useEffect(() => {
    async function fetchData() {
      if (!id) return
      setLoading(true)
      try {
        const [profileData, activityData, repoData] = await Promise.all([
          getUserProfile(id),
          getUserActivity(id),
          getUserRepos(id)
        ])
        setProfile(profileData)
        setActivity(activityData)
        setRepos(repoData)
      } catch (err) {
        console.error('Error fetching profile data:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [id])

  if (loading) {
    return (
      <div className={styles['profile-container']}>
        <div style={{ padding: '100px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <div className="spinner" style={{ marginBottom: '20px' }}></div>
          Loading developer profile...
        </div>
      </div>
    )
  }

  if (!profile) return null

  return (
    <div className={styles['profile-container']}>
      <div className={styles['profile-grid']}>
        {/* Sidebar */}
        <aside className={styles['profile-sidebar']}>
          <div className={styles['avatar-large']}>
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.name || "Avatar"} />
            ) : (
              <User size={80} className={styles['avatar-placeholder']} />
            )}
          </div>

          <div className={styles['profile-info']}>
            {editing ? (
              <ProfileEditor
                profile={profile}
                onSaved={(updated) => { setProfile({ ...profile, ...updated }); setEditing(false) }}
                onCancel={() => setEditing(false)}
              />
            ) : (
              <>
                <h1 className={styles["user-name"]}>{profile.name || "Developer"}</h1>
                <div className={styles['user-handle']}>@{(profile.name || 'developer').toLowerCase().replace(/\s/g, '_')}</div>
                <p className={styles['user-bio']}>
                  {profile.bio || 'This developer has not added a bio yet.'}
                </p>
                {isOwnProfile && (
                  <button className="btn-ghost" onClick={() => setEditing(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '16px' }}>
                    <Pencil size={14} /> Edit profile
                  </button>
                )}
              </>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calendar size={16} /> Joined {new Date(profile.created_at).toLocaleDateString()}
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main>
          {/* Stats Bar */}
          <div className={styles['profile-stats-grid']}>
            <div className={styles['stat-card']}>
              <span className={styles['stat-value']}>{repos.length}</span>
              <span className={styles['stat-label']}>Public Repositories</span>
            </div>
            <div className={styles['stat-card']}>
              <span className={styles['stat-value']}>{activity.length}</span>
              <span className={styles['stat-label']}>Recent Activities</span>
            </div>
            <div className={styles['stat-card']}>
              <span className={styles['stat-value']}>{repos.reduce((sum, r) => sum + (r.stars_count || 0), 0)}</span>
              <span className={styles['stat-label']}>Stars Earned</span>
            </div>
          </div>

          {/* Activity Timeline */}
          <div className={styles['timeline-container']}>
            <h2 style={{ fontSize: '1.25rem', color: 'white', marginBottom: '24px' }}>Latest Activity</h2>

            {activity.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No recent public activity.</div>
            ) : (
              activity.map((item, i) => (
                <motion.div
                  key={item.id}
                  className={styles['timeline-item']}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <div className={styles['timeline-icon']}>
                    {item.type === 'commit' && <GitCommit size={16} />}
                    {item.type === 'pr' && <GitPullRequest size={16} />}
                    {item.type === 'issue' && <CircleDot size={16} />}
                  </div>
                  <div className={styles['timeline-content']}>
                    <div className={styles['timeline-title']}>
                      <span className={`${styles['type-badge']} ${styles[`type--${item.type}`]}`}>{item.type}</span>
                      {item.type === 'commit' && <>Pushed to <b>{item.repo?.name}</b>: "{item.message}"</>}
                      {item.type === 'pr' && <>Opened pull request <b>#{item.id.slice(0,4)}</b> in <b>{item.repo?.name}</b></>}
                      {item.type === 'issue' && <>Opened issue <b>{item.title}</b> in <b>{item.repo?.name}</b></>}
                    </div>
                    <div className={styles['timeline-meta']}>
                      {new Date(item.created_at).toLocaleDateString()} at {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
