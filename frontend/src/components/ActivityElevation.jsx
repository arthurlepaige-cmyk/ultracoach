import React from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Mountain } from 'lucide-react'

export default function ActivityElevation({ data }) {
  if (!data?.points?.length) return null

  const { points, stats } = data
  const minEle = Math.min(...points.map(p => p.e))
  const maxEle = Math.max(...points.map(p => p.e))
  const padding = Math.max(20, (maxEle - minEle) * 0.1)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400 flex items-center gap-1">
          <Mountain size={12} className="text-brand-green" /> Profil altimétrique
        </span>
        <div className="flex gap-3 text-xs text-gray-400">
          <span>{stats.dist_km} km</span>
          <span className="text-orange-400">↑ {stats.dplus} m</span>
          <span className="text-brand-blue">↓ {stats.dminus} m</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={100}>
        <AreaChart data={points} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="elevGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#1D9E75" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#1D9E75" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <XAxis dataKey="d" hide />
          <YAxis domain={[minEle - padding, maxEle + padding]} hide />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              return (
                <div className="bg-dark-800 border border-dark-600 rounded px-2 py-1 text-xs">
                  <span className="text-gray-400">{payload[0].payload.d} km · </span>
                  <span className="text-white font-medium">{payload[0].payload.e} m</span>
                </div>
              )
            }}
          />
          <Area type="monotone" dataKey="e" stroke="#1D9E75" strokeWidth={1.5}
            fill="url(#elevGrad)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
