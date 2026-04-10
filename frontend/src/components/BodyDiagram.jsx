import React, { useState } from 'react'

const PAIN_COLORS = {
  0: 'transparent',
  1: '#D97706', // amber - léger
  2: '#EA580C', // orange - modéré
  3: '#DC2626', // red - fort
}
const PAIN_LABELS = { 1: 'Léger', 2: 'Modéré', 3: 'Fort' }
const PAIN_STROKE = {
  0: '#374151',
  1: '#B45309',
  2: '#C2410C',
  3: '#B91C1C',
}

const FRONT_ZONES = [
  { id: 'tete', label: 'Tête', s: 'circle', cx: 60, cy: 20, r: 16 },
  { id: 'epaule_g', label: 'Épaule G', s: 'ellipse', cx: 34, cy: 52, rx: 14, ry: 10 },
  { id: 'epaule_d', label: 'Épaule D', s: 'ellipse', cx: 86, cy: 52, rx: 14, ry: 10 },
  { id: 'thorax', label: 'Thorax', s: 'rect', x: 44, y: 44, w: 32, h: 26, rx: 6 },
  { id: 'ventre', label: 'Abdomen', s: 'rect', x: 46, y: 70, w: 28, h: 20, rx: 5 },
  { id: 'hanche_g', label: 'Hanche / Ilio G', s: 'rect', x: 36, y: 90, w: 22, h: 18, rx: 5 },
  { id: 'hanche_d', label: 'Hanche / Ilio D', s: 'rect', x: 62, y: 90, w: 22, h: 18, rx: 5 },
  { id: 'quad_g', label: 'Quadriceps G', s: 'rect', x: 36, y: 108, w: 22, h: 42, rx: 6 },
  { id: 'quad_d', label: 'Quadriceps D', s: 'rect', x: 62, y: 108, w: 22, h: 42, rx: 6 },
  { id: 'genou_g', label: 'Genou G', s: 'rect', x: 36, y: 150, w: 22, h: 18, rx: 6 },
  { id: 'genou_d', label: 'Genou D', s: 'rect', x: 62, y: 150, w: 22, h: 18, rx: 6 },
  { id: 'tibia_g', label: 'Tibia / Périosté G', s: 'rect', x: 38, y: 168, w: 17, h: 36, rx: 5 },
  { id: 'tibia_d', label: 'Tibia / Périosté D', s: 'rect', x: 65, y: 168, w: 17, h: 36, rx: 5 },
  { id: 'cheville_g', label: 'Cheville G', s: 'rect', x: 40, y: 204, w: 14, h: 14, rx: 5 },
  { id: 'cheville_d', label: 'Cheville D', s: 'rect', x: 66, y: 204, w: 14, h: 14, rx: 5 },
  { id: 'pied_g', label: 'Pied / Fascia G', s: 'ellipse', cx: 46, cy: 228, rx: 16, ry: 9 },
  { id: 'pied_d', label: 'Pied / Fascia D', s: 'ellipse', cx: 74, cy: 228, rx: 16, ry: 9 },
]

const BACK_ZONES = [
  { id: 'haut_dos', label: 'Haut dos / Trapèzes', s: 'rect', x: 44, y: 36, w: 32, h: 28, rx: 6 },
  { id: 'lombaires', label: 'Lombaires', s: 'rect', x: 46, y: 64, w: 28, h: 24, rx: 5 },
  { id: 'fesse_g', label: 'Fessier G', s: 'rect', x: 36, y: 88, w: 22, h: 25, rx: 6 },
  { id: 'fesse_d', label: 'Fessier D', s: 'rect', x: 62, y: 88, w: 22, h: 25, rx: 6 },
  { id: 'ischio_g', label: 'Ischio G', s: 'rect', x: 36, y: 113, w: 22, h: 42, rx: 6 },
  { id: 'ischio_d', label: 'Ischio D', s: 'rect', x: 62, y: 113, w: 22, h: 42, rx: 6 },
  { id: 'mollet_g', label: 'Mollet G', s: 'rect', x: 38, y: 156, w: 17, h: 40, rx: 5 },
  { id: 'mollet_d', label: 'Mollet D', s: 'rect', x: 65, y: 156, w: 17, h: 40, rx: 5 },
  { id: 'achille_g', label: "Achille G", s: 'rect', x: 40, y: 196, w: 13, h: 22, rx: 5 },
  { id: 'achille_d', label: "Achille D", s: 'rect', x: 67, y: 196, w: 13, h: 22, rx: 5 },
  { id: 'talon_g', label: 'Talon G', s: 'ellipse', cx: 46, cy: 228, rx: 14, ry: 9 },
  { id: 'talon_d', label: 'Talon D', s: 'ellipse', cx: 74, cy: 228, rx: 14, ry: 9 },
]

