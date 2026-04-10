import React, { useState, useEffect } from 'react'
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea,
  ScatterChart, Scatter, Legend, ComposedChart, Bar, BarChart,
  PieChart, Pie, Cell
} from 'recharts'
import { useApi } from '../hooks/useApi'
import { api } from '../api'
import { BarChart2, TrendingUp, Mountain, Activity } from 'lucide-react'
import AEIChart from '../components/AEIChart'
import AEIMonthDetail from '../components/AEIMonthDetail'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="card-sm text-xs min-w-[140px]">
      <p className="text-gray-400 mb-1 font-medium">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color || p.fill }}>
          {p.name}: <span className="font-bold">{typeof p.value === 'number' ? p.value.toFixed ? p.value.toFixed(1) : p.value : p.value}</span>
        </p>
      ))}
    </div>
  )
}

export default function Analytics() {
  const [activeTab, setActiveTab] = useState('aei')

  const { data: aeiData } = useApi(() => api.getAEIMonthly())
  const twoYearsAgo = new Date(Date.now() - 2 * 365 * 86400000).toISOString().split('T')[0]
  const { data: atlCtl } = useApi(() => api.getATLCTL(twoYearsAgo))
  const { data: endurance } = useApi(() => api.getEnduranceScore())
  const { data: hillScore } = useApi(() => api.getHillScore())
  const { data: races } = useApi(() => api.getRaces())
  const { data: garmin } = useApi(() => api.getGarminRuns(twoYearsAgo))
  const { data: strengthScore } = useApi(() => api.getStrengthScore())
  const { data: vo2maxData } = useApi(() => api.getVO2maxTrend())

  const [polarization, setPolarization] = useState(null)
  const [painTimeline, setPainTimeline] = useState(null)
  const [correlations, setCorrelations] = useState(null)

  useEffect(() => {
    api.getPolarization(12).then(setPolarization).catch(() => {})
    api.getPainTimeline(60).then(setPainTimeline).catch(() => {})
    api.getCorrelations().then(setCorrelations).catch(() => {})
  }, [])

  const tabs = [
    { key: 'aei', label: 'AEI', icon: TrendingUp },
    { key: 'load', label: 'Charge', icon: Activity },
    { key: 'scores', label: 'Scores', icon: Mountain },
    { key: 'races', label: 'Courses', icon: BarChart2 },
    { key: 'sante', label: 'Santé', icon: Activity },
  ]

  // Merge ATL/CTL with date labels
  const atlCtlChart = (atlCtl || [])
    .filter((_, i) => i % 3 === 0) // sample every 3 days for perf
    .map(d => ({
      date: d.date?.slice(0, 7),
      atl: d.atl,
      ctl: d.ctl,
      acwr: d.acwr ? Math.round(d.acwr * 100) / 100 : null
    }))

  // VO2max trend from garmin + dynamic current value
  const vo2Chart = ((vo2maxData?.series || garmin || []))
    .filter(r => r.vo2max && r.vo2max > 0)
    .filter((_, i) => i % 5 === 0)
    .map(r => ({ date: r.date?.slice(0, 7), vo2max: r.vo2max }))

  // Races for table
  const sortedRaces = [...(races || [])].sort((a, b) => new Date(b.date) - new Date(a.date))

  return (
    <div className="space-y-6 pb-20 md:pb-6">
      <h1 className="text-xl font-bold">Analyses</h1>

      {/* Tabs */}
      <div className="flex gap-1 bg-dark-800 p-1 rounded-lg">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              activeTab === key
                ? 'bg-dark-600 text-white'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <Icon size={14} />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* AEI Tab */}
      {activeTab === 'aei' && (
        <div className="space-y-4">
          <AEIMonthDetail />

          <div className="card">
            <h3 className="text-sm font-semibold mb-1">AEI historique — vue mensuelle</h3>
            <p className="text-xs text-gray-400 mb-3">Vert &gt;8.3 = pic de forme · Seuil orange 7.5</p>
            <AEIChart data={aeiData} />
          </div>

          {/* VO2max trend */}
          <div className="card">
            <h3 className="text-sm font-semibold mb-3">VO2max — tendance
              {vo2maxData?.current_dynamic && (
                <span className="ml-2 text-xs text-brand-purple font-normal">↻ {vo2maxData.current_dynamic} ml/kg/min (dynamique)</span>
              )}
            </h3>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={vo2Chart} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <defs>
                  <linearGradient id="vo2Grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#378ADD" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#378ADD" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2E3749" />
                <XAxis dataKey="date" tick={{ fill: '#6B7280', fontSize: 10 }} interval={3} />
                <YAxis domain={[50, 70]} tick={{ fill: '#6B7280', fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="vo2max" stroke="#378ADD" fill="url(#vo2Grad)" name="VO2max" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Charge Tab */}
      {activeTab === 'load' && (
        <div className="space-y-4">
          <div className="card">
            <h3 className="text-sm font-semibold mb-1">ATL / CTL — Charge d'entraînement</h3>
            <p className="text-xs text-gray-400 mb-3">Zone optimale ACWR: 0.8-1.1</p>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={atlCtlChart} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2E3749" />
                <XAxis dataKey="date" tick={{ fill: '#6B7280', fontSize: 9 }} interval={4} />
                <YAxis yAxisId="load" tick={{ fill: '#6B7280', fontSize: 10 }} />
                <YAxis yAxisId="acwr" orientation="right" domain={[0, 2]} tick={{ fill: '#6B7280', fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: '11px', color: '#9CA3AF' }} />
                <ReferenceArea yAxisId="acwr" y1={0.8} y2={1.1} fill="#1D9E75" fillOpacity={0.08} />
                <Line yAxisId="load" type="monotone" dataKey="atl" stroke="#E24B4A" dot={false} strokeWidth={1.5} name="ATL (fatigue)" />
                <Line yAxisId="load" type="monotone" dataKey="ctl" stroke="#378ADD" dot={false} strokeWidth={2} name="CTL (forme)" />
                <Line yAxisId="acwr" type="monotone" dataKey="acwr" stroke="#EF9F27" dot={false} strokeWidth={1} name="ACWR" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Scores Tab */}
      {activeTab === 'scores' && (
        <div className="space-y-4">
          {/* Current scores summary */}
          <div className="grid grid-cols-2 gap-3">
            {/* Endurance Score */}
            <div className="card text-center">
              <div className="text-xs text-gray-500 mb-1">Score endurance</div>
              <div className="text-2xl font-black text-brand-green">
                {endurance?.at(-1)?.es ? Math.round(endurance.at(-1).es / 100) : '—'}
                <span className="text-sm font-normal text-gray-500">/100</span>
              </div>
              {endurance?.at(-1)?.dynamic && <div className="text-xs text-brand-purple mt-0.5">↻ calculé</div>}
              <div className="text-xs text-gray-500 mt-0.5">Échelle Garmin 0–10000</div>
            </div>
            {/* VO2max */}
            <div className="card text-center">
              <div className="text-xs text-gray-500 mb-1">VO2max estimé</div>
              <div className="text-2xl font-black text-brand-blue">
                {vo2maxData?.current_dynamic || vo2maxData?.current_garmin || '—'}
                <span className="text-sm font-normal text-gray-500"> ml/kg/min</span>
              </div>
              {vo2maxData?.current_dynamic && (
                <div className="text-xs text-brand-purple mt-0.5">↻ dynamique</div>
              )}
              <div className="text-xs text-gray-500 mt-0.5">Garmin: {vo2maxData?.current_garmin}</div>
            </div>
            {/* Hill Score */}
            <div className="card">
              <div className="text-xs text-gray-500 mb-2">Score dénivelé</div>
              <div className="flex justify-around">
                {[
                  { label: 'Global', val: hillScore?.at(-1)?.hs_overall, color: '#378ADD' },
                  { label: 'Force', val: hillScore?.at(-1)?.hs_strength, color: '#E24B4A' },
                  { label: 'End.', val: hillScore?.at(-1)?.hs_endurance, color: '#1D9E75' }, // End. = abrév. française "Endurance"
                ].map(({ label, val, color }) => (
                  <div key={label} className="text-center">
                    <div className="text-lg font-black" style={{ color }}>{val ?? '—'}</div>
                    <div className="text-xs text-gray-500">{label}</div>
                  </div>
                ))}
              </div>
              {hillScore?.at(-1)?.dynamic && <div className="text-xs text-brand-purple mt-1 text-center">↻ calculé</div>}
            </div>
            {/* Strength Score */}
            <div className="card text-center">
              <div className="text-xs text-gray-500 mb-1">Score Renforcement</div>
              <div className="text-2xl font-black" style={{ color: (strengthScore?.score ?? 0) >= 75 ? '#1D9E75' : (strengthScore?.score ?? 0) >= 50 ? '#EF9F27' : '#E24B4A' }}>
                {strengthScore?.score ?? 0}
                <span className="text-sm font-normal text-gray-500">/100</span>
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {strengthScore?.sessions_28d ?? 0}/{strengthScore?.target ?? 8} séances · 28j
              </div>
            </div>
          </div>

          {/* Endurance Score chart */}
          <div className="card">
            <h3 className="text-sm font-semibold mb-3">Score endurance — historique</h3>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart
                data={(endurance || []).filter((_, i) => i % 7 === 0)}
                margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
              >
                <defs>
                  <linearGradient id="esGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1D9E75" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#1D9E75" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2E3749" />
                <XAxis dataKey="date" tick={{ fill: '#6B7280', fontSize: 9 }} interval={4} />
                <YAxis tick={{ fill: '#6B7280', fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="es" stroke="#1D9E75" fill="url(#esGrad)" name="ES" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Hill Score chart */}
          <div className="card">
            <h3 className="text-sm font-semibold mb-3">Score dénivelé — historique</h3>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart
                data={(hillScore || []).filter((_, i) => i % 7 === 0)}
                margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#2E3749" />
                <XAxis dataKey="date" tick={{ fill: '#6B7280', fontSize: 9 }} interval={4} />
                <YAxis tick={{ fill: '#6B7280', fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: '11px', color: '#9CA3AF' }} />
                <Line type="monotone" dataKey="hs_overall" stroke="#378ADD" dot={false} name="Global" />
                <Line type="monotone" dataKey="hs_strength" stroke="#E24B4A" dot={false} name="Force" />
                <Line type="monotone" dataKey="hs_endurance" stroke="#1D9E75" dot={false} name="Endurance" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Races Tab */}
      {activeTab === 'races' && (
        <div className="card">
          <h3 className="text-sm font-semibold mb-3">Historique des courses ({sortedRaces.length})</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400 border-b border-dark-600">
                  <th className="text-left py-2 pr-2">Date</th>
                  <th className="text-left py-2 pr-2">Course</th>
                  <th className="text-right py-2 pr-2">Dist</th>
                  <th className="text-right py-2 pr-2">D+</th>
                  <th className="text-right py-2 pr-2">Temps</th>
                  <th className="text-right py-2 pr-2">Rang</th>
                  <th className="text-right py-2">Betrail</th>
                </tr>
              </thead>
              <tbody>
                {sortedRaces.map((r, i) => (
                  <tr key={i} className={`border-b border-dark-600/40 last:border-0 ${!r.finished ? 'opacity-50' : ''}`}>
                    <td className="py-1.5 pr-2 text-gray-400">{r.date?.slice(0, 7)}</td>
                    <td className="py-1.5 pr-2 text-gray-200 max-w-[120px] truncate">{r.name}</td>
                    <td className="py-1.5 pr-2 text-right text-brand-blue">{r.dist}km</td>
                    <td className="py-1.5 pr-2 text-right text-brand-purple">{r.dplus}m</td>
                    <td className="py-1.5 pr-2 text-right font-mono text-gray-300">
                      {r.time_h ? `${Math.floor(r.time_h)}h${String(Math.round((r.time_h % 1) * 60)).padStart(2, '0')}` : '—'}
                    </td>
                    <td className="py-1.5 pr-2 text-right text-gray-400">
                      {r.rank_num && r.rank_tot ? `${r.rank_num}/${r.rank_tot}` : '—'}
                    </td>
                    <td className="py-1.5 text-right text-brand-orange">{r.itra || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Santé Tab */}
      {activeTab === 'sante' && (
        <div className="space-y-4">

          {/* Polarisation weekly */}
          {polarization?.weekly?.length > 0 && (
            <div className="card">
              <h3 className="text-sm font-semibold mb-1">Polarisation — répartition zones (12 semaines)</h3>
              <p className="text-xs text-gray-400 mb-3">
                Vert = facile (Z1-Z2) · Orange = zone grise (Z3) · Rouge = intensif (Z4-Z5) · Cible : 80% vert
              </p>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={polarization.weekly} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2E3749" vertical={false} />
                  <XAxis dataKey="week" tick={{ fill: '#6B7280', fontSize: 9 }}
                    tickFormatter={v => v?.slice(5)} />
                  <YAxis domain={[0, 100]} tick={{ fill: '#6B7280', fontSize: 10 }} unit="%" />
                  <Tooltip
                    formatter={(v, name) => [`${v}%`, name]}
                    contentStyle={{ backgroundColor: '#1A2235', border: '1px solid #2E3749', borderRadius: '8px', fontSize: '11px' }}
                  />
                  <Bar dataKey="easy_pct" stackId="a" fill="#1D9E75" name="Facile" radius={[0,0,0,0]} />
                  <Bar dataKey="moderate_pct" stackId="a" fill="#EF9F27" name="Zone grise" />
                  <Bar dataKey="hard_pct" stackId="a" fill="#E24B4A" name="Intensif" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
              {polarization.overall && (
                <div className="flex gap-4 mt-2 justify-center">
                  {[
                    { label: 'Facile', pct: polarization.overall.easy_pct, color: '#1D9E75' },
                    { label: 'Zone grise', pct: polarization.overall.moderate_pct, color: '#EF9F27' },
                    { label: 'Intensif', pct: polarization.overall.hard_pct, color: '#E24B4A' },
                  ].map(({ label, pct, color }) => (
                    <div key={label} className="text-center">
                      <div className="text-base font-black" style={{ color }}>{pct}%</div>
                      <div className="text-xs text-gray-500">{label}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Douleurs récurrentes */}
          {painTimeline?.summary?.length > 0 && (
            <div className="card">
              <h3 className="text-sm font-semibold mb-3">Zones douloureuses — 60 jours</h3>
              <div className="space-y-2">
                {painTimeline.summary.map(p => (
                  <div key={p.zone} className="flex items-center gap-3">
                    <span className="text-xs text-gray-300 w-32 shrink-0">{p.label}</span>
                    <div className="flex-1 h-2 bg-dark-500 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{
                        width: `${Math.min(100, p.count * 10)}%`,
                        backgroundColor: p.max_level >= 3 ? '#DC2626' : p.max_level >= 2 ? '#EA580C' : '#D97706'
                      }} />
                    </div>
                    <span className="text-xs text-gray-500 w-12 text-right">{p.count}× · niv.{p.max_level}</span>
                  </div>
                ))}
              </div>
              {painTimeline.timeline?.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs text-gray-500 mb-2">Chronologie :</p>
                  <div className="flex flex-wrap gap-1.5">
                    {painTimeline.timeline.slice(0, 20).map(t => (
                      <div key={t.date} className="text-xs px-2 py-0.5 rounded bg-dark-700/60 border border-dark-600/40">
                        <span className="text-gray-500">{t.date.slice(5)} </span>
                        {t.zones.map(z => (
                          <span key={z.zone} className="ml-1" style={{
                            color: z.level >= 3 ? '#DC2626' : z.level >= 2 ? '#EA580C' : '#D97706'
                          }}>●</span>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Corrélations sommeil → AEI */}
          {correlations?.sleep_aei?.length > 3 && (
            <div className="card">
              <h3 className="text-sm font-semibold mb-1">Corrélation Sommeil → AEI lendemain</h3>
              <p className="text-xs text-gray-400 mb-3">Impact du sommeil sur ton efficacité aérobie</p>
              <ResponsiveContainer width="100%" height={160}>
                <ScatterChart margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2E3749" />
                  <XAxis dataKey="sleep_h" name="Sommeil" unit="h" tick={{ fill: '#6B7280', fontSize: 10 }} domain={[4, 10]} />
                  <YAxis dataKey="aei" name="AEI" tick={{ fill: '#6B7280', fontSize: 10 }} domain={[6, 10]} />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    contentStyle={{ backgroundColor: '#1A2235', border: '1px solid #2E3749', borderRadius: '8px', fontSize: '11px' }}
                    formatter={(v, name) => [name === 'AEI' ? v?.toFixed(2) : v + 'h', name]}
                  />
                  <Scatter name="Séances" data={correlations.sleep_aei} fill="#378ADD" opacity={0.7} r={4} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Corrélation HRV → RPE */}
          {correlations?.hrv_rpe?.length > 3 && (
            <div className="card">
              <h3 className="text-sm font-semibold mb-1">Corrélation HRV → RPE séance</h3>
              <p className="text-xs text-gray-400 mb-3">HRV du matin prédit l'effort ressenti en séance</p>
              <ResponsiveContainer width="100%" height={160}>
                <ScatterChart margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2E3749" />
                  <XAxis dataKey="hrv" name="HRV" unit="ms" tick={{ fill: '#6B7280', fontSize: 10 }} />
                  <YAxis dataKey="rpe" name="RPE" tick={{ fill: '#6B7280', fontSize: 10 }} domain={[1, 10]} />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    contentStyle={{ backgroundColor: '#1A2235', border: '1px solid #2E3749', borderRadius: '8px', fontSize: '11px' }}
                  />
                  <Scatter name="Séances" data={correlations.hrv_rpe} fill="#7F77DD" opacity={0.7} r={4} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Pas encore de données */}
          {!polarization?.overall && !painTimeline?.summary?.length && !correlations?.sleep_aei?.length && (
            <div className="card text-center py-8">
              <p className="text-gray-500 text-sm">Commence à encoder RPE, douleurs et sommeil dans le journal</p>
              <p className="text-gray-600 text-xs mt-1">Les corrélations apparaîtront après quelques semaines de données</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
