import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Utensils, ChevronLeft, ChevronRight, RefreshCw, Settings, Droplets, Flame, Loader2, Leaf, Fish, Beef, Apple, Wheat, AlertTriangle, CheckCircle, ShoppingCart, Download, X, Upload, CloudDownload, Key, Link } from 'lucide-react'
import { api } from '../api'
import { format, parseISO, startOfWeek } from 'date-fns'
import { fr } from 'date-fns/locale'

const DAY_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

function CalorieBar({ value, target, label, color }) {
  const pct = Math.min(100, Math.round((value / target) * 100))
  return (
    <div>
      <div className="flex justify-between text-xs mb-0.5">
        <span className="text-gray-400">{label}</span>
        <span style={{ color }}>{value} / {target} kcal</span>
      </div>
      <div className="h-1.5 rounded-full bg-dark-600">
        <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

function MacroBadge({ label, value, unit = 'g', color }) {
  return (
    <div className="text-center p-2 rounded-lg bg-dark-700">
      <p className="text-lg font-bold" style={{ color }}>~{value}</p>
      <p className="text-xs text-gray-400">{unit} {label}</p>
    </div>
  )
}

function IngredientRow({ ingredient }) {
  return (
    <div className="flex justify-between items-start text-xs py-1 border-b border-dark-600/30 last:border-0">
      <span className="text-gray-200">{ingredient.nom}</span>
      <div className="text-right shrink-0 ml-4">
        <span className="text-gray-400">{ingredient.quantite}</span>
        {ingredient.kcal_approx && <span className="text-gray-500 ml-2">~{ingredient.kcal_approx} kcal</span>}
      </div>
    </div>
  )
}

function MealCard({ title, icon: Icon, color, kcal, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="card">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg" style={{ backgroundColor: color + '20' }}>
            <Icon size={16} style={{ color }} />
          </div>
          <span className="font-medium text-sm">{title}</span>
        </div>
        <div className="flex items-center gap-3">
          {kcal && <span className="text-xs text-gray-400">~{kcal} kcal</span>}
          <ChevronRight size={14} className={`text-gray-500 transition-transform ${open ? 'rotate-90' : ''}`} />
        </div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden">
            <div className="pt-3 mt-3 border-t border-dark-600">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function SettingsPanel({ onClose, onSaved }) {
  const [form, setForm] = useState({ weight_kg: 70, height_cm: 175, age: 35, sex: 'M', birthdate: '' })
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    api.getNutritionSettings().then(s => { if (s) setForm(s); setLoaded(true) }).catch(() => setLoaded(true))
  }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    try { await api.saveNutritionSettings(form); onSaved() }
    finally { setSaving(false) }
  }

  if (!loaded) return null
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-dark-800 border border-dark-500 rounded-xl w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold">Paramètres nutrition</h3>
          <button onClick={onClose} className="p-1 hover:bg-dark-600 rounded"><X size={16} /></button>
        </div>
        <p className="text-xs text-gray-400">Données pour estimer tes besoins caloriques.</p>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs text-gray-400 mb-1 block">Poids (kg)</label>
            <input type="number" className="input-field" value={form.weight_kg} onChange={e => set('weight_kg', parseFloat(e.target.value))} /></div>
          <div><label className="text-xs text-gray-400 mb-1 block">Taille (cm)</label>
            <input type="number" className="input-field" value={form.height_cm} onChange={e => set('height_cm', parseFloat(e.target.value))} /></div>
          <div><label className="text-xs text-gray-400 mb-1 block">Date de naissance</label>
            <input type="date" className="input-field" value={form.birthdate || ''} onChange={e => set('birthdate', e.target.value)} />
            {form.birthdate && <p className="text-xs text-gray-500 mt-0.5">{(() => { const b = new Date(form.birthdate); const a = new Date(); let age = a.getFullYear() - b.getFullYear(); if (a.getMonth() < b.getMonth() || (a.getMonth() === b.getMonth() && a.getDate() < b.getDate())) age--; return age + ' ans'; })()}</p>}
          </div>
          <div><label className="text-xs text-gray-400 mb-1 block">Sexe</label>
            <select className="input-field" value={form.sex} onChange={e => set('sex', e.target.value)}>
              <option value="M">Homme</option>
              <option value="F">Femme</option>
            </select></div>
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="btn-secondary flex-1">Annuler</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-1">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
            Sauvegarder
          </button>
        </div>
      </div>
    </motion.div>
  )
}

// ── Panneau sync Gist (liste de courses commune) ─────────────────────────────
function GistSyncPanel({ onClose }) {
  const [gistSettings, setGistSettings] = useState(null)
  const [token, setToken] = useState('')
  const [partnerUrl, setPartnerUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState(null)
  const [pushing, setPushing] = useState(false)
  const [pulling, setPulling] = useState(false)

  useEffect(() => {
    api.get('/nutrition/gist/settings').then(d => {
      setGistSettings(d)
      setPartnerUrl(d.source_url || '')
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const saveToken = async () => {
    if (!token.trim()) return
    try {
      await api.put('/nutrition/gist/token', { token: token.trim() })
      setMsg({ ok: true, text: 'Token sauvegardé' })
      setToken('')
      const d = await api.get('/nutrition/gist/settings')
      setGistSettings(d)
    } catch (e) { setMsg({ ok: false, text: e.message }) }
  }

  const pushNow = async () => {
    setPushing(true); setMsg(null)
    try {
      const r = await api.post('/nutrition/gist/push', {})
      setMsg({ ok: true, text: `✓ ${r.items_count} ingrédients publiés — semaine ${r.week}` })
      const d = await api.get('/nutrition/gist/settings')
      setGistSettings(d)
    } catch (e) { setMsg({ ok: false, text: e.message }) }
    finally { setPushing(false) }
  }

  const pullNow = async () => {
    setPulling(true); setMsg(null)
    try {
      const r = await api.post('/nutrition/gist/pull', { url: partnerUrl.trim() || undefined })
      setMsg({ ok: true, text: `✓ ${r.items_count} ingrédients de ${r.partner} importés (semaine ${r.week})` })
    } catch (e) { setMsg({ ok: false, text: e.message }) }
    finally { setPulling(false) }
  }

  if (loading) return null

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-dark-800 border border-dark-500 rounded-xl w-full max-w-sm p-5 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="font-bold flex items-center gap-2"><Link size={15} className="text-brand-green" />Liste de courses commune</h3>
          <button onClick={onClose} className="p-1 hover:bg-dark-600 rounded"><X size={16} /></button>
        </div>

        {/* Section Arthur — push */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-300 flex items-center gap-1.5"><Upload size={12} />Publier mes ingrédients</p>
          <p className="text-xs text-gray-500">Chaque samedi à 20h, tes ingrédients sont publiés automatiquement sur GitHub Gist si le token est configuré.</p>
          {!gistSettings?.has_token ? (
            <div className="space-y-2">
              <p className="text-xs text-orange-400">Token GitHub manquant — <a href="https://github.com/settings/tokens/new?scopes=gist" target="_blank" rel="noopener noreferrer" className="underline">créer un token ici</a> (scope : gist uniquement)</p>
              <div className="flex gap-2">
                <input type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="ghp_xxxxxxxxxxxx" className="input-field flex-1 text-xs" />
                <button onClick={saveToken} className="btn-primary text-xs px-3 flex items-center gap-1"><Key size={12} />OK</button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-green-400"><CheckCircle size={12} />Token configuré{gistSettings.last_push && ` — dernier push ${new Date(gistSettings.last_push).toLocaleDateString('fr-FR')}`}</div>
              {gistSettings.gist_url && (
                <p className="text-xs text-gray-500 break-all">URL à donner à Camille :<br/><span className="text-blue-400">{gistSettings.source_url || 'Génère d\'abord un push'}</span></p>
              )}
              <button onClick={pushNow} disabled={pushing} className="btn-secondary text-xs w-full flex items-center justify-center gap-1.5">
                {pushing ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                Publier maintenant
              </button>
            </div>
          )}
        </div>

        <div className="border-t border-dark-600" />

        {/* Section Camille — pull */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-300 flex items-center gap-1.5"><CloudDownload size={12} />Importer les ingrédients du partenaire</p>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">URL du Gist partenaire</label>
            <input type="url" value={partnerUrl} onChange={e => setPartnerUrl(e.target.value)} placeholder="https://gist.github.com/raw/..." className="input-field w-full text-xs" />
          </div>
          <button onClick={pullNow} disabled={pulling || !partnerUrl.trim()} className="btn-secondary text-xs w-full flex items-center justify-center gap-1.5">
            {pulling ? <Loader2 size={12} className="animate-spin" /> : <CloudDownload size={12} />}
            Importer maintenant
          </button>
          {gistSettings?.last_pull && <p className="text-xs text-gray-500">Dernier import : {new Date(gistSettings.last_pull).toLocaleDateString('fr-FR')}</p>}
        </div>

        {msg && (
          <p className={`text-xs rounded-lg px-3 py-2 ${msg.ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>{msg.text}</p>
        )}
      </div>
    </motion.div>
  )
}

function ShoppingList({ weekStart }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [checked, setChecked] = useState({})
  const [pulling, setPulling] = useState(false)
  const [pullStatus, setPullStatus] = useState(null)
  const [showGist, setShowGist] = useState(false)

  const load = () => {
    setLoading(true)
    api.getShoppingList(weekStart).then(d => { setData(d); setLoading(false) }).catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [weekStart])

  const toggle = (key) => setChecked(c => ({ ...c, [key]: !c[key] }))
  const uncheckAll = () => setChecked({})

  const handleSync = async () => {
    setPulling(true)
    setPullStatus(null)
    try {
      const r = await api.syncFromSource(weekStart)
      if (r.imported > 0) {
        setPullStatus(`✓ ${r.imported} menus synchronisés`)
        setTimeout(() => { load(); setPullStatus(null) }, 2000)
      } else {
        setPullStatus('Déjà à jour — aucun nouveau menu')
        setTimeout(() => setPullStatus(null), 3000)
      }
    } catch (e) {
      setPullStatus(e.message.includes('source') ? 'Compte source non configuré' : 'Erreur : ' + e.message)
    } finally {
      setPulling(false)
    }
  }

  if (loading) return <div className="card flex items-center justify-center py-10 gap-3 text-gray-400"><Loader2 size={18} className="animate-spin" /><span className="text-sm">Chargement…</span></div>

  if (!data?.items?.length) return (
    <div className="card text-center py-10 space-y-3">
      <ShoppingCart size={32} className="text-gray-600 mx-auto" />
      <p className="text-sm text-gray-400">Génère d'abord les menus de la semaine</p>
      <p className="text-xs text-gray-500">La liste de courses s'alimente automatiquement depuis les menus générés.</p>
    </div>
  )

  const uncheckedItems = data.items.filter(it => !checked[it.nom.toLowerCase()])
  const checkedItems = data.items.filter(it => checked[it.nom.toLowerCase()])

  return (
    <div className="space-y-3">
      <AnimatePresence>{showGist && <GistSyncPanel onClose={() => { setShowGist(false); load() }} />}</AnimatePresence>
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">{data.days_with_menu}/{data.total_days} jours · {data.items.length} ingrédients</p>
        <div className="flex gap-2">
          <button onClick={() => setShowGist(true)}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-dark-700 hover:bg-dark-600 transition-colors text-gray-300"
            title="Sync liste de courses commune">
            <Link size={12} />
            <span className="hidden sm:inline">Foyer</span>
          </button>
          <button onClick={handleSync} disabled={pulling}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-dark-700 hover:bg-dark-600 transition-colors disabled:opacity-50 text-gray-300"
            title="Synchroniser les recettes depuis le compte source">
            {pulling ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
            <span className="hidden sm:inline">Synchroniser</span>
          </button>
          {Object.keys(checked).length > 0 && (
            <button onClick={uncheckAll} className="text-xs px-2.5 py-1.5 rounded-lg bg-dark-700 hover:bg-dark-600 transition-colors text-gray-400">
              Tout décocher
            </button>
          )}
        </div>
      </div>

      {pullStatus && (
        <p className={`text-xs px-3 py-2 rounded-lg ${pullStatus.startsWith('✓') ? 'bg-green-500/10 text-green-300' : 'bg-red-500/10 text-red-300'}`}>
          {pullStatus}
        </p>
      )}

      {/* Liste à cocher */}
      <div className="card divide-y divide-dark-600">
        {uncheckedItems.map(item => (
          <button key={item.nom} onClick={() => toggle(item.nom.toLowerCase())}
            className="w-full flex items-start gap-3 py-2.5 text-left hover:bg-dark-700/30 transition-colors">
            <div className="w-4 h-4 mt-0.5 rounded border border-gray-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-sm text-gray-200">{item.nom}</span>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {item.occurrences.map((o, i) => (
                  <span key={i} className="text-xs text-gray-500">{o.day} {o.meal} {o.quantite ? `· ${o.quantite}` : ''}</span>
                )).slice(0, 3)}
                {item.occurrences.length > 3 && <span className="text-xs text-gray-600">+{item.occurrences.length - 3}</span>}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Articles cochés */}
      {checkedItems.length > 0 && (
        <div className="card divide-y divide-dark-600 opacity-50">
          {checkedItems.map(item => (
            <button key={item.nom} onClick={() => toggle(item.nom.toLowerCase())}
              className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-dark-700/30 transition-colors">
              <div className="w-4 h-4 rounded border border-brand-green bg-brand-green/20 shrink-0 flex items-center justify-center">
                <CheckCircle size={10} className="text-brand-green" />
              </div>
              <span className="text-sm text-gray-400 line-through">{item.nom}</span>
            </button>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-600 text-center">
        {checkedItems.length} / {data.items.length} articles cochés — liste non sauvegardée
      </p>
    </div>
  )
}

export default function Nutrition() {
  const [view, setView] = useState('menus') // 'menus' | 'courses'
  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [weekStart, setWeekStart] = useState(() => format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'))
  const [weekData, setWeekData] = useState(null)
  const [dayData, setDayData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [error, setError] = useState(null)
  const [generatingWeek, setGeneratingWeek] = useState(false)
  const [weekGenStatus, setWeekGenStatus] = useState(null)

  const loadWeek = (from) => {
    api.getNutritionWeek(from).then(setWeekData).catch(() => {})
  }

  const loadDay = async (date, regen = false) => {
    setLoading(true)
    setError(null)
    setDayData(null)
    try {
      const data = await api.getDailyMenu(date, regen)
      setDayData(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const generateMenu = async () => {
    setGenerating(true)
    setError(null)
    try {
      const data = await api.getDailyMenu(selectedDate, true)
      setDayData(data)
      loadWeek(weekStart) // refresh semaine
    } catch (e) {
      setError(e.message)
    } finally {
      setGenerating(false)
    }
  }

  const handleGenerateWeek = async () => {
    setGeneratingWeek(true)
    setWeekGenStatus(null)
    try {
      const result = await api.generateWeekMenus(weekStart)
      setWeekGenStatus(`Génération lancée pour ${result.dates?.[0]} → ${result.dates?.[6]}`)
      setTimeout(() => { loadWeek(weekStart); setWeekGenStatus(null) }, 3000)
    } catch (e) {
      setWeekGenStatus('Erreur : ' + e.message)
    } finally {
      setGeneratingWeek(false)
    }
  }

useEffect(() => { loadWeek(weekStart) }, [weekStart])
  useEffect(() => { loadDay(selectedDate) }, [selectedDate])

  const prevWeek = () => {
    const d = new Date(weekStart + 'T12:00:00'); d.setDate(d.getDate() - 7)
    setWeekStart(format(d, 'yyyy-MM-dd'))
  }
  const nextWeek = () => {
    const d = new Date(weekStart + 'T12:00:00'); d.setDate(d.getDate() + 7)
    setWeekStart(format(d, 'yyyy-MM-dd'))
  }

  const menu = dayData?.menu
  const needs = dayData?.needs

  const SESSION_COLORS = { 'Repos': '#6B7280', 'Endurance': '#378ADD', 'Longue': '#1D9E75', 'Tempo': '#E24B4A', 'Récup': '#7F77DD' }
  const getSessionColor = (s) => Object.entries(SESSION_COLORS).find(([k]) => s?.includes(k))?.[1] || '#EF9F27'

  return (
    <div className="space-y-4 pb-20 md:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Nutrition</h1>
          <p className="text-xs text-gray-400">Menus adaptés à ta charge d'entraînement</p>
        </div>
        <div className="flex gap-1">
          <button
            onClick={handleGenerateWeek}
            disabled={generatingWeek}
            title="Générer tous les menus de la semaine"
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-dark-700 hover:bg-dark-600 transition-colors disabled:opacity-50 text-gray-300"
          >
            {generatingWeek ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            <span className="hidden sm:inline">Semaine</span>
          </button>
          <button onClick={() => setShowSettings(true)} className="p-2 rounded-lg hover:bg-dark-700 text-gray-400 hover:text-white transition-colors">
            <Settings size={18} />
          </button>
        </div>
      </div>


      {/* Onglets Menus / Courses */}
      <div className="flex gap-1 bg-dark-800 rounded-lg p-0.5 border border-dark-600">
        <button onClick={() => setView('menus')}
          className={`flex-1 flex items-center justify-center gap-1.5 text-xs py-2 rounded-md transition-colors ${view === 'menus' ? 'bg-dark-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
          <Utensils size={13} /> Menus
        </button>
        <button onClick={() => setView('courses')}
          className={`flex-1 flex items-center justify-center gap-1.5 text-xs py-2 rounded-md transition-colors ${view === 'courses' ? 'bg-dark-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
          <ShoppingCart size={13} /> Liste de courses
        </button>
      </div>

      {/* Vue Liste de courses */}
      {view === 'courses' && (
        <div className="space-y-3">
          {/* Navigation semaine */}
          <div className="flex items-center justify-between">
            <button onClick={prevWeek} className="p-1.5 rounded hover:bg-dark-700"><ChevronLeft size={16} /></button>
            <span className="text-sm font-medium">Semaine du {format(parseISO(weekStart), 'd MMM', { locale: fr })}</span>
            <button onClick={nextWeek} className="p-1.5 rounded hover:bg-dark-700"><ChevronRight size={16} /></button>
          </div>
          <ShoppingList weekStart={weekStart} />
        </div>
      )}

      {/* Vue Menus */}
      {view === 'menus' && <>

      {/* Calendrier semaine */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <button onClick={prevWeek} className="p-1 rounded hover:bg-dark-600"><ChevronLeft size={16} /></button>
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-xs font-medium text-gray-300">
              Semaine du {format(parseISO(weekStart), 'd MMM', { locale: fr })}
            </span>
            {weekGenStatus && <span className="text-xs text-brand-green">{weekGenStatus}</span>}
          </div>
          <button onClick={nextWeek} className="p-1 rounded hover:bg-dark-600"><ChevronRight size={16} /></button>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {weekData?.days?.map((day, i) => {
            const isSelected = day.date === selectedDate
            const isToday = day.date === format(new Date(), 'yyyy-MM-dd')
            const d = parseISO(day.date)
            return (
              <button key={day.date} onClick={() => setSelectedDate(day.date)}
                className={`flex flex-col items-center p-1.5 rounded-lg transition-all ${isSelected ? 'bg-brand-green text-white' : 'hover:bg-dark-600 text-gray-400'}`}>
                <span className="text-xs">{DAY_FR[i]}</span>
                <span className={`text-sm font-bold ${isToday && !isSelected ? 'text-brand-green' : ''}`}>{d.getDate()}</span>
                {/* Indicateur charge */}
                <div className="mt-0.5 flex flex-col gap-0.5 w-full">
                  {day.session_kcal > 0 && (
                    <div className="h-1 rounded-full w-full" style={{
                      backgroundColor: day.session_kcal > 1200 ? '#E24B4A' : day.session_kcal > 600 ? '#EF9F27' : '#1D9E75'
                    }} />
                  )}
                  {day.has_menu && (
                    <div className="h-0.5 rounded-full w-full bg-brand-green/40" />
                  )}
                </div>
              </button>
            )
          })}
        </div>
        <div className="mt-2 flex gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1"><span className="w-2 h-1 rounded bg-red-400 inline-block" />Intense</span>
          <span className="flex items-center gap-1"><span className="w-2 h-1 rounded bg-orange-400 inline-block" />Modéré</span>
          <span className="flex items-center gap-1"><span className="w-2 h-1 rounded bg-brand-green inline-block" />Léger/Repos</span>
          <span className="flex items-center gap-1"><span className="w-2 h-0.5 rounded bg-brand-green/40 inline-block" />Menu généré</span>
        </div>
      </div>

      {/* Jour sélectionné */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold">
            {format(parseISO(selectedDate), 'EEEE d MMMM', { locale: fr })}
          </h2>
          {dayData?.session_summary && (
            <p className="text-xs" style={{ color: getSessionColor(dayData.session_summary) }}>
              {dayData.session_summary}
            </p>
          )}
        </div>
        <button
          onClick={generateMenu}
          disabled={generating}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-dark-700 hover:bg-dark-600 transition-colors disabled:opacity-50"
        >
          {generating ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          {menu ? 'Régénérer' : 'Générer le menu'}
        </button>
      </div>

      {/* Erreur */}
      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 flex gap-2 text-xs text-red-300">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Loading */}
      {(loading || generating) && !menu && (
        <div className="card flex items-center justify-center gap-3 py-10 text-gray-400">
          <Loader2 size={20} className="animate-spin" />
          <span className="text-sm">{generating ? 'Génération du menu en cours…' : 'Chargement…'}</span>
        </div>
      )}

      {/* Résumé calorique */}
      {needs && (
        <div className="card space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Flame size={16} className="text-brand-orange" />
            <h3 className="text-sm font-semibold">Besoins estimés</h3>
            <span className="text-xs text-gray-500 ml-auto">indicatif</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center p-2 rounded-lg bg-dark-700">
              <p className="text-lg font-bold text-brand-green">~{needs.total_kcal}</p>
              <p className="text-xs text-gray-400">kcal total</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-dark-700">
              <p className="text-lg font-bold text-brand-blue">~{needs.session_kcal}</p>
              <p className="text-xs text-gray-400">kcal séance</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-dark-700">
              <p className="text-lg font-bold text-brand-purple">{needs.hydration_l}L</p>
              <p className="text-xs text-gray-400">hydratation</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <MacroBadge label="glucides" value={needs.macros.carbs_g} color="#1D9E75" />
            <MacroBadge label="protéines" value={needs.macros.protein_g} color="#378ADD" />
            <MacroBadge label="lipides" value={needs.macros.fat_g} color="#EF9F27" />
          </div>
        </div>
      )}

      {/* Menu du jour */}
      {menu && (
        <AnimatePresence>
          <motion.div key={selectedDate} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="space-y-3">

            {/* Message coach */}
            {menu.message_coach && (
              <div className="p-3 rounded-lg bg-dark-700/50 border border-dark-500">
                <p className="text-xs text-gray-300 italic">{menu.titre_journee && <span className="font-semibold not-italic text-white">{menu.titre_journee} — </span>}{menu.message_coach}</p>
              </div>
            )}

            {/* Petit-déjeuner */}
            {menu.petit_dejeuner && (
              <MealCard title="Petit-déjeuner" icon={Wheat} color="#EF9F27" kcal={menu.petit_dejeuner.kcal_total} defaultOpen={true}>
                <div className="space-y-1">
                  {menu.petit_dejeuner.ingredients?.map((ing, i) => <IngredientRow key={i} ingredient={ing} />)}
                </div>
                {menu.petit_dejeuner.note && (
                  <p className="text-xs text-gray-400 mt-2 italic">{menu.petit_dejeuner.note}</p>
                )}
              </MealCard>
            )}

            {/* Déjeuner */}
            {menu.dejeuner && (
              <MealCard title="Déjeuner" icon={Leaf} color="#1D9E75" kcal={menu.dejeuner.kcal_total}>
                {menu.dejeuner.option_restes && (
                  <div className="mb-2">
                    <p className="text-xs font-medium text-brand-green mb-1">Option A — Restes</p>
                    <p className="text-xs text-gray-300">{menu.dejeuner.option_restes}</p>
                  </div>
                )}
                {menu.dejeuner.option_pain_fromage && (
                  <div className="mt-2 pt-2 border-t border-dark-600">
                    <p className="text-xs font-medium text-gray-400 mb-1">Option B — Pain + fromage</p>
                    <p className="text-xs text-gray-300 mb-1">{menu.dejeuner.option_pain_fromage.description}</p>
                    {menu.dejeuner.option_pain_fromage.ingredients?.map((ing, i) => <IngredientRow key={i} ingredient={ing} />)}
                  </div>
                )}
                {menu.dejeuner.note && (
                  <p className="text-xs text-gray-400 mt-2 italic">{menu.dejeuner.note}</p>
                )}
              </MealCard>
            )}

            {/* Collation */}
            {menu.collation?.si_besoin && (
              <MealCard title="Collation (si besoin)" icon={Apple} color="#7F77DD" kcal={menu.collation.kcal_approx}>
                <p className="text-sm text-gray-300">{menu.collation.si_besoin}</p>
              </MealCard>
            )}

            {/* Dîner */}
            {menu.diner && (
              <MealCard title={`Dîner — ${menu.diner.nom || ''}`} icon={menu.diner.nom?.toLowerCase().includes('truite') || menu.diner.nom?.toLowerCase().includes('saumon') ? Fish : Beef} color="#378ADD" kcal={menu.diner.kcal_total} defaultOpen={true}>
                {menu.diner.temps_preparation && (
                  <p className="text-xs text-gray-500 mb-2">⏱ {menu.diner.temps_preparation}</p>
                )}
                <div className="space-y-1 mb-3">
                  {menu.diner.ingredients?.map((ing, i) => <IngredientRow key={i} ingredient={ing} />)}
                </div>
                {menu.diner.preparation?.length > 0 && (
                  <div className="border-t border-dark-600 pt-2 space-y-1">
                    <p className="text-xs font-medium text-gray-400 mb-1">Préparation</p>
                    {menu.diner.preparation.map((step, i) => (
                      <div key={i} className="flex gap-2 text-xs text-gray-300">
                        <span className="text-brand-green shrink-0">{i + 1}.</span>{step}
                      </div>
                    ))}
                  </div>
                )}
                {menu.diner.restes_lendemain && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-brand-green">
                    <CheckCircle size={11} /> Fait de bonnes restes pour le déjeuner de demain
                  </div>
                )}
                {menu.diner.note && (
                  <p className="text-xs text-gray-400 mt-2 italic">{menu.diner.note}</p>
                )}
              </MealCard>
            )}

            {/* Hydratation */}
            {menu.hydratation && (
              <MealCard title="Hydratation" icon={Droplets} color="#378ADD">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl font-bold text-brand-blue">~{menu.hydratation.total_l}L</span>
                  <span className="text-xs text-gray-400">objectif journalier</span>
                </div>
                {menu.hydratation.conseils?.map((c, i) => (
                  <p key={i} className="text-xs text-gray-300 flex gap-2"><span className="text-brand-blue">·</span>{c}</p>
                ))}
              </MealCard>
            )}

            {/* Récap calories */}
            {menu.recap_kcal && (
              <div className="card space-y-2">
                <h4 className="text-xs font-medium text-gray-400">Récap calorique indicatif</h4>
                <CalorieBar
                  value={menu.recap_kcal.total}
                  target={menu.recap_kcal.objectif}
                  label="Total estimé vs besoin"
                  color={Math.abs(menu.recap_kcal.total - menu.recap_kcal.objectif) < 200 ? '#1D9E75' : '#EF9F27'}
                />
                <div className="grid grid-cols-4 gap-1 text-xs text-center mt-1">
                  {[
                    ['Matin', menu.recap_kcal.petit_dejeuner],
                    ['Midi', menu.recap_kcal.dejeuner],
                    ['Collation', menu.recap_kcal.collation],
                    ['Soir', menu.recap_kcal.diner],
                  ].map(([label, kcal]) => kcal ? (
                    <div key={label} className="p-1 rounded bg-dark-700">
                      <p className="text-white font-medium">~{kcal}</p>
                      <p className="text-gray-500">{label}</p>
                    </div>
                  ) : null)}
                </div>
                <p className="text-xs text-gray-500 italic">Ces valeurs sont des estimations — adapte selon ta faim et ton ressenti.</p>
              </div>
            )}

            {/* Provider info */}
            {dayData?.provider && (
              <p className="text-xs text-gray-600 text-center">Généré via {dayData.provider}{dayData.cached ? ' · mis en cache' : ''}</p>
            )}
          </motion.div>
        </AnimatePresence>
      )}

      {/* État vide — pas encore de menu */}
      {!loading && !generating && !menu && !error && (
        <div className="card text-center py-10 space-y-3">
          <Utensils size={32} className="text-gray-600 mx-auto" />
          <p className="text-sm text-gray-400">Pas encore de menu pour ce jour</p>
          <button onClick={generateMenu} className="btn-primary mx-auto flex items-center gap-2">
            <Utensils size={14} /> Générer le menu avec l'IA
          </button>
          <p className="text-xs text-gray-500">L'IA adapte le menu à ta séance et à la saison</p>
        </div>
      )}

      </> /* fin view === 'menus' */}

      {/* Panel paramètres */}
      <AnimatePresence>
        {showSettings && (
          <SettingsPanel
            onClose={() => setShowSettings(false)}
            onSaved={() => { setShowSettings(false); loadDay(selectedDate, false) }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
