import React, { useState, useEffect } from 'react'
import { ChevronDown, ChevronUp, Heart, Info } from 'lucide-react'
import { api } from '../api'

const ZONE_META = {
  Z1: { color: '#378ADD', label: 'Z1 — Récupération',  short: 'Z1', desc: 'Très facile, conversation aisée' },
  Z2: { color: '#1D9E75', label: 'Z2 — Endurance',     short: 'Z2', desc: 'Effort confortable, respiration régulière' },
  Z3: { color: '#EF9F27', label: 'Z3 — Tempo',         short: 'Z3', desc: 'Soutenu, conversation difficile' },
  Z4: { color: '#E24B4A', label: 'Z4 — Seuil',         short: 'Z4', desc: 'Intense, phrases courtes seulement' },
  Z5: { color: '#7F77DD', label: 'Z5 — Max',           short: 'Z5', desc: 'Maximal, sprints et côtes courtes' },
}

// Session type → phases with zone targets
// trail: true → show FC (not pace) for this phase
const SESSION_ZONES = [
  {
    type: 'Endurance', icon: '🏃', color: '#378ADD',
    phases: [
      { label: 'Échauffement', zone: 'Z1', duration: '5 min', trail: false },
      { label: 'Corps',        zone: 'Z2', duration: 'effort principal', trail: false },
      { label: 'Retour calme', zone: 'Z1', duration: '5 min', trail: false },
    ],
  },
  {
    type: 'Longue', icon: '⛰️', color: '#1D9E75',
    phases: [
      { label: 'Échauffement', zone: 'Z1', duration: '10 min', trail: false },
      { label: 'Plat / descente', zone: 'Z1-Z2', duration: 'majorité', trail: false },
      { label: 'Montées', zone: 'Z2-Z3', duration: 'D+', trail: true },
      { label: 'Retour calme',  zone: 'Z1', duration: '10 min', trail: false },
    ],
  },
  {
    type: 'Tempo', icon: '⚡', color: '#EF9F27',
    phases: [
      { label: 'Échauffement', zone: 'Z1-Z2', duration: '15-20 min', trail: false },
      { label: 'Corps',        zone: 'Z3-Z4', duration: 'effort soutenu', trail: false },
      { label: 'Retour calme', zone: 'Z1',    duration: '10-15 min', trail: false },
    ],
  },
  {
    type: 'Côtes', icon: '🏔️', color: '#E24B4A',
    phases: [
      { label: 'Échauffement', zone: 'Z1-Z2', duration: '15 min', trail: false },
      { label: 'Efforts côtes', zone: 'Z4-Z5', duration: 'répétitions', trail: true },
      { label: 'Récup active',  zone: 'Z1',    duration: 'entre efforts', trail: true },
      { label: 'Retour calme',  zone: 'Z1',    duration: '10 min', trail: false },
    ],
  },
  {
    type: 'Spécifique', icon: '🎯', color: '#7F77DD',
    phases: [
      { label: 'Échauffement', zone: 'Z1',    duration: '10-15 min', trail: false },
      { label: 'Corps',        zone: 'Z2-Z3', duration: 'allure course', trail: false },
      { label: 'Retour calme', zone: 'Z1',    duration: '10 min', trail: false },
    ],
  },
  {
    type: 'Récup', icon: '💆', color: '#4B5563',
    phases: [
      { label: 'Intégralité', zone: 'Z1', duration: 'tout le long', trail: false },
    ],
  },
]

function fmtPace(minPerKm) {
  if (!minPerKm) return null
  const mins = Math.floor(minPerKm)
  const secs = Math.round((minPerKm - mins) * 60)
  return `${mins}:${String(secs).padStart(2, '0')}`
}

function resolveZone(zoneKey, zones) {
  if (!zones) return null
  const parts = zoneKey.split('-')
  const first = zones[parts[0]]
  const last  = zones[parts[parts.length - 1]]
  if (!first || !last) return null
  return {
    bpmMin:  first.bpm_min,
    bpmMax:  last.bpm_max,
    paceMin: parts.reduce((acc, k) => Math.min(acc, zones[k]?.pace_min ?? Infinity), Infinity),
    paceMax: parts.reduce((acc, k) => Math.max(acc, zones[k]?.pace_max ?? -Infinity), -Infinity),
    color:   ZONE_META[parts[0]]?.color || '#4B5563',
  }
}

