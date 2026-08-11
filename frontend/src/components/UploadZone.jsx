import { useCallback, useState, useEffect, useRef } from 'react'
import { useDropzone } from 'react-dropzone'

/* ── Ripple hook ─────────────────────────────────────────────────────────── */
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

/* ── Pipeline steps ─────────────────────────────────────────────────────── */
const STEPS = [
  { id: 'parse',    label: 'Parsing file structure & encoding' },
  { id: 'schema',   label: 'Schema validation — checking required columns' },
  { id: 'profile',  label: 'Profiling dataset — missing values & duplicates' },
  { id: 'fields',   label: 'Required field enforcement (7 columns)' },
  { id: 'formats',  label: 'Format validation — email, phone, date' },
  { id: 'range',    label: 'Range checks — age 18–100, city allowlist, ID 6-digit' },
  { id: 'unique',   label: 'Uniqueness check — detecting duplicate customer IDs' },
  { id: 'score',    label: 'Computing quality score & column analysis' },
  { id: 'output',   label: 'Generating clean ZIP & quarantine CSV' },
]

/* ── Orbital spinner ─────────────────────────────────────────────────────── */
function OrbitalSpinner() {
  return (
    <div className="relative flex items-center justify-center" style={{ width: 128, height: 128 }}>
      {/* Pulse halo */}
      <div
        className="absolute inset-0 rounded-full"
        style={{ border: '1px solid rgba(99,102,241,0.12)', animation: 'pulse-ring 2.8s ease-in-out infinite' }}
      />
      {/* Ring 1 — slow CW */}
      <div className="absolute rounded-full" style={{
        inset: 8, border: '1.5px solid transparent',
        borderTopColor: 'rgba(99,102,241,0.4)', borderRightColor: 'rgba(99,102,241,0.15)',
        animation: 'orbit-cw 4s linear infinite',
      }} />
      {/* Ring 2 — medium CCW */}
      <div className="absolute rounded-full" style={{
        inset: 22, border: '2px solid transparent',
        borderTopColor: '#6366f1', borderBottomColor: 'rgba(99,102,241,0.2)',
        animation: 'orbit-ccw 2.2s linear infinite',
      }} />
      {/* Ring 3 — fast CW */}
      <div className="absolute rounded-full" style={{
        inset: 38, border: '2.5px solid transparent',
        borderTopColor: '#10b981', borderLeftColor: 'rgba(16,185,129,0.2)',
        animation: 'orbit-med 1.1s linear infinite',
      }} />
      {/* Centre icon */}
      <div
        className="relative z-10 w-12 h-12 rounded-full flex items-center justify-center"
        style={{
          background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(16,185,129,0.1))',
          border: '1px solid rgba(99,102,241,0.3)',
          boxShadow: '0 0 0 5px rgba(99,102,241,0.06), 0 4px 20px rgba(99,102,241,0.25)',
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L3 7v6c0 5.25 3.75 10.15 9 11.35C17.25 23.15 21 18.25 21 13V7z"/>
          <polyline points="9 12 11 14 15 10"/>
        </svg>
      </div>
      {/* Orbiting dot — indigo */}
      <div
        className="absolute w-2.5 h-2.5 rounded-full"
        style={{
          background: '#6366f1',
          boxShadow: '0 0 10px rgba(99,102,241,0.9)',
          top: '50%', left: '50%',
          transformOrigin: '-19px 0',
          marginTop: '-5px', marginLeft: '-5px',
          animation: 'orbit-cw 2.2s linear infinite',
        }}
      />
      {/* Orbiting dot — emerald */}
      <div
        className="absolute w-1.5 h-1.5 rounded-full"
        style={{
          background: '#10b981',
          boxShadow: '0 0 6px rgba(16,185,129,0.8)',
          top: '50%', left: '50%',
          transformOrigin: '-30px 0',
          marginTop: '-3px', marginLeft: '-3px',
          animation: 'orbit-ccw 3.5s linear infinite',
        }}
      />
    </div>
  )
}

/* ── Step row ────────────────────────────────────────────────────────────── */
function StepItem({ step, status, delay }) {
  return (
    <div
      className="flex items-center gap-3 anim-fade-up"
      style={{ animationDelay: `${delay}ms`, opacity: 0 }}
    >
      <div className={`step-dot ${
        status === 'done'   ? 'step-dot-done' :
        status === 'active' ? 'step-dot-active' :
        'step-dot-idle'
      }`} />
      <span
        className="text-sm flex-1"
        style={{
          color: status === 'done' ? '#10b981' : status === 'active' ? '#818cf8' : '#374151',
          fontWeight: status !== 'idle' ? 500 : 400,
          transition: 'color 0.4s ease',
        }}
      >
        {step.label}
      </span>
      {status === 'done' && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      )}
      {status === 'active' && (
        <span className="badge badge-brand py-0.5" style={{ fontSize: '10px' }}>Processing</span>
      )}
    </div>
  )
}

