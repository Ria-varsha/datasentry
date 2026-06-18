import { useCallback, useState, useEffect, useRef } from 'react'
import { useDropzone } from 'react-dropzone'

/* ── Ripple hook ──────────────────────────────────────────────────────────── */
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
    Object.assign(r.style, { width: size + 'px', height: size + 'px', left: x + 'px', top: y + 'px' })
    el.appendChild(r)
    setTimeout(() => r.remove(), 660)
  }, [ref])
}

/* ── Pipeline steps shown during processing ───────────────────────────────── */
const STEPS = [
  { id: 'parse',  label: 'Parsing CSV structure' },
  { id: 'phone',  label: 'Validating phone formats (SG / IN)' },
  { id: 'date',   label: 'Checking date integrity (YYYY-MM-DD)' },
  { id: 'fields', label: 'Enforcing required fields' },
  { id: 'route',  label: 'Routing clean & quarantine streams' },
  { id: 'chunk',  label: 'Chunking & bundling ZIP archive' },
]

/* ── Orbital spinner ─────────────────────────────────────────────────────── */
function OrbitalSpinner() {
  return (
    <div className="relative flex items-center justify-center" style={{ width: 128, height: 128 }}>
      {/* Outermost pulse halo */}
      <div
        className="absolute inset-0 rounded-full"
        style={{ border: '1px solid rgba(90,108,245,0.12)', animation: 'pulse-ring 2.8s ease-in-out infinite' }}
      />
      {/* Ring 1 — slow CW */}
      <div className="absolute rounded-full" style={{
        inset: 8, border: '1.5px solid transparent',
        borderTopColor: '#c7d7fe', borderRightColor: 'rgba(199,215,254,0.4)',
        animation: 'orbit-cw 4s linear infinite',
      }} />
      {/* Ring 2 — medium CCW */}
      <div className="absolute rounded-full" style={{
        inset: 22, border: '2px solid transparent',
        borderTopColor: '#5a6cf5', borderBottomColor: 'rgba(90,108,245,0.2)',
        animation: 'orbit-ccw 2.2s linear infinite',
      }} />
      {/* Ring 3 — fast CW */}
      <div className="absolute rounded-full" style={{
        inset: 38, border: '2.5px solid transparent',
        borderTopColor: '#3640d2', borderLeftColor: 'rgba(54,64,210,0.25)',
        animation: 'orbit-med 1.1s linear infinite',
      }} />
      {/* Centre icon */}
      <div
        className="relative z-10 w-12 h-12 rounded-full flex items-center justify-center"
        style={{
          background: 'linear-gradient(135deg, #eef2ff, #e0eaff)',
          border: '1px solid #c7d7fe',
          boxShadow: '0 0 0 5px rgba(90,108,245,0.07), 0 4px 16px rgba(90,108,245,0.2)',
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4350ea" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L3 7v6c0 5.25 3.75 10.15 9 11.35C17.25 23.15 21 18.25 21 13V7z"/>
          <polyline points="9 12 11 14 15 10"/>
        </svg>
      </div>
      {/* Orbiting dot */}
      <div
        className="absolute w-2.5 h-2.5 rounded-full"
        style={{
          background: '#5a6cf5',
          boxShadow: '0 0 10px rgba(90,108,245,0.9)',
          top: '50%', left: '50%',
          transformOrigin: '-19px 0',
          marginTop: '-5px', marginLeft: '-5px',
          animation: 'orbit-cw 2.2s linear infinite',
        }}
      />
      {/* Second orbiting dot (offset) */}
      <div
        className="absolute w-1.5 h-1.5 rounded-full"
        style={{
          background: '#818cf8',
          boxShadow: '0 0 6px rgba(129,140,248,0.8)',
          top: '50%', left: '50%',
          transformOrigin: '-30px 0',
          marginTop: '-3px', marginLeft: '-3px',
          animation: 'orbit-ccw 3.5s linear infinite',
        }}
      />
    </div>
  )
}

/* ── Step row ──────────────────────────────────────────────────────────────── */
function StepItem({ step, status, delay }) {
  return (
    <div
      className="flex items-center gap-3 anim-fade-up"
      style={{ animationDelay: `${delay}ms`, opacity: 0 }}
    >
      <div className={`step-dot ${
        status === 'done' ? 'step-dot-done' :
        status === 'active' ? 'step-dot-active' :
        'step-dot-idle'
      }`} />
      <span
        className="text-sm flex-1"
        style={{
          color: status === 'done' ? '#15803d' : status === 'active' ? '#3640d2' : '#94a3b8',
          fontWeight: status !== 'idle' ? 500 : 400,
          transition: 'color 0.4s ease',
        }}
      >
        {step.label}
      </span>
      {status === 'done' && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      )}
      {status === 'active' && (
        <span className="badge badge-brand py-0.5" style={{ fontSize: '10px' }}>
          Running
        </span>
      )}
    </div>
  )
}

/* ── Main UploadZone ──────────────────────────────────────────────────────── */
export default function UploadZone({ onUpload, isUploading, errorMsg, onRetry }) {
  const browseRef    = useRef(null)
  const createRipple = useRipple(browseRef)

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
    }, 780)
    return () => { clearInterval(elapsedTimer); clearInterval(stepTimer) }
  }, [isUploading])

  const onDrop = useCallback((accepted) => {
    if (accepted.length > 0 && !isUploading) onUpload(accepted[0])
  }, [onUpload, isUploading])

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'] },
    multiple: false,
    disabled: isUploading,
    noClick: true,
  })

  /* ── Processing UI ──────────────────────────────────────────────────── */
  if (isUploading) {
    return (
      <div className="max-w-xl mx-auto anim-fade-scale">
        <div className="surface p-10 text-center" style={{ borderRadius: 24 }}>

          <div className="flex justify-center mb-7">
            <OrbitalSpinner />
          </div>

          <h2 className="font-display font-bold text-slate-800 text-xl mb-1 tracking-tight">
            Validating Your Data
          </h2>
          <p className="text-sm text-slate-400 mb-7">
            DataSentry pipeline running &nbsp;&middot;&nbsp; {elapsed}s elapsed
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
                delay={i * 70}
              />
            ))}
          </div>

          {/* Info note */}
          <div
            className="rounded-xl px-4 py-3 flex items-start gap-3 text-left"
            style={{ background: 'rgba(240,244,255,0.9)', border: '1px solid rgba(199,215,254,0.7)' }}
          >
            <svg className="flex-shrink-0 mt-0.5" width="15" height="15" viewBox="0 0 24 24"
              fill="none" stroke="#5a6cf5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="16" x2="12" y2="12"/>
              <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
            <p className="text-xs text-slate-600 leading-relaxed">
              Clean rows are chunked into 1,000-row CSV files and bundled into a downloadable ZIP.
            </p>
          </div>
        </div>
      </div>
    )
  }

  /* ── Idle / drag UI ─────────────────────────────────────────────────── */
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

        {/* Radial glow when dragging */}
        {isDragActive && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse at center, rgba(90,108,245,0.07) 0%, transparent 70%)',
              animation: 'pulse-ring 1.4s ease-in-out infinite',
            }}
          />
        )}

        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div
            style={{
              width: 80, height: 80, borderRadius: 20,
              background: isDragActive ? 'linear-gradient(135deg, #e0eaff, #eef2ff)' : 'rgba(240,244,255,0.9)',
              border: `2px solid ${isDragActive ? '#a5bafd' : 'rgba(199,215,254,0.8)'}`,
              boxShadow: isDragActive
                ? '0 0 0 10px rgba(90,108,245,0.07), 0 16px 40px rgba(90,108,245,0.18)'
                : '0 4px 16px rgba(90,108,245,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.38s cubic-bezier(0.4,0,0.2,1)',
              transform: isDragActive ? 'scale(1.12) rotate(-6deg)' : 'scale(1)',
            }}
          >
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none"
              stroke={isDragActive ? '#4350ea' : '#818cf8'}
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

        <h2 className="font-display font-semibold text-slate-800 text-[1.25rem] mb-2 tracking-tight">
          {isDragActive ? 'Release to Start Validation' : 'Drop your CSV file here'}
        </h2>
        <p className="text-slate-400 text-sm mb-8 leading-relaxed">
          {isDragActive
            ? 'DataSentry will validate immediately'
            : 'Drag & drop a .csv file, or click below to browse'}
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

        <p className="text-xs text-slate-300 mt-5">
          Only <span className="font-mono text-slate-400">.csv</span> files · No size limit
        </p>

        {/* Status dot */}
        <div
          className="absolute top-4 right-4 w-2 h-2 rounded-full"
          style={{
            background: isDragActive ? '#22c55e' : 'rgba(199,215,254,0.8)',
            boxShadow: isDragActive ? '0 0 0 4px rgba(34,197,94,0.2)' : 'none',
            transition: 'all 0.3s ease',
          }}
        />
      </div>

      {/* Error banner — Retry calls onRetry (resets state), NOT window.reload */}
      {errorMsg && (
        <div
          className="rounded-2xl px-5 py-4 flex items-start gap-4 anim-fade-scale"
          style={{ background: 'rgba(254,226,226,0.9)', border: '1px solid rgba(254,202,202,0.8)', backdropFilter: 'blur(8px)' }}
        >
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(254,202,202,0.6)' }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-800 mb-0.5">Validation Failed</p>
            <p className="text-xs text-red-600 leading-relaxed">{errorMsg}</p>
          </div>
          <button
            id="retry-upload-btn"
            onClick={onRetry}
            className="btn btn-ghost text-xs px-3 py-1.5 rounded-lg flex-shrink-0"
            style={{ border: '1px solid rgba(254,202,202,0.9)', color: '#dc2626' }}
          >
            Try Again
          </button>
        </div>
      )}

      {/* CSV column reference */}
      {!errorMsg && (
        <div className="surface-flat p-5">
          <div className="flex items-center gap-2 mb-3">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="16" x2="12" y2="12"/>
              <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
            <span className="stat-label">Expected CSV Columns</span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {[
              { col: 'order_id',         note: 'required' },
              { col: 'product_id',       note: 'required' },
              { col: 'payment_mode',     note: 'required' },
              { col: 'phone',            note: 'SG / IN regex' },
              { col: 'country_code',     note: 'SG or IN' },
              { col: 'transaction_date', note: 'YYYY-MM-DD' },
            ].map(({ col, note }) => (
              <div key={col} className="flex items-center gap-1.5">
                <span className="col-chip">{col}</span>
                <span className="text-xs text-slate-300">{note}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
