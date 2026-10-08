import { Suspense } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import Navbar from '../Navbar/Navbar'
import Sidebar from '../Sidebar/Sidebar'
import { PageFallback, RouteErrorBoundary } from '../RouteStates/RouteStates'
import { EASE_OUT } from '../../lib/motion'
import { useRouteAnnouncer } from '../../lib/useRouteAnnouncer'
import styles from './Layout.module.css'

export default function Layout() {
  const { pathname } = useLocation()
  useRouteAnnouncer()
  return (
    <div className={styles.layout}>
      <a href="#main" className="skip-link">Skip to content</a>
      <div className={styles.ambient} aria-hidden="true" />
      <Navbar />
      <Sidebar />
      <main id="main" className={styles.content} tabIndex={-1}>
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
