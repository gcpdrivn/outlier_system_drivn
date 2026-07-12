import { useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts'
import { fetchDistribution, fetchMeta } from './lib/api'

const METRICS = [
  { key: 'rev_per_km', label: 'Revenue / km', unit: '₹' },
  { key: 'rev_per_seat_km', label: 'Revenue / seat / km', unit: '₹' },
  { key: 'asp_booked', label: 'ASP booked', unit: '₹' },
  { key: 'asp_available', label: 'ASP available', unit: '₹' },
  { key: 'occupancy', label: 'Occupancy %', unit: '%' },
  { key: 'seats_booked', label: 'Seats booked', unit: '' },
]
const CLASSES = [['', 'All classes'], ['seater', 'Seater'], ['sleeper', 'Sleeper'], ['hybrid', 'Hybrid']]
const EVS = [['', 'EV + ICE'], ['true', 'EV only'], ['false', 'ICE only']]
const ACCENT = '#5cb030', UPPER = '#d97706', LOWER = '#3b82f6', GRID = '#e3e6ea', MUTED = '#6b7280'

const fmt = (n) => (n == null || !Number.isFinite(n) ? '—' : Math.abs(n) >= 1000 ? Math.round(n).toLocaleString() : (Math.round(n * 100) / 100).toLocaleString())

// Build a density histogram from the 101-point quantile array (each 1% interval
// distributed proportionally across fixed bins). Axis clipped to p0..p97 so a long
// upper tail doesn't crush the bulk; a flag notes clipped mass.
function histogram(q, nBins = 30) {
  if (!q || q.length < 101) return { bins: [], lo: 0, hi: 1, clipped: false }
  const lo = q[0], hi = q[97]
  if (!(hi > lo)) return { bins: [{ mid: lo, pct: 100 }], lo: lo - 1, hi: lo + 1, clipped: false }
  const w = (hi - lo) / nBins
  const bins = Array.from({ length: nBins }, (_, b) => ({ mid: lo + (b + 0.5) * w, x0: lo + b * w, x1: lo + (b + 1) * w, pct: 0 }))
  for (let i = 0; i < 100; i++) {
    const a = q[i], b = q[i + 1]
    if (b <= a) { const bi = Math.min(nBins - 1, Math.max(0, Math.floor((a - lo) / w))); if (a >= lo && a <= hi) bins[bi].pct += 1; continue }
    const s = Math.max(0, Math.floor((a - lo) / w)), e = Math.min(nBins - 1, Math.floor((b - lo) / w))
    for (let bi = s; bi <= e; bi++) {
      const ov = Math.min(b, bins[bi].x1) - Math.max(a, bins[bi].x0)
      if (ov > 0) bins[bi].pct += ov / (b - a)
    }
  }
  return { bins, lo, hi, clipped: q[100] > q[97] }
}

// Percentile rank (0–100) of value v within the quantile array (linear interp).
function pctRank(q, v) {
  if (!q || q.length < 101 || v == null || !Number.isFinite(v)) return null
  if (v <= q[0]) return 0
  if (v >= q[100]) return 100
  let i = 0
  while (i < 100 && q[i + 1] < v) i++
  const span = q[i + 1] - q[i]
  return Math.round((i + (span ? (v - q[i]) / span : 0)) * 10) / 10
}

function Stat({ label, value, accent }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: 11, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 700, color: accent || 'var(--text)' }}>{value}</span>
    </div>
  )
}

