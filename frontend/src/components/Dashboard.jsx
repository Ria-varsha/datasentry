import { useEffect, useState, useRef, useCallback } from 'react'

/* ═══════════════════════════════════════════════════════════════════════════
   ANIMATED NUMBER COUNTER — easeOut cubic RAF animation
   ═══════════════════════════════════════════════════════════════════════════ */
function AnimatedNumber({ value, duration = 950 }) {
  const [display, setDisplay] = useState(0)
  const rafRef = useRef(null)

  useEffect(() => {
    if (value === 0) { setDisplay(0); return }
    const start   = performance.now()
    const easeOut = (t) => 1 - Math.pow(1 - t, 3)
    const tick    = (now) => {
      const t = Math.min((now - start) / duration, 1)
      setDisplay(Math.round(easeOut(t) * value))
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [value, duration])

  return <>{display.toLocaleString()}</>
}

/* ═══════════════════════════════════════════════════════════════════════════
   RIPPLE HOOK
   ═══════════════════════════════════════════════════════════════════════════ */
function useRipple(ref) {
  return useCallback((e) => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const size = Math.max(rect.width, rect.height) * 2
    const x    = e.clientX - rect.left - size / 2
    const y    = e.clientY - rect.top  - size / 2
    const r    = document.createElement('span')
    r.className = 'btn-ripple'
    Object.assign(r.style, { width: size+'px', height: size+'px', left: x+'px', top: y+'px' })
    el.appendChild(r)
    setTimeout(() => r.remove(), 660)
  }, [ref])
}

/* ═══════════════════════════════════════════════════════════════════════════
   METRIC CARD
   ═══════════════════════════════════════════════════════════════════════════ */
function MetricCard({ value, label, sublabel, accentColor, decoColor, bgColor, borderColor, badgeBg, badgeColor, badgeBorder, badgeText, iconSvg, delay }) {
  return (
    <div
      className="metric-card anim-fade-up"
      style={{
        animationDelay: `${delay}ms`,
        opacity: 0,
        borderColor,
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div
          className="w-11 h-11 rounded-2xl flex items-center justify-center"
          style={{ background: bgColor, border: `1px solid ${borderColor}` }}
        >
          {iconSvg}
        </div>
        <span
          className="badge"
          style={{ background: badgeBg, color: badgeColor, border: `1px solid ${badgeBorder}` }}
        >
          {badgeText}
        </span>
      </div>

      {/* Number */}
      <p
        className="font-display font-bold metric-value mb-1"
        style={{ fontSize: '2.1rem', lineHeight: 1, color: accentColor, letterSpacing: '-0.04em' }}
      >
        <AnimatedNumber value={value} />
      </p>
      <p className="text-sm font-semibold text-slate-700">{label}</p>
      <p className="text-xs text-slate-400 mt-0.5">{sublabel}</p>

      {/* Corner decoration */}
      <div
        className="absolute bottom-0 right-0 w-20 h-20 rounded-tl-full"
        style={{ background: decoColor, opacity: 0.06 }}
        aria-hidden
      />
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   HEALTH BAR
   ═══════════════════════════════════════════════════════════════════════════ */
function HealthBar({ cleanPct, quarPct, cleanCount, quarCount, total }) {
  const [go, setGo] = useState(false)
  useEffect(() => { const t = setTimeout(() => setGo(true), 250); return () => clearTimeout(t) }, [])

  const label =
    cleanPct === 100 ? { text: 'Perfect Health',          color: '#15803d', bg: 'rgba(220,252,231,0.9)', border: 'rgba(187,247,208,0.8)' } :
    cleanPct >= 80   ? { text: 'Good Condition',           color: '#3640d2', bg: 'rgba(224,234,255,0.9)', border: 'rgba(199,215,254,0.8)' } :
    cleanPct >= 50   ? { text: 'Attention Required',       color: '#b45309', bg: 'rgba(254,243,199,0.9)', border: 'rgba(253,230,138,0.8)' } :
                       { text: 'Critical — Review Needed', color: '#dc2626', bg: 'rgba(254,226,226,0.9)', border: 'rgba(254,202,202,0.8)' }

  return (
    <div>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Data Health Overview</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {total.toLocaleString()} total rows processed through the validation pipeline
          </p>
        </div>
        <span className="badge" style={{ background: label.bg, color: label.color, border: `1px solid ${label.border}` }}>
          {label.text}
        </span>
      </div>

      {/* Segmented bar */}
      <div
        className="w-full h-5 rounded-full overflow-hidden flex"
        style={{ background: 'rgba(224,234,255,0.6)' }}
      >
        {cleanPct > 0 && (
          <div
            className="h-full relative overflow-hidden"
            style={{
              width: go ? `${cleanPct}%` : '0%',
              background: 'linear-gradient(90deg, #15803d, #22c55e, #4ade80)',
              transition: 'width 1.5s cubic-bezier(0.4,0,0.2,1)',
              boxShadow: '2px 0 10px rgba(22,163,74,0.4)',
              borderRadius: quarPct === 0 ? '9999px' : '9999px 0 0 9999px',
            }}
          >
            <div
              className="absolute inset-0"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)',
                animation: 'shimmer-move 2.8s infinite',
              }}
            />
          </div>
        )}
        {quarPct > 0 && (
          <div
            style={{
              width: go ? `${quarPct}%` : '0%',
              background: 'linear-gradient(90deg, #d97706, #f59e0b, #fbbf24)',
              transition: 'width 1.5s cubic-bezier(0.4,0,0.2,1) 0.08s',
              boxShadow: '-2px 0 10px rgba(217,119,6,0.4)',
              borderRadius: cleanPct === 0 ? '9999px' : '0 9999px 9999px 0',
            }}
          />
        )}
      </div>

      {/* Tick labels */}
      <div className="flex justify-between mt-1 px-0.5">
        {['0%','25%','50%','75%','100%'].map(t => (
          <span key={t} className="font-mono text-slate-300" style={{ fontSize: 10 }}>{t}</span>
        ))}
      </div>

      {/* Legend tiles */}
      <div className="grid grid-cols-2 gap-4 mt-5">
        <div
          className="rounded-xl px-4 py-3.5 flex items-center gap-3"
          style={{ background: 'rgba(240,253,244,0.9)', border: '1px solid rgba(220,252,231,0.8)' }}
        >
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: '#22c55e', boxShadow: '0 0 0 3px rgba(34,197,94,0.2)' }} />
          <div>
            <p className="text-sm font-bold text-emerald-800">{cleanCount.toLocaleString()} rows</p>
            <p className="text-xs text-emerald-600">Clean — {cleanPct.toFixed(1)}%</p>
          </div>
        </div>
        <div
          className="rounded-xl px-4 py-3.5 flex items-center gap-3"
          style={{ background: 'rgba(255,251,235,0.9)', border: '1px solid rgba(254,243,199,0.8)' }}
        >
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: '#f59e0b', boxShadow: '0 0 0 3px rgba(245,158,11,0.2)' }} />
          <div>
            <p className="text-sm font-bold text-amber-800">{quarCount.toLocaleString()} rows</p>
            <p className="text-xs text-amber-600">Quarantined — {quarPct.toFixed(1)}%</p>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   ERROR ROW
   ═══════════════════════════════════════════════════════════════════════════ */
