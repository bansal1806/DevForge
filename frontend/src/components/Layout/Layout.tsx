import { Outlet } from 'react-router-dom'
import { motion } from 'framer-motion'
import Navbar from '../Navbar/Navbar'
import Sidebar from '../Sidebar/Sidebar'
import styles from './Layout.module.css'

export default function Layout() {
  return (
    <div className={styles.layout}>
      {/* Ambient background glow orbs */}
      <div className={styles['layout-ambient']}>
        <div className={`${styles['layout-ambient-orb']} ${styles['layout-ambient-orb--blue']}`} />
        <div className={`${styles['layout-ambient-orb']} ${styles['layout-ambient-orb--purple']}`} />
        <div className={`${styles['layout-ambient-orb']} ${styles['layout-ambient-orb--emerald']}`} />
      </div>

      <Navbar />
      <Sidebar />

      <motion.main
        className={styles['layout-content']}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
      >
        <Outlet />
      </motion.main>
    </div>
  )
}
