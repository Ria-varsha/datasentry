import { useEffect, useState, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import QualityScore from './QualityScore'
import ColumnQuality from './ColumnQuality'

/* ═══════════════════════════════════════════════════════════════════════════
   ANIMATED NUMBER COUNTER — easeOut cubic RAF animation
   ═══════════════════════════════════════════════════════════════════════════ */
function AnimatedNumber({ value, duration = 900 }) {
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
function MetricCard({ value, label, sublabel, accentColor, borderColor, badgeBg, badgeColor, badgeBorder, badgeText, iconSvg, delay }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: delay / 1000 }}
      whileHover={{ scale: 1.02 }}
      className="metric-card bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 shadow-card transition-colors"
      style={{ borderColor }}
    >
      <div className="flex items-start justify-between mb-5">
        <div
          className="w-11 h-11 rounded-2xl flex items-center justify-center transition-colors"
          style={{ background: 'rgba(99,102,241,0.06)', border: `1px solid ${borderColor}` }}
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
      <p
        className="font-display font-bold metric-value mb-1 transition-colors"
        style={{ fontSize: '2.1rem', lineHeight: 1, color: accentColor, letterSpacing: '-0.04em' }}
      >
        <AnimatedNumber value={value} />
      </p>
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 transition-colors">{label}</p>
      <p className="text-xs mt-0.5 text-slate-500 dark:text-slate-400 transition-colors">{sublabel}</p>
      <div
        className="absolute bottom-0 right-0 w-20 h-20 rounded-tl-full"
        style={{ background: accentColor, opacity: 0.05 }}
        aria-hidden
      />
    </motion.div>
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

  const dotColor =
    rank === 1 ? '#ef4444' :
    rank <= 3  ? '#f59e0b' : '#94a3b8'

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay: delay / 1000 }}
      className="error-row p-3 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-slate-100 dark:border-transparent transition-colors"
    >
      <div className="flex items-center gap-3 mb-2.5">
        <span
          className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 transition-colors"
          style={{ background: 'rgba(245,158,11,0.12)', color: '#fbbf24' }}
        >
          {rank}
        </span>
        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dotColor }} />
        <span className="text-sm flex-1 leading-snug text-slate-700 dark:text-slate-300 transition-colors">{reason}</span>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-slate-500 dark:text-slate-400 transition-colors">{relPct.toFixed(1)}%</span>
          <span
            className="font-display font-bold metric-value transition-colors"
            style={{ fontSize: '1.05rem', color: '#fbbf24', minWidth: '2.5rem', textAlign: 'right' }}
          >
            {count}
          </span>
        </div>
      </div>
      <div className="w-full h-1.5 rounded-full overflow-hidden transition-colors" style={{ background: 'rgba(245,158,11,0.1)' }}>
        <div
          className="h-full rounded-full transition-colors"
          style={{
            width: go ? `${pct}%` : '0%',
            background: 'linear-gradient(90deg, #b45309, #d97706, #f59e0b)',
            transition: 'width 1.1s cubic-bezier(0.4,0,0.2,1)',
            boxShadow: '0 1px 4px rgba(245,158,11,0.35)',
          }}
        />
      </div>
    </motion.div>
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
                  disabled:opacity-30 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none`}
    >
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: 'rgba(0,0,0,0.2)' }}
      >
        {iconSvg}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white font-bold text-[15px] leading-tight">{label}</p>
        <p className="text-white/60 text-xs mt-0.5">{sublabel}</p>
      </div>
      <span
        className="px-2.5 py-1 rounded-lg text-xs font-bold flex-shrink-0"
        style={{ background: 'rgba(0,0,0,0.2)', color: 'rgba(255,255,255,0.8)' }}
      >
        .{ext}
      </span>
    </button>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN DASHBOARD
   ═══════════════════════════════════════════════════════════════════════════ */
export default function Dashboard({ metrics, fileName, datasetId, apiBase, onReset }) {
  const {
    total_rows,
    clean_count,
    quarantine_count,
    quality_score,
    duplicate_count,
    error_summary,
    column_quality,
  } = metrics

  const resetRef     = useRef(null)
  const createRipple = useRipple(resetRef)
  const cleanPct     = total_rows > 0 ? (clean_count      / total_rows) * 100 : 0
  const quarPct      = total_rows > 0 ? (quarantine_count / total_rows) * 100 : 0
  const sortedErrors = Object.entries(error_summary || {}).sort((a, b) => b[1] - a[1])
  const maxErrCount  = sortedErrors.length > 0 ? sortedErrors[0][1] : 1

  const dlBase = `${apiBase}/api/datasets/${datasetId}`

  return (
    <div className="max-w-5xl mx-auto space-y-5 anim-fade-scale">

      <div className="surface bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/50 flex items-center gap-4 px-5 py-4 transition-colors" style={{ borderRadius: 16 }}>
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors"
          style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate text-slate-800 dark:text-slate-100 transition-colors">{fileName}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="badge badge-emerald" style={{ fontSize: '10px', padding: '2px 8px' }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Validated
            </span>
            <span className="text-xs text-slate-400 dark:text-slate-500 transition-colors">·</span>
            <span className="font-mono text-xs text-slate-500 dark:text-slate-400 transition-colors">{total_rows.toLocaleString()} rows</span>
            <span className="text-xs text-slate-400 dark:text-slate-500 transition-colors">·</span>
            <span className="font-mono text-xs text-slate-500 dark:text-slate-400 transition-colors">ID: {datasetId}</span>
          </div>
        </div>
        <button
          id="process-new-btn"
          ref={resetRef}
          onClick={(e) => { createRipple(e); onReset() }}
          className="btn btn-ghost px-4 py-2.5 text-sm rounded-xl flex-shrink-0 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10"/>
            <path d="M3.51 15a9 9 0 1 0 .49-3.56"/>
          </svg>
          New File
        </button>
      </div>

      {/* ── Metric cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        <MetricCard
          value={total_rows} label="Total Records" sublabel="Ingested from file" delay={0}
          accentColor="#818cf8" borderColor="rgba(99,102,241,0.2)"
          badgeBg="rgba(99,102,241,0.12)" badgeColor="#a5b4fc" badgeBorder="rgba(99,102,241,0.2)" badgeText="Total"
          iconSvg={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <line x1="3" y1="9"  x2="21" y2="9"/>
              <line x1="3" y1="15" x2="21" y2="15"/>
              <line x1="9" y1="3"  x2="9"  y2="21"/>
            </svg>
          }
        />
        <MetricCard
          value={clean_count} label="Valid Records" sublabel={`Passed all rules · ${cleanPct.toFixed(1)}%`} delay={100}
          accentColor="#34d399" borderColor="rgba(16,185,129,0.2)"
          badgeBg="rgba(16,185,129,0.12)" badgeColor="#34d399" badgeBorder="rgba(16,185,129,0.2)" badgeText={`${cleanPct.toFixed(1)}%`}
          iconSvg={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          }
        />
        <MetricCard
          value={quarantine_count} label="Quarantined" sublabel={`Failed validation · ${quarPct.toFixed(1)}%`} delay={200}
          accentColor="#fbbf24" borderColor="rgba(245,158,11,0.2)"
          badgeBg="rgba(245,158,11,0.12)" badgeColor="#fbbf24" badgeBorder="rgba(245,158,11,0.2)" badgeText={`${quarPct.toFixed(1)}%`}
          iconSvg={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9"  x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          }
        />
      </div>

      {/* ── Quality Overview (ring + column bars) ─────────────────────────── */}
      <div className="surface p-7 bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/50 transition-colors" style={{ borderRadius: 20 }}>
        <div className="flex items-start justify-between mb-6">
          <div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 transition-colors">Dataset Quality Overview</h3>
            <p className="text-xs mt-0.5 text-slate-500 dark:text-slate-400 transition-colors">
              Quality Score = (valid ÷ total) × 100
            </p>
          </div>
          {duplicate_count > 0 && (
            <span className="badge badge-red">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              {duplicate_count} duplicates
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-8">
          {/* Left — score ring */}
          <QualityScore
            score={quality_score}
            cleanCount={clean_count}
            quarCount={quarantine_count}
            duplicateCount={duplicate_count}
            totalRows={total_rows}
          />
          {/* Right — column bars */}
          {column_quality && <ColumnQuality columnQuality={column_quality} />}
        </div>
      </div>

      {/* ── Top Data Quality Issues ───────────────────────────────────────── */}
      {sortedErrors.length > 0 && (
        <div className="surface p-7 bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/50 transition-colors" style={{ borderRadius: 20 }}>
          <div className="flex items-start justify-between mb-5">
            <div>
              <h3 className="text-sm font-semibold mb-0.5 text-slate-800 dark:text-slate-100 transition-colors">
                Top Data Quality Issues
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 transition-colors">
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

      {/* ── Downloads ────────────────────────────────────────────────────── */}
      <div className="surface p-7 bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/50 transition-colors" style={{ borderRadius: 20 }}>
        <div className="mb-5">
          <h3 className="text-sm font-semibold mb-0.5 text-slate-800 dark:text-slate-100 transition-colors">Download Outputs</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 transition-colors">
            Clean data is split into 1,000-row CSV chunks and zipped. The quarantine file includes a{' '}
            <span className="font-mono text-slate-400 dark:text-slate-500 transition-colors">Quarantine_Reason</span> column with all errors per row.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <DownloadButton
            id="download-clean-btn"
            label="Download Valid Data"
            sublabel={`ZIP · ${clean_count.toLocaleString()} rows · 1,000 per chunk`}
            ext="zip"
            btnClass="btn-clean"
            disabled={clean_count === 0}
            onClick={() => window.open(`${dlBase}/download/clean`, '_blank')}
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
            onClick={() => window.open(`${dlBase}/download/quarantine`, '_blank')}
            iconSvg={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9"  x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            }
          />
        </div>

        <div className="mt-5 pt-5 flex items-start gap-2 border-t border-slate-200 dark:border-slate-700/50 transition-colors">
          <svg className="flex-shrink-0 mt-0.5 text-slate-500 dark:text-slate-400 transition-colors" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8"  x2="12.01" y2="8"/>
          </svg>
          <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400 transition-colors">
            Output files are associated with dataset <span className="font-mono text-slate-400 dark:text-slate-500 transition-colors">{datasetId}</span>.
            Uploading a new file creates a separate dataset session.
          </p>
        </div>
      </div>

    </div>
  )
}
