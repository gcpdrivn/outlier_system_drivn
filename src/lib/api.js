const API_BASE = import.meta.env.VITE_API_BASE || ''

export async function fetchDistribution({ metrics, bands, filter, from, to } = {}) {
  const p = new URLSearchParams()
  if (metrics && metrics.length) p.set('metrics', metrics.join(','))
  if (bands) p.set('bands', bands)
  if (filter) p.set('filter', filter)
  if (from) p.set('from', from)
  if (to) p.set('to', to)
  const res = await fetch(`${API_BASE}/api/outlier/distribution?${p.toString()}`)
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body.error) throw new Error(body.error || `${res.status} ${res.statusText}`)
  return body
}

export async function fetchMeta() {
  try {
    const res = await fetch(`${API_BASE}/api/report/meta`)
    if (!res.ok) return { routes: [], operators: [] }
    return await res.json()
  } catch { return { routes: [], operators: [] } }
}
