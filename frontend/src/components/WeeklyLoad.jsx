import React from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer
} from 'recharts'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="card-sm text-xs min-w-[130px]">
      <p className="text-gray-400 mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.fill }}>
          {p.name}: <span className="font-bold">{p.value}{p.name === 'km' ? ' km' : ' m D+'}</span>
        </p>
      ))}
    </div>
  )
}

export default function WeeklyLoad({ data }) {
  if (!data || data.length === 0) return (
    <div className="flex items-center justify-center h-48 text-gray-500 text-sm">Chargement...</div>
  )

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2E3749" />
        <XAxis dataKey="label" tick={{ fill: '#6B7280', fontSize: 10 }} />
        <YAxis yAxisId="km" tick={{ fill: '#6B7280', fontSize: 10 }} />
        <YAxis yAxisId="dplus" orientation="right" tick={{ fill: '#6B7280', fontSize: 10 }} />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: '11px', color: '#9CA3AF' }}
          iconType="rect"
          iconSize={8}
        />
        <Bar yAxisId="km" dataKey="km" name="km" fill="#378ADD" radius={[3, 3, 0, 0]} />
        <Bar yAxisId="dplus" dataKey="dplus" name="D+" fill="#7F77DD" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