function ErrorRow({ rank, reason, count, maxCount, totalQuar, delay }) {
  const [go, setGo] = useState(false)
  const pct    = maxCount  > 0 ? (count / maxCount)  * 100 : 0
  const relPct = totalQuar > 0 ? (count / totalQuar) * 100 : 0
  useEffect(() => { const t = setTimeout(() => setGo(true), delay + 120); return () => clearTimeout(t) }, [delay])

  return (
    <div
      className="error-row anim-fade-up"
      style={{ animationDelay: `${delay}ms`, opacity: 0 }}
    >
      <div className="flex items-center gap-3 mb-2.5">
        <span
          className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
          style={{ background: 'rgba(254,243,199,0.9)', color: '#b45309' }}
        >
          {rank}
        </span>
        <span className="text-sm text-slate-700 font-medium flex-1 leading-snug">{reason}</span>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-slate-400">{relPct.toFixed(1)}%</span>
          <span
            className="font-display font-bold metric-value"
            style={{ fontSize: '1.05rem', color: '#b45309', minWidth: '2.5rem', textAlign: 'right' }}
          >
            {count}
          </span>
        </div>
      </div>
      <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(253,230,138,0.6)' }}>
        <div
          className="h-full rounded-full"
          style={{
            width: go ? `${pct}%` : '0%',
            background: 'linear-gradient(90deg, #b45309, #d97706, #f59e0b)',
            transition: 'width 1.1s cubic-bezier(0.4,0,0.2,1)',
            boxShadow: '0 1px 4px rgba(217,119,6,0.4)',
          }}
        />
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   DOWNLOAD BUTTON
   ═══════════════════════════════════════════════════════════════════════════ */
function DownloadButton({ id, label, sublabel, ext, btnClass, iconSvg, disabled, onClick }) {
  const ref          = useRef(null)
  const createRipple = useRipple(ref)
  return (
    <button
      id={id}
      ref={ref}
      disabled={disabled}
      onClick={(e) => { createRipple(e); if (!disabled) onClick() }}
      className={`btn ${btnClass} w-full rounded-2xl px-5 py-5 flex items-center gap-4 text-left
                  disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none disabled:filter-none`}
    >
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: 'rgba(0,0,0,0.15)' }}
      >
        {iconSvg}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white font-bold text-[15px] leading-tight">{label}</p>
        <p className="text-white/70 text-xs mt-0.5">{sublabel}</p>
      </div>
      <span
        className="px-2.5 py-1 rounded-lg text-xs font-bold flex-shrink-0"
        style={{ background: 'rgba(0,0,0,0.18)', color: 'rgba(255,255,255,0.88)' }}
      >
        .{ext}
      </span>
      <svg
        width="16" height="16" viewBox="0 0 24 24" fill="none"
        stroke="rgba(255,255,255,0.7)" strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round"
        className="flex-shrink-0"
      >
        <path d="M5 12h14M12 5l7 7-7 7"/>
      </svg>
    </button>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN DASHBOARD
   ═══════════════════════════════════════════════════════════════════════════ */
export default function Dashboard({ metrics, fileName, apiBase, onReset }) {
  const { total_rows, clean_count, quarantine_count, error_summary } = metrics
  const resetRef     = useRef(null)
  const createRipple = useRipple(resetRef)

  const cleanPct     = total_rows > 0 ? (clean_count      / total_rows) * 100 : 0
  const quarPct      = total_rows > 0 ? (quarantine_count / total_rows) * 100 : 0
  const sortedErrors = Object.entries(error_summary).sort((a, b) => b[1] - a[1])
  const maxErrCount  = sortedErrors.length > 0 ? sortedErrors[0][1] : 1

  return (
    <div className="max-w-5xl mx-auto space-y-5 anim-fade-scale">

      {/* ── File status bar ───────────────────────────────────── */}
      <div className="surface flex items-center gap-4 px-5 py-4" style={{ borderRadius: 16 }}>
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(240,244,255,0.9)', border: '1px solid rgba(199,215,254,0.7)' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5a6cf5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">{fileName}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="badge badge-emerald" style={{ fontSize: '10px', padding: '2px 8px' }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Validated
            </span>
            <span className="text-xs text-slate-400">·</span>
            <span className="font-mono text-xs text-slate-400">{total_rows.toLocaleString()} rows</span>
          </div>
        </div>
        <button
          id="process-new-btn"
          ref={resetRef}
          onClick={(e) => { createRipple(e); onReset() }}
          className="btn btn-ghost px-4 py-2.5 text-sm rounded-xl flex-shrink-0"
          style={{ border: '1px solid rgba(226,232,240,0.9)' }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10"/>
            <path d="M3.51 15a9 9 0 1 0 .49-3.56"/>
          </svg>
          New File
        </button>
      </div>

      {/* ── Metric cards ──────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        <MetricCard
          value={total_rows} label="Total Rows" sublabel="Ingested from CSV" delay={0}
          accentColor="#3640d2" decoColor="#4350ea"
          bgColor="rgba(240,244,255,0.9)" borderColor="rgba(199,215,254,0.6)"
          badgeBg="rgba(224,234,255,0.9)" badgeColor="#3640d2" badgeBorder="rgba(199,215,254,0.7)" badgeText="All"
          iconSvg={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5a6cf5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <line x1="3" y1="9"  x2="21" y2="9"/>
              <line x1="3" y1="15" x2="21" y2="15"/>
              <line x1="9" y1="3"  x2="9"  y2="21"/>
            </svg>
          }
        />
        <MetricCard
          value={clean_count} label="Clean Rows" sublabel="Passed all validation rules" delay={100}
          accentColor="#15803d" decoColor="#22c55e"
          bgColor="rgba(240,253,244,0.9)" borderColor="rgba(187,247,208,0.6)"
          badgeBg="rgba(220,252,231,0.9)" badgeColor="#15803d" badgeBorder="rgba(187,247,208,0.7)" badgeText={`${cleanPct.toFixed(1)}%`}
          iconSvg={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          }
        />
        <MetricCard
          value={quarantine_count} label="Quarantined" sublabel="Routed to error stream" delay={200}
          accentColor="#b45309" decoColor="#f59e0b"
          bgColor="rgba(255,251,235,0.9)" borderColor="rgba(253,230,138,0.6)"
          badgeBg="rgba(254,243,199,0.9)" badgeColor="#b45309" badgeBorder="rgba(253,230,138,0.7)" badgeText={`${quarPct.toFixed(1)}%`}
          iconSvg={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9"  x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          }
        />
      </div>

      {/* ── Health bar ─────────────────────────────────────────── */}
      <div className="surface p-7" style={{ borderRadius: 20 }}>
        <HealthBar
          cleanPct={cleanPct} quarPct={quarPct}
          cleanCount={clean_count} quarCount={quarantine_count}
          total={total_rows}
        />
      </div>

      {/* ── Error breakdown ─────────────────────────────────────── */}
      {sortedErrors.length > 0 && (
        <div className="surface p-7" style={{ borderRadius: 20 }}>
          <div className="flex items-start justify-between mb-5">
            <div>
              <h3 className="text-sm font-semibold text-slate-800 mb-0.5">Quarantine Reason Analysis</h3>
              <p className="text-xs text-slate-400">
                {sortedErrors.length} distinct error {sortedErrors.length === 1 ? 'category' : 'categories'} · ranked by frequency
              </p>
            </div>
            <span className="badge badge-amber">{quarantine_count} affected</span>
          </div>

          <div className="flex items-center justify-between mb-2">
            <span className="stat-label">Error Category</span>
            <span className="stat-label">Count</span>
          </div>
          <div className="divider mb-4" />

          <div className="space-y-3">
            {sortedErrors.map(([reason, count], idx) => (
              <ErrorRow
                key={reason}
                rank={idx + 1}
                reason={reason}
                count={count}
                maxCount={maxErrCount}
                totalQuar={quarantine_count}
                delay={idx * 75}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Downloads ──────────────────────────────────────────── */}
      <div className="surface p-7" style={{ borderRadius: 20 }}>
        <div className="mb-5">
          <h3 className="text-sm font-semibold text-slate-800 mb-0.5">Download Outputs</h3>
          <p className="text-xs text-slate-400">
            Clean data is split into 1,000-row CSV chunks and zipped. The quarantine file includes a{' '}
            <span className="font-mono text-slate-500">Quarantine_Reason</span> column with all errors per row.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <DownloadButton
            id="download-clean-btn"
            label="Download Clean Chunks"
            sublabel={`ZIP · ${clean_count.toLocaleString()} rows · 1,000 per chunk`}
            ext="zip"
            btnClass="btn-clean"
            disabled={clean_count === 0}
            onClick={() => window.open(`${apiBase}/api/download/clean`, '_blank')}
            iconSvg={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            }
          />
          <DownloadButton
            id="download-quarantine-btn"
            label="Download Quarantined Errors"
            sublabel={`CSV · ${quarantine_count.toLocaleString()} rows · with reason column`}
            ext="csv"
            btnClass="btn-amber"
            disabled={quarantine_count === 0}
            onClick={() => window.open(`${apiBase}/api/download/quarantine`, '_blank')}
            iconSvg={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9"  x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            }
          />
        </div>

        <div className="mt-5 pt-5 border-t border-slate-100 flex items-start gap-2">
          <svg className="flex-shrink-0 mt-0.5" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8"  x2="12.01" y2="8"/>
          </svg>
          <p className="text-xs text-slate-400 leading-relaxed">
            Output files are stored in a temporary server session. Uploading a new file replaces the previous outputs.
          </p>
        </div>
      </div>

    </div>
  )
}
