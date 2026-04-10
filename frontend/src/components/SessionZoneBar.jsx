/**
 * SessionZoneBar — compact visual HR/pace indicator for a training session.
 *
 * Shows:
 *  - A 5-segment color bar (Z1→Z5), target zone(s) fully lit, others dimmed
 *  - BPM range of the target zone(s)
 *  - Flat-equivalent pace range — only if terrain is not too hilly
 *    (dplus_m / km < TRAIL_THRESHOLD → pace shown, else "piloter à la FC")
 */
import React from 'react'
import { useZones } from '../hooks/useZones'

const TRAIL_THRESHOLD = 15 // m D+ per km above which pace is not shown

const ZONE_CFG = [
  { key: 'Z1', color: '#378ADD', label: 'Z1' },
  { key: 'Z2', color: '#1D9E75', label: 'Z2' },
  { key: 'Z3', color: '#EF9F27', label: 'Z3' },
  { key: 'Z4', color: '#E24B4A', label: 'Z4' },
  { key: 'Z5', color: '#7F77DD', label: 'Z5' },
]

function fmtPace(minPerKm) {
  if (!minPerKm) return null
  const m = Math.floor(minPerKm)
  const s = Math.round((minPerKm - m) * 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Parse a zone string like "Z2", "Z1-Z2", "Z2-Z4", "Z1→Z3" into [loIdx, hiIdx] */
function parseZoneRange(zoneStr) {
  if (!zoneStr) return null
  const norm = zoneStr.replace('→', '-').replace('Z', '').split('-')
  const lo = parseInt(norm[0]) - 1            // 0-indexed
  const hi = parseInt(norm[norm.length - 1]) - 1
  if (isNaN(lo) || isNaN(hi)) return null
  return [Math.max(0, lo), Math.min(4, hi)]
}

export default function SessionZoneBar({ zone, fc_max, fc_min, dplus_m, km, compact = false }) {
  const data = useZones()

  // Determine active zone range
  const range = parseZoneRange(zone)
  if (!range && !fc_max) return null   // nothing to show

  // Infer zone from fc_max if zone not set
  let activeRange = range
  if (!activeRange && fc_max && data?.zones) {
    const idx = ZONE_CFG.findIndex((_, i) => {
      const z = data.zones[`Z${i + 1}`]
      return z && fc_max <= z.bpm_max
    })
    if (idx >= 0) activeRange = [idx, idx]
  }

  if (!activeRange) return null

  const [loIdx, hiIdx] = activeRange

  // BPM range
  let bpmMin = null, bpmMax = null
  if (data?.zones) {
    bpmMin = data.zones[`Z${loIdx + 1}`]?.bpm_min
    bpmMax = data.zones[`Z${hiIdx + 1}`]?.bpm_max
  } else if (fc_min || fc_max) {
    bpmMin = fc_min || null
    bpmMax = fc_max || null
  }

  // Pace range — only for relatively flat terrain
  const isTrail = dplus_m && km && (dplus_m / km) >= TRAIL_THRESHOLD
  let paceMin = null, paceMax = null
  if (!isTrail && data?.zones) {
    const zLo = data.zones[`Z${loIdx + 1}`]
    const zHi = data.zones[`Z${hiIdx + 1}`]
    // Use fastest pace of high zone, slowest pace of low zone
    paceMin = zHi?.pace_min ?? zLo?.pace_min
    paceMax = zLo?.pace_max ?? zHi?.pace_max
  }

  const loColor = ZONE_CFG[loIdx]?.color || '#4B5563'
  const hiColor = ZONE_CFG[hiIdx]?.color || loColor

  // Gradient color for multi-zone
  const barColor = loIdx === hiIdx
    ? loColor
    : `linear-gradient(90deg, ${loColor}, ${hiColor})`

  return (
    <div className={compact ? 'mt-1.5' : 'mt-2'}>
      {/* Mini 5-segment zone strip */}
      <div className="flex gap-px h-[5px] rounded-sm overflow-hidden mb-1.5">
        {ZONE_CFG.map((z, i) => {
          const active = i >= loIdx && i <= hiIdx
          return (
            <div
              key={z.key}
              className="flex-1 transition-opacity"
              style={{
                backgroundColor: z.color,
                opacity: active ? 1 : 0.15,
              }}
            />
          )
        })}
      </div>

      {/* Zone label + BPM + pace */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Zone pill */}
        <span
          className="text-xs font-bold px-1.5 py-0.5 rounded"
          style={{
            background: loIdx === hiIdx ? loColor + '22' : `${loColor}22`,
            color: loColor,
          }}
        >
          {zone || `Z${loIdx + 1}`}
        </span>

        {/* BPM */}
        {bpmMin && bpmMax && (
          <span className="text-xs font-mono text-gray-400">
            ♥ {bpmMin}–{bpmMax}
          </span>
        )}
        {bpmMax && !bpmMin && (
          <span className="text-xs font-mono text-gray-400">
            ♥ &lt;{bpmMax}
          </span>
        )}

        {/* Pace or trail note */}
        {!isTrail && paceMin && paceMax ? (
          <span className="text-xs font-mono text-gray-600">
            · {fmtPace(paceMin)}–{fmtPace(paceMax)} /km
            {data?.zones?.[`Z${loIdx + 1}`]?.pace_source === 'extrapolated' && (
              <span className="text-gray-700"> ~</span>
            )}
          </span>
        ) : isTrail ? (
          <span className="text-xs text-gray-700 italic">· piloter à la FC</span>
        ) : null}
      </div>
    </div>
  )
}