function BandPanel({ band, metricKey, metricLabel, unit, centre, point }) {
  const m = band.metrics?.[metricKey]
  const hist = useMemo(() => (m ? histogram(m.quantiles) : null), [m])
  if (!m) return null
  const centreVal = centre === 'mean' ? m.mean : centre === 'median' ? m.p50 : null
  const rank = point != null ? pctRank(m.quantiles, point) : null
  const u = (v) => (v == null ? '—' : (unit === '₹' ? '₹' : '') + fmt(v) + (unit === '%' ? '%' : ''))

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 17, fontWeight: 800 }}>{band.label} <span style={{ fontSize: 12, color: MUTED, fontWeight: 500 }}>km</span></div>
        <div style={{ display: 'flex', gap: 16 }}>
          <Stat label="Trips/day" value={fmt(band.avgTripsPerDay)} />
          <Stat label="Avg occ" value={band.avgOccupancy + '%'} />
          <Stat label="Avg km" value={fmt(band.avgKm)} />
        </div>
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={hist.bins} margin={{ top: 8, right: 12, left: 4, bottom: 20 }}>
          <CartesianGrid strokeDasharray="2 4" stroke={GRID} vertical={false} />
          <XAxis type="number" dataKey="mid" domain={[hist.lo, hist.hi]} tick={{ fill: MUTED, fontSize: 11 }} tickFormatter={(v) => fmt(v)} tickLine={false}
            label={{ value: `${metricLabel}${unit === '%' ? ' (%)' : unit === '₹' ? ' (₹)' : ''}`, position: 'insideBottom', offset: -12, style: { fill: 'var(--text)', fontSize: 12, fontWeight: 700 } }} />
          <YAxis tick={{ fill: MUTED, fontSize: 11 }} tickFormatter={(v) => v + '%'} tickLine={false} width={34} />
          <Tooltip cursor={{ fill: 'rgba(0,0,0,0.03)' }}
            formatter={(v) => [(Math.round(v * 10) / 10) + '% of trips', 'Density']}
            labelFormatter={(v) => `${metricLabel}: ~${fmt(v)}`}
            contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid var(--border-strong)' }} />
          <Bar dataKey="pct" fill={ACCENT} fillOpacity={0.55} isAnimationActive={false}>
            {hist.bins.map((_, i) => <Cell key={i} />)}
          </Bar>
          {[['p25', m.p25], ['p50', m.p50], ['p75', m.p75], ['p90', m.p90]].map(([lab, val]) => (
            <ReferenceLine key={lab} x={val} stroke={MUTED} strokeDasharray="3 3"
              label={{ value: lab, position: 'top', fill: MUTED, fontSize: 10 }} />
          ))}
          {centreVal != null && (
            <ReferenceLine x={centreVal} stroke={ACCENT} strokeWidth={2}
              label={{ value: centre, position: 'top', fill: ACCENT, fontSize: 11, fontWeight: 700 }} />
          )}
          {point != null && Number.isFinite(point) && (
            <ReferenceLine x={point} stroke={rank != null && rank >= 50 ? UPPER : LOWER} strokeWidth={2}
              label={{ value: `▶ ${rank}pct`, position: 'insideTopRight', fill: rank != null && rank >= 50 ? UPPER : LOWER, fontSize: 11, fontWeight: 800 }} />
          )}
        </BarChart>
      </ResponsiveContainer>
      {hist.clipped && <div style={{ fontSize: 10, color: MUTED, marginTop: -6 }}>Axis clipped at p97 — max {u(m.quantiles[100])} (long upper tail).</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
        <Stat label="p25" value={u(m.p25)} />
        <Stat label="p50" value={u(m.p50)} />
        <Stat label="p75" value={u(m.p75)} />
        <Stat label="p90" value={u(m.p90)} />
        <Stat label="Mean" value={u(m.mean)} accent={ACCENT} />
        <Stat label="Std dev" value={u(m.std)} />
        <Stat label="n" value={fmt(m.count)} />
      </div>
      {point != null && Number.isFinite(point) && (
        <div style={{ fontSize: 13, padding: '6px 10px', borderRadius: 6, background: rank >= 50 ? 'rgba(217,119,6,0.08)' : 'rgba(59,130,246,0.08)', color: rank >= 50 ? UPPER : LOWER, fontWeight: 600 }}>
          Your point {u(point)} → <strong>{rank}th percentile</strong> in this band
          {rank >= 90 ? ' · upper tail' : rank <= 10 ? ' · lower tail' : ''}
        </div>
      )}
    </div>
  )
}

