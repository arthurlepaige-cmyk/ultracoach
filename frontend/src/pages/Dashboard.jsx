import React, { useEffect, useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Heart, Zap, TrendingUp, Activity, Wind, Mountain, Moon, Dumbbell, RefreshCw, MessageSquare } from 'lucide-react'
import { api } from '../api'
import { useApi } from '../hooks/useApi'
import RaceCountdown from '../components/RaceCountdown'
import AEIChart from '../components/AEIChart'
import WeeklyLoad from '../components/WeeklyLoad'
import FormIndicator, { FCAlert } from '../components/FormIndicator'

const AEI_PERIODS = [
  { key: '7d',  label: '7j' },
  { key: '1m',  label: '1m' },
  { key: '3m',  label: '3m' },
  { key: '6m',  label: '6m' },
  { key: '1y',  label: '1an' },
  { key: 'all', label: 'Tout' },
]

function periodFromDate(key) {
  const now = new Date()
  if (key === '7d')  { const d = new Date(now); d.setDate(d.getDate() - 7);   return d.toISOString().slice(0, 10) }
  if (key === '1m')  { const d = new Date(now); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 10) }
  if (key === '3m')  { const d = new Date(now); d.setMonth(d.getMonth() - 3); return d.toISOString().slice(0, 10) }
  if (key === '6m')  { const d = new Date(now); d.setMonth(d.getMonth() - 6); return d.toISOString().slice(0, 10) }
  if (key === '1y')  { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return d.toISOString().slice(0, 10) }
  return null // 'all'
}

// Color helpers
const HRV_COLORS = { green: '#1D9E75', blue: '#378ADD', orange: '#EF9F27', red: '#E24B4A', neutral: '#6B7280' }
const acwrColor = (v) => v >= 0.8 && v <= 1.1 ? '#1D9E75' : v >= 0.7 && v <= 1.3 ? '#EF9F27' : '#E24B4A'
const recoveryColor = (v) => v >= 75 ? '#1D9E75' : v >= 50 ? '#378ADD' : v >= 30 ? '#EF9F27' : '#E24B4A'

function MetricCard({ icon: Icon, label, value, unit, color = '#1D9E75', sub, badge }) {
  return (
    <motion.div className="metric-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Icon size={14} style={{ color }} />
          <span className="text-xs text-gray-400 uppercase tracking-wide">{label}</span>
        </div>
        {badge && <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ backgroundColor: badge.color + '22', color: badge.color }}>{badge.label}</span>}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold" style={{ color }}>{value ?? '—'}</span>
        {unit && <span className="text-sm text-gray-400">{unit}</span>}
      </div>
      {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
    </motion.div>
  )
}

// Mini trend arrow: deviation %
function TrendBadge({ deviation, inverted = false }) {
  if (deviation === null || deviation === undefined) return null
  const good = inverted ? deviation < 0 : deviation > 0
  const color = Math.abs(deviation) < 5 ? '#6B7280' : good ? '#1D9E75' : '#EF9F27'
  const arrow = deviation > 0 ? '↑' : '↓'
  return <span className="text-xs font-medium" style={{ color }}>{arrow}{Math.abs(deviation)}%</span>
}

// Recovery ring 0-100
function RecoveryRing({ score }) {
  if (score === null || score === undefined) return (
    <div className="flex flex-col items-center justify-center">
      <span className="text-3xl font-black text-gray-600">—</span>
      <span className="text-xs text-gray-500 mt-1">Score récup.</span>
    </div>
  )
  const color = recoveryColor(score)
  const r = 28, circ = 2 * Math.PI * r
  const pct = Math.min(score / 100, 1)
  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative w-16 h-16">
        <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
          <circle cx="32" cy="32" r={r} fill="none" stroke="#2E3749" strokeWidth="6" />
          <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="6"
            strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
            strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-base font-black" style={{ color }}>{score}</span>
      </div>
      <span className="text-xs text-gray-500 mt-1">Score récup.</span>
    </div>
  )
}

