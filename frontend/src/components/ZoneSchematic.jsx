import React, { useState, useEffect } from 'react'
import { ChevronDown, ChevronUp, Heart } from 'lucide-react'
import { api } from '../api'

// Zone definitions: colors, names, descriptions
const ZONE_META = {
  Z1: { color: '#378ADD', label: 'Z1 — Récupération',    short: 'Récup',    desc: 'Allure très facile, conversation possible' },
  Z2: { color: '#1D9E75', label: 'Z2 — Endurance',       short: 'Endurance',desc: 'Effort confortable, respiration régulière' },
  Z3: { color: '#EF9F27', label: 'Z3 — Tempo',           short: 'Tempo',    desc: 'Effort soutenu, conversation difficile' },
  Z4: { color: '#E24B4A', label: 'Z4 — Seuil',           short: 'Seuil',    desc: 'Effort intense, phrases courtes seulement' },
  Z5: { color: '#7F77DD', label: 'Z5 — Max',             short: 'Max',      desc: 'Effort maximal, sprint ou côtes courtes' },
}

// Session types → warmup / main / cooldown zone mapping
const SESSION_ZONES = [
  {
    type: 'Endurance',
    icon: '🏃',
    color: '#378ADD',
    phases: [
      { label: 'Échauffement', zone: 'Z1', duration: '5 min' },
      { label: 'Corps', zone: 'Z2', duration: 'effort principal' },
      { label: 'Retour', zone: 'Z1', duration: '5 min' },
    ],
  },
  {
    type: 'Longue',
    icon: '⛰️',
    color: '#1D9E75',
    phases: [
      { label: 'Échauffement', zone: 'Z1', duration: '10 min' },
      { label: 'Corps', zone: 'Z2', duration: 'majorité' },
      { label: 'Côtes', zone: 'Z3', duration: 'montées' },
      { label: 'Retour', zone: 'Z1', duration: '10 min' },
    ],
  },
  {
    type: 'Tempo',
    icon: '⚡',
    color: '#EF9F27',
    phases: [
      { label: 'Échauffement', zone: 'Z1-Z2', duration: '15-20 min' },
      { label: 'Corps', zone: 'Z3-Z4', duration: 'effort soutenu' },
      { label: 'Retour', zone: 'Z1', duration: '10-15 min' },
    ],
  },
  {
    type: 'Côtes',
    icon: '🏔️',
    color: '#E24B4A',
    phases: [
      { label: 'Échauffement', zone: 'Z1-Z2', duration: '15 min' },
      { label: 'Efforts', zone: 'Z4-Z5', duration: 'répétitions' },
      { label: 'Récup active', zone: 'Z1', duration: 'entre efforts' },
      { label: 'Retour', zone: 'Z1', duration: '10 min' },
    ],
  },
  {
    type: 'Spécifique',
    icon: '🎯',
    color: '#7F77DD',
    phases: [
      { label: 'Échauffement', zone: 'Z1', duration: '10-15 min' },
      { label: 'Corps', zone: 'Z2-Z3', duration: 'allure course' },
      { label: 'Retour', zone: 'Z1', duration: '10 min' },
    ],
  },
  {
    type: 'Récup',
    icon: '💆',
    color: '#4B5563',
    phases: [
      { label: 'Tout', zone: 'Z1', duration: 'intégralité' },
    ],
  },
]

// Format pace: minutes as min:ss/km
function formatPace(minPerKm) {
  if (!minPerKm) return null
  const mins = Math.floor(minPerKm)
  const secs = Math.round((minPerKm - mins) * 60)
  return `${mins}:${String(secs).padStart(2, '0')}`
}

// Resolve a zone key like "Z1-Z2" to its BPM range
function resolveZoneBpm(zoneKey, zones) {
  if (!zones) return null
  const parts = zoneKey.split('-')
  const first = zones[parts[0]]
  const last = zones[parts[parts.length - 1]]
  if (!first || !last) return null
  return { min: first.bpm_min, max: last.bpm_max }
}

function resolveZonePace(zoneKey, zones) {
  if (!zones) return null
  const parts = zoneKey.split('-')
  const firstZ = zones[parts[0]]
  const lastZ = zones[parts[parts.length - 1]]
  if (!firstZ || !lastZ) return null
  const paceMin = Math.min(
    firstZ.pace_min ?? Infinity,
    lastZ.pace_min ?? Infinity,
  )
  const paceMax = Math.max(
    firstZ.pace_max ?? -Infinity,
    lastZ.pace_max ?? -Infinity,
  )
  if (!isFinite(paceMin) || !isFinite(paceMax)) return null
  return { min: paceMin, max: paceMax }
}

function ZoneBadge({ zoneKey, zones, inline = false }) {
  const bpm = resolveZoneBpm(zoneKey, zones)
  const pace = resolveZonePace(zoneKey, zones)

  const parts = zoneKey.split('-')
  const color = ZONE_META[parts[0]]?.color || '#4B5563'

  return (
    <span className={`inline-flex flex-col ${inline ? '' : 'items-end'}`}>
      <span className="text-xs font-bold" style={{ color }}>
        {zoneKey}
      </span>
      {bpm && (
        <span className="text-xs text-gray-400 font-mono whitespace-nowrap">
          {bpm.min}–{bpm.max} bpm
        </span>
      )}
      {pace && (
        <span className="text-xs text-gray-500 font-mono whitespace-nowrap">
          {formatPace(pace.min)}–{formatPace(pace.max)} /km
        </span>
      )}
    </span>
  )
}

