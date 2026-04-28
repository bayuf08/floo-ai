/**
 * Auto-scroll a container to its bottom when its content changes.
 * Returns the ref to bind to the scroll container and a manual scrollToBottom().
 */
export function useScrollToBottom() {
  const containerRef = ref<HTMLElement | null>(null)

  function scrollToBottom(smooth = true) {
    const el = containerRef.value
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  }

  /** Watch a reactive source and scroll on change (e.g. messages.length). */
  function watchAndScroll<T>(source: () => T) {
    watch(source, async () => {
      await nextTick()
      scrollToBottom()
    })
  }

  return { containerRef, scrollToBottom, watchAndScroll }
}
