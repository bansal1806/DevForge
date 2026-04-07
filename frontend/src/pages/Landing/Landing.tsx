import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  GitBranch,
  ArrowRight,
  Zap,
  Shield,
  Users,
  Code2,
  GitPullRequest,
  Globe,
} from 'lucide-react'
import styles from './Landing.module.css'

const features = [
  {
    icon: GitBranch,
    color: 'blue',
    title: 'Smart Branching',
    desc: 'Logical version control with instant branch creation, commit snapshotting, and full history tracking.',
  },
  {
    icon: Users,
    color: 'purple',
    title: 'Real-time Collaboration',
    desc: 'Code together live with multiplayer editing, cursor sync, and instant file broadcasting.',
  },
  {
    icon: Shield,
    color: 'emerald',
    title: 'Zero-Trust Security',
    desc: 'Row-Level Security policies enforce data isolation at the database layer. Your code stays yours.',
  },
  {
    icon: GitPullRequest,
    color: 'amber',
    title: 'Pull Requests & Reviews',
    desc: 'Full-featured PR workflows with inline comments, reviews, and merge controls.',
  },
  {
    icon: Code2,
    color: 'rose',
    title: 'Gists & Snippets',
    desc: 'Share code snippets instantly. Public or private gists with syntax highlighting.',
  },
  {
    icon: Globe,
    color: 'cyan',
    title: 'Issue Tracking',
    desc: 'Lightweight issue management tied directly to your repositories with full comment threads.',
  },
]

const stats = [
  { value: '10K+', label: 'Repositories' },
  { value: '50K+', label: 'Commits' },
  { value: '5K+', label: 'Developers' },
  { value: '99.9%', label: 'Uptime' },
]

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
}

export default function Landing() {
  return (
    <div className={styles.landing}>
      {/* Landing Navbar */}
      <motion.nav
        className={styles['landing-nav']}
        initial={{ y: -64, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
      >
        <Link to="/" className={styles['landing-nav-brand']}>
          <div className={styles['landing-nav-logo']}>
            <GitBranch size={18} color="white" />
          </div>
          <span className={styles['landing-nav-title']}>
            Dev<span className={styles['landing-nav-accent']}>Forge</span>
          </span>
        </Link>
        <div className={styles['landing-nav-actions']}>
          <a href="#features" className={styles['landing-nav-link']}>Features</a>
          <Link to="/dashboard" className={styles['landing-nav-link']}>Dashboard</Link>
          <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
            <Link to="/dashboard" className="btn-neon" id="cta-get-started-nav">
              Get Started
            </Link>
          </motion.div>
        </div>
      </motion.nav>

      {/* Hero Section */}
      <section className={styles.hero}>
        {/* Ambient orbs */}
        <div className={styles['hero-ambient']}>
          <div className={`${styles['hero-orb']} ${styles['hero-orb--1']}`} />
          <div className={`${styles['hero-orb']} ${styles['hero-orb--2']}`} />
          <div className={`${styles['hero-orb']} ${styles['hero-orb--3']}`} />
        </div>

        {/* Grid background */}
        <div className={styles['hero-grid']} />

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          style={{ position: 'relative', zIndex: 1 }}
        >
          <motion.div variants={itemVariants} className={styles['hero-badge']}>
            <span className={styles['hero-badge-dot']} />
            Now in Open Beta
          </motion.div>

          <motion.h1 variants={itemVariants} className={styles['hero-title']}>
            <span className={styles['hero-title-line']}>Where Code Meets</span>
            <span className={`${styles['hero-title-line']} ${styles['hero-title-gradient']}`}>
              Collaboration
            </span>
          </motion.h1>

          <motion.p variants={itemVariants} className={styles['hero-subtitle']}>
            The next-generation platform for developers. Branch, commit, review, and ship code
            together in real-time with zero-trust security baked in.
          </motion.p>

          <motion.div variants={itemVariants} className={styles['hero-actions']}>
            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
              <Link to="/dashboard" className={styles['hero-btn-primary']} id="cta-start-forging">
                <Zap size={18} />
                Start Forging
                <ArrowRight size={16} />
              </Link>
            </motion.div>
            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
              <a href="#features" className={styles['hero-btn-secondary']} id="cta-learn-more">
                Learn More
              </a>
            </motion.div>
          </motion.div>

          {/* Stats */}
          <motion.div variants={itemVariants} className={styles['stats-bar']}>
            {stats.map((stat) => (
              <div className={styles['stat-item']} key={stat.label}>
                <div className={styles['stat-value']}>{stat.value}</div>
                <div className={styles['stat-label']}>{stat.label}</div>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </section>

      {/* Features Section */}
      <section className={styles.features} id="features">
        <motion.div
          className={styles['features-header']}
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
        >
          <div className={styles['features-label']}>Features</div>
          <h2 className={styles['features-title']}>
            Everything you need to <span className={styles['hero-title-gradient']}>ship faster</span>
          </h2>
        </motion.div>

        <motion.div
          className={styles['features-grid']}
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-50px' }}
        >
          {features.map((f) => (
            <motion.div
              key={f.title}
              className={styles['feature-card']}
              variants={itemVariants}
              whileHover={{ y: -4 }}
            >
              <div className={`${styles['feature-icon']} ${styles[`feature-icon--${f.color}`]}`}>
                <f.icon size={24} />
              </div>
              <h3 className={styles['feature-title']}>{f.title}</h3>
              <p className={styles['feature-desc']}>{f.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* Footer */}
      <footer className={styles['landing-footer']}>
        © 2026 DevForge. Built with passion for developers.
      </footer>
    </div>
  )
}
