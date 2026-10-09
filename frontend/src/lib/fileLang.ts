/** File-extension helpers shared by the explorer, editor and status bar. */

const EXT_COLOR: Record<string, string> = {
  py: '#3572a5', js: '#d4b830', mjs: '#d4b830', cjs: '#d4b830', jsx: '#d4b830',
  ts: '#3178c6', tsx: '#3178c6', cpp: '#f34b7d', cc: '#f34b7d', cxx: '#f34b7d', h: '#f34b7d', hpp: '#f34b7d',
  css: '#7c4dce', html: '#e34c26', json: '#b45309', md: '#6f6258', sql: '#e38c00', sh: '#4f9a2f',
}

const MONACO: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  py: 'python', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', h: 'cpp', hpp: 'cpp', json: 'json', md: 'markdown',
  css: 'css', html: 'html', yml: 'yaml', yaml: 'yaml', sql: 'sql', sh: 'shell',
}

const LABEL: Record<string, string> = {
  typescript: 'TypeScript', javascript: 'JavaScript', python: 'Python', cpp: 'C++', json: 'JSON',
  markdown: 'Markdown', css: 'CSS', html: 'HTML', yaml: 'YAML', sql: 'SQL', shell: 'Shell', plaintext: 'Plain text',
}

const ext = (path: string) => path.split('.').pop()?.toLowerCase() || ''

/** Icon color for a file (roughly GitHub linguist's palette). */
export const fileColor = (path: string) => EXT_COLOR[ext(path)] || 'var(--color-text-muted)'

/** Monaco language id for a file. */
export const monacoLanguage = (path?: string | null) => (path && MONACO[ext(path)]) || 'plaintext'

/** Human-readable language name for a file. */
export const languageLabel = (path?: string | null) => LABEL[monacoLanguage(path)]

/** Whether the run button can execute this file. */
export const isRunnable = (path?: string | null) => !!path && /\.(js|mjs|cjs|ts|py|cpp|cc|cxx)$/i.test(path)
