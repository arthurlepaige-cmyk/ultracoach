import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Save, Heart, Activity, Thermometer, CheckCircle, AlertTriangle, Plus, X, ChevronDown, ExternalLink, Dumbbell, Pencil, MapPin, ChevronLeft, ChevronRight, Calendar, Trash2 } from 'lucide-react'
import { api } from '../api'
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths } from 'date-fns'
import { fr } from 'date-fns/locale'
import BodyDiagram from '../components/BodyDiagram'

// Stair height constant (standard step ≈ 18cm)
const STAIR_HEIGHT_M = 0.18

// Exercise video library — YouTube search URLs per exercise
const EXERCISE_VIDEOS = {
  'Gainage frontal':         'https://www.youtube.com/results?search_query=gainage+frontal+tutoriel+trail',
  'Fentes avant':            'https://www.youtube.com/results?search_query=fentes+avant+tutoriel+renforcement',
  'Squats sautés':           'https://www.youtube.com/results?search_query=squats+sautes+tutoriel+renforcement',
  'Pont fessier':            'https://www.youtube.com/results?search_query=pont+fessier+tutoriel',
  'Step-ups (chaise)':       'https://www.youtube.com/results?search_query=step+up+exercice+tutoriel',
  'Gainage latéral':         'https://www.youtube.com/results?search_query=gainage+lateral+tutoriel',
  'Pompes':                  'https://www.youtube.com/results?search_query=pompes+tutoriel+technique',
  'Mountain climbers':       'https://www.youtube.com/results?search_query=mountain+climbers+exercice+tutoriel',
  'Fentes latérales':        'https://www.youtube.com/results?search_query=fentes+laterales+tutoriel+renforcement',
  'Chaise (wall sit)':       'https://www.youtube.com/results?search_query=wall+sit+chaise+exercice+quadriceps',
  'Burpees':                 'https://www.youtube.com/results?search_query=burpees+tutoriel+debutant',
  'Pistol squat partiel':    'https://www.youtube.com/results?search_query=pistol+squat+progression+debutant',
}

// ── Sport configuration ──────────────────────────────────────────────────────

const SPORTS = [
  {
    key: 'Course à pied',
    icon: '🏃',
    color: '#1D9E75',
    fields: ['distance', 'dplus', 'duration', 'fc_moy'],
    aei: true,
    subtypes: ['Endurance', 'Longue', 'Tempo', 'Côtes', 'Activation', 'Récup', 'Compétition'],
    distLabel: 'Distance', distUnit: 'km', distStep: '0.1',
    dplusLabel: 'D+', dplusUnit: 'm',
  },
  {
    key: 'Trail',
    icon: '⛰️',
    color: '#1D9E75',
    fields: ['distance', 'dplus', 'duration', 'fc_moy'],
    aei: true,
    subtypes: ['Endurance', 'Longue', 'Spécifique', 'Côtes', 'Activation', 'Récup', 'Compétition'],
    distLabel: 'Distance', distUnit: 'km', distStep: '0.1',
    dplusLabel: 'D+', dplusUnit: 'm',
  },
  {
    key: 'Tapis',
    icon: '🏃',
    color: '#378ADD',
    fields: ['distance', 'dplus', 'duration', 'fc_moy'],
    aei: true,
    subtypes: ['Endurance', 'Tempo', 'Activation', 'Récup'],
    distLabel: 'Distance', distUnit: 'km', distStep: '0.1',
    dplusLabel: 'D+ (affiché)', dplusUnit: 'm',
    hint: 'Entre le D+ affiché sur le tapis',
  },
  {
    key: 'Escalier',
    icon: '🪜',
    color: '#EF9F27',
    fields: ['nb_marches', 'dplus', 'duration', 'fc_moy'],
    aei: false,
    subtypes: ['Endurance', 'Intensif', 'Récup'],
    dplusLabel: 'D+ gravi', dplusUnit: 'm',
    hint: 'Entrez le nombre de marches ou le D+ directement',
  },
  {
    key: 'Renforcement',
    icon: '💪',
    color: '#7F77DD',
    fields: ['duration', 'fc_moy'],
    aei: false,
    subtypes: ['Force jambes', 'Core & stabilité', 'Full body', 'Récup active'],
    hint: 'Renforcement musculaire à domicile — sans matériel',
  },
  {
    key: 'Vélo extérieur',
    icon: '🚴',
    color: '#7F77DD',
    fields: ['distance', 'dplus', 'duration', 'fc_moy'],
    aei: false,
    subtypes: ['Endurance', 'Sortie longue', 'Intensif', 'Récup'],
    distLabel: 'Distance', distUnit: 'km', distStep: '0.1',
    dplusLabel: 'D+', dplusUnit: 'm',
  },
  {
    key: 'Vélo intérieur',
    icon: '🚴',
    color: '#7F77DD',
    fields: ['duration', 'power_w', 'fc_moy'],
    aei: false,
    subtypes: ['Endurance', 'Intervalles', 'Récup', 'FTP'],
    hint: 'Distance non pertinente en vélo indoor',
  },
  {
    key: 'Repos',
    icon: '😴',
    color: '#4B5563',
    fields: [],
    aei: false,
    subtypes: [],
  },
]

const SPORT_MAP = Object.fromEntries(SPORTS.map(s => [s.key, s]))

// ── Sub-components ────────────────────────────────────────────────────────────

function StarRating({ value, onChange }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" onClick={() => onChange(n)}
          className={`text-lg transition-colors ${n <= value ? 'text-yellow-400' : 'text-gray-600 hover:text-yellow-300'}`}>
          ★
        </button>
      ))}
    </div>
  )
}

// ── Session Calendar ──────────────────────────────────────────────────────────

