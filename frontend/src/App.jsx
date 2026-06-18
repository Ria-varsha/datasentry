import { useState, useCallback } from 'react'
import UploadZone from './components/UploadZone'
import Dashboard from './components/Dashboard'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

/* ── Animated background blobs ──────────────────────────────────────────── */
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

export default function App() {
  const [appState, setAppState] = useState('idle') // idle | uploading | done | error
  const [metrics,  setMetrics]  = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [fileName, setFileName] = useState('')

  /* ── Upload handler ─────────────────────────────────────────────────── */
  const handleUpload = useCallback(async (file) => {
    setAppState('uploading')
    setMetrics(null)
    setErrorMsg('')
    setFileName(file.name)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch(`${API_BASE}/api/upload`, { method: 'POST', body: formData })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Unknown server error' }))
        throw new Error(err.detail || `Server responded with ${res.status}`)
      }
      const data = await res.json()
      setMetrics(data)
      setAppState('done')
    } catch (err) {
      setErrorMsg(err.message || 'Upload failed — make sure the backend is running on port 8000.')
      setAppState('error')
    }
  }, [])

  /* ── Reset handler ──────────────────────────────────────────────────── */
  const handleReset = useCallback(() => {
    setAppState('idle')
    setMetrics(null)
    setErrorMsg('')
    setFileName('')
  }, [])

  const showUpload = appState === 'idle' || appState === 'uploading' || appState === 'error'

  return (
    <>
      {/* Fixed animated background */}
      <PageBackground />

      {/* All content sits above the fixed bg */}
      <div className="page-content min-h-screen flex flex-col">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <header className="header-glass sticky top-0 z-50">
          <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">

            {/* Brand */}
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, #3640d2, #5a6cf5)',
                  boxShadow: '0 4px 12px rgba(83,104,245,0.4)',
                }}
              >
                {/* Shield + check icon */}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L3 7v6c0 5.25 3.75 10.15 9 11.35C17.25 23.15 21 18.25 21 13V7z"/>
                  <polyline points="9 12 11 14 15 10"/>
                </svg>
              </div>
              <div>
                <p className="font-display font-bold text-slate-900 text-[15px] leading-none tracking-tight">
                  DataSentry
                </p>
                <p className="text-[10px] text-slate-400 font-semibold tracking-widest mt-0.5 uppercase">
                  Validation Platform
                </p>
              </div>
            </div>

            {/* Right — status + API docs link */}
            <div className="flex items-center gap-3">
              <span className="badge badge-emerald">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: '#22c55e', animation: 'step-pulse 2s ease-in-out infinite' }}
                />
                API Live
              </span>
              <a
                id="swagger-docs-link"
                href={`${API_BASE}/docs`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-ghost px-4 py-2 text-sm rounded-xl"
                style={{ border: '1px solid rgba(226,232,240,0.9)' }}
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

        {/* ── Main content ──────────────────────────────────────────────── */}
        <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-12">

          {/* Hero section — only when not viewing dashboard */}
          {showUpload && (
            <div className="text-center mb-10 anim-fade-up">
              {/* Eyebrow */}
              <div
                className="inline-flex items-center gap-2 badge badge-brand mb-5 py-1.5 px-4"
                style={{ fontSize: '12px' }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L3 7v6c0 5.25 3.75 10.15 9 11.35C17.25 23.15 21 18.25 21 13V7z"/>
                  <polyline points="9 12 11 14 15 10"/>
                </svg>
                Smart Quarantine Engine &bull; v1.0
              </div>

              <h1
                className="font-display font-bold text-slate-900 mb-4"
                style={{ fontSize: 'clamp(2rem, 4.5vw, 3.25rem)', lineHeight: 1.1, letterSpacing: '-0.03em' }}
              >
                Guard &amp; Validate
                <br />
                <span className="gradient-text-brand">Transaction Data</span>
                <br />
                at Enterprise Scale
              </h1>

              <p className="text-slate-500 text-base max-w-md mx-auto leading-relaxed">
                Upload a CSV. DataSentry validates every row against phone regex rules,
                date formats, and required fields — then precisely routes clean data to
                chunked ZIPs and errors to quarantine.
              </p>

              {/* Feature chips */}
              <div className="flex flex-wrap justify-center gap-2 mt-7">
                {[
                  { icon: '📞', label: 'Phone Regex (SG · IN)' },
                  { icon: '📅', label: 'YYYY-MM-DD Strict' },
                  { icon: '🔒', label: 'Required Field Guards' },
                  { icon: '📦', label: '1,000-row Chunking' },
                  { icon: '⚡', label: 'Instant Pipeline' },
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
              isUploading={appState === 'uploading'}
              errorMsg={appState === 'error' ? errorMsg : ''}
              onRetry={handleReset}
            />
          )}

          {/* Dashboard */}
          {appState === 'done' && metrics && (
            <Dashboard
              metrics={metrics}
              fileName={fileName}
              apiBase={API_BASE}
              onReset={handleReset}
            />
          )}
        </main>

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <footer
          className="page-content"
          style={{ borderTop: '1px solid rgba(199,215,254,0.5)', paddingTop: 20, paddingBottom: 20 }}
        >
          <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div
                className="w-5 h-5 rounded-md flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #3640d2, #5a6cf5)' }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L3 7v6c0 5.25 3.75 10.15 9 11.35C17.25 23.15 21 18.25 21 13V7z"/>
                  <polyline points="9 12 11 14 15 10"/>
                </svg>
              </div>
              <span className="text-sm text-slate-500 font-semibold">DataSentry</span>
            </div>
            <p className="text-xs text-slate-400">
              Built with FastAPI &amp; React &middot; Deployable on Render + Vercel &middot; No Docker required
            </p>
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span className="font-mono">v1.0.0</span>
              <span className="w-1 h-1 rounded-full bg-slate-300" />
              <span style={{ color: '#16a34a', fontWeight: 600 }}>● All systems operational</span>
            </div>
          </div>
        </footer>
      </div>
    </>
  )
}