export default function ZoneSchematic() {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState(null)
  const [tab, setTab] = useState('zones') // 'zones' | 'sessions'

  useEffect(() => {
    if (open && !data) {
      api.getPaceZones().then(setData).catch(() => {})
    }
  }, [open])

  const zones = data?.zones

  // Compute total BPM range for the zone bar
  const allBpmMin = zones ? zones.Z1.bpm_min : 110
  const allBpmMax = zones ? zones.Z5.bpm_max : 190
  const bpmRange = allBpmMax - allBpmMin

  return (
    <div className="card">
      {/* Header — always visible */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between"
      >
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Heart size={14} className="text-red-400" />
          Zones FC &amp; allures
        </h3>
        {open ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          {/* Tab switcher */}
          <div className="flex gap-1 p-1 bg-dark-700 rounded-xl">
            {[{ id: 'zones', label: 'Zones' }, { id: 'sessions', label: 'Par type de séance' }].map(t => (
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

          {/* --- TAB: ZONES --- */}
          {tab === 'zones' && (
            <div className="space-y-3">
              {/* Visual zone bar */}
              {zones && (
                <div className="relative h-8 rounded-lg overflow-hidden flex">
                  {Object.entries(ZONE_META).map(([z, meta]) => {
                    const zd = zones[z]
                    if (!zd) return null
                    const width = ((zd.bpm_max - zd.bpm_min) / bpmRange) * 100
                    return (
                      <div
                        key={z}
                        className="flex items-center justify-center text-xs font-bold text-white/90 shrink-0"
                        style={{ width: `${width}%`, backgroundColor: meta.color }}
                      >
                        {meta.short}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* BPM scale below bar */}
              {zones && (
                <div className="relative h-4 flex">
                  {Object.entries(ZONE_META).map(([z, meta]) => {
                    const zd = zones[z]
                    if (!zd) return null
                    const width = ((zd.bpm_max - zd.bpm_min) / bpmRange) * 100
                    return (
                      <div key={z} className="shrink-0 flex justify-start" style={{ width: `${width}%` }}>
                        <span className="text-xs text-gray-600 font-mono">{zd.bpm_min}</span>
                      </div>
                    )
                  })}
                  {/* Last label (Z5 max) */}
                  {zones?.Z5 && (
                    <span className="text-xs text-gray-600 font-mono">{zones.Z5.bpm_max}</span>
                  )}
                </div>
              )}

              {/* Zone detail rows */}
              <div className="space-y-2 mt-1">
                {Object.entries(ZONE_META).map(([z, meta]) => {
                  const zd = zones?.[z]
                  return (
                    <div key={z} className="flex items-start gap-3 py-2 border-b border-dark-600/40 last:border-0">
                      {/* Color dot + zone name */}
                      <div className="w-3 h-3 rounded-full mt-0.5 shrink-0" style={{ backgroundColor: meta.color }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-200">{meta.label}</p>
                        <p className="text-xs text-gray-500 leading-relaxed">{meta.desc}</p>
                      </div>
                      <div className="text-right shrink-0 space-y-0.5">
                        {zd && (
                          <p className="text-xs font-mono text-gray-300">{zd.bpm_min}–{zd.bpm_max} bpm</p>
                        )}
                        {zd?.pace_min && zd?.pace_max ? (
                          <p className="text-xs font-mono text-gray-500">
                            {formatPace(zd.pace_min)}–{formatPace(zd.pace_max)} /km
                          </p>
                        ) : (
                          <p className="text-xs text-gray-700 italic">allure à mesurer</p>
                        )}
                        {zd?.samples > 0 && (
                          <p className="text-xs text-gray-700">{zd.samples} sorties</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {!zones && (
                <p className="text-xs text-gray-600 text-center py-4">Chargement des zones…</p>
              )}
            </div>
          )}

          {/* --- TAB: SESSIONS --- */}
          {tab === 'sessions' && (
            <div className="space-y-4">
              {SESSION_ZONES.map(sess => (
                <div key={sess.type} className="rounded-xl border border-dark-600/50 overflow-hidden">
                  {/* Session header */}
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-dark-600/40"
                    style={{ backgroundColor: sess.color + '12' }}>
                    <span className="text-sm">{sess.icon}</span>
                    <span className="text-xs font-bold text-gray-200">{sess.type}</span>
                  </div>

                  {/* Phase rows */}
                  <div className="divide-y divide-dark-600/30">
                    {sess.phases.map((phase, i) => {
                      const bpm = resolveZoneBpm(phase.zone, zones)
                      const pace = resolveZonePace(phase.zone, zones)
                      const parts = phase.zone.split('-')
                      const color = ZONE_META[parts[0]]?.color || '#4B5563'
                      return (
                        <div key={i} className="flex items-center gap-3 px-3 py-2">
                          {/* Phase label */}
                          <div className="w-24 shrink-0">
                            <p className="text-xs text-gray-400">{phase.label}</p>
                            <p className="text-xs text-gray-600">{phase.duration}</p>
                          </div>

                          {/* Zone pill */}
                          <span
                            className="text-xs font-bold px-2 py-0.5 rounded-full shrink-0"
                            style={{ backgroundColor: color + '22', color }}
                          >
                            {phase.zone}
                          </span>

                          {/* BPM + pace */}
                          <div className="flex-1 text-right">
                            {bpm && (
                              <p className="text-xs font-mono text-gray-300">{bpm.min}–{bpm.max} bpm</p>
                            )}
                            {pace ? (
                              <p className="text-xs font-mono text-gray-500">
                                {formatPace(pace.min)}–{formatPace(pace.max)} /km
                              </p>
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
