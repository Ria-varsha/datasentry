import { motion } from 'framer-motion'

const COLUMNS = ['customer_id','full_name','email','phone_number','age','city','signup_date']

const COL_TYPE_ICONS = {
  customer_id:  { icon: '#', label: 'ID',       color: '#818cf8' },
  full_name:    { icon: 'T', label: 'Text',     color: '#34d399' },
  email:        { icon: '@', label: 'Email',    color: '#60a5fa' },
  phone_number: { icon: '#', label: 'Numeric',  color: '#a78bfa' },
  age:          { icon: '0', label: 'Integer',  color: '#fb923c' },
  city:         { icon: 'C', label: 'Category', color: '#f472b6' },
  signup_date:  { icon: 'D', label: 'Date',     color: '#2dd4bf' },
}

function MissingBar({ pct }) {
  const color = pct === 0 ? '#10b981' : pct < 10 ? '#f59e0b' : '#ef4444'
  return (
    <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden mt-1">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className="h-full rounded-full"
        style={{ background: color }}
      />
    </div>
  )
}

export default function ProfileCard({ profile, onConfigure, onValidate, onReset }) {
  if (!profile) return null

  const { filename, total_rows, total_columns, columns, missing_pct,
          duplicate_count, col_stats, uploaded_at } = profile

  const pctWithMissing = Object.values(missing_pct || {}).filter(v => v > 0).length

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
      className="max-w-4xl mx-auto space-y-5"
    >
      {/* Header bar */}
      <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl px-6 py-5 flex items-center justify-between shadow-sm transition-colors">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
               style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
          </div>
          <div>
            <p className="font-semibold text-slate-800 dark:text-slate-100 text-[15px] transition-colors">{filename}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 transition-colors">
              Schema check passed &nbsp;·&nbsp; {total_rows?.toLocaleString()} rows &nbsp;·&nbsp; {total_columns} columns
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="badge badge-emerald text-[11px]">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Schema OK
          </span>
          <button onClick={onReset}
            className="btn btn-ghost px-3 py-1.5 text-xs rounded-lg">
            New File
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Rows',   value: total_rows?.toLocaleString(), sub: 'Ingested from file',   color: '#818cf8' },
          { label: 'Columns',      value: total_columns,                sub: 'Canonical schema',     color: '#34d399' },
          { label: 'Duplicates',   value: duplicate_count,              sub: 'By customer_id',       color: duplicate_count > 0 ? '#fbbf24' : '#34d399' },
        ].map((stat, i) => (
          <motion.div key={stat.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: i * 0.08 }}
            className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-5 relative overflow-hidden shadow-sm transition-colors"
          >
            <p className="text-3xl font-bold font-display transition-colors" style={{ color: stat.color }}>{stat.value}</p>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mt-1 transition-colors">{stat.label}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 transition-colors">{stat.sub}</p>
            <div className="absolute bottom-0 right-0 w-16 h-16 rounded-tl-full" style={{ background: stat.color, opacity: 0.05 }} />
          </motion.div>
        ))}
      </div>

      {/* Column quality table */}
      <div className="bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-6 shadow-sm transition-colors">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 transition-colors">Column Profile</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 transition-colors">
              {pctWithMissing === 0 ? 'No missing values detected' : `${pctWithMissing} column(s) have missing values`}
            </p>
          </div>
          <span className="badge badge-brand text-xs">{total_columns} columns</span>
        </div>

        <div className="space-y-3">
          {COLUMNS.filter(c => (columns || []).includes(c)).map((col, i) => {
            const meta = COL_TYPE_ICONS[col] || { icon: '?', label: 'Unknown', color: '#94a3b8' }
            const pct  = (missing_pct || {})[col] ?? 0
            return (
              <motion.div key={col}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.1 + i * 0.05 }}
                className="flex items-center gap-4"
              >
                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-[11px] font-bold"
                     style={{ background: `${meta.color}18`, color: meta.color }}>
                  {meta.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-slate-700 dark:text-slate-300 transition-colors">{col}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 transition-colors">
                        {meta.label}
                      </span>
                      <span className="text-xs font-medium transition-colors" style={{ color: pct === 0 ? '#10b981' : '#f59e0b' }}>
                        {pct === 0 ? '✓ complete' : `${pct}% missing`}
                      </span>
                    </div>
                  </div>
                  <MissingBar pct={pct} />
                </div>
              </motion.div>
            )
          })}
        </div>

        {col_stats?.age && (
          <div className="mt-5 pt-5 border-t border-slate-200 dark:border-slate-700/50 transition-colors">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-3 transition-colors">Age Statistics</p>
            <div className="grid grid-cols-4 gap-3">
              {[['Min', col_stats.age.min], ['Max', col_stats.age.max], ['Mean', col_stats.age.mean], ['Median', col_stats.age.median]].map(([k,v]) => (
                <div key={k} className="rounded-xl p-3 text-center bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 transition-colors">
                  <p className="text-lg font-bold text-indigo-500 dark:text-indigo-400 font-display">{v}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 transition-colors">{k}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Action row */}
      <div className="flex gap-3">
        <button id="configure-rules-btn" onClick={onConfigure}
          className="btn btn-ghost flex-1 py-4 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
            <path d="M4.93 4.93a10 10 0 0 0 0 14.14"/>
          </svg>
          Configure Rules
        </button>
        <motion.button id="run-validation-btn" onClick={onValidate}
          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
          className="btn btn-primary flex-1 py-4 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          Run Validation
        </motion.button>
      </div>
    </motion.div>
  )
}
