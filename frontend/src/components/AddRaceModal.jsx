import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, AlertTriangle, CheckCircle, Upload, ChevronRight, ChevronLeft, Flag, Clock, Mountain, Calendar, Target, Zap } from 'lucide-react'
import { api } from '../api'

const STEPS = ['Identité', 'Priorité', 'Préparation', 'Objectifs', 'Récap']

const PRIORITY_CONFIG = {
  A: {
    label: 'Priorité A — Objectif principal',
    desc: 'Tu veux performer au maximum. Tapering complet, récupération optimisée. Les autres courses s\'y adaptent.',
    color: '#1D9E75',
    bg: 'bg-green-500/10',
    border: 'border-green-500/40',
  },
  B: {
    label: 'Priorité B — Préparation / Test',
    desc: 'Course utile pour ta préparation. Tu peux performer, mais sans compromettre tes objectifs A.',
    color: '#378ADD',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/40',
  },
  C: {
    label: 'Priorité C — Course en jambes',
    desc: 'Sortie longue habillée, récup normale. Aucun tapering, aucun impact sur le reste.',
    color: '#7F77DD',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/40',
  },
}

function formatH(h) {
  if (!h) return '—'
  const hours = Math.floor(h)
  const mins = Math.round((h - hours) * 60)
  return `${hours}h${String(mins).padStart(2, '0')}`
}

function estimateTime(dist, dplus) {
  if (!dist) return null
  const pts = dist + (dplus || 0) / 100
  return Math.round((pts / 11.25) * 100) / 100
}

function estimateRecovery(dist, dplus) {
  const pts = (dist || 0) + (dplus || 0) / 100
  if (pts > 180) return 21
  if (pts > 100) return 14
  if (pts > 60) return 10
  if (pts > 35) return 7
  return 4
}

