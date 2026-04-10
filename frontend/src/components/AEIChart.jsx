import React from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="card-sm text-xs min-w-[120px]">
      <p className="text-gray-400 mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <span className="font-bold">{p.value}</span>
        </p>
      ))}
    </div>
  )
}

export default function AEIChart({ data, races = [], daily = false }) {
  if (!data || data.length === 0) return (
    <div className="flex items-center justify-center h-48 text-gray-500 text-sm">
      Chargement...
    </div>
  )

  const peaks = [
    { month: '2024-10', month2: '2024-11' },
    { month: '2026-01', month2: '2026-02' },
  ]

  const enriched = data.map(d => {
    const key = daily ? d.date : d.month
    const isPeak = !daily && peaks.some(p => key >= p.month && key <= p.month2)
    return { ...d, _key: key, isPeak }
  })

  // X-axis tick formatter
  const tickFmt = (v) => {
    if (!v) return ''
    if (daily) {
      // YYYY-MM-DD → DD/MM
      const parts = v.split('-')
      return `${parts[2]}/${parts[1]}`
    }
    const [y, m] = v.split('-')
    return `${m}/${y.slice(2)}`
  }

  // Auto interval based on data size
  const interval = data.length <= 10 ? 0 : data.length <= 20 ? 1 : data.length <= 40 ? 2 : Math.floor(data.length / 12)

  // dataKey: daily uses 'rolling' (5-session avg) with 'aei' as dots; monthly uses 'aei'
  const mainKey = daily ? 'rolling' : 'aei'

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={enriched} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
        <defs>
          <linearGradient id="aeiGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#1D9E75" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#1D9E75" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#2E3749" />
        <XAxis
          dataKey="_key"
          tick={{ fill: '#6B7280', fontSize: 10 }}
          tickFormatter={tickFmt}
          interval={interval}
        />
        <YAxis domain={[6.5, 9.5]} tick={{ fill: '#6B7280', fontSize: 10 }} />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine y={8.3} stroke="#1D9E75" strokeDasharray="4 2" strokeWidth={1.5}
          label={{ value: 'Pic', position: 'left', fill: '#1D9E75', fontSize: 10 }} />
        <ReferenceLine y={7.5} stroke="#EF9F27" strokeDasharray="4 2" strokeWidth={1}
          label={{ value: 'Seuil', position: 'left', fill: '#EF9F27', fontSize: 10 }} />

        {/* Daily mode: show individual session dots */}
        {daily && (
          <Area type="monotone" dataKey="aei" stroke="none" fill="none"
            dot={(props) => {
              const { cx, cy, payload } = props
              if (!payload.aei) return null
              const color = payload.aei >= 8.3 ? '#1D9E75' : payload.aei >= 7.5 ? '#378ADD' : '#EF9F27'
              return <circle key={`s-${cx}`} cx={cx} cy={cy} r={3} fill={color} fillOpacity={0.7} stroke="none" />
            }}
            name="Séance"
          />
        )}

        <Area
          type="monotone"
          dataKey={mainKey}
          stroke="#1D9E75"
          strokeWidth={2}
          fill="url(#aeiGrad)"
          dot={!daily ? (props) => {
            const { cx, cy, payload } = props
            return payload.isPeak
              ? <circle key={`dot-${cx}`} cx={cx} cy={cy} r={3} fill="#1D9E75" stroke="none" />
              : null
          } : false}
          name="AEI"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
