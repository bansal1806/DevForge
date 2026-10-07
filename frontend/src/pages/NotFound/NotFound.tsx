import { useState } from 'react'
import { motion } from 'framer-motion'
import { Home, Compass } from 'lucide-react'
import { AnvilArt, LinkButton } from '../../components/ui'
import { sparkBurst } from '../../lib/sparks'
import { fadeUp } from '../../lib/motion'
import styles from './NotFound.module.css'

const STRIKE_LINES = [
  'Strike the anvil.',
  'Nice swing.',
  'The metal is warming up…',
  'Glowing orange now.',
  'Almost forged…',
  'Forged! Still not the page you wanted, though.',
]

/** A forge-themed 404 — the anvil throws sparks when you strike it. */
export default function NotFound() {
  const [strikes, setStrikes] = useState(0)

  const strike = (e: React.MouseEvent<HTMLButtonElement>) => {
    const next = strikes + 1
    setStrikes(next)
    sparkBurst(e.currentTarget, { count: 18 + Math.min(next, 8) * 6, power: 6 + Math.min(next, 8) * 0.6 })
  }

  return (
    <main className={styles.page}>
      <motion.div className={styles.content} initial="hidden" animate="visible" variants={fadeUp}>
        <div className={`${styles.code} text-gradient`}>404</div>
        <h1 className={styles.title}>This page has cooled off</h1>
        <p className={styles.text}>
          Whatever was here has gone cold — or it was never forged in the first place. Check the address, or head back
          to somewhere warm.
        </p>

        <button className={styles.anvil} onClick={strike} aria-label="Strike the anvil">
          <AnvilArt size={120} />
        </button>
        <p className={styles.hint} aria-live="polite">{STRIKE_LINES[Math.min(strikes, STRIKE_LINES.length - 1)]}</p>

        <div className={styles.actions}>
          <LinkButton to="/" variant="primary" className="">
            <Home size={16} /> Home
          </LinkButton>
          <LinkButton to="/explore">
            <Compass size={16} /> Explore repositories
          </LinkButton>
        </div>
      </motion.div>
    </main>
  )
}
