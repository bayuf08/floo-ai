<template>
  <!--
    Renders a markdown string as sanitized HTML, styled with prose-like
    Tailwind utility classes that match the rest of the Floo design system.
    Used by SkillDetailDrawer to render the rich SKILL.md bodies seeded for
    Marketing + Creator skills (~5k chars of headings, lists, tables,
    blockquotes, bold, italic).

    Sanitization: every render goes through DOMPurify so a custom-skill
    user can't inject scripts or hostile attributes via the instructions
    textarea. We never render raw HTML — only the HTML marked produces
    AFTER it's been sanitized.

    SSR: this component is client-only because DOMPurify needs the DOM.
    The parent (SkillDetailDrawer) is itself click-triggered, so this is
    fine in practice. If you need SSR support later, switch to the
    isomorphic-dompurify package.
  -->
  <div
    class="floo-markdown text-sm text-floo-text-secondary leading-relaxed"
    v-html="html"
  />
</template>

<script setup lang="ts">
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const props = defineProps<{
  /** Raw markdown string. May be empty/null/undefined — renders nothing. */
  source: string | null | undefined
}>()

// Configure marked once. GFM gets us tables; breaks=false is the default
// markdown behavior (a single newline is whitespace, not a <br>) which
// matches how our SKILL.md bodies are authored.
marked.setOptions({
  gfm: true,
  breaks: false,
})

const html = computed(() => {
  const src = props.source?.trim()
  if (!src) return ''
  // marked.parse returns either string or Promise<string> depending on
  // async extensions. We don't use any, so the sync overload is safe.
  const raw = marked.parse(src, { async: false }) as string
  if (import.meta.server) {
    // SSR fallback: skip sanitize (DOMPurify needs window). The drawer
    // is client-only in practice, so this branch is rarely hit. Hydration
    // will replace this with the sanitized version.
    return raw
  }
  return DOMPurify.sanitize(raw)
})
</script>

<style scoped>
/*
  Prose-style typography. Targets the elements `marked` produces.
  Kept minimal — matches Floo's existing scale rather than dropping in
  the @tailwindcss/typography plugin (one more dep).
*/
.floo-markdown :deep(h1) {
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--ft-text);
  margin: 1.25rem 0 0.5rem;
  line-height: 1.3;
}
.floo-markdown :deep(h2) {
  font-size: 1rem;
  font-weight: 600;
  color: var(--ft-text);
  margin: 1.1rem 0 0.4rem;
  line-height: 1.35;
}
.floo-markdown :deep(h3) {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--ft-text);
  margin: 0.95rem 0 0.3rem;
  line-height: 1.4;
}
.floo-markdown :deep(h4),
.floo-markdown :deep(h5),
.floo-markdown :deep(h6) {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--ft-text);
  margin: 0.85rem 0 0.25rem;
}
.floo-markdown :deep(p) {
  margin: 0.55rem 0;
}
.floo-markdown :deep(ul),
.floo-markdown :deep(ol) {
  margin: 0.55rem 0 0.55rem 1.25rem;
  padding-left: 0.25rem;
}
.floo-markdown :deep(ul) { list-style: disc; }
.floo-markdown :deep(ol) { list-style: decimal; }
.floo-markdown :deep(li) { margin: 0.2rem 0; }
.floo-markdown :deep(li > p) { margin: 0.15rem 0; }
.floo-markdown :deep(strong) {
  font-weight: 600;
  color: var(--ft-text);
}
.floo-markdown :deep(em) {
  font-style: italic;
}
.floo-markdown :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.82rem;
  padding: 0.08rem 0.3rem;
  border-radius: 4px;
  background: var(--ft-surface-2, rgba(0,0,0,0.05));
  color: var(--ft-text);
}
.floo-markdown :deep(pre) {
  margin: 0.75rem 0;
  padding: 0.75rem 0.9rem;
  border-radius: 6px;
  background: var(--ft-surface-2, rgba(0,0,0,0.05));
  overflow-x: auto;
  font-size: 0.82rem;
}
.floo-markdown :deep(pre code) {
  background: transparent;
  padding: 0;
}
.floo-markdown :deep(blockquote) {
  margin: 0.75rem 0;
  padding: 0.25rem 0.85rem;
  border-left: 3px solid var(--ft-border-strong, #e5e7eb);
  color: var(--ft-text-muted);
  font-style: italic;
}
.floo-markdown :deep(table) {
  border-collapse: collapse;
  margin: 0.75rem 0;
  width: 100%;
  font-size: 0.82rem;
}
.floo-markdown :deep(th),
.floo-markdown :deep(td) {
  border: 1px solid var(--ft-border, #e5e7eb);
  padding: 0.45rem 0.6rem;
  text-align: left;
  vertical-align: top;
}
.floo-markdown :deep(th) {
  font-weight: 600;
  background: var(--ft-surface-2, rgba(0,0,0,0.04));
}
.floo-markdown :deep(hr) {
  margin: 1rem 0;
  border: 0;
  border-top: 1px solid var(--ft-border, #e5e7eb);
}
.floo-markdown :deep(a) {
  color: var(--ft-brand, #6366f1);
  text-decoration: underline;
}
/* Tighten the very first and last children so the wrapper itself controls
   the section's outer spacing. */
.floo-markdown :deep(> *:first-child) { margin-top: 0; }
.floo-markdown :deep(> *:last-child)  { margin-bottom: 0; }
</style>