function ZoneShape({ zone, level, onClick, hovered, onHover }) {
  const fill = PAIN_COLORS[level]
  const stroke = PAIN_STROKE[level]
  const baseOpacity = level === 0 ? 0.35 : 0.85
  const opacity = hovered ? Math.min(1, baseOpacity + 0.2) : baseOpacity
  const common = {
    fill, stroke, strokeWidth: level > 0 ? 1.5 : 1,
    opacity,
    style: { cursor: 'pointer', transition: 'all 0.15s ease' },
    onClick: () => onClick(zone.id),
    onMouseEnter: () => onHover(zone.id),
    onMouseLeave: () => onHover(null),
  }
  if (zone.s === 'circle') return <circle cx={zone.cx} cy={zone.cy} r={zone.r} {...common}><title>{zone.label}{level > 0 ? ` — ${PAIN_LABELS[level]}` : ''}</title></circle>
  if (zone.s === 'ellipse') return <ellipse cx={zone.cx} cy={zone.cy} rx={zone.rx} ry={zone.ry} {...common}><title>{zone.label}{level > 0 ? ` — ${PAIN_LABELS[level]}` : ''}</title></ellipse>
  return <rect x={zone.x} y={zone.y} width={zone.w} height={zone.h} rx={zone.rx || 0} {...common}><title>{zone.label}{level > 0 ? ` — ${PAIN_LABELS[level]}` : ''}</title></rect>
}

// Simple body silhouette background paths
function BodySilhouette({ view }) {
  const bodyColor = '#1C2537'
  const strokeColor = '#374151'
  if (view === 'front') return (
    <g opacity={0.5}>
      {/* Head */}
      <circle cx={60} cy={20} r={18} fill={bodyColor} stroke={strokeColor} strokeWidth={1} />
      {/* Neck */}
      <rect x={54} y={36} width={12} height={10} rx={3} fill={bodyColor} stroke={strokeColor} strokeWidth={1} />
      {/* Torso */}
      <path d="M40 44 Q30 50 28 90 L36 110 L84 110 L92 90 Q90 50 80 44 Z" fill={bodyColor} stroke={strokeColor} strokeWidth={1} />
      {/* Left arm */}
      <path d="M28 56 Q16 70 18 115 Q22 120 30 115 Q28 75 38 62 Z" fill={bodyColor} stroke={strokeColor} strokeWidth={1} />
      {/* Right arm */}
      <path d="M92 56 Q104 70 102 115 Q98 120 90 115 Q92 75 82 62 Z" fill={bodyColor} stroke={strokeColor} strokeWidth={1} />
      {/* Left leg */}
      <path d="M36 108 Q30 150 34 240 L58 240 L58 108 Z" fill={bodyColor} stroke={strokeColor} strokeWidth={1} />
      {/* Right leg */}
      <path d="M62 108 Q62 108 62 108 L86 108 L86 240 L62 240 Q66 150 62 108 Z" fill={bodyColor} stroke={strokeColor} strokeWidth={1} />
    </g>
  )
  return (
    <g opacity={0.5}>
      <circle cx={60} cy={20} r={18} fill={bodyColor} stroke={strokeColor} strokeWidth={1} />
      <rect x={54} y={36} width={12} height={10} rx={3} fill={bodyColor} stroke={strokeColor} strokeWidth={1} />
      <path d="M40 44 Q30 50 28 90 L36 110 L84 110 L92 90 Q90 50 80 44 Z" fill={bodyColor} stroke={strokeColor} strokeWidth={1} />
      <path d="M28 56 Q16 70 18 115 Q22 120 30 115 Q28 75 38 62 Z" fill={bodyColor} stroke={strokeColor} strokeWidth={1} />
      <path d="M92 56 Q104 70 102 115 Q98 120 90 115 Q92 75 82 62 Z" fill={bodyColor} stroke={strokeColor} strokeWidth={1} />
      <path d="M36 108 Q30 150 34 240 L58 240 L58 108 Z" fill={bodyColor} stroke={strokeColor} strokeWidth={1} />
      <path d="M62 108 Q62 108 62 108 L86 108 L86 240 L62 240 Q66 150 62 108 Z" fill={bodyColor} stroke={strokeColor} strokeWidth={1} />
    </g>
  )
}

