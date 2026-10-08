const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
]

const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

/** "just now", "5 minutes ago", "yesterday", "3 weeks ago" */
export function timeAgo(date: string | Date, now = Date.now()) {
  const seconds = Math.round((new Date(date).getTime() - now) / 1000)
  // Intl throws a RangeError on NaN; a bad timestamp shouldn't take down a page
  if (!Number.isFinite(seconds)) return 'some time ago'
  if (Math.abs(seconds) < 45) return 'just now'
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size || unit === 'minute') {
      return formatter.format(Math.round(seconds / size), unit)
    }
  }
  return 'just now'
}

export type Heat = 'molten' | 'warm' | 'cool'

/** How "hot" something is by age — new work glows, old work cools to steel. */
export function heatOf(date: string | Date, now = Date.now()): Heat {
  const age = now - new Date(date).getTime()
  if (age < 10 * 60 * 1000) return 'molten'
  if (age < 24 * 3600 * 1000) return 'warm'
  return 'cool'
}
