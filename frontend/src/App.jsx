import { useState, useCallback } from 'react'
import UploadZone from './components/UploadZone'
import Dashboard  from './components/Dashboard'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

/* ── Animated background blobs ───────────────────────────────────────────── */
function PageBackground() {
  return (
    <div className="page-bg" aria-hidden="true">
      <div className="bg-blob-1" />
      <div className="bg-blob-2" />
      <div className="bg-blob-3" />
      <div className="bg-grid"  />
    </div>
  )
}

/* ── Shield icon (reusable) ──────────────────────────────────────────────── */
function ShieldIcon({ size = 18, stroke = 'white' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L3 7v6c0 5.25 3.75 10.15 9 11.35C17.25 23.15 21 18.25 21 13V7z"/>
      <polyline points="9 12 11 14 15 10"/>
    </svg>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   APP
   ═══════════════════════════════════════════════════════════════════════════ */
export default function App() {
  // phase: 'idle' | 'profiling' | 'validating' | 'done' | 'error'
  const [phase,      setPhase]      = useState('idle')
  const [profileData, setProfileData] = useState(null)   // from /api/datasets/profile
  const [metrics,    setMetrics]    = useState(null)     // from /api/datasets/{id}/validate
  const [datasetId,  setDatasetId]  = useState(null)
  const [errorMsg,   setErrorMsg]   = useState('')
  const [fileName,   setFileName]   = useState('')

  /* ── 2-phase upload handler ─────────────────────────────────────────── */
  const handleUpload = useCallback(async (file) => {
    setPhase('profiling')
    setMetrics(null)
    setProfileData(null)
    setErrorMsg('')
    setFileName(file.name)

    const formData = new FormData()
    formData.append('file', file)

    try {
      // Phase 1 — Profile
      const profileRes = await fetch(`${API_BASE}/api/datasets/profile`, {
        method: 'POST',
        body: formData,
      })
      if (!profileRes.ok) {
        const err = await profileRes.json().catch(() => ({ detail: 'Unknown server error' }))
        throw new Error(
          typeof err.detail === 'object'
            ? err.detail.error || JSON.stringify(err.detail)
            : err.detail || `Server responded with ${profileRes.status}`
        )
      }
      const profile = await profileRes.json()
      setProfileData(profile)
      setDatasetId(profile.dataset_id)

      // Phase 2 — Validate
      setPhase('validating')
      const validateRes = await fetch(`${API_BASE}/api/datasets/${profile.dataset_id}/validate`, {
        method: 'POST',
      })
      if (!validateRes.ok) {
        const err = await validateRes.json().catch(() => ({ detail: 'Validation failed' }))
        throw new Error(
          typeof err.detail === 'object'
            ? err.detail.error || JSON.stringify(err.detail)
            : err.detail || `Server responded with ${validateRes.status}`
        )
      }
      const result = await validateRes.json()
      setMetrics(result)
      setPhase('done')
    } catch (err) {
      setErrorMsg(err.message || 'Upload failed — make sure the backend is running on port 8000.')
      setPhase('error')
    }
  }, [])

  /* ── Reset handler ───────────────────────────────────────────────────── */
  const handleReset = useCallback(() => {
    setPhase('idle')
    setMetrics(null)
    setProfileData(null)
    setErrorMsg('')
    setFileName('')
    setDatasetId(null)
  }, [])

  const showUpload = phase !== 'done'

  return (
    <>
      <PageBackground />

      <div className="page-content min-h-screen flex flex-col">

        {/* ── Header ───────────────────────────────────────────────────── */}
        <header className="header-glass sticky top-0 z-50">
          <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">

            {/* Brand */}
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, #4f46e5, #6366f1, #10b981)',
                  boxShadow: '0 4px 14px rgba(99,102,241,0.5)',
                }}
              >
                <ShieldIcon size={18} stroke="white" />
              </div>
              <div>
                <p className="font-display font-bold text-[15px] leading-none tracking-tight" style={{ color: '#f1f5f9' }}>
                  DataSentry
                </p>
                <p className="text-[10px] font-semibold tracking-widest mt-0.5 uppercase" style={{ color: '#6366f1' }}>
                  v2 · Validation Platform
                </p>
              </div>
            </div>

            {/* Right */}
            <div className="flex items-center gap-3">
              <span className="badge badge-emerald">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: '#10b981', animation: 'step-pulse 2s ease-in-out infinite' }}
                />
                API Live
              </span>
              <a
                id="swagger-docs-link"
                href={`${API_BASE}/docs`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-ghost px-4 py-2 text-sm rounded-xl"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                  <polyline points="10 9 9 9 8 9"/>
                </svg>
                API Docs
              </a>
            </div>
          </div>
        </header>

        {/* ── Main ─────────────────────────────────────────────────────── */}
        <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-12">

          {/* Hero */}
          {showUpload && (
            <div className="text-center mb-10 anim-fade-up">
              {/* Eyebrow badge */}
              <div
                className="inline-flex items-center gap-2 badge badge-brand mb-5 py-1.5 px-4"
                style={{ fontSize: '12px' }}
              >
                <ShieldIcon size={11} stroke="currentColor" />
                Intelligent Data Quality Platform &bull; v2.0
              </div>

              <h1
                className="font-display font-bold mb-4"
                style={{
                  fontSize: 'clamp(2rem, 4.5vw, 3.25rem)',
                  lineHeight: 1.1,
                  letterSpacing: '-0.03em',
                  color: '#f1f5f9',
                }}
              >
                Validate, Classify &amp; Explain
                <br />
                <span className="gradient-text-brand">Dataset Quality</span>
                <br />
                at Every Record
              </h1>

              <p className="text-base max-w-md mx-auto leading-relaxed" style={{ color: '#64748b' }}>
                Upload a CSV. DataSentry profiles the dataset, enforces 7 configurable validation rules per record,
                and produces a quality score — with explainable errors for every quarantined row.
              </p>

              {/* Feature chips */}
              <div className="flex flex-wrap justify-center gap-2 mt-7">
                {[
                  { icon: '🔍', label: 'Schema Detection' },
                  { icon: '📊', label: 'Dataset Profiling' },
                  { icon: '⚙️', label: '7 Validation Rules' },
                  { icon: '🔁', label: 'Duplicate Detection' },
                  { icon: '📦', label: '1K-row Chunking' },
                  { icon: '🏆', label: 'Quality Score' },
                ].map(({ icon, label }) => (
                  <span key={label} className="badge badge-slate py-1 px-3 gap-1.5" style={{ fontSize: '12px' }}>
                    <span>{icon}</span>{label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Upload zone */}
          {showUpload && (
            <UploadZone
              onUpload={handleUpload}
              phase={phase}
              errorMsg={phase === 'error' ? errorMsg : ''}
              onRetry={handleReset}
              profileData={profileData}
            />
          )}

          {/* Dashboard */}
          {phase === 'done' && metrics && (
            <Dashboard
              metrics={metrics}
              fileName={fileName}
              datasetId={datasetId}
              apiBase={API_BASE}
              onReset={handleReset}
            />
          )}
        </main>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <footer style={{ borderTop: '1px solid rgba(99,102,241,0.1)', paddingTop: 20, paddingBottom: 20 }}>
          <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div
                className="w-5 h-5 rounded-md flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #4f46e5, #10b981)' }}
              >
                <ShieldIcon size={10} stroke="white" />
              </div>
              <span className="text-sm font-semibold" style={{ color: '#475569' }}>DataSentry</span>
            </div>
            <p className="text-xs" style={{ color: '#374151' }}>
              FastAPI · React · Vite · Deployable on Render + Vercel
            </p>
            <div className="flex items-center gap-3 text-xs" style={{ color: '#374151' }}>
              <span className="font-mono">v2.0.0</span>
              <span className="w-1 h-1 rounded-full" style={{ background: '#374151' }} />
              <span style={{ color: '#10b981', fontWeight: 600 }}>● All systems operational</span>
            </div>
          </div>
        </footer>

      </div>
    </>
  )
}
