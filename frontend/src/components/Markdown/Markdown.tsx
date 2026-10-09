import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import { createElement } from 'react'

type Level = 1 | 2 | 3 | 4 | 5 | 6

/**
 * Renders user-authored markdown (READMEs, descriptions, comments) *under* the
 * page's own heading: `# Title` becomes an <h2> (or deeper with `offset`), so a
 * page never gets a second <h1> and the outline stays correct. The original
 * level is kept as an `md-hN` class so it still looks like an h1.
 */
export function Markdown({ children, offset = 1 }: { children: string, offset?: 1 | 2 | 3 }) {
  const components: Components = {}
  for (let n = 1 as Level; n <= 6; n = (n + 1) as Level) {
    const level = Math.min(6, n + offset)
    components[`h${n}`] = ({ node: _node, className, ...props }) => {
      void _node
      return createElement(`h${level}`, { ...props, className: [className, `md-h${n}`].filter(Boolean).join(' ') })
    }
  }
  return <ReactMarkdown components={components}>{children}</ReactMarkdown>
}
