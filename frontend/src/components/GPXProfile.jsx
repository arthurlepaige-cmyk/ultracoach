import React, { useMemo, useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, ReferenceArea
} from 'recharts'

// Colors per zone (AI strategy) or type (GPX detection)
const ZONE_COLORS = {
  'Z1':    '#4B9EDB',
  'Z1-Z2': '#1D9E75',
  'Z2':    '#378ADD',
  'Z2-Z3': '#EF9F27',
  'Z3':    '#E24B4A',
  'Z3-Z4': '#C0392B',
}

const TYPE_COLORS = {
  climb:   '#EF9F27',
  descent: '#378ADD',
  flat:    '#4B5563',
}

function truncate(str, n) {
  if (!str) return ''
  return str.length > n ? str.slice(0, n) + '…' : str
}

const CustomTooltip = ({ active, payload, sections, totalKm }) => {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  const section = sections?.find(s => d.km >= s.km_start && d.km <= s.km_end)
  return (
    <div className="card-sm text-xs min-w-[140px]">
      <p className="font-bold text-white mb-1">{d.km} km</p>
      <p style={{ color: '#7F77DD' }}>Alt : {d.ele} m</p>
      {section && (
        <>
          <div className="border-t border-dark-500 mt-1.5 pt-1.5">
            <p className="font-medium" style={{ color: section.color }}>
              {section.label}
            </p>
            {section.zone && <p className="text-gray-400">Zone {section.zone}</p>}
            {section.strategy && (
              <p className="text-gray-400 mt-0.5 leading-relaxed" style={{ maxWidth: 180 }}>
                {truncate(section.strategy, 80)}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default function GPXProfile({ data, checkpoints = [], sections: aiSections }) {
  const [hoveredSection, setHoveredSection] = useState(null)

  const totalKm = data?.total_km || data?.points?.[data.points.length - 1]?.km || 0

  // Build display sections — prefer AI strategy sections, fallback to GPX-detected
  const displaySections = useMemo(() => {
    const raw = aiSections?.length ? aiSections : data?.sections || []
    return raw.map((s, i) => {
      const isAI = !!s.zone || !!s.strategy
      const color = isAI
        ? (ZONE_COLORS[s.zone] || '#378ADD')
        : (TYPE_COLORS[s.type] || '#4B5563')
      const label = isAI
        ? (s.desc || `Section ${i + 1}`)
        : (s.type === 'climb' ? `Montée ${s.gradient > 8 ? '(raide)' : s.gradient > 5 ? '(modérée)' : ''}`.trim()
           : s.type === 'descent' ? 'Descente'
           : 'Plat')
      return { ...s, color, label, isAI }
    })
  }, [aiSections, data?.sections])

  // Night section from checkpoints
  const nightSection = useMemo(() => {
    const nightCps = checkpoints.filter(cp => cp.is_night)
    if (nightCps.length < 2) return null
    return { start: nightCps[0].km, end: nightCps[nightCps.length - 1].km }
  }, [checkpoints])

  if (!data?.points?.length) return (
    <div className="flex items-center justify-center h-48 text-gray-500 text-sm">
      {data === null ? 'Chargement profil…' : 'Aucune donnée GPX'}
    </div>
  )

  return (
    <div>
      {data.synthetic && (
        <div className="text-xs text-yellow-500/70 mb-2 text-center">
          ⚠ Profil estimé — uploadez le GPX dans l'onglet Plan pour le vrai profil
        </div>
      )}

      {/* Stats */}
      {!data.synthetic && (
        <div className="flex gap-4 text-xs text-gray-400 mb-3">
          <span className="text-brand-blue">📏 {totalKm} km</span>
          <span className="text-brand-orange">▲ D+ {data.dplus_computed?.toLocaleString('fr-FR')} m</span>
          <span className="text-brand-purple">▼ D- {data.dminus_computed?.toLocaleString('fr-FR')} m</span>
          {aiSections?.length > 0 && (
            <span className="text-purple-400">✦ {aiSections.length} sections IA</span>
          )}
        </div>
      )}

      {/* Chart */}
      <ResponsiveContainer width="100%" height={230}>
        <AreaChart data={data.points} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
          <defs>
            <linearGradient id="eleGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#1D9E75" stopOpacity={0.55} />
              <stop offset="95%" stopColor="#1D9E75" stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#2E3749" />

          {/* Night band */}
          {nightSection && (
            <ReferenceArea
              x1={nightSection.start} x2={nightSection.end}
              fill="#1e3a5f" fillOpacity={0.4}
            />
          )}

          {/* Section bands */}
          {displaySections.map((s, i) => (
            <ReferenceArea
              key={i}
              x1={s.km_start} x2={s.km_end}
              fill={s.color}
              fillOpacity={hoveredSection === i ? 0.28 : 0.13}
              stroke={hoveredSection === i ? s.color : 'none'}
              strokeOpacity={0.4}
              strokeWidth={1}
            />
          ))}

          {/* Checkpoint lines */}
          {checkpoints.map((cp, i) => (
            <ReferenceLine
              key={i}
              x={cp.km}
              stroke="#EF9F27"
              strokeDasharray="3 2"
              strokeWidth={1}
              label={{ value: cp.target_time, position: 'insideTopRight', fill: '#EF9F27', fontSize: 8 }}
            />
          ))}

          <XAxis
            dataKey="km"
            tick={{ fill: '#6B7280', fontSize: 10 }}
            tickFormatter={v => `${v}km`}
            interval={Math.max(1, Math.floor(data.points.length / 8))}
          />
          <YAxis tick={{ fill: '#6B7280', fontSize: 10 }} />
          <Tooltip content={<CustomTooltip sections={displaySections} totalKm={totalKm} />} />
          <Area
            type="monotone"
            dataKey="ele"
            stroke="#1D9E75"
            strokeWidth={1.5}
            fill="url(#eleGrad)"
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* Section strip — colored bar below chart */}
      {displaySections.length > 0 && totalKm > 0 && (
        <div className="mt-1 mb-1">
          {/* Color bar */}
          <div className="flex h-3 rounded overflow-hidden w-full">
            {displaySections.map((s, i) => {
              const widthPct = ((s.km_end - s.km_start) / totalKm) * 100
              return (
                <div
                  key={i}
                  style={{ width: `${widthPct}%`, backgroundColor: s.color, opacity: hoveredSection === i ? 1 : 0.7 }}
                  className="transition-opacity cursor-pointer border-r border-dark-800/30 last:border-0"
                  onMouseEnter={() => setHoveredSection(i)}
                  onMouseLeave={() => setHoveredSection(null)}
                  title={`${s.km_start}–${s.km_end}km · ${s.label}`}
                />
              )
            })}
          </div>

          {/* Km markers under the bar */}
          <div className="relative h-4 w-full mt-0.5">
            {displaySections.map((s, i) => {
              const leftPct = (s.km_start / totalKm) * 100
              return (
                <span
                  key={i}
                  className="absolute text-gray-600"
                  style={{ left: `${leftPct}%`, fontSize: 8, transform: 'translateX(-50%)' }}
                >
                  {s.km_start}
                </span>
              )
            })}
            <span
              className="absolute text-gray-600"
              style={{ left: '100%', fontSize: 8, transform: 'translateX(-100%)' }}
            >
              {totalKm}
            </span>
          </div>
        </div>
      )}

      {/* Section cards — shown on hover or all if ≤6 */}
      {displaySections.length > 0 && (
        <div className="mt-3 space-y-0">
          {/* If AI sections: show all as compact pills */}
          <div className="flex flex-wrap gap-1.5">
            {displaySections.map((s, i) => (
              <button
                key={i}
                onMouseEnter={() => setHoveredSection(i)}
                onMouseLeave={() => setHoveredSection(null)}
                className={`text-xs px-2 py-1 rounded-lg border transition-all text-left ${
                  hoveredSection === i ? 'opacity-100' : 'opacity-70 hover:opacity-90'
                }`}
                style={{
                  borderColor: s.color + '60',
                  backgroundColor: s.color + '18',
                  color: s.color,
                }}
              >
                <span className="font-mono font-bold">{s.km_start}–{s.km_end}km</span>
                {s.zone && <span className="ml-1 opacity-80">{s.zone}</span>}
                <span className="ml-1 opacity-80">· {truncate(s.label, 22)}</span>
              </button>
            ))}
          </div>

          {/* Detail card for hovered section */}
          {hoveredSection !== null && displaySections[hoveredSection]?.isAI && (
            <div
              className="mt-2 p-2.5 rounded-xl border text-xs"
              style={{
                borderColor: displaySections[hoveredSection].color + '40',
                backgroundColor: displaySections[hoveredSection].color + '10',
              }}
            >
              <p className="font-semibold mb-0.5" style={{ color: displaySections[hoveredSection].color }}>
                {displaySections[hoveredSection].label}
                <span className="font-normal text-gray-400 ml-2">
                  km {displaySections[hoveredSection].km_start}–{displaySections[hoveredSection].km_end}
                </span>
              </p>
              {displaySections[hoveredSection].strategy && (
                <p className="text-gray-300">{displaySections[hoveredSection].strategy}</p>
              )}
              <div className="flex flex-wrap gap-2 mt-1">
                {displaySections[hoveredSection].zone && (
                  <span className="text-gray-400">Zone {displaySections[hoveredSection].zone}</span>
                )}
                {displaySections[hoveredSection].target_pace_min_km && (
                  <span className="text-brand-orange">
                    {Math.floor(displaySections[hoveredSection].target_pace_min_km)}:{String(Math.round((displaySections[hoveredSection].target_pace_min_km % 1) * 60)).padStart(2, '0')} min/km
                  </span>
                )}
                {displaySections[hoveredSection].fc_max && (
                  <span className="text-red-400">FC ≤{displaySections[hoveredSection].fc_max}</span>
                )}
                {displaySections[hoveredSection].key_risk && (
                  <span className="text-orange-400">⚠ {displaySections[hoveredSection].key_risk}</span>
                )}
              </div>
              {displaySections[hoveredSection].nutrition && (
                <p className="text-blue-400/80 mt-1">💧 {displaySections[hoveredSection].nutrition}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-2">
        {nightSection && (
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: '#1e3a5f', opacity: 0.9 }} />
            Nuit
          </div>
        )}
        {checkpoints.length > 0 && (
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <span className="inline-block w-4" style={{ borderTop: '1px dashed #EF9F27', marginTop: 2 }} />
            Checkpoints
          </div>
        )}
        {!aiSections?.length && displaySections.length > 0 && (
          <>
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <span className="w-3 h-3 rounded-sm inline-block bg-[#EF9F27] opacity-70" /> Montée
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <span className="w-3 h-3 rounded-sm inline-block bg-[#378ADD] opacity-70" /> Descente
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <span className="w-3 h-3 rounded-sm inline-block bg-[#4B5563] opacity-70" /> Plat
            </div>
          </>
        )}
      </div>
    </div>
  )
}