function SessionCalendar({ onSelectDate, selectedDate }) {
  const [month, setMonth] = useState(new Date())
  const [logs, setLogs] = useState({})

  useEffect(() => {
    const from = format(startOfMonth(month), 'yyyy-MM-dd')
    const to = format(endOfMonth(month), 'yyyy-MM-dd')
    api.getDailyLogs({ from, to }).then(data => {
      const map = {}
      data.forEach(l => { map[l.date] = l })
      setLogs(map)
    }).catch(() => {})
  }, [month])

  const days = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) })
  // Padding: Monday=0, so we shift getDay (Sun=0 → Mon=0)
  const firstDow = (getDay(startOfMonth(month)) + 6) % 7

  const DAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <button type="button" onClick={() => setMonth(m => subMonths(m, 1))}
          className="p-1 rounded hover:bg-dark-600 text-gray-400 hover:text-white transition-colors">
          <ChevronLeft size={16} />
        </button>
        <h3 className="text-sm font-semibold capitalize">
          {format(month, 'MMMM yyyy', { locale: fr })}
        </h3>
        <button type="button" onClick={() => setMonth(m => addMonths(m, 1))}
          className="p-1 rounded hover:bg-dark-600 text-gray-400 hover:text-white transition-colors">
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_LABELS.map((d, i) => (
          <div key={i} className="text-center text-xs text-gray-600 py-1">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: firstDow }).map((_, i) => <div key={`pad-${i}`} />)}
        {days.map(day => {
          const dateStr = format(day, 'yyyy-MM-dd')
          const log = logs[dateStr]
          const isSelected = dateStr === selectedDate
          const isToday = dateStr === format(new Date(), 'yyyy-MM-dd')
          const cfg = log ? (SPORT_MAP[log.sport] || SPORT_MAP['Course à pied']) : null
          const hasSessions = log && (log.distance_km || log.dplus_m || log.sport === 'Renforcement')

          return (
            <button
              key={dateStr}
              type="button"
              onClick={() => onSelectDate(dateStr)}
              className={`relative flex flex-col items-center py-1 rounded-lg text-xs transition-all ${
                isSelected ? 'bg-brand-green/30 ring-1 ring-brand-green/60' :
                isToday ? 'bg-dark-600 ring-1 ring-gray-500/40' :
                hasSessions ? 'bg-dark-700/60 hover:bg-dark-600' :
                'hover:bg-dark-700'
              }`}
            >
              <span className={`text-xs leading-none ${
                isSelected ? 'text-brand-green font-bold' :
                isToday ? 'text-white font-semibold' :
                hasSessions ? 'text-gray-300' : 'text-gray-600'
              }`}>
                {format(day, 'd')}
              </span>
              {hasSessions && (
                <span className="text-xs mt-0.5 leading-none" title={log.sport}>{cfg?.icon}</span>
              )}
              {hasSessions && log.aei && (
                <span className={`text-xs font-bold leading-none mt-0.5 ${log.aei >= 8.3 ? 'text-brand-green' : log.aei >= 7.5 ? 'text-brand-blue' : 'text-brand-orange'}`}>
                  {log.aei}
                </span>
              )}
              {hasSessions && !log.aei && log.distance_km && (
                <span className="text-xs text-gray-500 leading-none mt-0.5">{log.distance_km}k</span>
              )}
              {hasSessions && log.rpe && (
                <span className="text-xs leading-none mt-0.5" style={{
                  color: log.rpe <= 4 ? '#1D9E75' : log.rpe <= 6 ? '#378ADD' : log.rpe <= 8 ? '#EF9F27' : '#E24B4A'
                }}>
                  {log.rpe}⚡
                </span>
              )}
              {log?.pain_zones && JSON.parse(log.pain_zones || '[]').some(z => z.level >= 2) && (
                <span className="text-xs leading-none mt-0.5 text-red-400">🩹</span>
              )}
              {log?.extra_sessions?.length > 0 && (
                <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-brand-orange" title={`+${log.extra_sessions.length} séances`} />
              )}
            </button>
          )
        })}
      </div>

      <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-600">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-brand-green inline-block" />Sélectionné</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-brand-orange inline-block" />+séances</span>
      </div>
    </div>
  )
}

