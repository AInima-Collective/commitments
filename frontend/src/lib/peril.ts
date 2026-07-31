// Peril metadata helpers. A mutual's `perilURI` is either an inline
// `data:application/json;base64,…` document (schema `peril.v1`, written by the
// seed and the registry create flow) or a plain ipfs:// reference. These
// helpers resolve a human label / description from either shape.

export interface PerilMeta {
  name?: string
  description?: string
  trigger?: string
}

/** Decode a `data:application/json;base64,` peril document, if that's what `uri` is. */
export function parsePerilURI(uri: string | undefined): PerilMeta {
  if (!uri) return {}
  const m = /^data:application\/json(?:;[^,]*)?;base64,(.*)$/.exec(uri)
  if (!m) return {}
  try {
    const json =
      typeof atob !== 'undefined' ? atob(m[1]) : Buffer.from(m[1], 'base64').toString('utf-8')
    const obj = JSON.parse(json) as PerilMeta
    return { name: obj.name, description: obj.description, trigger: obj.trigger }
  } catch {
    return {}
  }
}

/** A short human label for a peril: the document `name`, else the URI's last path segment. */
export function perilLabel(uri: string | undefined): string {
  if (!uri) return 'Mutual'
  const parsed = parsePerilURI(uri)
  if (parsed.name) return parsed.name
  const trimmed = uri.replace(/^ipfs:\/\//, '').replace(/\/$/, '')
  const seg = trimmed.split('/').pop() ?? trimmed
  return seg.length > 0 ? seg : 'Mutual'
}
