import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Map, Clock, Moon, AlertTriangle, ChevronDown, Sparkles, Loader2, Flag, ShieldAlert } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { api } from '../api'
import GPXProfile from '../components/GPXProfile'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'

function formatH(h) {
  if (!h) return '—'
  const hours = Math.floor(h)
  const mins = Math.round((h - hours) * 60)
  return `${hours}h${String(mins).padStart(2, '0')}`
}

const PRIORITY_COLORS = { A: '#1D9E75', B: '#378ADD', C: '#7F77DD' }
const OBJ_COLORS = { a: '#1D9E75', b: '#378ADD', c: '#7F77DD' }

export default function RaceStrategy() {
  const [objective, setObjective] = useState('b')
  const [selectedRaceId, setSelectedRaceId] = useState(null)
  const [raceList, setRaceList] = useState([])
  const [aiLoading, setAiLoading] = useState(false)
  const [aiStrategy, setAiStrategy] = useState(null)
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiStale, setAiStale] = useState(false)
  const [aiError, setAiError] = useState(null)
  const [showAI, setShowAI] = useState(false)

  // Load race list once
  useEffect(() => {
    api.getRaceList().then(list => {
      setRaceList(list)
      if (list.length > 0) setSelectedRaceId(list[0].race_id)
    }).catch(() => {})
  }, [])

  const { data: strategy, refetch: refetchStrategy } = useApi(
    () => selectedRaceId ? api.getRaceStrategy(selectedRaceId) : null,
    [selectedRaceId]
  )
  const { data: gpx, refetch: refetchGpx } = useApi(
    () => selectedRaceId ? api.getGPXProfile(selectedRaceId) : null,
    [selectedRaceId]
  )
  const { data: cpData } = useApi(
    () => selectedRaceId ? api.getCheckpoints(objective, selectedRaceId) : null,
    [objective, selectedRaceId]
  )

  // Load AI strategy on race change (auto-generates if missing/stale)
  useEffect(() => {
    if (!selectedRaceId) return
    setAiStrategy(null)
    setAiGenerating(false)
    setAiStale(false)
    api.getAIStrategy(selectedRaceId).then(data => {
      if (data?.strategy) { setAiStrategy(data.strategy); setShowAI(true) }
      setAiGenerating(data?.generating || false)
      setAiStale(data?.stale || false)
    }).catch(() => {})
  }, [selectedRaceId])

  // Poll every 6s while auto-generating in background
  useEffect(() => {
    if (!aiGenerating || !selectedRaceId) return
    const iv = setInterval(() => {
      api.getAIStrategy(selectedRaceId).then(data => {
        if (data?.strategy) {
          setAiStrategy(data.strategy)
          setShowAI(true)
          setAiGenerating(false)
          setAiStale(false)
          clearInterval(iv)
        } else if (!data?.generating) {
          setAiGenerating(false)
          clearInterval(iv)
        }
      }).catch(() => {})
    }, 6000)
    return () => clearInterval(iv)
  }, [aiGenerating, selectedRaceId])

  const handleGenerateAI = async () => {
    if (!selectedRaceId) return
    setAiLoading(true)
    setAiError(null)
    try {
      const result = await api.generateAIStrategy(selectedRaceId)
      if (result.strategy) { setAiStrategy(result.strategy); setShowAI(true) }
      else if (result.generating) setAiGenerating(true)
    } catch (e) {
      setAiError(e.message)
    } finally {
      setAiLoading(false)
    }
  }

  const checkpoints = cpData?.checkpoints || []
  const sections = aiStrategy?.sections || strategy?.race_strategy?.sections || []

  const objOptions = strategy ? [
    { key: 'a', label: 'Obj. A', time: strategy.obj_a_time_h || strategy.objective_a?.time_h, color: OBJ_COLORS.a },
    { key: 'b', label: 'Obj. B', time: strategy.obj_b_time_h || strategy.objective_b?.time_h, color: OBJ_COLORS.b },
    { key: 'c', label: 'Obj. C', time: strategy.obj_c_time_h || strategy.objective_c?.time_h, color: OBJ_COLORS.c },
  ] : []

  const raceDateFormatted = strategy?.date
    ? format(parseISO(strategy.date), 'd MMMM yyyy', { locale: fr })
    : null

  const selectedRace = raceList.find(r => r.race_id === selectedRaceId)

  return (
    <div className="space-y-6 pb-20 md:pb-6">

      {/* Race selector */}
      {raceList.length > 1 && (
        <div className="card">
          <label className="text-xs text-gray-400 uppercase tracking-wide mb-2 block">Course</label>
          <div className="flex flex-wrap gap-2">
            {raceList.map(r => (
              <button
                key={r.race_id}
                onClick={() => setSelectedRaceId(r.race_id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                  selectedRaceId === r.race_id
                    ? 'text-white border-opacity-50'
                    : 'border-dark-500 text-gray-400 hover:border-dark-400'
                }`}
                style={selectedRaceId === r.race_id ? {
                  borderColor: PRIORITY_COLORS[r.priority],
                  backgroundColor: PRIORITY_COLORS[r.priority] + '20',
                  color: PRIORITY_COLORS[r.priority],
                } : {}}
              >
                <span className="font-bold">{r.priority}</span>
                {r.name}
                {r.has_gpx && <span className="text-green-400">·GPX</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="card">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <Map size={20} className="text-brand-green mt-0.5 shrink-0" />
            <div className="min-w-0">
              <h2 className="font-bold text-lg truncate">{strategy?.name || '—'}</h2>
              <p className="text-sm text-gray-400">
                {strategy?.distance_km}km · {strategy?.dplus_m?.toLocaleString('fr-FR')}m D+
                {strategy?.start_time && ` · Départ ${strategy.start_time}`}
                {raceDateFormatted && ` le ${raceDateFormatted}`}
              </p>
              {strategy?.has_gpx && (
                <span className="text-xs text-brand-green mt-0.5 inline-block">✓ GPX chargé — profil réel</span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <button
              onClick={handleGenerateAI}
              disabled={aiLoading || aiGenerating || !selectedRaceId}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-purple-500/15 text-purple-300 border border-purple-500/30 hover:bg-purple-500/25 transition-colors disabled:opacity-50"
            >
              {(aiLoading || aiGenerating) ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              {aiLoading ? 'Analyse…' : aiGenerating ? 'Génération…' : 'Stratégie IA'}
            </button>
            {aiGenerating && !aiStrategy && (
              <span className="text-xs text-purple-400/70 animate-pulse">Calcul en cours…</span>
            )}
            {aiStale && (
              <span className="text-xs text-yellow-500/70">↻ Mise à jour hebdo en cours</span>
            )}
          </div>
        </div>

        {aiError && (
          <div className="mt-2 p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400">
            {aiError.includes('Ollama') ? '⚙️ Lancez Ollama pour activer l\'IA locale' : aiError}
          </div>
        )}

        {/* AI assessment banner */}
        {aiStrategy && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 p-3 rounded-xl bg-purple-500/10 border border-purple-500/20"
          >
            <div className="flex items-center gap-2 mb-1">
              <Sparkles size={12} className="text-purple-400" />
              <span className="text-xs font-semibold text-purple-300">Analyse IA — Objectif recommandé : {aiStrategy.recommended_objective}</span>
            </div>
            <p className="text-xs text-gray-300">{aiStrategy.objective_assessment}</p>
            {aiStrategy.health_flags?.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {aiStrategy.health_flags.map((f, i) => (
                  <span key={i} className="text-xs bg-orange-500/15 text-orange-400 px-2 py-0.5 rounded flex items-center gap-1">
                    <ShieldAlert size={9} /> {f}
                  </span>
                ))}
              </div>
            )}
            <button
              onClick={() => setShowAI(!showAI)}
              className="text-xs text-purple-400 hover:text-purple-300 mt-2 flex items-center gap-1"
            >
              <ChevronDown size={12} className={`transition-transform ${showAI ? 'rotate-180' : ''}`} />
              {showAI ? 'Masquer la stratégie détaillée' : 'Voir la stratégie complète'}
            </button>
          </motion.div>
        )}

        {/* Objective selector */}
        <div className="grid grid-cols-3 gap-2 mt-4">
          {objOptions.map(opt => (
            <button
              key={opt.key}
              onClick={() => setObjective(opt.key)}
              className={`p-2 rounded-lg border text-left transition-all`}
              style={objective === opt.key ? {
                borderColor: opt.color,
                backgroundColor: opt.color + '15',
              } : { borderColor: '#374151' }}
            >
              <div className="text-xs font-bold" style={{ color: objective === opt.key ? opt.color : '#9CA3AF' }}>
                {opt.label}
              </div>
              <div className="text-xs text-gray-500">{formatH(opt.time)}</div>
            </button>
          ))}
        </div>
      </div>

      {/* GPX Profile */}
      <div className="card">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          Profil altimétrique
          {gpx?.synthetic && <span className="text-xs text-yellow-500/70">(estimé)</span>}
          {!gpx?.synthetic && <span className="text-xs text-green-400">·GPX réel</span>}
        </h3>
        <GPXProfile data={gpx} checkpoints={checkpoints} sections={aiStrategy?.sections} />
      </div>

      {/* AI Strategy detail */}
      <AnimatePresence>
        {aiStrategy && showAI && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden space-y-4"
          >
            {/* AI Sections */}
            {aiStrategy.sections?.length > 0 && (
              <div className="card">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Sparkles size={14} className="text-purple-400" /> Sections — Stratégie IA
                </h3>
                <div className="space-y-3">
                  {aiStrategy.sections.map((s, i) => (
                    <div key={i} className="p-3 rounded-xl bg-dark-700/50 border border-dark-600/50">
                      <div className="flex items-center justify-between mb-1 flex-wrap gap-1">
                        <span className="text-xs font-bold text-gray-200">km {s.km_start}–{s.km_end}</span>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-brand-orange">{s.target_pace_min_km ? `${Math.floor(s.target_pace_min_km)}:${String(Math.round((s.target_pace_min_km % 1) * 60)).padStart(2, '0')} min/km` : ''}</span>
                          <span className="text-red-400">{s.fc_max ? `FC ≤${s.fc_max}` : ''}</span>
                          <span className="text-brand-blue text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: '#378ADD20' }}>{s.zone}</span>
                        </div>
                      </div>
                      <p className="text-xs font-medium text-gray-200 mb-1">{s.desc}</p>
                      <p className="text-xs text-gray-400">{s.strategy}</p>
                      {s.key_risk && (
                        <p className="text-xs text-orange-400 mt-1 flex items-center gap-1">
                          <AlertTriangle size={9} /> {s.key_risk}
                        </p>
                      )}
                      {s.nutrition && (
                        <p className="text-xs text-blue-400/80 mt-1">💧 {s.nutrition}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Night strategy */}
            {aiStrategy.night_strategy && (
              <div className="card border border-blue-900/40 bg-blue-900/10">
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <Moon size={14} className="text-blue-400" /> Stratégie nuit
                </h3>
                <p className="text-xs text-gray-300">{aiStrategy.night_strategy}</p>
              </div>
            )}

            {/* Nutrition */}
            {aiStrategy.nutrition_plan && (
              <div className="card">
                <h3 className="text-sm font-semibold mb-2">💧 Plan nutrition</h3>
                <p className="text-xs text-gray-300">{aiStrategy.nutrition_plan}</p>
              </div>
            )}

            {/* Rules + Mental */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {aiStrategy.race_rules?.length > 0 && (
                <div className="card">
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <Flag size={13} className="text-brand-orange" /> Règles de course
                  </h3>
                  <div className="space-y-1.5">
                    {aiStrategy.race_rules.map((r, i) => (
                      <p key={i} className="text-xs text-gray-300 flex items-start gap-1.5">
                        <span className="text-brand-orange shrink-0 mt-0.5">·</span> {r}
                      </p>
                    ))}
                  </div>
                </div>
              )}
              {aiStrategy.mental_tips?.length > 0 && (
                <div className="card">
                  <h3 className="text-sm font-semibold mb-2">🧠 Mental</h3>
                  <div className="space-y-1.5">
                    {aiStrategy.mental_tips.map((t, i) => (
                      <p key={i} className="text-xs text-gray-300 flex items-start gap-1.5">
                        <span className="text-brand-purple shrink-0 mt-0.5">·</span> {t}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Checkpoints table */}
      {checkpoints.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Clock size={14} className="text-brand-orange" />
            Checkpoints — {formatH(cpData?.total_h)}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400 border-b border-dark-600">
                  <th className="text-left py-2 pr-3">km</th>
                  <th className="text-left py-2 pr-3">Section</th>
                  <th className="text-right py-2 pr-3">Heure</th>
                  <th className="text-right py-2 pr-3">Cumulé</th>
                  <th className="text-right py-2">FC max</th>
                </tr>
              </thead>
              <tbody>
                {checkpoints.map((cp, i) => (
                  <motion.tr
                    key={i}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.04 }}
                    className={`border-b border-dark-600/50 last:border-0 ${cp.is_night ? 'bg-blue-900/15' : ''}`}
                  >
                    <td className="py-2 pr-3 font-mono font-bold text-gray-300">{cp.km}</td>
                    <td className="py-2 pr-3 text-gray-300">
                      <div className="flex items-center gap-1">
                        {cp.is_night && <Moon size={10} className="text-blue-400 shrink-0" />}
                        {cp.name}
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-right font-mono text-brand-orange">{cp.target_time}</td>
                    <td className="py-2 pr-3 text-right text-gray-400">{formatH(cp.cumul_h)}</td>
                    <td className="py-2 text-right text-red-400">{cp.fc_max || '—'}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Generating placeholder */}
      {!aiStrategy && aiGenerating && (
        <div className="card flex items-center gap-3 text-sm text-purple-300">
          <Loader2 size={16} className="animate-spin text-purple-400 shrink-0" />
          <div>
            <p className="font-medium">Génération de la stratégie IA en cours…</p>
            <p className="text-xs text-gray-400 mt-0.5">L'IA analyse votre profil, vos performances et le tracé GPX</p>
          </div>
        </div>
      )}

      {/* Static rules (fallback if no AI) */}
      {!aiStrategy && !aiGenerating && (
        <div className="card">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <AlertTriangle size={14} className="text-brand-orange" />
            Règles de base
          </h3>
          <div className="space-y-2 text-sm">
            {[
              { icon: '🚶', text: 'Marcher systématiquement sur les pentes > 10%' },
              { icon: '❤️', text: `FC max Z1-Z2 (< ${strategy ? (strategy.zones_karvonen?.Z2?.[1] || 148) : 148} bpm) sur le premier tiers — résister` },
              { icon: '💧', text: 'Eau et sel tous les 20km minimum' },
              { icon: '⚡', text: 'Gel toutes les 30-40min sur les montées longues' },
              { icon: '🧠', text: 'Générez la stratégie IA pour des conseils personnalisés basés sur vos performances réelles' },
            ].map((rule, i) => (
              <div key={i} className="flex items-start gap-2 text-gray-300">
                <span className="shrink-0">{rule.icon}</span>
                <span className="text-sm">{rule.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* JSON sections (fallback, non-AI) */}
      {!aiStrategy && sections.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold mb-3">Sections détaillées</h3>
          <div className="space-y-2">
            {sections.map((s, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-dark-600/50 last:border-0 text-xs">
                <div>
                  <span className="font-medium text-gray-200">{s.km_start}–{s.km_end} km</span>
                  <span className="ml-2 text-gray-400">{s.desc}</span>
                </div>
                <div className="flex items-center gap-3 text-right">
                  {s.pace && <span className="text-brand-orange">{s.pace} min/km</span>}
                  {s.fc_max && <span className="text-red-400">FC ≤ {s.fc_max}</span>}
                  <span className="text-gray-400">{formatH(s.target_h)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
