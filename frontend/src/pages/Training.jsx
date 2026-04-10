import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Calendar, Target, Clock, TrendingUp, Mountain, Plus, Flag, Pencil, Trash2, Upload, CheckCircle, ChevronDown, ChevronRight, ChevronLeft, Sparkles, AlertTriangle, Ban, Loader2, X, ExternalLink, Dumbbell } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { api } from '../api'
import { format, parseISO, differenceInDays } from 'date-fns'
import { fr } from 'date-fns/locale'
import AddRaceModal from '../components/AddRaceModal'
import ZoneSchematic from '../components/ZoneSchematic'

const PHASE_ICONS = { 'Base': '🏃', 'Charge': '💪', 'Spécificité': '🎯', 'Affûtage': '⚡', 'Race Week': '🏁' }

const SESSION_COLORS = {
  'Repos': '#4B5563', 'Endurance': '#378ADD', 'Longue': '#1D9E75',
  'Tempo': '#EF9F27', 'Côtes': '#E24B4A', 'Spécifique': '#7F77DD',
  'Activation': '#1D9E75', 'Récup': '#4B5563', 'COURSE': '#E24B4A',
  'Escalier': '#EF9F27', 'Renforcement': '#7F77DD',
}

const SPORT_ICONS = {
  'Escalier': '🪜', 'Vélo extérieur': '🚴', 'Vélo intérieur': '🚴',
  'Tapis': '🏃', 'Trail': '⛰️', 'Course à pied': '🏃', 'Renforcement': '💪',
}

// Exercise video search URLs
const EXERCISE_VIDEOS = {
  'Gainage frontal':         'https://www.youtube.com/results?search_query=gainage+frontal+tutoriel+trail',
  'Fentes avant':            'https://www.youtube.com/results?search_query=fentes+avant+tutoriel+renforcement',
  'Squats sautés':           'https://www.youtube.com/results?search_query=squats+sautes+tutoriel+renforcement',
  'Pont fessier':            'https://www.youtube.com/results?search_query=pont+fessier+tutoriel',
  'Step-ups (chaise)':       'https://www.youtube.com/results?search_query=step+up+exercice+tutoriel',
  'Gainage latéral':         'https://www.youtube.com/results?search_query=gainage+lateral+tutoriel',
  'Pompes':                  'https://www.youtube.com/results?search_query=pompes+tutoriel+technique',
  'Mountain climbers':       'https://www.youtube.com/results?search_query=mountain+climbers+exercice+tutoriel',
  'Fentes latérales':        'https://www.youtube.com/results?search_query=fentes+laterales+tutoriel',
  'Chaise (wall sit)':       'https://www.youtube.com/results?search_query=wall+sit+chaise+exercice',
  'Burpees':                 'https://www.youtube.com/results?search_query=burpees+tutoriel+debutant',
  'Pistol squat partiel':    'https://www.youtube.com/results?search_query=pistol+squat+progression',
}

const PRIORITY_COLOR = { A: '#1D9E75', B: '#378ADD', C: '#7F77DD' }
const PRIORITY_BG = { A: 'bg-green-500/10 border-green-500/30', B: 'bg-blue-500/10 border-blue-500/30', C: 'bg-purple-500/10 border-purple-500/30' }

// Sessions that need warmup/cooldown
const INTENSE_TYPES = ['Tempo', 'Côtes', 'Spécifique', 'COURSE']
const WARMUP_PROTOCOLS = {
  'Tempo':    { warmup: '15-20 min Z1 progressif + 4×30s accélérations', cooldown: '10-15 min Z1 très lent + étirements dynamiques' },
  'Côtes':    { warmup: '15 min Z1-Z2 progressif + mobilité hanches', cooldown: '10 min trot lent + étirements quadris/mollets' },
  'Spécifique':{ warmup: '10-15 min Z1 facile', cooldown: '10 min Z1 + récupération active' },
  'COURSE':   { warmup: '5-10 min marche active + mobilité', cooldown: 'Récupération post-course : marche, hydratation, alimentation' },
  'Endurance':{ warmup: '5 min allure progressive', cooldown: null },
  'Longue':   { warmup: '10 min allure très facile Z1', cooldown: '5-10 min marche + étirements' },
}

