/**
 * Spark engine — the forge's signature effect. A single shared, full-screen,
 * click-through canvas draws short glowing streaks with gravity and drag,
 * like sparks off an anvil. The animation loop only runs while sparks are
 * alive, and everything is skipped for users who prefer reduced motion.
 */

interface Spark {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  color: string
}

export interface BurstOptions {
  /** Number of sparks (default 28) */
  count?: number
  /** Launch speed in px/frame (default 7) */
  power?: number
  /** Cone in degrees around straight up; 360 = all directions (default 160) */
  spread?: number
  /** Override colors (CSS colors) */
  colors?: string[]
}

const MAX_SPARKS = 500
const GRAVITY = 0.22
const DRAG = 0.965

let canvas: HTMLCanvasElement | null = null
let ctx: CanvasRenderingContext2D | null = null
let sparks: Spark[] = []
let frame = 0

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

function themeColors(): string[] {
  const css = getComputedStyle(document.documentElement)
  const read = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback
  // White-hot core, ember body, amber tail
  return ['#fff4e0', read('--color-ember', '#ff6b2c'), read('--color-ember-strong', '#ff8a4c'), '#ffb347', '#ffd27a']
}

function ensureCanvas() {
  if (canvas && ctx) return
  canvas = document.createElement('canvas')
  canvas.setAttribute('aria-hidden', 'true')
  Object.assign(canvas.style, {
    position: 'fixed',
    inset: '0',
    width: '100vw',
    height: '100vh',
    pointerEvents: 'none',
    zIndex: '2000',
  })
  document.body.appendChild(canvas)
  ctx = canvas.getContext('2d')
  resize()
  window.addEventListener('resize', resize)
}

function resize() {
  if (!canvas || !ctx) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = window.innerWidth * dpr
  canvas.height = window.innerHeight * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

function tick() {
  if (!ctx || !canvas) return
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
  ctx.globalCompositeOperation = 'lighter'

  sparks = sparks.filter((s) => {
    s.vx *= DRAG
    s.vy = s.vy * DRAG + GRAVITY
    s.x += s.vx
    s.y += s.vy
    s.life -= 1
    if (s.life <= 0 || s.y > window.innerHeight + 40) return false

    const t = s.life / s.maxLife // 1 → 0 as it cools
    ctx!.strokeStyle = s.color
    ctx!.globalAlpha = Math.min(1, t * 1.6)
    ctx!.lineWidth = s.size * (0.4 + t * 0.6)
    ctx!.lineCap = 'round'
    ctx!.beginPath()
    ctx!.moveTo(s.x, s.y)
    // Streak length follows velocity, so fast sparks look like trails
    ctx!.lineTo(s.x - s.vx * 2.2, s.y - s.vy * 2.2)
    ctx!.stroke()
    return true
  })

  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'

  if (sparks.length > 0) {
    frame = requestAnimationFrame(tick)
  } else {
    frame = 0
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
  }
}

function start() {
  if (!frame) frame = requestAnimationFrame(tick)
}

function originPoint(origin: Element | { x: number, y: number }) {
  if ('getBoundingClientRect' in origin) {
    const r = origin.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }
  return origin
}

/** Burst of sparks from an element's center or a viewport point. */
export function sparkBurst(origin: Element | { x: number, y: number } | null | undefined, options: BurstOptions = {}) {
  if (!origin || prefersReducedMotion() || typeof document === 'undefined') return
  ensureCanvas()

  const { count = 28, power = 7, spread = 160, colors = themeColors() } = options
  const { x, y } = originPoint(origin)
  const room = Math.max(0, MAX_SPARKS - sparks.length)

  for (let i = 0; i < Math.min(count, room); i++) {
    // Angle measured from straight up, within the cone
    const angle = (-90 + (Math.random() - 0.5) * spread) * (Math.PI / 180)
    const speed = power * (0.45 + Math.random() * 0.75)
    const maxLife = 32 + Math.random() * 34
    sparks.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: maxLife,
      maxLife,
      size: 1.4 + Math.random() * 1.8,
      color: colors[Math.floor(Math.random() * colors.length)],
    })
  }
  start()
}

/** Sparks drifting down from the top edge for a few seconds (easter egg). */
export function sparkRain(durationMs = 3500) {
  if (prefersReducedMotion() || typeof document === 'undefined') return
  ensureCanvas()
  const colors = themeColors()
  const until = performance.now() + durationMs

  const drip = () => {
    const room = Math.max(0, MAX_SPARKS - sparks.length)
    for (let i = 0; i < Math.min(6, room); i++) {
      const maxLife = 90 + Math.random() * 60
      sparks.push({
        x: Math.random() * window.innerWidth,
        y: -10,
        vx: (Math.random() - 0.5) * 1.5,
        vy: 1 + Math.random() * 3,
        life: maxLife,
        maxLife,
        size: 1.2 + Math.random() * 2,
        color: colors[Math.floor(Math.random() * colors.length)],
      })
    }
    start()
    if (performance.now() < until) requestAnimationFrame(drip)
  }
  drip()
}
