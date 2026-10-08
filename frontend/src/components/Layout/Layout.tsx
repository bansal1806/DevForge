import { Suspense } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import Navbar from '../Navbar/Navbar'
import Sidebar from '../Sidebar/Sidebar'
import { PageFallback, RouteErrorBoundary } from '../RouteStates/RouteStates'
import { EASE_OUT } from '../../lib/motion'
import styles from './Layout.module.css'

export default function Layout() {
  const { pathname } = useLocation()
  return (
    <div className={styles.layout}>
      <div className={styles.ambient} aria-hidden="true" />
      <Navbar />
      <Sidebar />
      <main id="main" className={styles.content}>
        {/* Keyed by path: each page eases in, and a crashed page resets on navigation */}
        <motion.div
          key={pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: EASE_OUT }}
        >
          <RouteErrorBoundary resetKey={pathname}>
            <Suspense fallback={<PageFallback />}>
              <Outlet />
            </Suspense>
          </RouteErrorBoundary>
        </motion.div>
      </main>
    </div>
  )
}