function FCBadge({ value }) {
  if (!value) return null
  let color = '#1D9E75', label = '< 53'
  if (value >= 56) { color = '#E24B4A'; label = '≥ 56 — Reporter' }
  else if (value >= 53) { color = '#EF9F27'; label = '53-55 — Vigilance' }
  return (
    <motion.span initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
      className="text-xs font-medium px-2 py-0.5 rounded"
      style={{ backgroundColor: color + '22', color }}>
      {label}
    </motion.span>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

function loadEntryIntoForm(entry, setForm) {
  if (!entry) return
  setForm(prev => ({
    ...prev,
    fc_repos: entry.fc_repos || '',
    hrv: entry.hrv || '',
    sensation: entry.sensation || 3,
    meteo_temp: entry.meteo_temp || '',
    sleep_hhmm: entry.sleep_h ? `${String(Math.floor(entry.sleep_h)).padStart(2,'0')}:${String(Math.round((entry.sleep_h % 1) * 60)).padStart(2,'0')}` : '',
    sleep_quality: entry.sleep_quality || 3,
    sport: entry.sport || 'Course à pied',
    session_type: entry.session_type || 'Endurance',
    distance_km: entry.distance_km || '',
    dplus_m: entry.dplus_m || '',
    duration_h: entry.duration_min ? Math.floor(entry.duration_min / 60).toString() : '',
    duration_min_part: entry.duration_min ? (entry.duration_min % 60).toString() : '',
    fc_moy: entry.fc_moy || '',
    power_w: entry.power_w || '',
    nb_marches: entry.nb_marches || '',
    notes: entry.notes || '',
    rpe: entry.rpe || '',
    pain_zones: entry.pain_zones ? (typeof entry.pain_zones === 'string' ? JSON.parse(entry.pain_zones) : entry.pain_zones) : [],
    shoe_id: entry.shoe_id || '',
  }))
}

// Map a plan sport name to a valid SPORT_MAP key
const PLAN_SPORT_MAP = {
  'Course à pied': 'Course à pied', 'Trail': 'Trail', 'Tapis': 'Tapis',
  'Escalier': 'Escalier', 'Renforcement': 'Renforcement',
  'Vélo extérieur': 'Vélo extérieur', 'Vélo intérieur': 'Vélo intérieur',
}

function applyPlanToForm(sessions, setForm, setExtraSessions) {
  if (!sessions?.length) return

  // Expand "Multiple" soir sessions into their sub-sessions
  const expanded = []
  sessions.forEach(s => {
    if (s.sport === 'Multiple' && s.sessions?.length) {
      s.sessions.forEach(sub => expanded.push({ ...sub, slot: s.slot }))
    } else {
      expanded.push(s)
    }
  })

  // Keep only trackable sports
  const trackable = expanded.filter(s => s.sport !== 'Repos' && s.sport !== 'Sauna' && PLAN_SPORT_MAP[s.sport])
  if (!trackable.length) return

  // Primary = first running session (matin slot preferred), else first trackable
  const primary =
    trackable.find(s => ['Course à pied', 'Trail', 'Tapis'].includes(s.sport) && s.slot === 'matin') ||
    trackable.find(s => ['Course à pied', 'Trail', 'Tapis'].includes(s.sport)) ||
    trackable[0]

  const primarySport = PLAN_SPORT_MAP[primary.sport] || 'Course à pied'
  const dh = primary.duration_min ? Math.floor(primary.duration_min / 60).toString() : ''
  const dm = primary.duration_min ? (primary.duration_min % 60).toString() : ''

  setForm(prev => ({
    ...prev,
    sport: primarySport,
    session_type: primary.session_type || 'Endurance',
    distance_km: primary.km ? primary.km.toString() : '',
    dplus_m: primary.dplus_m ? primary.dplus_m.toString() : '',
    duration_h: dh,
    duration_min_part: dm,
    nb_marches: primarySport === 'Escalier' && primary.dplus_m
      ? Math.round(primary.dplus_m / 0.18).toString() : '',
    fc_moy: '',
    notes: primary.desc || '',
  }))

  // Remaining → extra sessions
  const rest = trackable.filter(s => s !== primary)
  if (rest.length) {
    setExtraSessions(rest.map(s => ({
      sport: PLAN_SPORT_MAP[s.sport] || 'Course à pied',
      session_type: s.session_type || '',
      distance_km: s.km ? s.km.toString() : '',
      dplus_m: s.dplus_m ? s.dplus_m.toString() : '',
      duration_h: s.duration_min ? Math.floor(s.duration_min / 60).toString() : '',
      duration_min_part: s.duration_min ? (s.duration_min % 60).toString() : '',
      fc_moy: '',
      notes: s.desc || '',
    })))
  }
}

export default function DailyLog() {
  const today = format(new Date(), 'yyyy-MM-dd')
  const formRef = useRef(null)

  const [activeTab, setActiveTab] = useState('health')
  const [form, setForm] = useState({
    date: today,
    fc_repos: '', hrv: '', sensation: 3, meteo_temp: '',
    sleep_hhmm: '', sleep_quality: 3,
    sport: 'Course à pied',
    session_type: 'Endurance',
    distance_km: '', dplus_m: '',
    duration_h: '', duration_min_part: '',
    fc_moy: '', power_w: '',
    nb_marches: '',
    notes: '',
    rpe: '',
    pain_zones: [],
    shoe_id: '',
  })
  const [extraSessions, setExtraSessions] = useState([])
  const [showExtraForm, setShowExtraForm] = useState(false)
  const [showCalendar, setShowCalendar] = useState(false)
  const [fetchingTemp, setFetchingTemp] = useState(false)

  const [planPrefilled, setPlanPrefilled] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savingHealth, setSavingHealth] = useState(false)
  const [deletingTraining, setDeletingTraining] = useState(false)
  const [result, setResult] = useState(null)
  const [healthResult, setHealthResult] = useState(null)
  const [error, setError] = useState(null)
  const [healthError, setHealthError] = useState(null)
  const [recoverySuggestions, setRecoverySuggestions] = useState(null)
  const [recentLogs, setRecentLogs] = useState([])
  const [nextRace, setNextRace] = useState(null)

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  // When sport changes, reset subtype to first available
  const handleSportChange = (sportKey) => {
    const cfg = SPORT_MAP[sportKey]
    set('sport', sportKey)
    set('session_type', cfg?.subtypes?.[0] || '')
    if (!cfg?.fields.includes('distance')) set('distance_km', '')
    if (!cfg?.fields.includes('dplus')) { set('dplus_m', ''); set('nb_marches', '') }
    if (!cfg?.fields.includes('power_w')) set('power_w', '')
  }

  // Auto-calculate D+ from nb_marches for Escalier
  const handleMarchesChange = (val) => {
    set('nb_marches', val)
    if (val) set('dplus_m', Math.round(parseInt(val) * STAIR_HEIGHT_M).toString())
  }

  // Extra session helpers
  const addExtraSession = () => {
    setExtraSessions(prev => [...prev, {
      sport: 'Course à pied', session_type: 'Endurance',
      distance_km: '', dplus_m: '', duration_h: '', duration_min_part: '', fc_moy: '', notes: '',
    }])
    setShowExtraForm(true)
  }
  const removeExtraSession = (idx) => setExtraSessions(prev => prev.filter((_, i) => i !== idx))
  const setExtra = (idx, k, v) => setExtraSessions(prev => prev.map((s, i) => i === idx ? { ...s, [k]: v } : s))

  // Load race and recent logs on mount
  useEffect(() => {
    api.getRaceTargets().then(races => {
      const upcoming = races
        .filter(r => r.date > today && r.active !== 0)
        .sort((a, b) => {
          const pOrder = { A: 0, B: 1, C: 2 }
          return (pOrder[a.priority] ?? 3) - (pOrder[b.priority] ?? 3) || a.date.localeCompare(b.date)
        })
      setNextRace(upcoming[0] || null)
    }).catch(() => {})
    api.getDailyLogs({ limit: 7 }).then(setRecentLogs).catch(() => {})
  }, [today])

  // Auto-load entry whenever the date changes
  useEffect(() => {
    setResult(null)
    setError(null)
    setPlanPrefilled(false)
    api.getDailyLog(form.date)
      .then(entry => {
        loadEntryIntoForm(entry, setForm)
        if (entry?.extra_sessions?.length) setExtraSessions(entry.extra_sessions.map(s => ({
          sport: s.sport || 'Course à pied',
          session_type: s.session_type || '',
          distance_km: s.distance_km || '',
          dplus_m: s.dplus_m || '',
          duration_h: s.duration_min ? Math.floor(s.duration_min / 60).toString() : '',
          duration_min_part: s.duration_min ? (s.duration_min % 60).toString() : '',
          fc_moy: s.fc_moy || '',
          notes: s.notes || '',
        })))
        else setExtraSessions([])
      })
      .catch(() => {
        // No entry yet — reset then try to pre-fill from plan
        setForm(prev => ({
          ...prev,
          sport: 'Course à pied', session_type: 'Endurance',
          distance_km: '', dplus_m: '', duration_h: '', duration_min_part: '',
          fc_moy: '', power_w: '', nb_marches: '', notes: '',
        }))
        setExtraSessions([])
        api.getPlanSessions(form.date, form.date).then(planData => {
          const day = planData?.days?.[0]
          if (day?.sessions?.length) {
            applyPlanToForm(day.sessions, setForm, setExtraSessions)
            setPlanPrefilled(true)
          }
        }).catch(() => {})
      })
  }, [form.date])

  // Temperature auto-fetch via geolocation + Open-Meteo (free, no API key)
  const fetchTemperature = useCallback(() => {
    if (!navigator.geolocation) return
    setFetchingTemp(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords
          const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude.toFixed(4)}&longitude=${longitude.toFixed(4)}&current_weather=true`
          const res = await fetch(url)
          const data = await res.json()
          const temp = data.current_weather?.temperature
          if (temp !== undefined) set('meteo_temp', temp.toString())
        } catch {}
        setFetchingTemp(false)
      },
      () => setFetchingTemp(false),
      { timeout: 8000 }
    )
  }, [])

  // Select a date from calendar → load it and scroll to form
  const handleSelectDate = (dateStr) => {
    set('date', dateStr)
    setShowCalendar(false)
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }

  const sportCfg = SPORT_MAP[form.sport] || SPORT_MAP['Course à pied']
  const daysUntilRace = nextRace ? Math.ceil((new Date(nextRace.date) - new Date()) / 86400000) : null

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setResult(null)
    try {
      const durationMin = (parseInt(form.duration_h) || 0) * 60 + (parseInt(form.duration_min_part) || 0) || null
      const extraForApi = extraSessions
        .filter(s => s.distance_km || s.dplus_m || s.duration_h || s.duration_min_part)
        .map(s => ({
          sport: s.sport,
          session_type: s.session_type || null,
          distance_km: s.distance_km ? parseFloat(s.distance_km) : null,
          dplus_m: s.dplus_m ? parseFloat(s.dplus_m) : null,
          duration_min: (parseInt(s.duration_h) || 0) * 60 + (parseInt(s.duration_min_part) || 0) || null,
          fc_moy: s.fc_moy ? parseInt(s.fc_moy) : null,
          notes: s.notes || null,
        }))

      const res = await api.saveDailyLog({
        date: form.date,
        fc_repos: form.fc_repos ? parseInt(form.fc_repos) : null,
        hrv: form.hrv ? parseInt(form.hrv) : null,
        sensation: form.sensation,
        meteo_temp: form.meteo_temp ? parseFloat(form.meteo_temp) : null,
        sport: form.sport,
        session_type: form.session_type || null,
        distance_km: form.distance_km ? parseFloat(form.distance_km) : null,
        dplus_m: form.dplus_m ? parseFloat(form.dplus_m) : null,
        duration_min: durationMin,
        fc_moy: form.fc_moy ? parseInt(form.fc_moy) : null,
        power_w: form.power_w ? parseInt(form.power_w) : null,
        nb_marches: form.nb_marches ? parseInt(form.nb_marches) : null,
        extra_sessions: extraForApi.length ? extraForApi : undefined,
        notes: form.notes || null,
        rpe: form.rpe ? parseInt(form.rpe) : null,
        pain_zones: form.pain_zones?.length ? form.pain_zones : null,
        shoe_id: form.shoe_id ? parseInt(form.shoe_id) : null,
      })
      setResult(res)
      setExtraSessions([])
      setShowExtraForm(false)
      api.getDailyLogs({ limit: 7 }).then(setRecentLogs).catch(() => {})
      api.getRecoverySuggestions().then(s => { if (s?.length) setRecoverySuggestions(s) }).catch(() => {})
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveHealth = async () => {
    setSavingHealth(true)
    setHealthError(null)
    setHealthResult(null)
    try {
      const res = await api.saveHealth(form.date, {
        fc_repos: form.fc_repos ? parseInt(form.fc_repos) : null,
        hrv: form.hrv ? parseInt(form.hrv) : null,
        sensation: form.sensation,
        meteo_temp: form.meteo_temp ? parseFloat(form.meteo_temp) : null,
        sleep_h: (() => {
          if (!form.sleep_hhmm) return null
          const [h, m] = form.sleep_hhmm.split(':').map(Number)
          return Math.round(((h || 0) + (m || 0) / 60) * 100) / 100
        })(),
        sleep_quality: form.sleep_quality || null,
        pain_zones: form.pain_zones?.length ? form.pain_zones : null,
      })
      setHealthResult(res)
      api.getDailyLogs({ limit: 7 }).then(setRecentLogs).catch(() => {})
      api.getRecoverySuggestions().then(s => { if (s?.length) setRecoverySuggestions(s) }).catch(() => {})
    } catch (err) {
      setHealthError(err.message)
    } finally {
      setSavingHealth(false)
    }
  }

  const handleDeleteTraining = async () => {
    if (!window.confirm('Supprimer les données d\'entraînement de ce jour ? Les données de santé seront conservées.')) return
    setDeletingTraining(true)
    setError(null)
    try {
      await api.deleteTraining(form.date)
      setForm(prev => ({
        ...prev,
        sport: 'Course à pied', session_type: 'Endurance',
        distance_km: '', dplus_m: '', duration_h: '', duration_min_part: '',
        fc_moy: '', power_w: '', nb_marches: '', notes: '',
      }))
      setExtraSessions([])
      setResult(null)
      api.getDailyLogs({ limit: 7 }).then(setRecentLogs).catch(() => {})
    } catch (err) {
      setError(err.message)
    } finally {
      setDeletingTraining(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-24 md:pb-6">

      {/* Header */}
      <div className="card">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-lg capitalize">
              {format(new Date(), 'EEEE d MMMM yyyy', { locale: fr })}
            </h2>
            {nextRace && daysUntilRace > 0 && (
              <p className="text-brand-green text-sm font-medium">
                J-{daysUntilRace} avant {nextRace.name}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {daysUntilRace > 0 && (
              <span className="text-3xl font-black text-gray-600">{daysUntilRace}</span>
            )}
            <button type="button" onClick={() => setShowCalendar(v => !v)}
              className={`p-2 rounded-lg border transition-colors ${showCalendar ? 'bg-brand-green/20 border-brand-green/40 text-brand-green' : 'border-dark-500 text-gray-400 hover:border-dark-400'}`}
              title="Calendrier des séances">
              <Calendar size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Calendar */}
      <AnimatePresence>
        {showCalendar && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <SessionCalendar onSelectDate={handleSelectDate} selectedDate={form.date} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tabs */}
      <div className="flex gap-1 bg-dark-800 p-1 rounded-lg">
        <button type="button" onClick={() => setActiveTab('health')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-sm font-medium transition-colors ${activeTab === 'health' ? 'bg-dark-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
          <Heart size={14} /> Santé
        </button>
        <button type="button" onClick={() => setActiveTab('training')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-sm font-medium transition-colors ${activeTab === 'training' ? 'bg-dark-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
          <Activity size={14} /> Entraînement
        </button>
      </div>

      <div ref={formRef} className="space-y-4">

        {/* Date — with edit context banner */}
        <div className="card">
          <label className="text-xs text-gray-400 uppercase tracking-wide mb-1 block">Date</label>
          <input type="date" value={form.date} onChange={e => set('date', e.target.value)} className="input-field" />
          {form.date !== today && (
            <div className="mt-2 flex items-center gap-2 px-2 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20">
              <Pencil size={11} className="text-orange-400 shrink-0" />
              <p className="text-xs text-orange-300">
                Modification du {format(parseISO(form.date), 'EEEE d MMMM', { locale: fr })} — les données existantes sont pré-chargées
              </p>
            </div>
          )}
        </div>

        {/* ── SANTÉ TAB ── */}
        {activeTab === 'health' && (
        <div className="space-y-4">

        {/* Morning metrics */}
        <div className="card space-y-4">
          <h3 className="text-sm font-semibold text-gray-300">Métriques matinales</h3>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-400 flex items-center gap-1">
                <Heart size={12} className="text-red-400" /> FC repos
              </label>
              <FCBadge value={parseInt(form.fc_repos)} />
            </div>
            <div className="flex items-center gap-2">
              <input type="number" placeholder="48" value={form.fc_repos}
                onChange={e => set('fc_repos', e.target.value)}
                className="input-field" min="30" max="80" />
              <span className="text-gray-400 text-sm whitespace-nowrap">bpm</span>
            </div>
            <div className="flex gap-3 text-xs mt-1">
              <span className="text-green-400">● &lt;53</span>
              <span className="text-orange-400">● 53-55</span>
              <span className="text-red-400">● ≥56 → Reporter</span>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 flex items-center gap-1 mb-1">
              <Activity size={12} className="text-brand-purple" /> HRV
            </label>
            <div className="flex items-center gap-2">
              <input type="number" placeholder="91" value={form.hrv}
                onChange={e => set('hrv', e.target.value)} className="input-field" />
              <span className="text-gray-400 text-sm">ms</span>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">Sensation générale</label>
            <StarRating value={form.sensation} onChange={v => set('sensation', v)} />
          </div>

          <div>
            <label className="text-xs text-gray-400 flex items-center gap-1 mb-1">
              <Thermometer size={12} /> Température
            </label>
            <div className="flex items-center gap-2">
              <input type="number" placeholder="15" value={form.meteo_temp}
                onChange={e => set('meteo_temp', e.target.value)}
                className="input-field" step="0.5" />
              <span className="text-gray-400 text-sm shrink-0">°C</span>
              <button type="button" onClick={fetchTemperature} disabled={fetchingTemp}
                title="Récupérer la température actuelle de votre position"
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-dark-600 border border-dark-500 text-gray-400 hover:text-brand-green hover:border-brand-green/40 transition-colors disabled:opacity-50 shrink-0">
                {fetchingTemp
                  ? <span className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                  : <MapPin size={11} />}
                <span className="hidden sm:inline">{fetchingTemp ? '…' : 'Auto'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Sleep */}
        <div className="card space-y-4">
          <h3 className="text-sm font-semibold text-gray-300">Sommeil</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Durée</label>
              <input type="time" value={form.sleep_hhmm}
                onChange={e => set('sleep_hhmm', e.target.value)}
                className="input-field" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Qualité</label>
              <StarRating value={form.sleep_quality} onChange={v => set('sleep_quality', v)} />
            </div>
          </div>
        </div>

        {/* Douleurs */}
        <div className="card">
          <label className="text-xs font-medium text-gray-300 mb-2 block">Douleurs / gênes</label>
          <BodyDiagram
            value={form.pain_zones}
            onChange={(zones) => set('pain_zones', zones)}
          />
        </div>

        {/* Health save button */}
        <button type="button" onClick={handleSaveHealth} disabled={savingHealth}
          className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-base">
          {savingHealth
            ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
            : <Save size={18} />}
          {savingHealth ? 'Enregistrement...' : 'Enregistrer Santé'}
        </button>

        {/* Health feedback */}
        <AnimatePresence>
          {healthResult && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="card border border-green-500/50 bg-green-500/10">
              <div className="flex items-center gap-2 text-brand-green">
                <CheckCircle size={16} />
                <p className="text-sm">Données de santé enregistrées</p>
              </div>
            </motion.div>
          )}
          {healthError && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="card border border-red-500/50 bg-red-500/10">
              <div className="flex items-center gap-2 text-red-400">
                <AlertTriangle size={16} />
                <p className="text-sm">{healthError}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        </div>
        )}

        {/* ── ENTRAÎNEMENT TAB ── */}
        {activeTab === 'training' && (
        <form onSubmit={handleSubmit} className="space-y-4">

        {/* Plan pre-fill banner */}
        {planPrefilled && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-2.5 p-3 rounded-xl bg-blue-500/10 border border-blue-500/25"
          >
            <span className="text-base leading-none mt-0.5">📋</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-brand-blue">Pré-rempli depuis le plan d'entraînement</p>
              <p className="text-xs text-gray-400 mt-0.5">Ajuste les valeurs réelles après ta séance (distance, FC moy, D+…)</p>
            </div>
            <button type="button" onClick={() => setPlanPrefilled(false)}
              className="text-gray-600 hover:text-gray-400 shrink-0 mt-0.5">
              <X size={13} />
            </button>
          </motion.div>
        )}

        {/* Sport selector */}
        <div className="card">
          <label className="text-xs text-gray-400 uppercase tracking-wide mb-3 block">Sport</label>
          <div className="grid grid-cols-4 gap-2">
            {SPORTS.map(s => (
              <button key={s.key} type="button" onClick={() => handleSportChange(s.key)}
                className={`flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl border text-center transition-all ${
                  form.sport === s.key
                    ? 'border-opacity-60'
                    : 'border-dark-500 hover:border-dark-400'
                }`}
                style={form.sport === s.key ? { borderColor: s.color, backgroundColor: s.color + '15' } : {}}>
                <span className="text-xl leading-none">{s.icon}</span>
                <span className="text-xs leading-tight" style={{ color: form.sport === s.key ? s.color : '#9CA3AF' }}>
                  {s.key === 'Course à pied' ? 'Course' : s.key === 'Vélo extérieur' ? 'Vélo ext.' : s.key === 'Vélo intérieur' ? 'Vélo int.' : s.key}
                </span>
              </button>
            ))}
          </div>
          {sportCfg.hint && (
            <p className="text-xs text-gray-500 mt-2">{sportCfg.hint}</p>
          )}
        </div>

        {/* Session fields — adaptive */}
        {form.sport !== 'Repos' && (
          <div className="card space-y-4">
            <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
              <span>{sportCfg.icon}</span> Séance
            </h3>

            {/* Subtype */}
            {sportCfg.subtypes?.length > 0 && (
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Type de séance</label>
                <select value={form.session_type} onChange={e => set('session_type', e.target.value)} className="input-field">
                  {sportCfg.subtypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            )}

            {/* Escalier: nb marches input → auto D+ */}
            {sportCfg.fields.includes('nb_marches') && (
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Nombre de marches montées</label>
                <div className="flex items-center gap-2">
                  <input type="number" placeholder="500" value={form.nb_marches}
                    onChange={e => handleMarchesChange(e.target.value)}
                    className="input-field" min="0" step="1" />
                  <span className="text-gray-400 text-sm shrink-0">marches</span>
                </div>
                {form.nb_marches && (
                  <p className="text-xs text-orange-400 mt-1">
                    ≈ {Math.round(parseInt(form.nb_marches) * STAIR_HEIGHT_M)}m D+ ({form.nb_marches} × {(STAIR_HEIGHT_M * 100).toFixed(0)}cm)
                  </p>
                )}
              </div>
            )}

            {/* Distance + D+ */}
            {(sportCfg.fields.includes('distance') || sportCfg.fields.includes('dplus')) && (
              <div className={`grid gap-3 ${sportCfg.fields.includes('distance') && sportCfg.fields.includes('dplus') ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {sportCfg.fields.includes('distance') && (
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">{sportCfg.distLabel}</label>
                    <div className="flex items-center gap-1">
                      <input type="number" placeholder="20" value={form.distance_km}
                        onChange={e => set('distance_km', e.target.value)}
                        className="input-field" step={sportCfg.distStep || '0.1'} />
                      <span className="text-gray-400 text-sm shrink-0">{sportCfg.distUnit}</span>
                    </div>
                  </div>
                )}
                {sportCfg.fields.includes('dplus') && (
                  <div>
                    <label className="text-xs text-gray-400 mb-1 flex items-center justify-between">
                      <span>{sportCfg.dplusLabel}</span>
                      {sportCfg.fields.includes('nb_marches') && <span className="text-gray-600">(auto depuis marches)</span>}
                    </label>
                    <div className="flex items-center gap-1">
                      <input type="number" placeholder="500" value={form.dplus_m}
                        onChange={e => set('dplus_m', e.target.value)} className="input-field" />
                      <span className="text-gray-400 text-sm shrink-0">{sportCfg.dplusUnit}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Renforcement: exercise list with video links */}
            {form.sport === 'Renforcement' && (
              <div>
                <label className="text-xs text-gray-400 mb-2 flex items-center gap-1">
                  <Dumbbell size={11} /> Exercices recommandés — cliquez pour la vidéo
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {Object.entries(EXERCISE_VIDEOS).map(([name, url]) => (
                    <a key={name} href={url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg bg-dark-600 text-gray-300 hover:bg-purple-500/20 hover:text-purple-300 transition-colors">
                      <ExternalLink size={9} className="shrink-0 opacity-60" />
                      {name}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Duration */}
            {sportCfg.fields.includes('duration') && (
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Durée</label>
                <div className="flex items-center gap-2">
                  <input type="number" placeholder="1" value={form.duration_h}
                    onChange={e => set('duration_h', e.target.value)}
                    className="input-field" min="0" />
                  <span className="text-gray-400">h</span>
                  <input type="number" placeholder="45" value={form.duration_min_part}
                    onChange={e => set('duration_min_part', e.target.value)}
                    className="input-field" min="0" max="59" />
                  <span className="text-gray-400">min</span>
                </div>
              </div>
            )}

            {/* Power (vélo intérieur) */}
            {sportCfg.fields.includes('power_w') && (
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Puissance moyenne</label>
                <div className="flex items-center gap-2">
                  <input type="number" placeholder="180" value={form.power_w}
                    onChange={e => set('power_w', e.target.value)} className="input-field" />
                  <span className="text-gray-400 text-sm">W</span>
                </div>
              </div>
            )}

            {/* FC moy */}
            {sportCfg.fields.includes('fc_moy') && (
              <div>
                <label className="text-xs text-gray-400 mb-1 block">FC moyenne</label>
                <div className="flex items-center gap-2">
                  <input type="number" placeholder="145" value={form.fc_moy}
                    onChange={e => set('fc_moy', e.target.value)}
                    className="input-field" min="80" max="220" />
                  <span className="text-gray-400 text-sm">bpm</span>
                </div>
              </div>
            )}

            {/* RPE */}
            <div>
              <label className="text-xs font-medium text-gray-300 mb-2 block flex items-center gap-2">
                Effort ressenti (RPE)
                {form.rpe && (
                  <span className="font-bold text-sm" style={{
                    color: form.rpe <= 4 ? '#1D9E75' : form.rpe <= 6 ? '#378ADD' : form.rpe <= 8 ? '#EF9F27' : '#E24B4A'
                  }}>
                    {form.rpe}/10 — {form.rpe <= 3 ? 'Très facile' : form.rpe <= 4 ? 'Facile' : form.rpe <= 6 ? 'Modéré' : form.rpe <= 7 ? 'Soutenu' : form.rpe <= 8 ? 'Difficile' : form.rpe <= 9 ? 'Très difficile' : 'Maximum'}
                  </span>
                )}
              </label>
              <input
                type="range"
                min="1" max="10" step="1"
                value={form.rpe || 5}
                onChange={e => set('rpe', e.target.value)}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-dark-600"
                style={{
                  accentColor: !form.rpe ? '#6B7280' : form.rpe <= 4 ? '#1D9E75' : form.rpe <= 6 ? '#378ADD' : form.rpe <= 8 ? '#EF9F27' : '#E24B4A'
                }}
              />
              <div className="flex justify-between text-xs text-gray-600 mt-0.5">
                <span>1 Repos</span>
                <span>5 Modéré</span>
                <span>10 Max</span>
              </div>
            </div>

            {/* AEI preview */}
            {sportCfg.aei && form.distance_km && form.duration_h || form.duration_min_part ? (
              (() => {
                const dist = parseFloat(form.distance_km)
                const durMin = (parseInt(form.duration_h) || 0) * 60 + (parseInt(form.duration_min_part) || 0)
                const dplus = parseFloat(form.dplus_m) || 0
                const hr = parseInt(form.fc_moy)
                if (!dist || !durMin || !hr) return null
                const allure = durMin / dist
                const dpKm = dplus / dist
                const allureEq = allure - (dpKm / 100)
                const speedEq = 60 / Math.max(allureEq, 3)
                const aeiPreview = Math.round((speedEq / hr) * 10000) / 100
                if (!aeiPreview || isNaN(aeiPreview)) return null
                const color = aeiPreview >= 8.3 ? '#1D9E75' : aeiPreview >= 7.5 ? '#378ADD' : '#EF9F27'
                return (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-dark-600 text-xs">
                    <span className="text-gray-400">AEI estimé :</span>
                    <span className="font-bold text-base" style={{ color }}>{aeiPreview}</span>
                    <span style={{ color }}>{aeiPreview >= 8.3 ? '— Pic de forme' : aeiPreview >= 7.5 ? '— Bonne forme' : '— Fatigue'}</span>
                  </div>
                )
              })()
            ) : null}

            <div>
              <label className="text-xs text-gray-400 mb-1 block">Notes</label>
              <textarea placeholder="Sensations, terrain, météo..."
                value={form.notes} onChange={e => set('notes', e.target.value)}
                className="input-field resize-none" rows={2} />
            </div>
          </div>
        )}

        {/* Extra sessions */}
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-300">Séances supplémentaires</h3>
            <button type="button" onClick={addExtraSession}
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-brand-green/15 text-brand-green border border-brand-green/30 hover:bg-brand-green/25 transition-colors">
              <Plus size={12} /> Ajouter une séance
            </button>
          </div>

          {extraSessions.length === 0 && (
            <p className="text-xs text-gray-600">Trajets bureau (7km), séance du soir, renforcement… enregistrez tout ici.</p>
          )}

          {extraSessions.map((sess, idx) => {
            const sCfg = SPORT_MAP[sess.sport] || SPORT_MAP['Course à pied']
            return (
              <div key={idx} className="mt-3 p-3 rounded-xl bg-dark-700/60 border border-dark-600/50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-300">Séance {idx + 2}</span>
                  <button type="button" onClick={() => removeExtraSession(idx)}
                    className="text-gray-500 hover:text-red-400 transition-colors">
                    <X size={14} />
                  </button>
                </div>

                {/* Sport */}
                <div className="flex flex-wrap gap-1.5">
                  {SPORTS.filter(s => s.key !== 'Repos').map(s => (
                    <button key={s.key} type="button"
                      onClick={() => setExtra(idx, 'sport', s.key)}
                      className={`text-xs px-2 py-1 rounded-lg border transition-all ${sess.sport === s.key ? 'border-opacity-60' : 'border-dark-500 text-gray-400'}`}
                      style={sess.sport === s.key ? { borderColor: s.color, backgroundColor: s.color + '20', color: s.color } : {}}>
                      {s.icon} {s.key === 'Course à pied' ? 'Course' : s.key}
                    </button>
                  ))}
                </div>

                {/* Quick fields: distance / D+ / duration */}
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {sCfg.fields.includes('distance') && (
                    <div>
                      <label className="text-gray-500 block mb-0.5">Distance</label>
                      <div className="flex items-center gap-0.5">
                        <input type="number" placeholder="7" value={sess.distance_km}
                          onChange={e => setExtra(idx, 'distance_km', e.target.value)}
                          className="input-field py-1 text-xs" step="0.1" />
                        <span className="text-gray-500 shrink-0">km</span>
                      </div>
                    </div>
                  )}
                  {sCfg.fields.includes('dplus') && (
                    <div>
                      <label className="text-gray-500 block mb-0.5">D+</label>
                      <div className="flex items-center gap-0.5">
                        <input type="number" placeholder="0" value={sess.dplus_m}
                          onChange={e => setExtra(idx, 'dplus_m', e.target.value)}
                          className="input-field py-1 text-xs" />
                        <span className="text-gray-500 shrink-0">m</span>
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="text-gray-500 block mb-0.5">Durée</label>
                    <div className="flex items-center gap-0.5">
                      <input type="number" placeholder="45" value={sess.duration_min_part}
                        onChange={e => setExtra(idx, 'duration_min_part', e.target.value)}
                        className="input-field py-1 text-xs" min="0" max="59" />
                      <span className="text-gray-500 shrink-0">min</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="text-gray-500 block mb-0.5">FC moy</label>
                    <div className="flex items-center gap-0.5">
                      <input type="number" placeholder="145" value={sess.fc_moy}
                        onChange={e => setExtra(idx, 'fc_moy', e.target.value)}
                        className="input-field py-1 text-xs" />
                      <span className="text-gray-500 shrink-0">bpm</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-gray-500 block mb-0.5">Notes</label>
                    <input type="text" placeholder="Retour bureau, soirée…" value={sess.notes}
                      onChange={e => setExtra(idx, 'notes', e.target.value)}
                      className="input-field py-1 text-xs" />
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Submit + Delete training */}
        <div className="flex gap-2">
          <button type="submit" disabled={saving}
            className="btn-primary flex-1 flex items-center justify-center gap-2 py-3 text-base">
            {saving
              ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
              : <Save size={18} />}
            {saving ? 'Enregistrement...' : sportCfg.aei ? `Enregistrer → AEI${extraSessions.length ? ` +${extraSessions.length}` : ''}` : `Enregistrer${extraSessions.length ? ` (${1 + extraSessions.length})` : ''}`}
          </button>
          <button type="button" onClick={handleDeleteTraining} disabled={deletingTraining}
            className="flex items-center justify-center gap-1 px-3 py-3 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
            title="Supprimer l'entraînement (conserver les données santé)">
            {deletingTraining
              ? <span className="animate-spin w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full" />
              : <Trash2 size={18} />}
          </button>
        </div>
        </form>
        )}
      </div>

      {/* Feedback */}
      <AnimatePresence>
        {result && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className={`card border ${
              result.aei >= 8.3 ? 'border-green-500/50 bg-green-500/10' :
              result.aei >= 7.5 ? 'border-blue-500/50 bg-blue-500/10' :
              'border-dark-500 bg-dark-700'
            }`}>
            <div className="flex items-start gap-3">
              <CheckCircle size={18} className="text-brand-green mt-0.5 shrink-0" />
              <div>
                {result.message && <p className="font-medium text-sm text-white mb-1">{result.message}</p>}
                {result.total_sessions > 1 && (
                  <p className="text-xs text-brand-green mb-1">{result.total_sessions} séances enregistrées cette journée</p>
                )}
                {result.aei && (
                  <p className="text-xs text-gray-300">
                    AEI : <span className="font-bold text-brand-green">{result.aei}</span> — {result.aei_status?.label}
                  </p>
                )}
                {result.sweet_spot && (
                  <p className="text-xs text-gray-400 mt-1">
                    Sweet Spot J-28 : {result.sweet_spot.km}km / {result.sweet_spot.dplus}m D+
                    {' '}→ <span className={result.sweet_spot.status === 'OPTIMAL' ? 'text-brand-green' : 'text-orange-400'}>
                      {result.sweet_spot.status}
                    </span>
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}
        {error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="card border border-red-500/50 bg-red-500/10">
            <div className="flex items-center gap-2 text-red-400">
              <AlertTriangle size={16} />
              <p className="text-sm">{error}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Suggestions récupération */}
      <AnimatePresence>
        {recoverySuggestions?.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="card space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                💆 Suggestions récupération
              </h3>
              <button onClick={() => setRecoverySuggestions(null)}
                className="p-1 rounded hover:bg-dark-600 text-gray-500 hover:text-gray-300">
                <X size={14} />
              </button>
            </div>
            <div className="space-y-2">
              {recoverySuggestions.map((s, i) => (
                <div key={i} className={`p-3 rounded-lg border ${
                  s.level === 'alert' ? 'border-red-500/30 bg-red-500/5' :
                  s.level === 'warning' ? 'border-orange-500/30 bg-orange-500/5' :
                  'border-dark-500 bg-dark-700/50'
                }`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-400 mb-0.5">{s.icon} {s.reason}</p>
                      <p className="text-sm font-medium text-white">{s.technique}</p>
                      <p className="text-xs text-gray-300 mt-0.5">{s.description}</p>
                      {s.duration && <p className="text-xs text-gray-500 mt-1">⏱ {s.duration}</p>}
                    </div>
                    <a href={s.search_url} target="_blank" rel="noopener noreferrer"
                      className="shrink-0 flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/40 text-red-300 transition-colors border border-red-500/20">
                      <ExternalLink size={11} />
                      YouTube
                    </a>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-600 text-center">Basé sur tes derniers logs · suggestions indicatives</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recent logs */}
      {recentLogs?.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">7 derniers jours</h3>
            <button type="button" onClick={() => setShowCalendar(v => !v)}
              className="text-xs text-gray-500 hover:text-brand-green transition-colors flex items-center gap-1">
              <Calendar size={11} /> Calendrier complet
            </button>
          </div>
          <div className="space-y-0">
            {recentLogs.map(log => {
              const cfg = SPORT_MAP[log.sport] || SPORT_MAP['Course à pied']
              const isEditing = log.date === form.date
              return (
                <div key={log.id} className={`flex items-center justify-between text-xs py-2 border-b border-dark-600 last:border-0 ${isEditing ? 'bg-brand-green/5 -mx-3 px-3 rounded' : ''}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{cfg.icon}</span>
                    <div>
                      <span className={isEditing ? 'text-brand-green font-medium' : 'text-gray-400'}>{log.date}</span>
                      {log.session_type && <span className="ml-1.5 text-gray-300">{log.session_type}</span>}
                      {log.sport === 'Repos' && <span className="ml-1.5 text-gray-600">Repos</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-right flex-wrap justify-end">
                    {log.distance_km && <span className="text-brand-blue">{log.distance_km}km</span>}
                    {log.dplus_m && <span className="text-brand-purple">{Math.round(log.dplus_m)}m↑</span>}
                    {log.nb_marches && <span className="text-orange-400">{log.nb_marches}🪜</span>}
                    {log.power_w && <span className="text-yellow-400">{log.power_w}W</span>}
                    {log.aei && (
                      <span className={`font-bold ${log.aei >= 8.3 ? 'text-brand-green' : log.aei >= 7.5 ? 'text-brand-blue' : 'text-brand-orange'}`}>
                        {log.aei}
                      </span>
                    )}
                    {log.extra_sessions?.length > 0 && (
                      <span className="text-gray-500">+{log.extra_sessions.length}</span>
                    )}
                    {log.fc_repos && (
                      <span className={log.fc_repos >= 56 ? 'text-red-400' : log.fc_repos >= 53 ? 'text-orange-400' : 'text-green-400'}>
                        ♥{log.fc_repos}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleSelectDate(log.date)}
                      className="ml-1 p-1 rounded text-gray-600 hover:text-brand-green hover:bg-brand-green/10 transition-colors"
                      title="Modifier cette séance"
                    >
                      <Pencil size={11} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
