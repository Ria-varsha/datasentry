import { useEffect, useRef, useState } from 'react'

/**
 * Animated SVG ring showing dataset quality score (0–100).
 * Colours:
 *   ≥ 90 → emerald  (Excellent)
 *   ≥ 75 → indigo   (Good)
 *   ≥ 50 → amber    (Attention)
 *   < 50 → red      (Critical)
 */

const RADIUS      = 64
const STROKE_W    = 9
const CIRCUMF     = 2 * Math.PI * RADIUS
const CENTER      = 88   // viewBox is 176×176

function getScoreColor(score) {
  if (score >= 90) return { stroke: '#10b981', glow: 'rgba(16,185,129,0.35)', label: 'EXCELLENT', badge: 'badge-emerald' }
  if (score >= 75) return { stroke: '#6366f1', glow: 'rgba(99,102,241,0.35)',  label: 'GOOD',      badge: 'badge-brand'   }
  if (score >= 50) return { stroke: '#f59e0b', glow: 'rgba(245,158,11,0.35)', label: 'FAIR',      badge: 'badge-amber'   }
  return               { stroke: '#ef4444', glow: 'rgba(239,68,68,0.35)',   label: 'CRITICAL',  badge: 'badge-red'     }
}

function AnimatedNumber({ target, duration = 1200 }) {
  const [display, setDisplay] = useState(0)
  const raf = useRef(null)
  useEffect(() => {
    const start  = performance.now()
    const ease   = (t) => 1 - Math.pow(1 - t, 3)
    const tick   = (now) => {
      const t = Math.min((now - start) / duration, 1)
      setDisplay(Math.round(ease(t) * target))
      if (t < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [target, duration])
  return <>{display}</>
}

export default function QualityScore({ score, cleanCount, quarCount, duplicateCount, totalRows }) {
  const [animated, setAnimated] = useState(false)
  const col    = getScoreColor(score)
  const offset = animated ? CIRCUMF * (1 - score / 100) : CIRCUMF

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 200)
    return () => clearTimeout(t)
  }, [score])

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Score ring */}
      <div className="relative flex items-center justify-center">
        {/* Glow halo */}
        <div
          className="absolute rounded-full"
          style={{
            inset: 8,
            background: `radial-gradient(circle, ${col.glow} 0%, transparent 70%)`,
            filter: 'blur(20px)',
            animation: 'pulse-ring 3s ease-in-out infinite',
          }}
        />
        <svg width={176} height={176} viewBox={`0 0 ${CENTER * 2} ${CENTER * 2}`}>
          {/* Track */}
          <circle
            className="quality-ring-track"
            cx={CENTER} cy={CENTER} r={RADIUS}
            strokeWidth={STROKE_W}
          />
          {/* Fill */}
          <circle
            className="quality-ring-fill"
            cx={CENTER} cy={CENTER} r={RADIUS}
            strokeWidth={STROKE_W}
            stroke={col.stroke}
            strokeDasharray={CIRCUMF}
            strokeDashoffset={offset}
            style={{ transformOrigin: `${CENTER}px ${CENTER}px` }}
          />
          {/* Centre text */}
          <text
            x={CENTER} y={CENTER - 8}
            textAnchor="middle" dominantBaseline="middle"
            fontSize="30" fontWeight="800"
            fontFamily="Outfit, Inter, sans-serif"
            fill={col.stroke}
          >
            <tspan><AnimatedNumber target={score} /></tspan>
          </text>
          <text
            x={CENTER} y={CENTER + 20}
            textAnchor="middle" dominantBaseline="middle"
            fontSize="11" fontWeight="600"
            fontFamily="Inter, sans-serif"
            fill="#64748b" letterSpacing="2"
          >
            / 100
          </text>
        </svg>
      </div>

      {/* Health label */}
      <span className={`badge ${col.badge} text-sm px-5 py-1.5`}>
        ● {col.label}
      </span>

      {/* 3-stat row */}
      <div className="grid grid-cols-3 gap-3 w-full text-center">
        {[
          { value: cleanCount,     label: 'Valid',      color: '#34d399' },
          { value: quarCount,      label: 'Invalid',    color: '#f59e0b' },
          { value: duplicateCount, label: 'Duplicates', color: '#f87171' },
        ].map(({ value, label, color }) => (
          <div
            key={label}
            className="rounded-xl py-3"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <p
              className="font-display font-bold text-xl metric-value"
              style={{ color }}
            >
              {value.toLocaleString()}
            </p>
            <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Formula note */}
      <p className="text-xs text-center" style={{ color: '#475569' }}>
        Score = (valid ÷ total) × 100 &nbsp;·&nbsp; {totalRows.toLocaleString()} records analysed
      </p>
    </div>
  )
}
