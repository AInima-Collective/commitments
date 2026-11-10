import { useEffect, useState } from 'react'
import type { Highlighter } from 'shiki'
import { useTheme } from '../ui'

const SUPPORTED_LANGS = [
  'solidity',
  'typescript',
  'tsx',
  'javascript',
  'jsx',
  'json',
  'bash',
  'shell',
  'rust',
  'toml',
  'yaml',
  'diff',
  'text',
] as const

let highlighterPromise: Promise<Highlighter> | null = null

async function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = import('shiki').then(({ createHighlighter }) =>
      createHighlighter({
        themes: ['github-light', 'github-dark'],
        langs: SUPPORTED_LANGS as unknown as string[],
      }),
    )
  }
  return highlighterPromise
}

export function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const { theme } = useTheme()
  const [html, setHtml] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getHighlighter()
      .then((h) => {
        const loaded = h.getLoadedLanguages() as string[]
        const useLang = loaded.includes(lang) ? lang : 'text'
        return h.codeToHtml(code, {
          lang: useLang,
          theme: theme === 'light' ? 'github-light' : 'github-dark',
        })
      })
      .then((rendered) => {
        if (!cancelled) setHtml(rendered)
      })
      .catch(() => {
        if (!cancelled) setHtml(null)
      })
    return () => {
      cancelled = true
    }
  }, [code, lang, theme])

  if (html) return <div className="ds-doc-codeblock" dangerouslySetInnerHTML={{ __html: html }} />
  return (
    <pre className="ds-doc-codeblock-fallback">
      <code>{code}</code>
    </pre>
  )
}
