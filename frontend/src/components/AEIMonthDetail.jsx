import React, { useState, useEffect, useMemo } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer, Cell,
} from 'recharts'
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { api } from '../api'
import { format, startOfMonth, endOfMonth, subMonths, addMonths, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'

function aeiColor(v) {
  if (!v) return '#4B5563'
  if (v >= 8.3) return '#1D9E75'
  if (v >= 7.5) return '#378ADD'
  if (v >= 7.0) return '#EF9F27'
  return '#E24B4A'
}

function aeiLabel(v) {
  if (!v) return '—'
  if (v >= 8.3) return 'Pic de forme'
  if (v >= 7.5) return 'Bonne forme'
  if (v >= 7.0) return 'Forme correcte'
  return 'Fatigue / sous-forme'
}

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  const color = aeiColor(d.aei)
  return (
    <div className="card-sm text-xs min-w-[160px]">
      <p className="font-bold text-white mb-1">{d.date}</p>
      <p style={{ color }} className="font-bold text-base">AEI {d.aei}</p>
      <p style={{ color }} className="mb-1">{aeiLabel(d.aei)}</p>
      {d.distance_km && <p className="text-brand-blue">{d.distance_km} km</p>}
      {d.dplus_m > 0 && <p className="text-brand-purple">D+ {d.dplus_m} m</p>}
      {d.fc_moy && <p className="text-red-400">FC moy {d.fc_moy} bpm</p>}
      {d.session_type && <p className="text-gray-400">{d.session_type}</p>}
      {d.rolling && <p className="text-gray-500 mt-1 border-t border-dark-500 pt-1">Moy glissante : {d.rolling}</p>}
    </div>
  )
}