export default function ZoneSchematic() {
  const [open, setOpen]   = useState(false)
  const [data, setData]   = useState(null)
  const [tab, setTab]     = useState('zones') // 'zones' | 'sessions'

  useEffect(() => {
    if (open && !data) {
      api.getPaceZones().then(setData).catch(() => {})
    }
  }, [open])

  const zones = data?.zones
  const allBpmMin = zones?.Z1?.bpm_min ?? 110
  const allBpmMax = zones?.Z5?.bpm_max ?? 190
  const bpmRange  = allBpmMax - allBpmMin

  return (
    <div className="card">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between"
      >
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Heart size={14} className="text-red-400" />
          Zones FC &amp; allures
        </h3>
        {open
          ? <ChevronUp size={16} className="text-gray-500" />
          : <ChevronDown size={16} className="text-gray-500" />}
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          {/* Tabs */}
          <div className="flex gap-1 p-1 bg-dark-700 rounded-xl">
            {[{ id: 'zones', label: 'Référence' }, { id: 'sessions', label: 'Par séance' }].map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  tab === t.id ? 'bg-dark-600 text-white' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* ─── TAB: ZONES ─── */}
          {tab === 'zones' && (
            <div className="space-y-3">
              {/* Visual bar */}
              {zones && (
                <>
                  <div className="relative h-7 rounded-lg overflow-hidden flex">
                    {Object.entries(ZONE_META).map(([z, meta]) => {
                      const zd = zones[z]
                      if (!zd) return null
                      const w = ((zd.bpm_max - zd.bpm_min) / bpmRange) * 100
                      return (
                        <div
                          key={z}
                          className="flex items-center justify-center text-xs font-bold text-white/90"
                          style={{ width: `${w}%`, backgroundColor: meta.color }}
                        >
                          {meta.short}
                        </div>
                      )
                    })}
                  </div>
                  {/* BPM scale */}
                  <div className="flex">
                    {Object.entries(ZONE_META).map(([z, meta]) => {
                      const zd = zones[z]
                      if (!zd) return null
                      const w = ((zd.bpm_max - zd.bpm_min) / bpmRange) * 100
                      return (
                        <div key={z} className="flex justify-start" style={{ width: `${w}%` }}>
                          <span className="text-xs text-gray-600 font-mono">{zd.bpm_min}</span>
                        </div>
                      )
                    })}
                    <span className="text-xs text-gray-600 font-mono">{zones?.Z5?.bpm_max}</span>
                  </div>
                </>
              )}

              {/* Calibration source badges */}
              {data && (
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className={`px-2 py-0.5 rounded-full font-medium ${
                    data.fc_repos_source === 'recent'
                      ? 'bg-green-500/15 text-green-400'
                      : 'bg-gray-700 text-gray-500'
                  }`}>
                    FC repos {data.fc_repos} bpm {data.fc_repos_source === 'recent' ? '· récent' : '· profil'}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full font-medium ${
                    data.fc_max_source === 'recent'
                      ? 'bg-green-500/15 text-green-400'
                      : 'bg-gray-700 text-gray-500'
                  }`}>
                    FC max {data.fc_max} bpm {data.fc_max_source === 'recent' ? '· récent' : '· profil'}
                  </span>
                </div>
              )}

              {/* Zone rows */}
              <div className="space-y-1.5">
                {Object.entries(ZONE_META).map(([z, meta]) => {
                  const zd = zones?.[z]
                  const hasPace = zd?.pace_min && zd?.pace_max
                  return (
                    <div key={z} className="flex items-center gap-3 py-2 border-b border-dark-600/40 last:border-0">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: meta.color }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-200">{meta.label}</p>
                        <p className="text-xs text-gray-500">{meta.desc}</p>
                        {zd?.pace_source === 'historical' && (
                          <p className="text-xs text-gray-700 italic">allure : données historiques</p>
                        )}
                      </div>
                      <div className="text-right shrink-0 space-y-0.5 min-w-[110px]">
                        {zd && (
                          <p className="text-xs font-mono text-gray-300">
                            ♥ {zd.bpm_min}–{zd.bpm_max} bpm
                          </p>
                        )}
                        {hasPace ? (
                          <p className="text-xs font-mono text-gray-500">
                            🏃 {fmtPace(zd.pace_min)}–{fmtPace(zd.pace_max)} /km
                          </p>
                        ) : (
                          <p className="text-xs text-gray-700 italic">pas assez de données</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Note on flat-equivalent correction */}
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-dark-700/50">
                <Info size={11} className="text-gray-600 mt-0.5 shrink-0" />
                <p className="text-xs text-gray-600 leading-relaxed">
                  FC et allures calibrées depuis tes 3 derniers mois (correction ITRA : 100m D+ ≡ 1km plat).
                  En trail avec D+, pilote à la <span className="text-gray-400 font-medium">FC</span> — laisse l'allure venir naturellement.
                </p>
              </div>

              {!zones && (
                <p className="text-xs text-gray-600 text-center py-4">Chargement…</p>
              )}
            </div>
          )}

          {/* ─── TAB: SESSIONS ─── */}
          {tab === 'sessions' && (
            <div className="space-y-3">
              {SESSION_ZONES.map(sess => (
                <div key={sess.type} className="rounded-xl border border-dark-600/50 overflow-hidden">
                  <div
                    className="flex items-center gap-2 px-3 py-2 border-b border-dark-600/40"
                    style={{ backgroundColor: sess.color + '14' }}
                  >
                    <span className="text-sm">{sess.icon}</span>
                    <span className="text-xs font-bold text-gray-200">{sess.type}</span>
                  </div>

                  <div className="divide-y divide-dark-600/30">
                    {sess.phases.map((phase, i) => {
                      const resolved = resolveZone(phase.zone, zones)
                      const color    = resolved?.color || '#4B5563'
                      const hasPace  = !phase.trail && isFinite(resolved?.paceMin) && isFinite(resolved?.paceMax) && resolved?.paceMin > 0
                      return (
                        <div key={i} className="flex items-center gap-3 px-3 py-2">
                          {/* Phase label */}
                          <div className="w-28 shrink-0">
                            <p className="text-xs text-gray-300 font-medium">{phase.label}</p>
                            <p className="text-xs text-gray-600">{phase.duration}</p>
                          </div>

                          {/* Zone pill */}
                          <span
                            className="text-xs font-bold px-2 py-0.5 rounded-full shrink-0"
                            style={{ backgroundColor: color + '22', color }}
                          >
                            {phase.zone}
                          </span>

                          {/* Targets */}
                          <div className="flex-1 text-right space-y-0.5">
                            {resolved && (
                              <p className="text-xs font-mono text-gray-300">
                                ♥ {resolved.bpmMin}–{resolved.bpmMax} bpm
                              </p>
                            )}
                            {hasPace ? (
                              <p className="text-xs font-mono text-gray-500">
                                🏃 {fmtPace(resolved.paceMin)}–{fmtPace(resolved.paceMax)} /km
                              </p>
                            ) : phase.trail ? (
                              <p className="text-xs text-gray-600 italic">piloter à la FC</p>
                            ) : null}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
