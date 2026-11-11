export function SectionHeading({ id, title, lead }: { id: string; title: string; lead?: string }) {
  return (
    <header className="ds-stack ds-stack-2" id={id}>
      <h2>{title}</h2>
      {lead && <p className="ds-muted ds-text-sm" style={{ maxWidth: '60ch' }}>{lead}</p>}
    </header>
  )
}
