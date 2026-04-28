/**
 * Format a Date as a short relative time string ("2m", "1h", "3d", "1w", "2mo").
 * Centralizes the format used by the sidebar project list, project cards, and timestamps.
 */
export function useRelativeTime() {
  function format(date: Date): string {
    const now = Date.now()
    const diff = now - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)
    const weeks = Math.floor(diff / 604800000)
    const months = Math.floor(diff / 2592000000)

    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes}m`
    if (hours < 24) return `${hours}h`
    if (days < 7) return `${days}d`
    if (weeks < 4) return `${weeks}w`
    return `${months}mo`
  }

  return { format }
}