export default function App({ user, logout }) {
  const [metric, setMetric] = useState('rev_per_km')
  const [bandsStr, setBandsStr] = useState('250,500,750')
  const [route, setRoute] = useState('')
  const [busClass, setBusClass] = useState('')
  const [ev, setEv] = useState('')
  const [centre, setCentre] = useState('median')       // median | mean | off
  const [pointStr, setPointStr] = useState('')
  const [routes, setRoutes] = useState([])
  const [state, setState] = useState({ data: null, loading: true, error: null })

  useEffect(() => { fetchMeta().then((m) => setRoutes((m.routes || []).map((r) => r.route))) }, [])

  const filter = useMemo(() => [
    route ? `route:${route}` : null,
    busClass ? `bus_class:${busClass}` : null,
    ev ? `is_ev:${ev}` : null,
  ].filter(Boolean).join(';'), [route, busClass, ev])

  useEffect(() => {
    let alive = true
    setState((s) => ({ ...s, loading: true, error: null }))
    fetchDistribution({ metrics: [metric], bands: bandsStr, filter })
      .then((data) => { if (alive) setState({ data, loading: false, error: null }) })
      .catch((e) => { if (alive) setState({ data: null, loading: false, error: e.message }) })
    return () => { alive = false }
  }, [metric, bandsStr, filter])

  const point = pointStr.trim() === '' ? null : Number(pointStr)
  const meta = METRICS.find((m) => m.key === metric)
  const { data, loading, error } = state

  const ctrl = { padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text)' }
  const seg = (active) => ({ padding: '6px 12px', border: '1px solid var(--border-strong)', background: active ? ACCENT : 'var(--surface)', color: active ? '#fff' : 'var(--text)', cursor: 'pointer', fontWeight: 600 })

  return (
    <div style={{ minHeight: '100vh' }}>
      <header style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 20, fontWeight: 900, letterSpacing: '0.06em' }}>DRIVN</span>
        <span style={{ fontSize: 15, color: MUTED }}>Outlier / Distribution Analysis</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, color: MUTED }}>{user?.name || user?.email}</span>
          <button onClick={logout} style={{ padding: '5px 12px', fontSize: 13, fontWeight: 600, borderRadius: 5, border: '1px solid var(--border-strong)', background: 'var(--surface)', cursor: 'pointer' }}>Sign out</button>
        </div>
      </header>

      {/* Controls */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end', padding: '14px 24px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: MUTED, fontWeight: 600 }}>METRIC
          <select value={metric} onChange={(e) => setMetric(e.target.value)} style={{ ...ctrl, minWidth: 180 }}>
            {METRICS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: MUTED, fontWeight: 600 }}>KM BAND CUT-OFFS
          <input value={bandsStr} onChange={(e) => setBandsStr(e.target.value)} placeholder="250,500,750" style={{ ...ctrl, width: 140 }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: MUTED, fontWeight: 600 }}>ROUTE
          <select value={route} onChange={(e) => setRoute(e.target.value)} style={{ ...ctrl, maxWidth: 220 }}>
            <option value="">All routes</option>
            {routes.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: MUTED, fontWeight: 600 }}>CLASS
          <select value={busClass} onChange={(e) => setBusClass(e.target.value)} style={ctrl}>
            {CLASSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: MUTED, fontWeight: 600 }}>FUEL
          <select value={ev} onChange={(e) => setEv(e.target.value)} style={ctrl}>
            {EVS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: MUTED, fontWeight: 600 }}>CENTRE LINE
          <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden' }}>
            {['median', 'mean', 'off'].map((c) => <button key={c} onClick={() => setCentre(c)} style={seg(centre === c)}>{c}</button>)}
          </div>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: MUTED, fontWeight: 600 }}>CHECK A POINT
          <input value={pointStr} onChange={(e) => setPointStr(e.target.value)} placeholder={`e.g. ${meta?.unit === '%' ? '85' : '120'}`} type="number" style={{ ...ctrl, width: 130 }} />
        </label>
      </div>

      {/* Body */}
      <div style={{ padding: '18px 24px' }}>
        {loading && <div style={{ color: MUTED, padding: 40, textAlign: 'center' }}>Computing distributions…</div>}
        {error && (
          <div style={{ padding: 16, background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 8, color: '#dc2626', fontSize: 13 }}>
            {/available_seater_revenue|Unrecognized name|available/i.test(error)
              ? 'ASP available needs a fact-table redeploy (canonical_grain.sql adds available_*_revenue). The other metrics work now.'
              : `Failed: ${error}`}
          </div>
        )}
        {data && !loading && (
          <>
            <div style={{ fontSize: 13, color: MUTED, marginBottom: 12 }}>
              Distribution of <strong style={{ color: 'var(--text)' }}>{meta?.label}</strong> across {data.bands.length} KM bands · window {data.window?.from} → {data.window?.to} · per-trip basis
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: 16 }}>
              {data.bands.map((b) => (
                <BandPanel key={b.band} band={b} metricKey={metric} metricLabel={meta?.label} unit={meta?.unit} centre={centre} point={point} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
