// Single source of truth: the raw skill text is imported directly from the
// on-disk Claude Code skill so the page and the installable skill never drift.
// Vite serves it via `?raw`; `fs.allow` in vite.config.ts already permits the
// repo root (the skill lives at <repo>/.claude/skills/commitments).
import skillRaw from '../../../.claude/skills/commitments/SKILL.md?raw'
import { MarkdownPage } from '../components/docs/MarkdownPage'
import { PageHeader } from '../components/protocol'
import { Card, CopyButton, Disclosure, Notice } from '../components/ui'

const SKILL_DIR = '.claude/skills/commitments'
const SKILL_PATH = `${SKILL_DIR}/SKILL.md`
const REFERENCE_PREFIX = '../../../.claude/skills/commitments/reference/'

// The comprehensive skill uses progressive disclosure: a router SKILL.md plus a
// reference/ file per subsystem. Surface every reference file so the page is a
// faithful, copyable mirror of the installed skill — not just its entry point.
const referenceModules = import.meta.glob('../../../.claude/skills/commitments/reference/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const referenceFiles = Object.entries(referenceModules)
  .map(([key, content]) => {
    const file = key.startsWith(REFERENCE_PREFIX) ? key.slice(REFERENCE_PREFIX.length) : key
    return { file, path: `${SKILL_DIR}/reference/${file}`, content }
  })
  .sort((a, b) => a.file.localeCompare(b.file))

export default function Resources() {
  return (
    <div className="ds-page">
      <PageHeader
        eyebrow="resources"
        title="Agent skills"
        lead="Copyable building blocks for driving the protocol with an AI agent. Grab the skill text and drop it into your agent's skill set."
      />

      <Card>
        <div className="ds-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
          <div className="ds-stack ds-stack-2">
            <h2 className="ds-text-lg">Commitments protocol</h2>
            <p className="ds-subtle">
              Teaches an agent to operate the whole protocol: deposit-first funding, the{' '}
              <code className="ds-doc-inline-code">createCommitment(CommitmentParams)</code> flow, two-phase
              forfeiture, unbonding, bilateral agreements, arbiter selection, distribution strategies, vault-share
              backing, and the registry / mesh / governance / rewards layers. Source of truth:{' '}
              <code className="ds-doc-inline-code">{SKILL_PATH}</code>.
            </p>
          </div>
          <CopyButton value={skillRaw} label="Copy SKILL.md" inline />
        </div>
      </Card>

      <Notice tone="info" size="sm">
        Drop the <code className="ds-doc-inline-code">commitments/</code> directory under your agent's skills folder, or
        feed <code className="ds-doc-inline-code">SKILL.md</code> directly as context. It is a working Claude Code skill
        in this repo; the <code className="ds-doc-inline-code">reference/</code> files below are read on demand.
      </Notice>

      <Card>
        <MarkdownPage content={skillRaw} sourcePath={SKILL_PATH} />
      </Card>

      {referenceFiles.length > 0 && (
        <div className="ds-stack ds-stack-3">
          <h2 className="ds-text-lg">Reference files</h2>
          {referenceFiles.map(({ file, path, content }) => (
            <Card key={file}>
              <Disclosure label={`reference/${file}`}>
                <div className="ds-stack ds-stack-3">
                  <div className="ds-row" style={{ justifyContent: 'flex-end' }}>
                    <CopyButton value={content} label={`Copy ${file}`} inline />
                  </div>
                  <MarkdownPage content={content} sourcePath={path} />
                </div>
              </Disclosure>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