function DailyBriefingCard() {
  const [state, setState] = useState({ text: null, generated_at: null, loading: true, error: null, refreshing: false })

  const load = async (refresh = false) => {
    setState(s => ({ ...s, loading: !refresh, refreshing: refresh, error: null }))
    try {
      const data = refresh ? await api.refreshDailyBriefing() : await api.getDailyBriefing()
      setState({ text: data.text, generated_at: data.generated_at, loading: false, refreshing: false, error: null })
    } catch (e) {
      setState(s => ({ ...s, loading: false, refreshing: false, error: e.message }))
    }
  }

  useEffect(() => { load() }, [])

  const timeLabel = state.generated_at
    ? new Date(state.generated_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : null

  if (state.loading) {
    return (
      <div className="card space-y-2 animate-pulse">
        <div className="h-3 bg-dark-600 rounded w-1/3" />
        <div className="h-3 bg-dark-600 rounded w-full" />
        <div className="h-3 bg-dark-600 rounded w-5/6" />
        <div className="h-3 bg-dark-600 rounded w-4/5" />
      </div>
    )
  }

  if (state.error) {
    return (
      <div className="card border border-red-500/20">
        <p className="text-xs text-red-400">Briefing indisponible — {state.error}</p>
      </div>
    )
  }

  return (
    <motion.div
      className="card border border-brand-green/15 bg-gradient-to-br from-dark-800 to-dark-700/50"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-brand-green/20 flex items-center justify-center shrink-0">
            <MessageSquare size={13} className="text-brand-green" />
          </div>
          <div>
            <p className="text-xs font-semibold text-brand-green">Briefing du jour</p>
            {timeLabel && <p className="text-xs text-gray-600">Généré à {timeLabel}</p>}
          </div>
        </div>
        <button
          onClick={() => load(true)}
          disabled={state.refreshing}
          className="p-1.5 rounded-lg text-gray-600 hover:text-gray-300 hover:bg-dark-600 transition-colors disabled:opacity-40"
          title="Régénérer"
        >
          <RefreshCw size={12} className={state.refreshing ? 'animate-spin' : ''} />
        </button>
      </div>
      <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">
        {state.text}
      </p>
    </motion.div>
  )
}

export default function Dashboard() {
  const { data: athlete } = useApi(() => api.getAthlete())
  const { data: aeiMonthly } = useApi(() => api.getAEIMonthly())
  const { data: weeklyData } = useApi(() => api.getWeeklyVolume(8))
  const { data: sweetSpot } = useApi(() => api.getSweetSpot())

  const [aeiPeriod, setAeiPeriod] = useState('1y')
  const [aeiDaily, setAeiDaily] = useState(null)
  const [polarization, setPolarization] = useState(null)
  const [shoes, setShoes] = useState([])
  const [weeklySummary, setWeeklySummary] = useState(null)

  // Fetch daily AEI for the last year once (covers 7d and 1m filters)
  useEffect(() => {
    const from = new Date()
    from.setFullYear(from.getFullYear() - 1)
    api.getAEIDaily(from.toISOString().slice(0, 10)).then(setAeiDaily).catch(() => {})
  }, [])
  useEffect(() => {
    api.getPolarization(8).then(setPolarization).catch(() => {})
    api.getShoes().then(setShoes).catch(() => {})
    api.getWeeklySummary().then(setWeeklySummary).catch(() => {})
  }, [])

  const [raceTargets, setRaceTargets] = useState([])
  useEffect(() => {
    api.getRaceTargets().then(setRaceTargets).catch(() => {})
  }, [])

  const today = new Date().toISOString().split('T')[0]
  const upcomingRaces = raceTargets
    .filter(r => r.date > today && r.active !== 0)
    .sort((a, b) => {
      const pOrder = { A: 0, B: 1, C: 2 }
      return (pOrder[a.priority] ?? 3) - (pOrder[b.priority] ?? 3) || a.date.localeCompare(b.date)
    })
  const chevaliers = upcomingRaces[0] || null
  const utmb = upcomingRaces[1] || null

  // ── Dynamic values ──────────────────────────────────────────────────────────
  const hrv_trend = athlete?.hrv_trend
  const fc_trend = athlete?.fc_repos_trend
  const todayLog = athlete?.today_log

  // AEI filtered data: daily for short periods, monthly for long
  const useDaily = aeiPeriod === '7d' || aeiPeriod === '1m'
  const aeiFiltered = useMemo(() => {
    const fromDate = periodFromDate(aeiPeriod)
    if (useDaily) {
      const src = aeiDaily || []
      return fromDate ? src.filter(d => d.date >= fromDate) : src
    }
    const src = aeiMonthly || []
    return fromDate ? src.filter(d => d.month >= fromDate.slice(0, 7)) : src
  }, [aeiPeriod, aeiMonthly, aeiDaily, useDaily])

  const aeiStatus = athlete?.aei_rolling >= 8.3
    ? { label: 'Pic de forme', color: '#1D9E75' }
    : athlete?.aei_rolling >= 7.5
    ? { label: 'Bonne forme', color: '#378ADD' }
    : { label: 'Récupération', color: '#EF9F27' }

  // Dynamic scores (prefer computed, fall back to Garmin static)
  const vo2max = athlete?.vo2max_dynamic || athlete?.vo2max_current
  const acwr = athlete?.acwr_current
  const atl = athlete?.atl_current
  const ctl = athlete?.ctl_current
  const esRaw = athlete?.endurance_score_dynamic
  const esDisplay = esRaw ? Math.round(esRaw / 100) : null  // 0-10000 → 0-100
  const hs = athlete?.hill_score_dynamic
  const hsDisplay = hs?.overall ?? null
  const strengthScore = athlete?.strength_score

  return (
    <div className="space-y-6 pb-20 md:pb-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div>
          <h1 className="text-xl font-bold">Tableau de bord</h1>
          <p className="text-sm text-gray-400">
            {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {athlete?.day_status && <FormIndicator status={athlete.day_status} />}
          {fc_trend?.today && <FCAlert fc_repos={fc_trend.today} />}
        </div>
      </div>

      {/* Race countdowns */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {chevaliers && <RaceCountdown race={chevaliers} color="#1D9E75" />}
        {utmb && <RaceCountdown race={utmb} color="#7F77DD" />}
      </div>

      {/* Daily AI briefing */}
      <DailyBriefingCard />

      {/* ── Daily health card ── */}
      <div className="card">
        <h3 className="text-sm font-semibold mb-3 text-gray-300">État du jour</h3>
        <div className="flex items-center gap-4">
          <RecoveryRing score={athlete?.recovery_score} />
          <div className="flex-1 grid grid-cols-2 gap-3">

            {/* HRV */}
            <div className="bg-dark-700/60 rounded-xl p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-400 flex items-center gap-1"><Activity size={10} className="text-brand-purple" /> HRV</span>
                <TrendBadge deviation={hrv_trend?.deviation} />
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-black" style={{ color: hrv_trend ? HRV_COLORS[hrv_trend.status] : '#6B7280' }}>
                  {hrv_trend?.today ?? todayLog?.hrv ?? '—'}
                </span>
                <span className="text-xs text-gray-500">ms</span>
              </div>
              {hrv_trend?.baseline && (
                <div className="text-xs text-gray-600 mt-0.5">base 7j : {hrv_trend.baseline}</div>
              )}
            </div>

            {/* FC repos */}
            <div className="bg-dark-700/60 rounded-xl p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-400 flex items-center gap-1"><Heart size={10} className="text-red-400" /> FC repos</span>
                <TrendBadge deviation={fc_trend?.deviation} inverted />
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-black" style={{ color: fc_trend ? HRV_COLORS[fc_trend.status] : '#6B7280' }}>
                  {fc_trend?.today ?? todayLog?.fc_repos ?? '—'}
                </span>
                <span className="text-xs text-gray-500">bpm</span>
              </div>
              {fc_trend?.baseline && (
                <div className="text-xs text-gray-600 mt-0.5">base 7j : {fc_trend.baseline}</div>
              )}
            </div>

            {/* Sensation */}
            <div className="bg-dark-700/60 rounded-xl p-3">
              <span className="text-xs text-gray-400 block mb-1">Sensation</span>
              <div className="flex gap-0.5">
                {[1,2,3,4,5].map(n => (
                  <span key={n} className={`text-base ${n <= (todayLog?.sensation ?? 0) ? 'text-yellow-400' : 'text-gray-700'}`}>★</span>
                ))}
              </div>
            </div>

            {/* Sommeil */}
            <div className="bg-dark-700/60 rounded-xl p-3">
              <span className="text-xs text-gray-400 flex items-center gap-1 mb-1"><Moon size={10} /> Sommeil</span>
              {todayLog?.sleep_h ? (
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-black" style={{ color: todayLog.sleep_h >= 7 ? '#1D9E75' : todayLog.sleep_h >= 6 ? '#EF9F27' : '#E24B4A' }}>
                    {todayLog.sleep_h}
                  </span>
                  <span className="text-xs text-gray-500">h</span>
                  {todayLog.sleep_quality && (
                    <span className="text-xs text-gray-500 ml-1">{'★'.repeat(todayLog.sleep_quality)}</span>
                  )}
                </div>
              ) : (
                <span className="text-gray-600 text-sm">—</span>
              )}
            </div>
          </div>
        </div>
        {weeklySummary?.stats?.avg_rpe && (
          <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-dark-700/40">
            <span className="text-xs text-gray-400">RPE moyen 7j :</span>
            <span className="text-sm font-bold" style={{
              color: weeklySummary.stats.avg_rpe <= 5 ? '#1D9E75' : weeklySummary.stats.avg_rpe <= 7 ? '#378ADD' : weeklySummary.stats.avg_rpe <= 8 ? '#EF9F27' : '#E24B4A'
            }}>
              {weeklySummary.stats.avg_rpe}/10
            </span>
            <span className="text-xs text-gray-500 ml-auto">{weeklySummary.stats.sessions_7d} séances</span>
          </div>
        )}
        {!todayLog && (
          <p className="text-xs text-gray-600 mt-3 text-center">
            Aucune saisie santé aujourd'hui — rendez-vous dans <span className="text-brand-green">Saisie → Santé</span>
          </p>
        )}
      </div>

      {/* ── Performance metrics ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          icon={TrendingUp} label="AEI glissant"
          value={athlete?.aei_rolling} color={aeiStatus.color} sub={aeiStatus.label}
        />
        <MetricCard
          icon={Wind} label="VO2max"
          value={vo2max} unit="ml/kg/min" color="#378ADD"
          sub={athlete?.vo2max_dynamic ? '↻ dynamique' : 'Garmin'}
          badge={athlete?.vo2max_dynamic ? { label: '↻', color: '#7F77DD' } : null}
        />
        <MetricCard
          icon={Activity} label="ACWR"
          value={acwr} color={acwr ? acwrColor(acwr) : '#6B7280'}
          sub={atl && ctl ? `ATL ${Math.round(atl)} / CTL ${Math.round(ctl)}` : 'charge entraînement'}
        />
        <MetricCard
          icon={Zap} label="Score endurance"
          value={esDisplay} unit="/100" color="#1D9E75"
          sub={esRaw ? `${Math.round(esRaw / 100 * 10000 / 100)} pts Garmin` : null}
          badge={esRaw ? { label: '↻', color: '#7F77DD' } : null}
        />
      </div>

      {/* ── Secondary scores ── */}
      <div className="grid grid-cols-3 gap-3">
        <MetricCard
          icon={Mountain} label="Score dénivelé"
          value={hsDisplay} color="#378ADD"
          sub={hs ? `Force ${hs.strength} · End. ${hs.endurance}` : null}
          badge={hs ? { label: '↻', color: '#7F77DD' } : null}
        />
        <MetricCard
          icon={Dumbbell} label="Renforcement"
          value={strengthScore?.score ?? '—'} unit={strengthScore ? '/100' : ''}
          color={(strengthScore?.score ?? 0) >= 75 ? '#1D9E75' : (strengthScore?.score ?? 0) >= 50 ? '#EF9F27' : '#E24B4A'}
          sub={strengthScore ? `${strengthScore.sessions_28d}/${strengthScore.target} séances · 28j` : null}
        />
        <MetricCard
          icon={Activity} label="Betrail Max"
          value={athlete?.itra_max} color="#7F77DD"
          sub={`UTMB index: ${athlete?.utmb_index}`}
        />
      </div>

      {/* Sweet spot J-28 */}
      {sweetSpot && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-semibold text-sm">Sweet Spot J-28 — {sweetSpot.race}</h3>
              <p className="text-xs text-gray-400">Fenêtre 4 semaines avant course</p>
            </div>
            <span className={`badge text-xs font-bold px-3 py-1 ${sweetSpot.status === 'OPTIMAL' ? 'bg-green-500/20 text-green-400' : 'bg-orange-500/20 text-orange-400'}`}>
              {sweetSpot.status}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>Volume km</span>
                <span>{sweetSpot.km} / {sweetSpot.km_target_min}-{sweetSpot.km_target_max} km</span>
              </div>
              <div className="h-2 bg-dark-500 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all"
                  style={{ width: `${Math.min(100, (sweetSpot.km / sweetSpot.km_target_max) * 100)}%`, backgroundColor: sweetSpot.km_ok ? '#1D9E75' : '#EF9F27' }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>D+</span>
                <span>{sweetSpot.dplus} / {sweetSpot.dplus_target_min}-{sweetSpot.dplus_target_max} m</span>
              </div>
              <div className="h-2 bg-dark-500 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all"
                  style={{ width: `${Math.min(100, (sweetSpot.dplus / sweetSpot.dplus_target_max) * 100)}%`, backgroundColor: sweetSpot.dplus_ok ? '#1D9E75' : '#EF9F27' }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Polarisation 80/20 */}
      {polarization?.overall && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-semibold text-sm">Polarisation d'entraînement</h3>
              <p className="text-xs text-gray-400">Objectif : 80% facile / 20% intensif (règle 80/20)</p>
            </div>
            {polarization.overall.easy_pct >= 75 ? (
              <span className="text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-400 font-medium">✓ Équilibré</span>
            ) : polarization.overall.moderate_pct > 30 ? (
              <span className="text-xs px-2 py-0.5 rounded bg-orange-500/20 text-orange-400 font-medium">⚠ Zone grise</span>
            ) : (
              <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 font-medium">Intensif</span>
            )}
          </div>
          <div className="space-y-2">
            {[
              { label: 'Facile (Z1-Z2)', pct: polarization.overall.easy_pct, color: '#1D9E75', target: 80 },
              { label: 'Zone grise (Z3)', pct: polarization.overall.moderate_pct, color: '#EF9F27', target: null },
              { label: 'Intensif (Z4-Z5)', pct: polarization.overall.hard_pct, color: '#E24B4A', target: 20 },
            ].map(({ label, pct, color, target }) => (
              <div key={label}>
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>{label}</span>
                  <span style={{ color }} className="font-semibold">{pct}%{target ? ` (cible ${target}%)` : ''}</span>
                </div>
                <div className="h-2 bg-dark-500 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                </div>
              </div>
            ))}
          </div>
          {polarization.overall.sessions_with_fc > 0 && (
            <p className="text-xs text-gray-600 mt-2">{polarization.overall.sessions_with_fc} séances analysées (8 semaines)</p>
          )}
        </div>
      )}

      {/* Chaussures */}
      {shoes.filter(s => s.alert).map(shoe => (
        <div key={shoe.id} className="card border border-orange-500/30 bg-orange-500/5">
          <div className="flex items-start gap-2">
            <span className="text-base">👟</span>
            <div>
              <p className="text-sm font-semibold text-orange-400">Alerte chaussures : {shoe.name}</p>
              <p className="text-xs text-gray-400">{shoe.km_total}km — {shoe.km_remaining > 0 ? `${shoe.km_remaining}km restants avant remplacement` : 'À remplacer'}</p>
            </div>
          </div>
        </div>
      ))}

      {/* Alertes douleur */}
      {weeklySummary?.pain_alerts?.length > 0 && (
        <div className="card border border-red-500/30 bg-red-500/5">
          <h3 className="font-semibold text-sm text-red-400 mb-2">⚠ Zones douloureuses récurrentes</h3>
          <div className="flex flex-wrap gap-1.5">
            {weeklySummary.pain_alerts.map(p => (
              <span key={p.zone} className="text-xs px-2 py-0.5 rounded-full"
                style={{ backgroundColor: p.max_level >= 3 ? '#DC262630' : '#EA580C30', color: p.max_level >= 3 ? '#DC2626' : '#EA580C' }}>
                {p.label} ({p.count}×)
              </span>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">Adapte ta semaine — évite les contraintes sur ces zones</p>
        </div>
      )}

      {/* AEI chart */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm">AEI — Indice d'efficacité aérobie</h3>
          <div className="flex gap-0.5">
            {AEI_PERIODS.map(p => (
              <button key={p.key} onClick={() => setAeiPeriod(p.key)}
                className={`text-xs px-2 py-1 rounded transition-colors ${aeiPeriod === p.key ? 'bg-dark-500 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <AEIChart data={aeiFiltered} daily={useDaily} />
      </div>

      {/* Weekly volume */}
      <div className="card">
        <h3 className="font-semibold text-sm mb-3">Volume hebdomadaire — 8 semaines</h3>
        <WeeklyLoad data={weeklyData} />
      </div>
    </div>
  )
}