/* ── Profile Summary Panel ───────────────────────────────────────────────── */
function ProfilePanel({ profile }) {
  if (!profile) return null
  const { total_rows, missing_pct, duplicate_count, column_rules } = profile

  return (
    <div
      className="rounded-2xl p-5 mt-4 anim-fade-scale"
      style={{
        background: 'rgba(99,102,241,0.06)',
        border: '1px solid rgba(99,102,241,0.2)',
      }}
    >
      <div className="flex items-center gap-2 mb-4">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: '#6366f1', letterSpacing: '0.08em' }}>
          Dataset Profile
        </span>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { label: 'Total Rows',  value: total_rows.toLocaleString() },
          { label: 'Duplicates', value: duplicate_count },
          { label: 'Columns',    value: 7 },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="rounded-xl px-3 py-2.5 text-center"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(99,102,241,0.15)' }}
          >
            <p className="font-display font-bold text-lg" style={{ color: '#a5b4fc' }}>{value}</p>
            <p className="text-xs" style={{ color: '#475569' }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Missing % minibar */}
      {missing_pct && (
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color: '#64748b' }}>Missing Values per Column</p>
          <div className="space-y-1.5">
            {Object.entries(missing_pct).map(([col, pct]) => (
              <div key={col} className="flex items-center gap-2">
                <span className="font-mono text-xs w-28 flex-shrink-0" style={{ color: '#64748b' }}>{col}</span>
                <div className="flex-1 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(pct, 100)}%`,
                      background: pct > 20 ? '#ef4444' : pct > 5 ? '#f59e0b' : '#10b981',
                      transition: 'width 0.8s ease',
                    }}
                  />
                </div>
                <span className="font-mono text-xs w-10 text-right" style={{ color: pct > 0 ? '#fbbf24' : '#34d399' }}>
                  {pct.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Main UploadZone ──────────────────────────────────────────────────────── */
export default function UploadZone({ onUpload, phase, errorMsg, onRetry, profileData }) {
  const browseRef    = useRef(null)
  const createRipple = useRipple(browseRef)
  const isUploading  = phase === 'uploading' || phase === 'profiling' || phase === 'validating'

  const [activeStep, setActiveStep] = useState(0)
  const [doneSteps,  setDoneSteps]  = useState([])
  const [elapsed,    setElapsed]    = useState(0)

  /* Animate steps while uploading */
  useEffect(() => {
    if (!isUploading) {
      setActiveStep(0); setDoneSteps([]); setElapsed(0)
      return
    }
    const elapsedTimer = setInterval(() => setElapsed(s => s + 1), 1000)
    let step = 0
    const stepTimer = setInterval(() => {
      if (step < STEPS.length - 1) {
        setDoneSteps(prev => [...prev, step])
        step++
        setActiveStep(step)
      }
    }, 700)
    return () => { clearInterval(elapsedTimer); clearInterval(stepTimer) }
  }, [isUploading])

  const onDrop = useCallback((accepted) => {
    if (accepted.length > 0 && !isUploading) onUpload(accepted[0])
  }, [onUpload, isUploading])

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    multiple: false,
    disabled: isUploading,
    noClick: true,
  })

  /* ── Processing UI ─────────────────────────────────────────────────────── */
  if (isUploading) {
    return (
      <div className="max-w-xl mx-auto anim-fade-scale">
        <div className="surface p-10 text-center" style={{ borderRadius: 24 }}>

          <div className="flex justify-center mb-7">
            <OrbitalSpinner />
          </div>

          <h2 className="font-display font-bold text-xl mb-1 tracking-tight" style={{ color: '#f1f5f9' }}>
            {phase === 'profiling' ? 'Profiling Dataset…' : 'Validating Your Data'}
          </h2>
          <p className="text-sm mb-7" style={{ color: '#475569' }}>
            DataSentry pipeline running &nbsp;·&nbsp; {elapsed}s elapsed
          </p>

          {/* Progress bar */}
          <div className="progress-bar-track h-1.5 mb-7">
            <div className="progress-bar-fill h-full" />
          </div>

          {/* Steps */}
          <div className="text-left space-y-3 mb-7 px-1">
            {STEPS.map((step, i) => (
              <StepItem
                key={step.id}
                step={step}
                status={doneSteps.includes(i) ? 'done' : activeStep === i ? 'active' : 'idle'}
                delay={i * 60}
              />
            ))}
          </div>

          {/* Info note */}
          <div
            className="rounded-xl px-4 py-3 flex items-start gap-3 text-left"
            style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}
          >
            <svg className="flex-shrink-0 mt-0.5" width="15" height="15" viewBox="0 0 24 24"
              fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="16" x2="12" y2="12"/>
              <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
            <p className="text-xs leading-relaxed" style={{ color: '#64748b' }}>
              Profiling detects schema, duplicates and missing values. Validation classifies every record with explainable errors.
            </p>
          </div>
        </div>
      </div>
    )
  }

  /* ── Idle / drag UI ────────────────────────────────────────────────────── */
  return (
    <div className="max-w-xl mx-auto space-y-4 anim-fade-up">

      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={`rounded-3xl p-12 text-center cursor-default relative overflow-hidden
          ${isDragActive ? 'dropzone-active' : 'dropzone-idle'}`}
        style={{ borderRadius: 24 }}
      >
        <input {...getInputProps()} id="csv-file-input" />

        {isDragActive && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse at center, rgba(99,102,241,0.08) 0%, transparent 70%)',
              animation: 'pulse-ring 1.4s ease-in-out infinite',
            }}
          />
        )}

        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div style={{
            width: 80, height: 80, borderRadius: 20,
            background: isDragActive
              ? 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(16,185,129,0.1))'
              : 'rgba(99,102,241,0.08)',
            border: `2px solid ${isDragActive ? 'rgba(99,102,241,0.6)' : 'rgba(99,102,241,0.2)'}`,
            boxShadow: isDragActive
              ? '0 0 0 12px rgba(99,102,241,0.07), 0 16px 48px rgba(99,102,241,0.2)'
              : '0 4px 20px rgba(99,102,241,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.38s cubic-bezier(0.4,0,0.2,1)',
            transform: isDragActive ? 'scale(1.12) rotate(-6deg)' : 'scale(1)',
          }}>
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none"
              stroke={isDragActive ? '#818cf8' : '#6366f1'}
              strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              {isDragActive ? (
                <>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </>
              ) : (
                <>
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                </>
              )}
            </svg>
          </div>
        </div>

        <h2 className="font-display font-semibold text-[1.25rem] mb-2 tracking-tight" style={{ color: '#f1f5f9' }}>
          {isDragActive ? 'Release to Start Validation' : 'Drop your dataset here'}
        </h2>
        <p className="text-sm mb-8 leading-relaxed" style={{ color: '#64748b' }}>
          {isDragActive
            ? 'DataSentry will profile & validate immediately'
            : 'Drag & drop a .csv or .xlsx file, or click below to browse'}
        </p>

        {/* Browse button */}
        <button
          id="browse-csv-btn"
          ref={browseRef}
          onClick={(e) => { createRipple(e); open() }}
          className="btn btn-primary px-8 py-3 text-sm rounded-2xl"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          Browse Files
        </button>

        <p className="text-xs mt-5" style={{ color: '#374151' }}>
          Only <span className="font-mono" style={{ color: '#64748b' }}>.csv / .xlsx</span> files · Max 25 MB
        </p>

        {/* Status dot */}
        <div
          className="absolute top-4 right-4 w-2 h-2 rounded-full"
          style={{
            background: isDragActive ? '#10b981' : 'rgba(99,102,241,0.3)',
            boxShadow: isDragActive ? '0 0 0 4px rgba(16,185,129,0.2)' : 'none',
            transition: 'all 0.3s ease',
          }}
        />
      </div>

      {/* Error banner */}
      {errorMsg && (
        <div
          className="rounded-2xl px-5 py-4 flex items-start gap-4 anim-fade-scale"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', backdropFilter: 'blur(8px)' }}
        >
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(239,68,68,0.12)' }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold mb-0.5" style={{ color: '#fca5a5' }}>Validation Failed</p>
            <p className="text-xs leading-relaxed" style={{ color: '#f87171' }}>
              {typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg)}
            </p>
          </div>
          <button
            id="retry-upload-btn"
            onClick={onRetry}
            className="btn btn-ghost text-xs px-3 py-1.5 rounded-lg flex-shrink-0"
            style={{ border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}
          >
            Try Again
          </button>
        </div>
      )}

      {/* Schema reference */}
      {!errorMsg && (
        <div className="surface-flat p-5">
          <div className="flex items-center gap-2 mb-3">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="16" x2="12" y2="12"/>
              <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
            <span className="stat-label">Required CSV Columns</span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2.5">
            {[
              { col: 'customer_id',   note: '6-digit int · unique' },
              { col: 'full_name',     note: 'required · 2–50 chars' },
              { col: 'email',         note: 'valid email' },
              { col: 'phone_number',  note: '10 digits' },
              { col: 'age',           note: '18–100' },
              { col: 'city',          note: 'Chennai/Mumbai/etc' },
              { col: 'signup_date',   note: 'DD-MM-YYYY / YYYY-MM-DD' },
            ].map(({ col, note }) => (
              <div key={col} className="flex items-center gap-1.5">
                <span className="col-chip">{col}</span>
                <span className="text-xs" style={{ color: '#374151' }}>{note}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Profile panel (shown after profile but before validate — currently auto-validated) */}
      {profileData && <ProfilePanel profile={profileData} />}
    </div>
  )
}