export default function AEIMonthDetail() {
  const [month, setMonth] = useState(new Date())
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const from = format(startOfMonth(month), 'yyyy-MM-dd')
    const to = format(endOfMonth(month), 'yyyy-MM-dd')
    api.getAEIDaily(from, to).then(d => {
      setData(d)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [month])

  const stats = useMemo(() => {
    if (!data.length) return null
    const vals = data.map(d => d.aei)
    const avg = Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 100) / 100
    const max = Math.max(...vals)
    const min = Math.min(...vals)
    const best = data.find(d => d.aei === max)
    // Trend: compare first half vs second half
    const mid = Math.floor(data.length / 2)
    const firstHalf = data.slice(0, mid).map(d => d.aei)
    const secondHalf = data.slice(mid).map(d => d.aei)
    const avgFirst = firstHalf.length ? firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length : 0
    const avgSecond = secondHalf.length ? secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length : 0
    const trend = avgSecond - avgFirst
    const peakCount = vals.filter(v => v >= 8.3).length
    const goodCount = vals.filter(v => v >= 7.5 && v < 8.3).length
    return { avg, max, min, best, trend, peakCount, goodCount, count: vals.length }
  }, [data])

  const isCurrentMonth = format(month, 'yyyy-MM') === format(new Date(), 'yyyy-MM')

  // Compute Y domain with margin
  const yMin = data.length ? Math.max(5.5, Math.floor(Math.min(...data.map(d => d.aei)) * 2) / 2 - 0.5) : 6
  const yMax = data.length ? Math.min(10, Math.ceil(Math.max(...data.map(d => d.aei)) * 2) / 2 + 0.5) : 10

  // X tick: just show day number
  const tickFormatter = (v) => {
    try { return format(parseISO(v), 'd') } catch { return v }
  }

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setMonth(m => subMonths(m, 1))}
          className="p-1 rounded hover:bg-dark-600 text-gray-400 hover:text-white transition-colors">
          <ChevronLeft size={16} />
        </button>
        <div className="text-center">
          <h3 className="text-sm font-semibold capitalize">
            {format(month, 'MMMM yyyy', { locale: fr })}
            {isCurrentMonth && <span className="ml-2 text-xs text-brand-green">· mois en cours</span>}
          </h3>
          <p className="text-xs text-gray-500">AEI — Aerobic Efficiency Index</p>
        </div>
        <button onClick={() => setMonth(m => addMonths(m, 1))} disabled={isCurrentMonth}
          className="p-1 rounded hover:bg-dark-600 text-gray-400 hover:text-white transition-colors disabled:opacity-30">
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-4 gap-2 mb-4">
          <div className="text-center p-2 rounded-lg bg-dark-700/60">
            <div className="text-xs text-gray-500 mb-0.5">Moyenne</div>
            <div className="text-lg font-black" style={{ color: aeiColor(stats.avg) }}>{stats.avg}</div>
            <div className="text-xs" style={{ color: aeiColor(stats.avg) }}>{aeiLabel(stats.avg)}</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-dark-700/60">
            <div className="text-xs text-gray-500 mb-0.5">Meilleure</div>
            <div className="text-lg font-black text-brand-green">{stats.max}</div>
            <div className="text-xs text-gray-500">{stats.best?.date?.slice(8)} {stats.best?.date?.slice(5,7) ? format(parseISO(stats.best.date), 'dd MMM', { locale: fr }) : ''}</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-dark-700/60">
            <div className="text-xs text-gray-500 mb-0.5">Séances</div>
            <div className="text-lg font-black text-white">{stats.count}</div>
            <div className="text-xs text-brand-green">{stats.peakCount}× pic</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-dark-700/60">
            <div className="text-xs text-gray-500 mb-0.5">Tendance</div>
            <div className="flex items-center justify-center gap-1">
              {stats.trend > 0.15
                ? <TrendingUp size={18} className="text-brand-green" />
                : stats.trend < -0.15
                  ? <TrendingDown size={18} className="text-red-400" />
                  : <Minus size={18} className="text-gray-400" />}
              <span className="text-sm font-bold" style={{ color: stats.trend > 0.15 ? '#1D9E75' : stats.trend < -0.15 ? '#E24B4A' : '#9CA3AF' }}>
                {stats.trend > 0 ? '+' : ''}{Math.round(stats.trend * 100) / 100}
              </span>
            </div>
            <div className="text-xs text-gray-500">vs déb. mois</div>
          </div>
        </div>
      )}

      {/* Chart */}
      {loading ? (
        <div className="flex items-center justify-center h-48 text-gray-500 text-sm">Chargement…</div>
      ) : data.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-gray-500 text-sm">
          Aucune séance avec données AEI ce mois
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2E3749" />
            <XAxis
              dataKey="date"
              tick={{ fill: '#6B7280', fontSize: 10 }}
              tickFormatter={tickFormatter}
              interval={data.length > 15 ? 2 : 0}
            />
            <YAxis domain={[yMin, yMax]} tick={{ fill: '#6B7280', fontSize: 10 }} />
            <Tooltip content={<CustomTooltip />} />

            {/* Zones */}
            <ReferenceLine y={8.3} stroke="#1D9E75" strokeDasharray="4 2" strokeWidth={1.5}
              label={{ value: '8.3', position: 'right', fill: '#1D9E75', fontSize: 9 }} />
            <ReferenceLine y={7.5} stroke="#EF9F27" strokeDasharray="4 2" strokeWidth={1}
              label={{ value: '7.5', position: 'right', fill: '#EF9F27', fontSize: 9 }} />

            {/* Average line */}
            {stats && (
              <ReferenceLine y={stats.avg} stroke="#7F77DD" strokeDasharray="2 3" strokeWidth={1}
                label={{ value: `moy ${stats.avg}`, position: 'left', fill: '#7F77DD', fontSize: 9 }} />
            )}

            {/* Bars colored per AEI level */}
            <Bar dataKey="aei" radius={[3, 3, 0, 0]} maxBarSize={28}>
              {data.map((entry, i) => (
                <Cell key={i} fill={aeiColor(entry.aei)} fillOpacity={0.75} />
              ))}
            </Bar>

            {/* Rolling average line */}
            <Line
              type="monotone"
              dataKey="rolling"
              stroke="#7F77DD"
              strokeWidth={2}
              dot={false}
              name="Moy glissante"
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block bg-[#1D9E75]" />Pic ≥8.3</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block bg-[#378ADD]" />Bon 7.5–8.3</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block bg-[#EF9F27]" />Correct 7–7.5</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block bg-[#E24B4A]" />&lt;7 Fatigue</span>
        <span className="flex items-center gap-1">
          <span className="w-4 border-t-2 border-[#7F77DD] inline-block mt-0.5" />Moy glissante 5 séances
        </span>
      </div>
    </div>
  )
}