export default function BodyDiagram({ value = [], onChange, readOnly = false }) {
  const [hovered, setHovered] = useState(null)
  const [view, setView] = useState('front') // 'front' | 'back'

  // Convert array to map: zone → level
  const painMap = {}
  for (const { zone, level } of (value || [])) { painMap[zone] = level }

  const handleClick = (zoneId) => {
    if (readOnly) return
    const current = painMap[zoneId] || 0
    const next = (current + 1) % 4 // 0 → 1 → 2 → 3 → 0
    const updated = (value || []).filter(z => z.zone !== zoneId)
    if (next > 0) updated.push({ zone: zoneId, level: next })
    onChange(updated)
  }

  const zones = view === 'front' ? FRONT_ZONES : BACK_ZONES
  const activePain = (value || []).filter(z => z.level > 0)

  return (
    <div className="space-y-2">
      {/* View toggle */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">Clique pour indiquer une douleur (1 clic = léger, 2 = modéré, 3 = fort, 4 = effacer)</span>
        <div className="flex bg-dark-700 rounded-lg p-0.5">
          <button type="button" onClick={() => setView('front')}
            className={`text-xs px-3 py-1 rounded-md transition-colors ${view === 'front' ? 'bg-dark-500 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
            Face
          </button>
          <button type="button" onClick={() => setView('back')}
            className={`text-xs px-3 py-1 rounded-md transition-colors ${view === 'back' ? 'bg-dark-500 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
            Dos
          </button>
        </div>
      </div>

      {/* SVG body */}
      <div className="flex justify-center">
        <svg viewBox="0 0 120 245" width="160" height="327" className="select-none">
          <BodySilhouette view={view} />
          {zones.map(zone => (
            <ZoneShape
              key={zone.id}
              zone={zone}
              level={painMap[zone.id] || 0}
              onClick={handleClick}
              hovered={hovered === zone.id}
              onHover={readOnly ? () => {} : setHovered}
            />
          ))}
          {/* Hover label */}
          {hovered && (
            <text x={60} y={242} textAnchor="middle" fontSize={7} fill="#9CA3AF">
              {zones.find(z => z.id === hovered)?.label}
              {painMap[hovered] > 0 ? ` — ${PAIN_LABELS[painMap[hovered]]}` : ''}
            </text>
          )}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-3">
        {[1, 2, 3].map(level => (
          <div key={level} className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: PAIN_COLORS[level] }} />
            <span className="text-xs text-gray-500">{PAIN_LABELS[level]}</span>
          </div>
        ))}
      </div>

      {/* Active pain summary */}
      {activePain.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {activePain.map(({ zone, level }) => {
            const allZones = [...FRONT_ZONES, ...BACK_ZONES]
            const zoneObj = allZones.find(z => z.id === zone)
            return (
              <span key={zone} className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1"
                style={{ backgroundColor: PAIN_COLORS[level] + '30', color: PAIN_COLORS[level], border: `1px solid ${PAIN_COLORS[level]}50` }}>
                {zoneObj?.label || zone}
                {!readOnly && (
                  <button type="button" onClick={() => handleClick(zone)} className="ml-0.5 opacity-70 hover:opacity-100">
                    ×
                  </button>
                )}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
