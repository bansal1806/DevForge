import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  User,
  MapPin,
  GitCommit,
  GitPullRequest,
  CircleDot
} from 'lucide-react'
import type { UserProfile, ActivityItem, Repository } from '../../lib/api'
import { getUserProfile, getUserActivity, getUserRepos } from '../../lib/api'
import styles from './Profile.module.css'

export default function Profile() {
  const { id } = useParams<{ id: string }>()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [repos, setRepos] = useState<Repository[]>([])
  const [loading, setLoading] = useState(true)

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
              <img src={profile.avatar_url} alt={profile.name} />
            ) : (
              <User size={80} className={styles['avatar-placeholder']} />
            )}
          </div>
          
          <div className={styles['profile-info']}>
            <h1 className={styles['user-name']}>{profile.name}</h1>
            <div className={styles['user-handle']}>@{profile.name.toLowerCase().replace(/\s/g, '_')}</div>
            <p className={styles['user-bio']}>
              {profile.bio || 'This developer has not added a bio yet.'}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <MapPin size={16} /> Joined {new Date(profile.created_at).toLocaleDateString()}
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
