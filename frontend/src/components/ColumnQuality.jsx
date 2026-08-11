import { useEffect, useState } from 'react'

/**
 * Animated horizontal bar chart showing per-column quality percentages.
 * Colour-codes each bar: ≥90 emerald, ≥75 indigo, ≥50 amber, <50 red.
 */

const COLUMNS_ORDER = [
  'customer_id',
  'full_name',
  'email',
  'phone_number',
  'age',
  'city',
  'signup_date',
]

function barColor(pct) {
  if (pct >= 90) return 'linear-gradient(90deg, #059669, #10b981, #34d399)'
  if (pct >= 75) return 'linear-gradient(90deg, #4f46e5, #6366f1, #818cf8)'
  if (pct >= 50) return 'linear-gradient(90deg, #b45309, #d97706, #f59e0b)'
  return              'linear-gradient(90deg, #b91c1c, #dc2626, #ef4444)'
}

function textColor(pct) {
  if (pct >= 90) return '#34d399'
  if (pct >= 75) return '#a5b4fc'
  if (pct >= 50) return '#fbbf24'
  return '#fca5a5'
}

function ColBar({ colName, pct, delay }) {
  const [go, setGo] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setGo(true), delay + 100)
    return () => clearTimeout(t)
  }, [delay])

  return (
    <div
      className="anim-fade-up"
      style={{ animationDelay: `${delay}ms`, opacity: 0 }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-mono text-xs" style={{ color: '#94a3b8' }}>{colName}</span>
        <span
          className="font-mono text-xs font-bold metric-value"
          style={{ color: textColor(pct), minWidth: '3.2rem', textAlign: 'right' }}
        >
          {pct.toFixed(1)}%
        </span>
      </div>
      <div className="column-bar-track">
        <div
          className="column-bar-fill"
          style={{
            width: go ? `${pct}%` : '0%',
            background: barColor(pct),
          }}
        />
      </div>
    </div>
  )
}

export default function ColumnQuality({ columnQuality }) {
  const cols = COLUMNS_ORDER.filter((c) => c in columnQuality)

  const avgScore = cols.length > 0
    ? cols.reduce((sum, c) => sum + columnQuality[c], 0) / cols.length
    : 0

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: '#f1f5f9' }}>
            Column Quality
          </h3>
          <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>
            Valid values per column · avg {avgScore.toFixed(1)}%
          </p>
        </div>
        <span className="badge badge-brand text-xs">7 columns</span>
      </div>

      {/* Bars */}
      <div className="space-y-4">
        {cols.map((col, i) => (
          <ColBar
            key={col}
            colName={col}
            pct={columnQuality[col]}
            delay={i * 80}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-6 pt-5" style={{ borderTop: '1px solid rgba(99,102,241,0.12)' }}>
        {[
          { range: '≥ 90%', color: '#34d399', label: 'Excellent' },
          { range: '≥ 75%', color: '#a5b4fc', label: 'Good' },
          { range: '≥ 50%', color: '#fbbf24', label: 'Fair' },
          { range: '< 50%', color: '#fca5a5', label: 'Critical' },
        ].map(({ range, color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: color }} />
            <span className="text-xs" style={{ color: '#475569' }}>
              {range} — {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
