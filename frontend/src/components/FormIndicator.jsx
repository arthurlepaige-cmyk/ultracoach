import React from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

const STATUS_CONFIG = {
  OPTIMAL: { color: '#1D9E75', bg: 'bg-green-500/10', border: 'border-green-500/30', icon: TrendingUp },
  VIGILANCE: { color: '#EF9F27', bg: 'bg-orange-500/10', border: 'border-orange-500/30', icon: Minus },
  REPOS: { color: '#E24B4A', bg: 'bg-red-500/10', border: 'border-red-500/30', icon: TrendingDown },
}

export default function FormIndicator({ status }) {
  if (!status) return null
  const config = STATUS_CONFIG[status.status] || STATUS_CONFIG.OPTIMAL
  const Icon = config.icon

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border ${config.bg} ${config.border}`}>
      <Icon size={14} style={{ color: config.color }} />
      <span className="text-sm font-bold" style={{ color: config.color }}>
        {status.status}
      </span>
    </div>
  )
}

export function FCAlert({ fc_repos }) {
  if (!fc_repos) return null

  let color = '#1D9E75'
  let label = 'EXCELLENT'
  let bg = 'bg-green-500/10'
  let border = 'border-green-500/30'

  if (fc_repos >= 56) {
    color = '#E24B4A'; label = 'REPORTER'; bg = 'bg-red-500/10'; border = 'border-red-500/30'
  } else if (fc_repos >= 53) {
    color = '#EF9F27'; label = 'VIGILANCE'; bg = 'bg-orange-500/10'; border = 'border-orange-500/30'
  }

  return (
    <div className={`flex items-center gap-2 px-2 py-1 rounded border ${bg} ${border}`}>
      <span className="w-2 h-2 rounded-full animate-pulse-slow" style={{ backgroundColor: color }} />
      <span className="text-sm font-mono font-bold" style={{ color }}>{fc_repos} bpm</span>
      <span className="text-xs" style={{ color }}>{label}</span>
    </div>
  )
}
