import React from 'react'
import { differenceInDays, parseISO, format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Flag } from 'lucide-react'

export default function RaceCountdown({ race, color = '#1D9E75' }) {
  if (!race) return null

  const today = new Date()
  const raceDate = parseISO(race.date)
  const days = differenceInDays(raceDate, today)
  // Progress: from 6 months before the race to race day
  const startRef = new Date(raceDate)
  startRef.setMonth(startRef.getMonth() - 6)
  const totalDays = differenceInDays(raceDate, startRef)
  const elapsed = differenceInDays(today, startRef)
  const progress = Math.max(0, Math.min(100, (elapsed / totalDays) * 100))

  const isPast = days < 0

  return (
    <div className="card">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Flag size={14} style={{ color }} />
            <span className="text-xs text-gray-400 uppercase tracking-wide">{race.name}</span>
          </div>
          <div className="text-2xl font-bold" style={{ color }}>
            {isPast ? 'Terminée' : `J-${days}`}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            {format(raceDate, 'dd MMM yyyy', { locale: fr })} · {race.distance_km}km / {race.dplus_m}m D+
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500">Départ</div>
          <div className="text-sm font-medium">{race.start_time || '00:00'}</div>
        </div>
      </div>

      {!isPast && (
        <div>
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Progression</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-1.5 bg-dark-500 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progress}%`, backgroundColor: color }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
