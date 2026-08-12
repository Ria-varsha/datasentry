import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const RULE_TYPE_STYLES = {
  required:      { label: 'Required',      bg: 'bg-red-100 dark:bg-red-900/30',     text: 'text-red-600 dark:text-red-400'     },
  type:          { label: 'Type',          bg: 'bg-blue-100 dark:bg-blue-900/30',    text: 'text-blue-600 dark:text-blue-400'   },
  format:        { label: 'Format',        bg: 'bg-violet-100 dark:bg-violet-900/30',text: 'text-violet-600 dark:text-violet-400'},
  range:         { label: 'Range',         bg: 'bg-orange-100 dark:bg-orange-900/30',text: 'text-orange-600 dark:text-orange-400'},
  allowed_values:{ label: 'Allowed Values',bg: 'bg-cyan-100 dark:bg-cyan-900/30',    text: 'text-cyan-600 dark:text-cyan-400'   },
  unique:        { label: 'Unique',        bg: 'bg-pink-100 dark:bg-pink-900/30',    text: 'text-pink-600 dark:text-pink-400'   },
  cross_column:  { label: 'Cross-Column',  bg: 'bg-emerald-100 dark:bg-emerald-900/30',text: 'text-emerald-600 dark:text-emerald-400'},
}

function RuleToggle({ rule, onChange }) {
  const style = RULE_TYPE_STYLES[rule.rule_type] || RULE_TYPE_STYLES.required
  const isAI  = rule.id === 'chennai_age_rule'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`p-4 rounded-xl border transition-all ${
        rule.enabled
          ? 'bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/50'
          : 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 opacity-60'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${style.bg} ${style.text}`}>
              {style.label}
            </span>
            {isAI && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
                AI Stage 3
              </span>
            )}
            <code className="text-xs text-slate-500 dark:text-slate-400 font-mono">{rule.field}</code>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed transition-colors">{rule.description}</p>
        </div>
        <button
          onClick={() => onChange(rule.id, !rule.enabled)}
          className={`w-10 h-5.5 rounded-full relative flex-shrink-0 transition-all duration-300 focus:outline-none ${
            rule.enabled ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-slate-600'
          }`}
          style={{ width: 40, height: 22, borderRadius: 11 }}
          aria-label={rule.enabled ? 'Disable rule' : 'Enable rule'}
        >
          <motion.span
            animate={{ x: rule.enabled ? 20 : 2 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="absolute top-[3px] w-4 h-4 rounded-full bg-white shadow-sm"
            style={{ width: 16, height: 16 }}
          />
        </button>
      </div>
    </motion.div>
  )
}

export default function RuleConfig({ apiBase, onValidate, onBack }) {
  const [rules, setRules]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [pendingChanges, setPending] = useState({})

  useEffect(() => {
    fetch(`${apiBase}/api/rules`)
      .then(r => r.json())
      .then(data => {
        setRules(data.rules || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [apiBase])

  const handleToggle = async (ruleId, enabled) => {
    setSaving(true)
    setPending(p => ({ ...p, [ruleId]: true }))
    try {
      const res = await fetch(`${apiBase}/api/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [ruleId]: enabled }),
      })
      const data = await res.json()
      setRules(data.rules || [])
    } finally {
      setSaving(false)
      setPending(p => { const n = { ...p }; delete n[ruleId]; return n })
    }
  }

  const enabledCount = rules.filter(r => r.enabled).length
  const fields = [...new Set(rules.map(r => r.field))]

  const groupedByField = fields.reduce((acc, field) => {
    acc[field] = rules.filter(r => r.field === field)
    return acc
  }, {})

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          Loading rule configuration...
        </div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.4 }}
      className="max-w-4xl mx-auto space-y-5"
    >
      {/* Header */}
      <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl px-6 py-5 flex items-center justify-between shadow-sm transition-colors">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
               style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
              <path d="M4.93 4.93a10 10 0 0 0 0 14.14"/>
            </svg>
          </div>
          <div>
            <h2 className="font-semibold text-slate-800 dark:text-slate-100 text-[15px] transition-colors">Rule Configuration</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 transition-colors">
              {enabledCount} of {rules.length} rules active &nbsp;·&nbsp; Toggle rules to customize validation
            </p>
          </div>
        </div>
        <button onClick={onBack} className="btn btn-ghost px-3 py-1.5 text-xs rounded-lg">
          Back to Profile
        </button>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 px-1">
        {Object.entries(RULE_TYPE_STYLES).map(([type, s]) => (
          <span key={type} className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${s.bg} ${s.text}`}>
            {s.label}
          </span>
        ))}
      </div>

      {/* Rules by field */}
      <div className="grid md:grid-cols-2 gap-4">
        {Object.entries(groupedByField).map(([field, fieldRules], fi) => (
          <motion.div key={field}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: fi * 0.05 }}
            className="bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-5 shadow-sm transition-colors"
          >
            <div className="flex items-center justify-between mb-4">
              <code className="text-sm font-semibold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-700/50 px-2 py-0.5 rounded-md transition-colors">
                {field}
              </code>
              <span className="text-xs text-slate-400 dark:text-slate-500 transition-colors">
                {fieldRules.filter(r => r.enabled).length}/{fieldRules.length} rules on
              </span>
            </div>
            <div className="space-y-2">
              {fieldRules.map(rule => (
                <RuleToggle key={rule.id} rule={rule} onChange={handleToggle} />
              ))}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Run Validation CTA */}
      <div className="bg-white dark:bg-slate-800/40 border border-indigo-200 dark:border-indigo-500/30 rounded-2xl p-6 flex items-center justify-between shadow-sm transition-colors">
        <div>
          <p className="font-semibold text-slate-800 dark:text-slate-100 transition-colors">Ready to validate?</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 transition-colors">
            {enabledCount} rules will be applied across all rows.
          </p>
        </div>
        <motion.button id="run-validation-from-rules-btn" onClick={onValidate}
          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
          className="btn btn-primary px-8 py-3.5 rounded-2xl text-sm font-semibold flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          Run Validation
        </motion.button>
      </div>
    </motion.div>
  )
}