export default function AddRaceModal({ onClose, onSaved, editRace = null }) {
  const isEdit = !!editRace

  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [conflicts, setConflicts] = useState(null)
  const [gpxFile, setGpxFile] = useState(null)
  const [gpxParsed, setGpxParsed] = useState(null)

  const [form, setForm] = useState({
    name: '',
    date: '',
    distance_km: '',
    dplus_m: '',
    dminus_m: '',
    start_time: '00:00',
    race_type: 'trail',
    // Step 2 — priority
    priority: 'A',
    tapering: true,
    // Step 3 — preparation
    weekly_runs_target: '',
    weekly_workouts_target: '',
    long_run_day: 'Dimanche',
    weekend_available: true,
    terrain_access: 'mixte',
    notes_planning: '',
    // Step 4 — objectives
    obj_a_time_h: '',
    obj_b_time_h: '',
    obj_c_time_h: '',
    use_estimated_time: true,
  })

  useEffect(() => {
    if (editRace) {
      setForm({
        name: editRace.name || '',
        date: editRace.date || '',
        distance_km: editRace.distance_km || '',
        dplus_m: editRace.dplus_m || '',
        dminus_m: editRace.dminus_m || '',
        start_time: editRace.start_time || '00:00',
        race_type: editRace.race_type || 'trail',
        priority: editRace.priority || 'A',
        tapering: editRace.tapering !== 0,
        weekly_runs_target: editRace.weekly_runs_target || '',
        weekly_workouts_target: editRace.weekly_workouts_target || '',
        long_run_day: editRace.long_run_day || 'Dimanche',
        weekend_available: editRace.weekend_available !== 0,
        terrain_access: editRace.terrain_access || 'mixte',
        notes_planning: editRace.notes_planning || '',
        obj_a_time_h: editRace.obj_a_time_h || '',
        obj_b_time_h: editRace.obj_b_time_h || '',
        obj_c_time_h: editRace.obj_c_time_h || '',
        use_estimated_time: false,
      })
    }
  }, [editRace])

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const estimated = estimateTime(parseFloat(form.distance_km), parseFloat(form.dplus_m))
  const recoveryDays = estimateRecovery(parseFloat(form.distance_km), parseFloat(form.dplus_m))

  // Live conflict check on date/distance change
  useEffect(() => {
    if (!form.date || !form.distance_km) return
    const timer = setTimeout(async () => {
      try {
        const result = await api.checkConflicts({
          date: form.date,
          distance_km: parseFloat(form.distance_km),
          dplus_m: parseFloat(form.dplus_m) || 0,
          priority: form.priority,
          race_id: editRace?.race_id || '',
        })
        setConflicts(result)
      } catch { setConflicts(null) }
    }, 600)
    return () => clearTimeout(timer)
  }, [form.date, form.distance_km, form.dplus_m, form.priority])

  // GPX file reader
  const handleGPX = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setGpxFile(file.name)
    const reader = new FileReader()
    reader.onload = (ev) => setGpxParsed(ev.target.result)
    reader.readAsText(file)
  }

  const handleSubmit = async () => {
    setSaving(true)
    try {
      const payload = {
        ...form,
        distance_km: parseFloat(form.distance_km),
        dplus_m: parseFloat(form.dplus_m) || 0,
        dminus_m: parseFloat(form.dminus_m) || null,
        tapering: form.tapering ? 1 : 0,
        weekend_available: form.weekend_available ? 1 : 0,
        weekly_runs_target: parseInt(form.weekly_runs_target) || null,
        weekly_workouts_target: parseInt(form.weekly_workouts_target) || null,
        obj_a_time_h: form.use_estimated_time ? (estimated ? estimated * 0.95 : null) : (parseFloat(form.obj_a_time_h) || null),
        obj_b_time_h: form.use_estimated_time ? estimated : (parseFloat(form.obj_b_time_h) || null),
        obj_c_time_h: form.use_estimated_time ? (estimated ? estimated * 1.1 : null) : (parseFloat(form.obj_c_time_h) || null),
        gpx_profile: gpxParsed || null,
      }

      let result
      if (isEdit) {
        result = await api.updateRaceTarget(editRace.race_id, payload)
      } else {
        result = await api.saveRaceTarget(payload)
      }
      onSaved(result)
    } catch (e) {
      alert('Erreur: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const canNext = () => {
    if (step === 0) return form.name && form.date && form.distance_km
    if (step === 3) return true
    return true
  }

  const priorityCfg = PRIORITY_CONFIG[form.priority]

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        className="relative bg-dark-800 border border-dark-500 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[92vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="sticky top-0 bg-dark-800 border-b border-dark-600 px-5 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="font-bold text-base">{isEdit ? `Modifier — ${editRace.name}` : 'Nouvel objectif'}</h2>
            <p className="text-xs text-gray-400">
              {STEPS[step]} — étape {step + 1}/{STEPS.length}
              {isEdit && <span className="ml-2 text-brand-green">· modifie et sauvegarde à tout moment</span>}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-dark-600 text-gray-400">
            <X size={18} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex gap-1 px-5 pt-4">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? 'bg-brand-green' : 'bg-dark-500'}`}
            />
          ))}
        </div>

        <div className="px-5 py-4 space-y-4">

          {/* ── STEP 0 : Identité ── */}
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Nom de la course *</label>
                <input className="input-field" placeholder="Ultra Trail des Chevaliers" value={form.name} onChange={e => set('name', e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Date *</label>
                  <input type="date" className="input-field" value={form.date} onChange={e => set('date', e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Heure départ</label>
                  <input type="time" className="input-field" value={form.start_time} onChange={e => set('start_time', e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Distance (km) *</label>
                  <input type="number" className="input-field" placeholder="157" value={form.distance_km} onChange={e => set('distance_km', e.target.value)} step="0.1" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">D+ (m)</label>
                  <input type="number" className="input-field" placeholder="4590" value={form.dplus_m} onChange={e => set('dplus_m', e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">D- (m)</label>
                  <input type="number" className="input-field" placeholder="5557" value={form.dminus_m} onChange={e => set('dminus_m', e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Type</label>
                <select className="input-field" value={form.race_type} onChange={e => set('race_type', e.target.value)}>
                  <option value="trail">Trail</option>
                  <option value="ultra">Ultra-trail</option>
                  <option value="route">Route / Asphalte</option>
                  <option value="workout">Workout / Objectif training</option>
                </select>
              </div>

              {/* GPX upload */}
              <div>
                <label className="text-xs text-gray-400 mb-2 block flex items-center gap-1">
                  <Upload size={11} /> Profil GPX (optionnel)
                </label>
                <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  gpxFile ? 'border-brand-green/50 bg-green-500/5' : 'border-dark-500 hover:border-dark-400'
                }`}>
                  <input type="file" accept=".gpx" className="hidden" onChange={handleGPX} />
                  {gpxFile
                    ? <><CheckCircle size={16} className="text-brand-green" /><span className="text-sm text-brand-green">{gpxFile}</span></>
                    : <><Upload size={16} className="text-gray-500" /><span className="text-sm text-gray-400">Glisse ou clique pour importer un .gpx</span></>
                  }
                </label>
                {gpxFile && (
                  <p className="text-xs text-brand-green mt-1">✓ Profil altimétrique sera généré depuis ce fichier</p>
                )}
              </div>
            </div>
          )}

          {/* ── STEP 1 : Priorité ── */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wide mb-3 block">Quelle priorité pour cette course ?</label>
                <div className="space-y-2">
                  {Object.entries(PRIORITY_CONFIG).map(([key, cfg]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => set('priority', key)}
                      className={`w-full text-left p-3 rounded-xl border transition-all ${
                        form.priority === key ? `${cfg.border} ${cfg.bg}` : 'border-dark-500 hover:border-dark-400'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black border-2 ${
                          form.priority === key ? '' : 'border-gray-600 text-gray-500'
                        }`} style={form.priority === key ? { borderColor: cfg.color, color: cfg.color } : {}}>
                          {key}
                        </span>
                        <div>
                          <p className="text-sm font-semibold" style={{ color: form.priority === key ? cfg.color : undefined }}>{cfg.label}</p>
                          <p className="text-xs text-gray-400">{cfg.desc}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {form.priority !== 'C' && (
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wide mb-2 block">Tapering prévu ?</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { val: true, label: 'Oui — réduction volume J-14', sub: form.priority === 'A' ? 'Recommandé pour un A' : 'Optionnel pour un B' },
                      { val: false, label: 'Non — reprise rapide', sub: 'Adapté si course de prépa' },
                    ].map(opt => (
                      <button key={String(opt.val)} type="button"
                        onClick={() => set('tapering', opt.val)}
                        className={`p-3 rounded-lg border text-left transition-all ${
                          form.tapering === opt.val ? 'border-brand-green/50 bg-green-500/10' : 'border-dark-500 hover:border-dark-400'
                        }`}
                      >
                        <p className="text-xs font-medium text-gray-200">{opt.label}</p>
                        <p className="text-xs text-gray-500">{opt.sub}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Conflict preview */}
              {conflicts && (conflicts.blockers?.length > 0 || conflicts.warnings?.length > 0) && (
                <div className="space-y-2">
                  {conflicts.blockers?.map((b, i) => (
                    <div key={i} className="flex gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                      <AlertTriangle size={15} className="text-red-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-medium text-red-300">{b.message}</p>
                      </div>
                    </div>
                  ))}
                  {conflicts.warnings?.map((w, i) => (
                    <div key={i} className={`flex gap-2 p-3 rounded-lg ${
                      w.type === 'WARNING' ? 'bg-orange-500/10 border border-orange-500/30' : 'bg-blue-500/10 border border-blue-500/30'
                    }`}>
                      <AlertTriangle size={15} className={`shrink-0 mt-0.5 ${w.type === 'WARNING' ? 'text-orange-400' : 'text-blue-400'}`} />
                      <div>
                        <p className={`text-xs font-medium ${w.type === 'WARNING' ? 'text-orange-300' : 'text-blue-300'}`}>{w.message}</p>
                        {w.recommendation && <p className="text-xs text-gray-400 mt-0.5">→ {w.recommendation}</p>}
                      </div>
                    </div>
                  ))}
                  {conflicts.safe && (
                    <div className="flex gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
                      <CheckCircle size={15} className="text-brand-green shrink-0" />
                      <p className="text-xs text-green-300">Aucun conflit avec tes autres objectifs</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── STEP 2 : Préparation ── */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-xs text-gray-400">Ces infos permettent d'adapter ton plan d'entraînement à tes contraintes réelles.</p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block flex items-center gap-1">
                    <Zap size={11} /> Sorties course/sem
                  </label>
                  <input type="number" className="input-field" placeholder="6" min="1" max="14"
                    value={form.weekly_runs_target} onChange={e => set('weekly_runs_target', e.target.value)} />
                  <p className="text-xs text-gray-500 mt-0.5">Ton optimum données: 6-8</p>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block flex items-center gap-1">
                    <Zap size={11} /> Renfo / qualité/sem
                  </label>
                  <input type="number" className="input-field" placeholder="1" min="0" max="5"
                    value={form.weekly_workouts_target} onChange={e => set('weekly_workouts_target', e.target.value)} />
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-400 mb-2 block">Jour préféré pour la sortie longue</label>
                <div className="flex flex-wrap gap-2">
                  {['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'].map(d => (
                    <button key={d} type="button"
                      onClick={() => set('long_run_day', d)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        form.long_run_day === d ? 'bg-brand-green text-white' : 'bg-dark-600 text-gray-400 hover:text-white'
                      }`}
                    >{d.slice(0,3)}</button>
                  ))}
                </div>
              </div>

              <div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <div
                    className={`w-10 h-5 rounded-full transition-colors ${form.weekend_available ? 'bg-brand-green' : 'bg-dark-500'}`}
                    onClick={() => set('weekend_available', !form.weekend_available)}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full mt-0.5 transition-transform ${form.weekend_available ? 'ml-5' : 'ml-0.5'}`} />
                  </div>
                  <div>
                    <span className="text-sm text-gray-200">Weekends disponibles pour s'entraîner</span>
                    <p className="text-xs text-gray-500">Ton historique : seulement 10% de séances le weekend — confirme si c'est voulu</p>
                  </div>
                </label>
              </div>

              <div>
                <label className="text-xs text-gray-400 mb-2 block">Accès terrain d'entraînement</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { val: 'trail', label: '🏔️ Trail/montagne' },
                    { val: 'route', label: '🛣️ Route/plat' },
                    { val: 'mixte', label: '🔀 Mixte' },
                  ].map(opt => (
                    <button key={opt.val} type="button" onClick={() => set('terrain_access', opt.val)}
                      className={`p-2 rounded-lg border text-xs text-center transition-all ${
                        form.terrain_access === opt.val ? 'border-brand-blue/50 bg-blue-500/10 text-white' : 'border-dark-500 text-gray-400'
                      }`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-400 mb-1 block">Contraintes ou notes</label>
                <textarea className="input-field resize-none" rows={2}
                  placeholder="Blessure genou droit, voyage pro semaine 18, pas de trail dispo en semaine…"
                  value={form.notes_planning} onChange={e => set('notes_planning', e.target.value)} />
              </div>
            </div>
          )}

          {/* ── STEP 3 : Objectifs de temps ── */}
          {step === 3 && (
            <div className="space-y-4">
              {estimated && (
                <div className="p-3 rounded-lg bg-brand-blue/10 border border-brand-blue/30">
                  <p className="text-xs text-brand-blue font-medium mb-1">Estimation sur base de ta SaintéLyon 2025</p>
                  <p className="text-sm text-white">Temps estimé : <span className="font-bold">{formatH(estimated)}</span></p>
                  <p className="text-xs text-gray-400 mt-0.5">{form.distance_km}km + {form.dplus_m}m D+ → {(parseFloat(form.distance_km) + parseFloat(form.dplus_m || 0) / 100).toFixed(0)} pts effort</p>
                </div>
              )}

              <div>
                <label className="flex items-center gap-3 cursor-pointer mb-3">
                  <div
                    className={`w-10 h-5 rounded-full transition-colors ${form.use_estimated_time ? 'bg-brand-green' : 'bg-dark-500'}`}
                    onClick={() => set('use_estimated_time', !form.use_estimated_time)}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full mt-0.5 transition-transform ${form.use_estimated_time ? 'ml-5' : 'ml-0.5'}`} />
                  </div>
                  <span className="text-sm">Utiliser les temps estimés automatiquement</span>
                </label>
              </div>

              {!form.use_estimated_time && (
                <div className="space-y-3">
                  {[
                    { key: 'obj_a_time_h', label: 'Objectif A', desc: 'Top performance', color: '#1D9E75' },
                    { key: 'obj_b_time_h', label: 'Objectif B', desc: 'Bonne course', color: '#378ADD' },
                    { key: 'obj_c_time_h', label: 'Objectif C', desc: 'Finisher / sécurité', color: '#7F77DD' },
                  ].map(obj => (
                    <div key={obj.key}>
                      <label className="text-xs mb-1 flex items-center gap-1" style={{ color: obj.color }}>
                        <Target size={11} /> {obj.label} — {obj.desc}
                      </label>
                      <div className="flex items-center gap-2">
                        <input type="number" step="0.25" className="input-field" placeholder="18.5"
                          value={form[obj.key]} onChange={e => set(obj.key, e.target.value)} />
                        <span className="text-gray-400 text-sm whitespace-nowrap">h</span>
                        {form[obj.key] && <span className="text-xs text-gray-400">{formatH(parseFloat(form[obj.key]))}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {form.use_estimated_time && estimated && (
                <div className="space-y-2">
                  {[
                    { label: 'Objectif A', mult: 0.95, color: '#1D9E75' },
                    { label: 'Objectif B', mult: 1.0, color: '#378ADD' },
                    { label: 'Objectif C', mult: 1.1, color: '#7F77DD' },
                  ].map(obj => (
                    <div key={obj.label} className="flex items-center justify-between py-2 border-b border-dark-600 last:border-0 text-sm">
                      <span className="text-gray-400">{obj.label}</span>
                      <span className="font-mono font-bold" style={{ color: obj.color }}>{formatH(estimated * obj.mult)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="p-3 rounded-lg bg-dark-700 text-xs text-gray-400">
                <p className="font-medium text-gray-300 mb-1">Récupération estimée après cette course</p>
                <p>~<span className="font-bold text-white">{recoveryDays} jours</span> avant de reprendre un entraînement normal</p>
              </div>
            </div>
          )}

          {/* ── STEP 4 : Récap ── */}
          {step === 4 && (
            <div className="space-y-3">
              <div className={`p-3 rounded-xl border ${priorityCfg.border} ${priorityCfg.bg}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg font-black" style={{ color: priorityCfg.color }}>{form.priority}</span>
                  <span className="font-bold text-white">{form.name}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-300">
                  <span>📅 {form.date} à {form.start_time}</span>
                  <span>📏 {form.distance_km}km / {form.dplus_m}m D+</span>
                  <span>🎯 Tapering: {form.tapering ? 'Oui' : 'Non'}</span>
                  <span>🔄 Récup: ~{recoveryDays}j</span>
                  {form.weekly_runs_target && <span>🏃 {form.weekly_runs_target} sorties/sem</span>}
                  {form.terrain_access && <span>🗺️ {form.terrain_access}</span>}
                  {gpxFile && <span>📍 GPX: {gpxFile}</span>}
                </div>
              </div>

              {/* Conflicts summary */}
              {conflicts?.blockers?.length > 0 && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                  <p className="text-xs font-bold text-red-400 mb-1">⛔ Conflits détectés — à corriger avant de sauvegarder</p>
                  {conflicts.blockers.map((b, i) => (
                    <p key={i} className="text-xs text-red-300">{b.message}</p>
                  ))}
                </div>
              )}
              {conflicts?.warnings?.length > 0 && !conflicts.blockers?.length && (
                <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/30">
                  <p className="text-xs font-bold text-orange-400 mb-1">⚠️ Points de vigilance</p>
                  {conflicts.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-orange-300">{w.message}</p>
                  ))}
                </div>
              )}
              {conflicts?.safe && !conflicts.blockers?.length && !conflicts.warnings?.length && (
                <div className="flex gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
                  <CheckCircle size={15} className="text-brand-green" />
                  <p className="text-xs text-green-300 font-medium">Calendrier compatible avec tes autres objectifs</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer navigation */}
        <div className="sticky bottom-0 bg-dark-800 border-t border-dark-600 px-5 py-4 flex items-center gap-3">
          {step > 0 && (
            <button type="button" onClick={() => setStep(s => s - 1)} className="btn-secondary flex items-center gap-1">
              <ChevronLeft size={16} /> Retour
            </button>
          )}
          <div className="flex-1" />
          {/* En mode édition : bouton sauvegarder disponible dès la 1ère étape */}
          {isEdit && step < STEPS.length - 1 && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving || !canNext()}
              className="btn-secondary flex items-center gap-2 disabled:opacity-40 text-sm"
            >
              {saving ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <Flag size={14} />}
              Sauvegarder
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={() => setStep(s => s + 1)}
              disabled={!canNext()}
              className="btn-primary flex items-center gap-1 disabled:opacity-40"
            >
              Suivant <ChevronRight size={16} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving || conflicts?.blockers?.length > 0}
              className="btn-primary flex items-center gap-2 disabled:opacity-40"
            >
              {saving ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <Flag size={16} />}
              {isEdit ? 'Mettre à jour' : 'Créer l\'objectif'}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  )
}
