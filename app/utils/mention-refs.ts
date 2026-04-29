export interface MentionRef {
  assetId: string
  filename: string
}

export function reconcileMentionRefs(text: string, refs: MentionRef[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const r of refs) {
    if (!text.includes('@' + r.filename)) continue
    if (seen.has(r.assetId)) continue
    seen.add(r.assetId)
    out.push(r.assetId)
  }
  return out
}