function SessionCard({ session, isToday }) {
  const color = SESSION_COLORS[session.type] || '#4B5563'
  const isRest = session.type === 'Repos' || session.type === 'Récup'
  const isStrength = session.type === 'Renforcement'
  const isIntense = INTENSE_TYPES.includes(session.type)
  const protocol = WARMUP_PROTOCOLS[session.type]
  const [expanded, setExpanded] = useState(false)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`card relative overflow-hidden ${isToday ? 'ring-1 ring-brand-green/50' : ''}`}
    >
      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-card" style={{ backgroundColor: color }} />
      <div className="pl-3">
        <div className="flex items-start justify-between mb-1">
          <div>
            <span className="text-xs text-gray-400 uppercase tracking-wide">
              {session.day} {session.date && format(parseISO(session.date), 'd MMM', { locale: fr })}
            </span>
            {isToday && <span className="ml-2 text-xs bg-brand-green/20 text-brand-green px-1.5 py-0.5 rounded">Aujourd'hui</span>}
          </div>
          <div className="flex items-center gap-2">
            {isIntense && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-400 font-medium">Intensif</span>
            )}
            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: color + '22', color }}>
              {session.type}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 mb-1">
          {session.sport && SPORT_ICONS[session.sport] && (
            <span className="text-sm">{SPORT_ICONS[session.sport]}</span>
          )}
          <p className="text-sm text-gray-200">{session.desc}</p>
        </div>

        {!isRest && (
          <div className="flex flex-wrap gap-3 text-xs mb-2">
            {session.distance > 0 && (
              <span className="flex items-center gap-1 text-brand-blue"><TrendingUp size={10} />{session.distance} km</span>
            )}
            {session.dplus > 0 && (
              <span className="flex items-center gap-1 text-brand-purple"><Mountain size={10} />{session.dplus} m D+</span>
            )}
            {session.fc_target && <span className="text-red-400">♥ max {session.fc_target} bpm</span>}
            {session.zone && <span className="flex items-center gap-1 text-brand-orange"><Target size={10} />{session.zone}</span>}
          </div>
        )}

        {/* Strength: exercise list with video links */}
        {isStrength && session.exercises?.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-colors mb-1"
            >
              <Dumbbell size={11} />
              {expanded ? '▾' : '▸'} {session.exercises.length} exercices — voir la liste & vidéos
            </button>
            <AnimatePresence>
              {expanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  {session.warmup && (
                    <div className="flex gap-2 text-xs mb-2">
                      <span className="text-green-400 font-medium shrink-0">▲ Écha.</span>
                      <span className="text-gray-300">{session.warmup}</span>
                    </div>
                  )}
                  <div className="space-y-1.5 mt-1">
                    {session.exercises.map((ex, i) => (
                      <div key={i} className="flex items-start justify-between gap-2 py-1.5 border-b border-dark-600/40 last:border-0">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium text-gray-200">{ex.name}</span>
                            <span className="text-xs text-purple-400 font-mono">{ex.sets}</span>
                          </div>
                          <p className="text-xs text-gray-500 leading-relaxed">{ex.desc}</p>
                          <p className="text-xs text-gray-600">{ex.muscles}</p>
                        </div>
                        {EXERCISE_VIDEOS[ex.name] && (
                          <a href={EXERCISE_VIDEOS[ex.name]} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-0.5 text-xs text-red-400/70 hover:text-red-400 transition-colors shrink-0 mt-0.5">
                            <ExternalLink size={10} />
                            Vidéo
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                  {session.cooldown && (
                    <div className="flex gap-2 text-xs mt-2">
                      <span className="text-blue-400 font-medium shrink-0">▼ Fin</span>
                      <span className="text-gray-300">{session.cooldown}</span>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Escalier: show suggested marches */}
        {session.type === 'Escalier' && session.suggested_marches && (
          <p className="text-xs text-orange-400/70 mt-1">
            ≈ {session.suggested_marches} marches × 18cm
          </p>
        )}

        {/* Warmup/cooldown for running sessions */}
        {protocol && !isStrength && (
          <div>
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1 transition-colors"
            >
              {expanded ? '▾' : '▸'} Échauffement & retour au calme
            </button>
            <AnimatePresence>
              {expanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-2 space-y-1.5">
                    <div className="flex gap-2 text-xs">
                      <span className="text-green-400 font-medium shrink-0">▲ Écha.</span>
                      <span className="text-gray-300">{protocol.warmup}</span>
                    </div>
                    {session.desc && isIntense && (
                      <div className="flex gap-2 text-xs">
                        <span className="text-orange-400 font-medium shrink-0">⚡ Corps</span>
                        <span className="text-gray-300">{session.desc}</span>
                      </div>
                    )}
                    {protocol.cooldown && (
                      <div className="flex gap-2 text-xs">
                        <span className="text-blue-400 font-medium shrink-0">▼ Retour</span>
                        <span className="text-gray-300">{protocol.cooldown}</span>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </motion.div>
  )
}

function RaceTargetRow({ race, onEdit, onDelete, onGPXUpdated, onViewFullPlan }) {
  const today = new Date()
  const raceDate = parseISO(race.date)
  const days = differenceInDays(raceDate, today)
  const isPast = days < 0
  const color = PRIORITY_COLOR[race.priority] || '#4B5563'
  const [gpxStatus, setGpxStatus] = useState(null) // null | 'loading' | 'ok' | 'error'
  const fileRef = useRef()

  const handleGPXFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setGpxStatus('loading')
    const reader = new FileReader()
    reader.onload = async (ev) => {
      try {
        const result = await api.updateRaceGPX(race.race_id, ev.target.result)
        setGpxStatus('ok')
        onGPXUpdated?.()
        setTimeout(() => setGpxStatus(null), 3000)
      } catch {
        setGpxStatus('error')
        setTimeout(() => setGpxStatus(null), 3000)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div className={`py-2.5 border-b border-dark-600/50 last:border-0 ${isPast ? 'opacity-40' : ''}`}>
      <div className="flex items-center gap-3">
        <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black border-2 shrink-0"
          style={{ borderColor: color, color }}>
          {race.priority}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-gray-200 truncate">{race.name}</p>
            {race.gpx_profile && (
              <span className="text-xs text-brand-green bg-green-500/10 px-1.5 py-0.5 rounded shrink-0">GPX ✓</span>
            )}
          </div>
          <p className="text-xs text-gray-400">
            {format(raceDate, 'd MMM yyyy', { locale: fr })} · {race.distance_km}km / {race.dplus_m}m D+
          </p>
        </div>
        <div className="text-right shrink-0">
          {isPast
            ? <span className="text-xs text-gray-500">Terminée</span>
            : <span className="text-sm font-bold" style={{ color }}>J-{days}</span>
          }
          {race.tapering === 1 && !isPast && (
            <p className="text-xs text-gray-500">Tapering prévu</p>
          )}
        </div>
        <div className="flex gap-1">
          <button onClick={() => onEdit(race)} className="p-1.5 rounded text-gray-500 hover:text-white hover:bg-dark-600 transition-colors">
            <Pencil size={13} />
          </button>
          <button onClick={() => onDelete(race)} className="p-1.5 rounded text-gray-500 hover:text-red-400 hover:bg-dark-600 transition-colors">
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Full plan button */}
      {!isPast && (
        <div className="mt-1.5 pl-9">
          <button
            onClick={onViewFullPlan}
            className="inline-flex items-center gap-1.5 text-xs text-brand-blue hover:text-blue-300 transition-colors"
          >
            <Calendar size={11} /> Voir le plan complet ({Math.max(0, differenceInDays(parseISO(race.date), new Date()))} jours)
          </button>
        </div>
      )}

      {/* GPX upload row — always visible */}
      {!isPast && (
        <div className="mt-2 pl-9">
          <label className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded border cursor-pointer transition-colors ${
            gpxStatus === 'ok' ? 'border-brand-green text-brand-green bg-green-500/10' :
            gpxStatus === 'error' ? 'border-red-500 text-red-400 bg-red-500/10' :
            gpxStatus === 'loading' ? 'border-gray-600 text-gray-400 bg-dark-600 animate-pulse' :
            race.gpx_profile
              ? 'border-brand-green/50 text-brand-green hover:border-brand-green hover:bg-green-500/10'
              : 'border-dashed border-gray-600 text-gray-400 hover:border-brand-blue hover:text-brand-blue hover:bg-blue-500/5'
          }`}>
            <input type="file" accept=".gpx" className="hidden" ref={fileRef} onChange={handleGPXFile} />
            {gpxStatus === 'loading' ? (
              <><span className="animate-spin">⟳</span> Chargement…</>
            ) : gpxStatus === 'ok' ? (
              <><CheckCircle size={12} /> GPX mis à jour</>
            ) : gpxStatus === 'error' ? (
              <>✕ Erreur — réessayer</>
            ) : race.gpx_profile ? (
              <><CheckCircle size={12} /> GPX chargé · Remplacer</>
            ) : (
              <><Upload size={12} /> Importer le GPX de la course</>
            )}
          </label>
          {gpxStatus === 'ok' && (
            <p className="text-xs text-gray-500 mt-0.5">Plan adapté au prochain rechargement</p>
          )}
        </div>
      )}
    </div>
  )
}

// ---- Shared constants (used by FullPlanModal, RacePlanSection, TodayPlanCard) ----

const READINESS_CFG = {
  OPTIMAL:   { color: '#1D9E75', label: 'Forme OK',     icon: '✅' },
  BOOST:     { color: '#378ADD', label: 'Forme +',      icon: '🚀' },
  VIGILANCE: { color: '#EF9F27', label: 'Allégé',       icon: '⚠️' },
  REPOS:     { color: '#E24B4A', label: 'Récupération', icon: '🔴' },
}

const SPORT_COLORS = {
  'Course à pied': '#378ADD', 'Trail': '#1D9E75',
  'Renforcement': '#7F77DD',  'Escalier': '#EF9F27',
  'Vélo extérieur': '#1D9E75', 'Vélo intérieur': '#1D9E75',
  'Sauna': '#E24B4A', 'Repos': '#4B5563', 'Multiple': '#7F77DD',
}

const SLOT_CFG = {
  matin: { icon: '🌅', label: 'Matin',  color: '#EF9F27' },
  midi:  { icon: '☀️', label: 'Midi',   color: '#378ADD' },
  soir:  { icon: '🌙', label: 'Soir',   color: '#7F77DD' },
}

const PHASE_COLOR = {
  RACE: '#E24B4A', RÉCUP: '#378ADD', BUILD: '#1D9E75',
  CHARGE: '#EF9F27', AFFÛTAGE: '#7F77DD', MARIAGE: '#7F77DD',
}

const RACE_PLANS = {
  chevaliers: {
    label: 'Trail des Chevaliers', emoji: '⚔️',
    date: '2026-05-15', color: '#EF9F27',
    weeks: [
      { id: 'S1', start: '2026-05-11', label: 'Chevaliers (15/05)',        phase: 'RACE',     km: 18,  dplus: 100,  sauna: false },
    ],
  },
  utmb: {
    label: 'UTMB', emoji: '🏔️',
    date: '2026-08-28', color: '#1D9E75',
    weeks: [
      { id: 'S2',  start: '2026-05-18', label: 'Récup 1 — post-Chevaliers',  phase: 'RÉCUP',    km: 30,  dplus: 200,  sauna: false },
      { id: 'S3',  start: '2026-05-25', label: 'Récup 2 — intro structure',   phase: 'RÉCUP',    km: 52,  dplus: 500,  sauna: false },
      { id: 'S4',  start: '2026-06-01', label: 'Build 1',                     phase: 'BUILD',    km: 80,  dplus: 900,  sauna: false },
      { id: 'S5',  start: '2026-06-08', label: 'Build 2',                     phase: 'BUILD',    km: 90,  dplus: 1400, sauna: false },
      { id: 'S6',  start: '2026-06-15', label: 'Build 3',                     phase: 'BUILD',    km: 96,  dplus: 1900, sauna: false },
      { id: 'S7',  start: '2026-06-22', label: 'Pré-mariage + Mariage 1',    phase: 'MARIAGE',  km: 50,  dplus: 800,  sauna: false },
      { id: 'S8',  start: '2026-06-29', label: 'Reprise + Sauna démarre',     phase: 'BUILD',    km: 72,  dplus: 1500, sauna: true  },
      { id: 'S9',  start: '2026-07-06', label: 'Charge 1 — Sortie nuit',     phase: 'CHARGE',   km: 100, dplus: 3000, sauna: true  },
      { id: 'S10', start: '2026-07-13', label: 'Mariage 2 (18/07)',           phase: 'MARIAGE',  km: 68,  dplus: 1500, sauna: true  },
      { id: 'S11', start: '2026-07-20', label: 'PIC UTMB — Semaine clé',     phase: 'CHARGE',   km: 120, dplus: 5000, sauna: true  },
      { id: 'S12', start: '2026-07-27', label: 'Mariage 3 (01/08)',           phase: 'MARIAGE',  km: 55,  dplus: 1800, sauna: true  },
      { id: 'S13', start: '2026-08-03', label: 'Maintien — Vosges/Ardennes', phase: 'CHARGE',   km: 90,  dplus: 3000, sauna: true  },
      { id: 'S14', start: '2026-08-10', label: 'Affûtage 1 — J-18 UTMB',    phase: 'AFFÛTAGE', km: 68,  dplus: 2000, sauna: true  },
      { id: 'S15', start: '2026-08-17', label: 'Affûtage 2 — J-11 UTMB',    phase: 'AFFÛTAGE', km: 42,  dplus: 500,  sauna: false },
      { id: 'S16', start: '2026-08-24', label: 'Race Week — UTMB 28/08',     phase: 'RACE',     km: 15,  dplus: 100,  sauna: false },
    ],
  },
}

// ---- Full plan modal ----
function FullPlanModal({ race, onClose }) {
  const [fullPlan, setFullPlan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState(null)
  const [aiStatus, setAiStatus] = useState(null)
  const [expandedWeek, setExpandedWeek] = useState(null)
  const [exportStatus, setExportStatus] = useState({}) // weekStart → { loading, ok, count }
  const today = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => {
    api.getFullPlan(race.race_id).then(d => { setFullPlan(d); setLoading(false) }).catch(() => setLoading(false))
    api.getAIStatus().then(setAiStatus).catch(() => {})
    setExpandedWeek(0)
  }, [race.race_id])

  const handleGenerateAI = async () => {
    setAiLoading(true)
    setAiError(null)
    try {
      const result = await api.generateAIPlan(race.race_id)
      if (result.provider) setAiStatus(s => ({ ...s, active_provider: result.provider, ollama_model: result.model }))
      const d = await api.getFullPlan(race.race_id)
      setFullPlan(d)
    } catch (e) {
      setAiError(e.message)
    } finally {
      setAiLoading(false)
    }
  }

  const PHASE_COLORS = { 'Base': '#378ADD', 'Charge': '#EF9F27', 'Spécificité': '#7F77DD', 'Affûtage': '#1D9E75', 'Race Week': '#E24B4A', 'maintenance': '#4B5563' }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm p-4 pt-8 overflow-y-auto"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="w-full max-w-2xl bg-dark-800 rounded-2xl border border-dark-600 mb-8"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-dark-600">
          <div>
            <h2 className="font-bold text-base">{race.name}</h2>
            <p className="text-xs text-gray-400">{race.distance_km}km / {race.dplus_m}m D+ · {format(parseISO(race.date), 'd MMM yyyy', { locale: fr })}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex flex-col items-end gap-1">
              <button
                onClick={handleGenerateAI}
                disabled={aiLoading || (aiStatus && !aiStatus.active_provider)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-purple-500/15 text-purple-300 border border-purple-500/30 hover:bg-purple-500/25 transition-colors disabled:opacity-50"
              >
                {aiLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                {aiLoading ? 'Génération…' : 'Générer avec IA'}
              </button>
              {aiStatus && (
                <span className="text-xs text-gray-600">
                  {aiStatus.active_provider === 'ollama'
                    ? `🟢 Local · ${aiStatus.ollama_model}`
                    : aiStatus.active_provider === 'anthropic'
                    ? '☁️ Claude API'
                    : '🔴 Aucun provider — lancez Ollama'}
                </span>
              )}
            </div>
            <button onClick={onClose} className="p-1.5 text-gray-500 hover:text-white rounded-lg hover:bg-dark-600">
              <X size={16} />
            </button>
          </div>
        </div>

        {aiError && (
          <div className="mx-4 mt-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400">
            {aiError.includes('Ollama') || aiError.includes('provider')
              ? <>⚙️ Lancez Ollama : <code className="bg-dark-700 px-1 rounded">ollama serve</code> puis réessayez</>
              : `Erreur IA: ${aiError}`}
          </div>
        )}

        <div className="p-4 space-y-2">
          {loading ? (
            <div className="text-center py-8 text-gray-500 text-sm">Chargement du plan…</div>
          ) : !fullPlan?.weeks?.length ? (
            <div className="text-center py-8 text-gray-500 text-sm">Aucune semaine à afficher</div>
          ) : (
            fullPlan.weeks.map((week, wi) => {
              const isExpanded = expandedWeek === wi
              const isCurrentWeek = week.sessions?.some(s => s.date === today)
              const totalKm = week.sessions?.reduce((a, s) => a + (s.distance || 0), 0) || 0
              const totalDplus = week.sessions?.reduce((a, s) => a + (s.dplus || 0), 0) || 0
              const phaseColor = PHASE_COLORS[week.phase?.phase] || '#4B5563'

              return (
                <div key={week.week_start} className={`rounded-xl border overflow-hidden transition-colors ${
                  isCurrentWeek ? 'border-brand-green/40 bg-green-500/5' :
                  week.is_unavailable ? 'border-gray-600/30 bg-gray-500/5' :
                  'border-dark-600/50'
                }`}>
                  <button
                    className="w-full flex items-center gap-3 p-3 text-left hover:bg-dark-700/50 transition-colors"
                    onClick={() => setExpandedWeek(isExpanded ? null : wi)}
                  >
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: week.is_unavailable ? '#4B5563' : phaseColor }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-gray-200">
                          Sem. {week.week_number} · {format(parseISO(week.week_start), 'd MMM', { locale: fr })}
                        </span>
                        {isCurrentWeek && <span className="text-xs bg-brand-green/20 text-brand-green px-1.5 py-0.5 rounded font-medium">Cette semaine</span>}
                        {week.is_unavailable && (
                          <span className="text-xs bg-gray-500/20 text-gray-400 px-1.5 py-0.5 rounded flex items-center gap-1">
                            <Ban size={9} /> {week.unavailability_label || 'Indisponible'}
                          </span>
                        )}
                        {week.has_ai_plan && <span className="text-xs bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded flex items-center gap-1"><Sparkles size={9} />IA</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-gray-500" style={{ color: week.is_unavailable ? '#4B5563' : phaseColor + 'CC' }}>
                          {week.is_unavailable ? 'Maintien' : week.phase?.phase}
                        </span>
                        <span className="text-xs text-gray-500">J-{week.days_until_race}</span>
                        {totalKm > 0 && <span className="text-xs text-gray-500">{totalKm}km</span>}
                        {totalDplus > 0 && <span className="text-xs text-gray-500">D+{totalDplus}m</span>}
                      </div>
                    </div>
                    {isExpanded ? <ChevronDown size={14} className="text-gray-500 shrink-0" /> : <ChevronRight size={14} className="text-gray-500 shrink-0" />}
                  </button>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: 'auto' }}
                        exit={{ height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="px-3 pb-3 space-y-1.5 border-t border-dark-600/30 pt-2">
                          {week.week_summary && (
                            <p className="text-xs text-gray-400 italic mb-2">{week.week_summary}</p>
                          )}
                          {/* Bouton export Garmin */}
                          {week.sessions?.some(s => s.type !== 'Repos') && (() => {
                            const ws = week.week_start
                            const es = exportStatus[ws]
                            return (
                              <div className="flex items-center justify-end mb-2">
                                {es?.ok && (
                                  <span className="text-xs text-brand-green mr-2">✓ {es.count} séance(s) envoyées</span>
                                )}
                                {es?.error && (
                                  <span className="text-xs text-red-400 mr-2">{es.error}</span>
                                )}
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation()
                                    const sessions = week.sessions.filter(s => s.type !== 'Repos' && s.type !== 'Récup' && s.type !== 'Renforcement')
                                    setExportStatus(prev => ({ ...prev, [ws]: { loading: true } }))
                                    try {
                                      const r = await api.exportPlanToGarmin(sessions)
                                      setExportStatus(prev => ({ ...prev, [ws]: { ok: true, count: r.exported } }))
                                    } catch (err) {
                                      setExportStatus(prev => ({ ...prev, [ws]: { error: err.message } }))
                                    }
                                  }}
                                  disabled={es?.loading}
                                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-dark-600 hover:bg-dark-500 text-xs text-gray-300 transition-colors disabled:opacity-50"
                                >
                                  {es?.loading
                                    ? <span className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                                    : <span>⌚</span>
                                  }
                                  {es?.loading ? 'Envoi…' : 'Envoyer vers Garmin'}
                                </button>
                              </div>
                            )
                          })()}
                          {week.sessions?.map((s, si) => {
                            const color = SESSION_COLORS[s.type] || SPORT_COLORS[s.type] || '#4B5563'
                            const isToday = s.date === today
                            const isRest = s.type === 'Repos' || s.type === 'Récup'
                            const slotCfg = s.slot ? SLOT_CFG[s.slot] : null
                            return (
                              <div key={si} className={`flex items-start gap-2.5 p-2 rounded-lg ${isToday ? 'bg-brand-green/10 border border-brand-green/20' : 'bg-dark-700/30'}`}>
                                <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: color }} />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs text-gray-400 w-8 shrink-0">{s.day}</span>
                                    {slotCfg && <span className="text-xs" title={slotCfg.label}>{slotCfg.icon}</span>}
                                    <span className="text-xs font-medium" style={{ color }}>{s.type}</span>
                                    {isToday && <span className="text-xs bg-brand-green/20 text-brand-green px-1 rounded">Aujourd'hui</span>}
                                  </div>
                                  {!isRest && (
                                    <p className="text-xs text-gray-300 mt-0.5 leading-relaxed">{s.desc}</p>
                                  )}
                                  {!isRest && (
                                    <div className="flex flex-wrap gap-2 mt-1">
                                      {s.distance > 0 && <span className="text-xs text-brand-blue">{s.distance}km</span>}
                                      {s.dplus > 0 && <span className="text-xs text-brand-purple">D+{s.dplus}m</span>}
                                      {s.duration_min > 0 && <span className="text-xs text-gray-500">{s.duration_min}min</span>}
                                      {s.zone && <span className="text-xs text-gray-500">{s.zone}</span>}
                                      {s.fc_target > 0 && <span className="text-xs text-red-400">♥ max {s.fc_target}</span>}
                                      {s.type === 'Renforcement' && s.exercises?.length > 0 && (
                                        <span className="text-xs text-purple-400">💪 {s.exercises.length} exercices</span>
                                      )}
                                      {s.type === 'Escalier' && s.suggested_marches > 0 && (
                                        <span className="text-xs text-orange-400">≈{s.suggested_marches} marches</span>
                                      )}
                                    </div>
                                  )}
                                  {s.warmup && !s.exercises && (
                                    <p className="text-xs text-green-400/70 mt-1">▲ {s.warmup}</p>
                                  )}
                                  {s.cooldown && !s.exercises && (
                                    <p className="text-xs text-blue-400/70 mt-0.5">▼ {s.cooldown}</p>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

// ---- Unavailability panel ----
function UnavailabilityPanel() {
  const [periods, setPeriods] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ date_from: '', date_to: '', label: '', impact: 'maintenance' })

  useEffect(() => {
    api.getUnavailability().then(setPeriods).catch(() => {})
  }, [])

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!form.date_from || !form.date_to) return
    const p = await api.addUnavailability(form)
    setPeriods(prev => [...prev, p].sort((a, b) => a.date_from.localeCompare(b.date_from)))
    setForm({ date_from: '', date_to: '', label: '', impact: 'maintenance' })
    setShowForm(false)
  }

  const handleDelete = async (id) => {
    await api.deleteUnavailability(id)
    setPeriods(prev => prev.filter(p => p.id !== id))
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Ban size={14} className="text-orange-400" /> Indisponibilités
        </h3>
        <button onClick={() => setShowForm(!showForm)} className="text-xs text-brand-blue hover:text-blue-300">
          {showForm ? 'Annuler' : '+ Ajouter'}
        </button>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.form
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
            onSubmit={handleAdd}
          >
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Du</label>
                <input type="date" value={form.date_from} onChange={e => setForm(p => ({ ...p, date_from: e.target.value }))}
                  className="w-full bg-dark-600 border border-dark-500 rounded-lg px-2 py-1.5 text-xs text-white" required />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Au</label>
                <input type="date" value={form.date_to} onChange={e => setForm(p => ({ ...p, date_to: e.target.value }))}
                  className="w-full bg-dark-600 border border-dark-500 rounded-lg px-2 py-1.5 text-xs text-white" required />
              </div>
            </div>
            <div className="mb-2">
              <input type="text" placeholder="Libellé (voyage, blessure…)" value={form.label}
                onChange={e => setForm(p => ({ ...p, label: e.target.value }))}
                className="w-full bg-dark-600 border border-dark-500 rounded-lg px-2 py-1.5 text-xs text-white placeholder-gray-600" />
            </div>
            <div className="flex gap-2 mb-3">
              {[['maintenance', 'Maintien (léger)'], ['reduced', 'Réduit (très léger)']].map(([v, l]) => (
                <button key={v} type="button" onClick={() => setForm(p => ({ ...p, impact: v }))}
                  className={`flex-1 text-xs py-1.5 rounded-lg border transition-colors ${form.impact === v ? 'border-brand-blue text-brand-blue bg-blue-500/10' : 'border-dark-500 text-gray-500 hover:border-gray-500'}`}>
                  {l}
                </button>
              ))}
            </div>
            <button type="submit" className="w-full btn-primary text-xs py-1.5 mb-3">Enregistrer</button>
          </motion.form>
        )}
      </AnimatePresence>

      {periods.length === 0 ? (
        <p className="text-xs text-gray-600">Aucune période — tes entraînements sont optimisés pour la progression.</p>
      ) : (
        <div className="space-y-1.5">
          {periods.map(p => (
            <div key={p.id} className="flex items-center gap-2 py-1.5 border-b border-dark-600/40 last:border-0">
              <Ban size={11} className="text-orange-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-xs text-gray-300">
                  {format(parseISO(p.date_from), 'd MMM', { locale: fr })} → {format(parseISO(p.date_to), 'd MMM yyyy', { locale: fr })}
                </span>
                {p.label && <span className="text-xs text-gray-500 ml-2">· {p.label}</span>}
              </div>
              <span className="text-xs text-gray-600">{p.impact === 'reduced' ? 'Très léger' : 'Maintien'}</span>
              <button onClick={() => handleDelete(p.id)} className="p-1 text-gray-600 hover:text-red-400 rounded transition-colors">
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---- Race plan section ----

function weekEnd(weekStart) {
  const d = new Date(weekStart + 'T12:00:00')
  d.setDate(d.getDate() + 6)
  return d.toISOString().slice(0, 10)
}

function DayCard({ dayData, date, today }) {
  const isToday = date === today
  const isPast = date < today
  const rc = READINESS_CFG[dayData?.readiness] || READINESS_CFG.OPTIMAL
  const hasAdapt = dayData?.readiness && dayData.readiness !== 'OPTIMAL'

  if (!dayData || !dayData.sessions?.length) {
    return (
      <div className="flex items-center gap-2 px-1 py-2 opacity-30">
        <span className="text-xs text-gray-500 w-20 shrink-0 font-medium uppercase">
          {format(parseISO(date), 'EEE d', { locale: fr })}
        </span>
        <span className="text-xs text-gray-700">repos</span>
      </div>
    )
  }

  // Group sessions by slot
  const bySlot = { matin: [], midi: [], soir: [] }
  dayData.sessions.forEach(s => { const sl = s.slot || 'matin'; bySlot[sl]?.push(s) })

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`card ${isToday ? 'ring-1 ring-brand-green/50' : ''} ${isPast ? 'opacity-60' : ''}`}
    >
      {/* Day header */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-200 uppercase tracking-wide">
            {format(parseISO(date), 'EEE', { locale: fr })}
          </span>
          <span className="text-xs text-gray-400">{format(parseISO(date), 'd MMM', { locale: fr })}</span>
          {isToday && <span className="text-xs bg-brand-green/20 text-brand-green px-1.5 py-0.5 rounded">Aujourd'hui</span>}
        </div>
        {hasAdapt && (
          <span className="text-xs px-1.5 py-0.5 rounded font-medium"
            style={{ backgroundColor: rc.color + '22', color: rc.color }}>
            {rc.icon} {rc.label}
          </span>
        )}
      </div>

      {/* Adaptation notes */}
      {dayData.adaptations?.length > 0 && (
        <div className="mb-2.5 px-2 py-1.5 rounded-lg bg-dark-700/60 space-y-0.5">
          {dayData.adaptations.map((a, i) => (
            <p key={i} className="text-xs text-gray-400">· {a}</p>
          ))}
        </div>
      )}

      {/* Sessions grouped by slot */}
      <div className="space-y-3">
        {['matin', 'midi', 'soir'].map(slot => {
          const sessions = bySlot[slot]
          if (!sessions.length) return null
          const sc = SLOT_CFG[slot]
          return (
            <div key={slot} className="flex gap-2.5">
              {/* Slot timeline */}
              <div className="flex flex-col items-center pt-0.5">
                <span className="text-sm leading-none">{sc.icon}</span>
                {sessions.length > 0 && <div className="w-px flex-1 bg-dark-600/40 mt-1.5" />}
              </div>
              <div className="flex-1 space-y-1.5 pb-0.5">
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: sc.color + 'AA' }}>
                  {sc.label}
                </span>
                {sessions.map((s, si) => {
                  const sportColor = SPORT_COLORS[s.sport] || '#4B5563'
                  const isRest = s.sport === 'Repos'
                  return (
                    <div key={si} className={`p-2.5 rounded-xl ${
                      s.adapted ? 'bg-orange-500/5 border border-orange-500/25' : 'bg-dark-700/50'
                    }`}>
                      <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                        <span className="text-xs font-semibold" style={{ color: sportColor }}>{s.sport}</span>
                        {s.session_type && !isRest && (
                          <span className="text-xs text-gray-500">· {s.session_type}</span>
                        )}
                        {s.adapted && <span className="text-xs text-orange-400 font-medium">Adapté</span>}
                      </div>
                      {isRest
                        ? <p className="text-xs text-gray-500">{s.desc}</p>
                        : <>
                          <p className="text-xs text-gray-300 leading-relaxed">{s.desc}</p>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
                            {s.km > 0 && (
                              <span className="text-xs text-brand-blue flex items-center gap-0.5">
                                <TrendingUp size={9} />
                                {s.km}km
                                {s.original_km && s.original_km !== s.km && (
                                  <span className="text-gray-600 line-through ml-1">{s.original_km}</span>
                                )}
                              </span>
                            )}
                            {s.dplus_m > 0 && (
                              <span className="text-xs text-brand-purple flex items-center gap-0.5">
                                <Mountain size={9} />{s.dplus_m}m D+
                              </span>
                            )}
                            {s.duration_min > 0 && (
                              <span className="text-xs text-gray-500 flex items-center gap-0.5">
                                <Clock size={9} />{s.duration_min}min
                              </span>
                            )}
                            {s.fc_max && <span className="text-xs text-red-400">FC&nbsp;max&nbsp;{s.fc_max}</span>}
                            {s.zone && <span className="text-xs text-brand-orange">{s.zone}</span>}
                          </div>
                          {s.location && (
                            <p className="text-xs text-gray-600 mt-1">{s.location}</p>
                          )}
                          {s.notes && s.notes !== s.desc && (
                            <p className="text-xs text-gray-600 mt-0.5 italic">{s.notes}</p>
                          )}
                          {s.adaptation_note && (
                            <p className="text-xs mt-1" style={{ color: rc.color + 'CC' }}>→ {s.adaptation_note}</p>
                          )}
                        </>
                      }
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Morning log chip */}
      {dayData.log && (
        <div className="mt-2.5 pt-2 border-t border-dark-600/30 flex flex-wrap gap-3 text-xs text-gray-600">
          {dayData.log.hrv && <span>VFC {dayData.log.hrv}</span>}
          {dayData.log.fc_repos && <span>FC {dayData.log.fc_repos}</span>}
          {dayData.log.sensation && <span>😊 {dayData.log.sensation}/5</span>}
          {dayData.log.sleep_h && <span>💤 {dayData.log.sleep_h?.toFixed(1)}h</span>}
          {dayData.log.aei && <span>AEI {dayData.log.aei}</span>}
        </div>
      )}
    </motion.div>
  )
}

function RacePlanSection() {
  const today = format(new Date(), 'yyyy-MM-dd')

  // Auto-select the right plan + week
  const initPlan = today <= '2026-05-17' ? 'chevaliers' : 'utmb'
  const initWeekIdx = (() => {
    const weeks = RACE_PLANS[initPlan === 'chevaliers' ? 'chevaliers' : 'utmb'].weeks
    const idx = weeks.findIndex(w => today >= w.start && today <= weekEnd(w.start))
    return idx >= 0 ? idx : (today < weeks[0].start ? 0 : weeks.length - 1)
  })()

  const [planId, setPlanId] = useState(initPlan)
  const [weekIdx, setWeekIdx] = useState(initWeekIdx)
  const [weekData, setWeekData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [raceNames, setRaceNames] = useState({}) // { chevaliers: 'Trail des Chevaliers', utmb: 'UTMB' }

  useEffect(() => {
    api.getRaceTargets().then(races => {
      const names = {}
      // Match races by date to plan keys
      Object.entries(RACE_PLANS).forEach(([key, p]) => {
        const match = races.find(r => r.date === p.date)
        if (match) names[key] = match.name
      })
      setRaceNames(names)
    }).catch(() => {})
  }, [])

  const plan = RACE_PLANS[planId]
  const weeks = plan.weeks
  const week = weeks[weekIdx]

  useEffect(() => {
    if (!week) return
    setLoading(true)
    setWeekData(null)
    const to = weekEnd(week.start)
    api.getPlanSessions(week.start, to)
      .then(d => { setWeekData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [planId, weekIdx])

  // When switching plan, reset to current week of new plan
  const handleSwitchPlan = (id) => {
    const newWeeks = RACE_PLANS[id].weeks
    const idx = newWeeks.findIndex(w => today >= w.start && today <= weekEnd(w.start))
    setPlanId(id)
    setWeekIdx(idx >= 0 ? idx : (today < newWeeks[0].start ? 0 : newWeeks.length - 1))
  }

  // Build full 7-day array for the week
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(week.start + 'T12:00:00')
    d.setDate(d.getDate() + i)
    const date = d.toISOString().slice(0, 10)
    return { date, dayData: weekData?.days?.find(x => x.date === date) || null }
  })

  const phaseColor = PHASE_COLOR[week.phase] || '#4B5563'
  const to = weekEnd(week.start)

  return (
    <div className="space-y-4">

      {/* Plan tabs */}
      <div className="flex gap-2">
        {Object.entries(RACE_PLANS).map(([id, p]) => (
          <button
            key={id}
            onClick={() => handleSwitchPlan(id)}
            className="flex-1 py-2.5 px-3 rounded-xl text-xs font-semibold border transition-all text-left"
            style={planId === id
              ? { borderColor: p.color, backgroundColor: p.color + '18', color: p.color }
              : { borderColor: '#374151', color: '#6B7280' }
            }
          >
            <span className="text-sm mr-1">{p.emoji}</span> {raceNames[id] || p.label}
            <span className="block text-xs font-normal mt-0.5 opacity-70">
              {format(parseISO(p.date), 'd MMM yyyy', { locale: fr })}
            </span>
          </button>
        ))}
      </div>

      {/* Week navigation */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setWeekIdx(i => Math.max(0, i - 1))}
          disabled={weekIdx === 0}
          className="p-2 rounded-xl bg-dark-700 text-gray-400 hover:text-white disabled:opacity-25 transition-colors shrink-0"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="flex-1 text-center min-w-0 px-1">
          <p className="text-sm font-semibold text-gray-200 truncate">{week.label}</p>
          <p className="text-xs text-gray-500">
            {format(parseISO(week.start), 'd', { locale: fr })}–{format(parseISO(to), 'd MMM', { locale: fr })}
            &nbsp;·&nbsp;Sem {weekIdx + 1}/{weeks.length}
          </p>
        </div>
        <button
          onClick={() => setWeekIdx(i => Math.min(weeks.length - 1, i + 1))}
          disabled={weekIdx === weeks.length - 1}
          className="p-2 rounded-xl bg-dark-700 text-gray-400 hover:text-white disabled:opacity-25 transition-colors shrink-0"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Week summary badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs px-2 py-1 rounded-full font-semibold"
          style={{ backgroundColor: phaseColor + '20', color: phaseColor }}>
          {week.phase}
        </span>
        <span className="text-xs text-gray-500 flex items-center gap-1">
          <TrendingUp size={10} /> {week.km} km
        </span>
        <span className="text-xs text-gray-500 flex items-center gap-1">
          <Mountain size={10} /> D+{week.dplus}m
        </span>
        {week.sauna && <span className="text-xs text-orange-400">🧖 Sauna</span>}
        {weekData?.recent_load?.avg_aei && (
          <span className="text-xs text-gray-600 ml-auto">AEI moy {weekData.recent_load.avg_aei.toFixed(1)}</span>
        )}
      </div>

      {/* Days */}
      {loading
        ? <div className="text-center py-8 text-gray-500 text-sm flex flex-col items-center gap-2">
            <Loader2 size={18} className="animate-spin" /> Chargement…
          </div>
        : <div className="space-y-2">
            {weekDays.map(({ date, dayData }) => (
              <DayCard key={date} date={date} dayData={dayData} today={today} />
            ))}
          </div>
      }
    </div>
  )
}

// ---- Today plan card ----
const PLAN_START = '2026-05-11'

// Renders a single session row
function SessionRow({ s, sportColor }) {
  return (
    <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-dark-700/50">
      <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: sportColor }} />
      <div className="flex-1">
        <span className="text-xs font-medium" style={{ color: sportColor }}>{s.sport || s.type}</span>
        {(s.notes || s.desc) && <p className="text-xs text-gray-400 mt-0.5">{s.notes || s.desc}</p>}
        <div className="flex flex-wrap gap-2 mt-1">
          {(s.km || s.distance) > 0 && <span className="text-xs text-brand-blue">{s.km || s.distance}km</span>}
          {(s.dplus_m || s.dplus) > 0 && <span className="text-xs text-brand-purple">D+{s.dplus_m || s.dplus}m</span>}
          {s.duration_min > 0 && <span className="text-xs text-gray-500">{s.duration_min}min</span>}
          {(s.fc_max || s.fc_target) > 0 && <span className="text-xs text-red-400">♥ max {s.fc_max || s.fc_target}</span>}
          {s.zone && <span className="text-xs text-gray-500">{s.zone}</span>}
        </div>
        {s.sessions?.length > 0 && (
          <div className="mt-1.5 space-y-1">
            {s.sessions.map((ss, i) => (
              <div key={i} className="text-xs text-gray-500 flex items-center gap-1.5">
                <div className="w-1 h-1 rounded-full bg-gray-600 shrink-0" />
                <span>{ss.sport}{ss.duration_min > 0 ? ` · ${ss.duration_min}min` : ''}{ss.dplus_m > 0 ? ` · D+${ss.dplus_m}m` : ''}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function TodayPlanCard() {
  const [planDay, setPlanDay] = useState(null)
  const [currentPlan, setCurrentPlan] = useState(null)
  const [loading, setLoading] = useState(true)
  const today = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => {
    const spPromise = api.getPlanSessions(today, today).catch(() => null)
    const cpPromise = api.getTodayAdapted().catch(() => null)
    Promise.all([spPromise, cpPromise]).then(([sp, cp]) => {
      setPlanDay(sp?.days?.[0] || null)
      setCurrentPlan(cp)
      setLoading(false)
    })
  }, [today])

  if (loading) return null

  const hasSP = planDay?.sessions?.length > 0

  if (hasSP) {
    const day = planDay
    const rc = READINESS_CFG[day.readiness] || READINESS_CFG.OPTIMAL
    const isAdapted = day.readiness && day.readiness !== 'OPTIMAL'
    const bySlot = { matin: [], midi: [], soir: [] }
    day.sessions.forEach(s => { const sl = s.slot || 'matin'; bySlot[sl]?.push(s) })
    const activeSlots = Object.entries(bySlot).filter(([, arr]) => arr.length > 0)

    return (
      <div className="card border" style={{ borderColor: rc.color + '30' }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <span>{rc.icon}</span> Séances du jour
            {isAdapted && (
              <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: rc.color + '20', color: rc.color }}>Adaptées</span>
            )}
          </h3>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ color: rc.color, backgroundColor: rc.color + '15' }}>{rc.label}</span>
        </div>
        {day.hrv_note && <p className="text-xs text-orange-400/80 mb-1.5">· {day.hrv_note}</p>}
        {day.fc_note && <p className="text-xs text-orange-400/80 mb-1.5">· {day.fc_note}</p>}
        <div className="space-y-3">
          {activeSlots.map(([slot, sessions]) => {
            const sc = SLOT_CFG[slot]
            return (
              <div key={slot}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-xs">{sc.icon}</span>
                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: sc.color }}>{sc.label}</span>
                </div>
                <div className="space-y-1.5">
                  {sessions.map((s, i) => (
                    <SessionRow key={i} s={s} sportColor={SPORT_COLORS[s.sport] || '#4B5563'} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
        {(!planDay?.hrv_trend && !planDay?.fc_repos_trend) && (
          <p className="text-xs text-gray-600 mt-2 text-center">💡 Encode ta VFC et FC repos pour personnaliser les séances</p>
        )}
      </div>
    )
  }

  // Fallback: plan courant générique
  if (!currentPlan?.adapted_session) return null

  const s = currentPlan.adapted_session
  const RC_MAP = {
    OPTIMAL:   { color: '#1D9E75', label: 'Forme optimale', icon: '✅' },
    VIGILANCE: { color: '#EF9F27', label: 'Vigilance',      icon: '⚠️' },
    REPOS:     { color: '#E24B4A', label: 'Récupération',   icon: '🔴' },
  }
  const rc = RC_MAP[currentPlan.readiness] || RC_MAP.OPTIMAL
  const color = SESSION_COLORS[s.type] || '#4B5563'

  return (
    <div className="card border" style={{ borderColor: rc.color + '40' }}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <span>{rc.icon}</span> Séance du jour
          {currentPlan.is_adapted && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-400">Adaptée</span>
          )}
        </h3>
        <span className="text-xs font-bold" style={{ color: rc.color }}>{rc.label}</span>
      </div>
      {currentPlan.adaptations?.length > 0 && (
        <div className="mb-2 space-y-0.5">
          {currentPlan.adaptations.map((a, i) => <p key={i} className="text-xs text-gray-400">· {a}</p>)}
        </div>
      )}
      <SessionRow s={{ ...s, sport: s.type, km: s.distance, dplus_m: s.dplus, fc_max: s.fc_target }} sportColor={color} />
      {s.warmup && <p className="text-xs text-green-400/70 mt-1">▲ {s.warmup}</p>}
      {s.cooldown && <p className="text-xs text-blue-400/70 mt-0.5">▼ {s.cooldown}</p>}
      {(!currentPlan.hrv && !currentPlan.fc_repos) && (
        <p className="text-xs text-gray-600 mt-2 text-center">💡 Encode ta VFC et FC repos dans le journal du matin pour personnaliser</p>
      )}
    </div>
  )
}

export default function Training() {
  const { data: plan } = useApi(() => api.getTrainingPlan())
  const { data: sweetSpot } = useApi(() => api.getSweetSpot())
  const [races, setRaces] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editRace, setEditRace] = useState(null)
  const [fullPlanRace, setFullPlanRace] = useState(null)

  const today = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => {
    api.getRaceTargets().then(setRaces).catch(() => {})
  }, [])

  const handleSaved = (result) => {
    api.getRaceTargets().then(setRaces).catch(() => {})
    setShowModal(false)
    setEditRace(null)
  }

  const handleEdit = (race) => { setEditRace(race); setShowModal(true) }

  const handleDelete = async (race) => {
    if (!confirm(`Supprimer "${race.name}" ?`)) return
    await api.deleteRaceTarget(race.race_id)
    setRaces(r => r.filter(x => x.race_id !== race.race_id))
  }

  const phase = plan?.phase

  return (
    <div className="space-y-6 pb-20 md:pb-6">

      {/* Today plan */}
      <TodayPlanCard />

      {/* Race targets list */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Flag size={14} className="text-brand-green" /> Mes objectifs
          </h3>
          <button
            onClick={() => { setEditRace(null); setShowModal(true) }}
            className="btn-primary flex items-center gap-1.5 text-xs py-1.5 px-3"
          >
            <Plus size={14} /> Ajouter
          </button>
        </div>

        {races.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">Aucun objectif — clique sur Ajouter</p>
        ) : (
          <div>
            {races.map(r => (
              <RaceTargetRow
                key={r.race_id}
                race={r}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onGPXUpdated={() => api.getRaceTargets().then(setRaces).catch(() => {})}
                onViewFullPlan={() => setFullPlanRace(r)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Unavailability */}
      <UnavailabilityPanel />

      {/* Phase header */}
      {plan && (
        <div className="card">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{PHASE_ICONS[phase?.phase] || '🏃'}</span>
              <div>
                <h2 className="font-bold text-lg" style={{ color: phase?.color }}>Phase {phase?.phase}</h2>
                <p className="text-xs text-gray-400">{phase?.description}</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-black text-brand-green">J-{plan.days_until_race}</div>
              <div className="text-xs text-gray-400">{plan.race?.name}</div>
            </div>
          </div>
        </div>
      )}

      {/* Sweet spot */}
      {sweetSpot && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Sweet Spot J-28</h3>
            <span className={`text-xs font-bold px-2 py-1 rounded ${
              sweetSpot.status === 'OPTIMAL' ? 'text-brand-green bg-green-500/10' : 'text-orange-400 bg-orange-500/10'
            }`}>{sweetSpot.status}</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'km', val: sweetSpot.km, min: sweetSpot.km_target_min, max: sweetSpot.km_target_max, ok: sweetSpot.km_ok },
              { label: 'D+', val: sweetSpot.dplus, min: sweetSpot.dplus_target_min, max: sweetSpot.dplus_target_max, ok: sweetSpot.dplus_ok },
            ].map(m => (
              <div key={m.label}>
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>{m.label}</span>
                  <span className="font-mono">{m.val} / {m.min}-{m.max}</span>
                </div>
                <div className="h-2 bg-dark-500 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${Math.min(100, (m.val / m.max) * 100)}%`, backgroundColor: m.ok ? '#1D9E75' : '#EF9F27' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* HR zones + pace reference */}
      <ZoneSchematic />

      {/* Race plans — primary planning source */}
      <RacePlanSection />

      {/* Modals */}
      <AnimatePresence>
        {showModal && (
          <AddRaceModal
            onClose={() => { setShowModal(false); setEditRace(null) }}
            onSaved={handleSaved}
            editRace={editRace}
          />
        )}
        {fullPlanRace && (
          <FullPlanModal race={fullPlanRace} onClose={() => setFullPlanRace(null)} />
        )}
      </AnimatePresence>
    </div>
  )
}
