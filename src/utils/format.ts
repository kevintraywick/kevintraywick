export function formatDate(iso: string, includeYear = false) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(includeYear ? { year: 'numeric' } : {}),
  })
}

export function hostname(url: string) {
  try { return new URL(url).hostname } catch { return url }
}

// The API's timestamps are SQLite UTC with no zone marker ("2026-10-29 14:23:26");
// read bare ones as UTC so the time shown is the visitor's local time.
export function formatDateTime(stamp: string) {
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(stamp) ? stamp : stamp.replace(' ', 'T') + 'Z'
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `${date} · ${time}`
}
