import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { User, Upload, Cpu, CheckCircle, AlertTriangle, ChevronRight, ChevronLeft, Mountain, FileText, Loader2 } from 'lucide-react'
import { api } from '../api'

const STEPS = ['Profil', 'Données', 'Conversion', 'Terminé']

const SOURCES = [
  {
    id: 'garmin_csv',
    label: 'Garmin Connect',
    icon: '⌚',
    instructions: [
      'Va sur connect.garmin.com → ton profil (en haut à droite)',
      'Paramètres du compte → Exporter tes données',
      'Ou : Activités → clique sur une activité → Exporter en CSV',
      'Pour toutes les activités : Activités → le bouton export CSV en haut',
    ],
    hint: 'Format CSV avec colonnes : Activity Type, Date, Distance, Calories, Time, Avg HR, Max HR, Total Ascent…',
  },
  {
    id: 'strava_csv',
    label: 'Strava',
    icon: '🟠',
    instructions: [
      'Va sur strava.com → Paramètres → Mon compte',
      'Tout en bas : "Télécharger ou supprimer tes données"',
      'Demande ton archive → attends l\'email (quelques minutes)',
      'Dans l\'archive ZIP : ouvre le fichier activities.csv',
    ],
    hint: 'Format CSV avec colonnes : Activity Date, Activity Type, Distance, Elapsed Time, Elevation Gain, Average HR, Max HR…',
  },
  {
    id: 'suunto_csv',
    label: 'Suunto',
    icon: '🔵',
    instructions: [
      'Va sur suunto.com → Se connecter → Journal d\'entraînement',
      'Paramètres → Export des données',
      'Ou : utilise l\'app Suunto → Mon profil → Exporter',
    ],
    hint: 'Format CSV avec colonnes : Date, Duration, Distance (km), Avg HR (bpm), Max HR (bpm), Ascent (m)…',
  },
  {
    id: 'json_libre',
    label: 'Autre / JSON',
    icon: '📄',
    instructions: [
      'Colle directement un JSON contenant tes activités',
      'Ou un CSV avec au minimum : date, distance, durée',
      'L\'IA s\'adapte à la plupart des formats',
    ],
    hint: 'Tout format tabulaire ou JSON avec des activités de course à pied',
  },
]

export default function Setup({ onComplete }) {
  const [step, setStep] = useState(0)
  const [profile, setProfile] = useState({ name: '', fc_repos: '', fc_max: '', vo2max_current: '' })
  const [source, setSource] = useState(null)
  const [rawData, setRawData] = useState('')
  const [converting, setConverting] = useState(false)
  const [converted, setConverted] = useState(null)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [skipImport, setSkipImport] = useState(false)

  const setP = (k, v) => setProfile(p => ({ ...p, [k]: v }))

  const handleFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setRawData(ev.target.result)
    reader.readAsText(file)
  }

  const handleConvert = async () => {
    if (!rawData.trim()) return setError('Colle ou importe tes données d\'abord')
    setConverting(true)
    setError(null)
    try {
      const athleteProfile = profile.fc_max ? {
        name: profile.name || 'Athlète',
        fc_repos: parseInt(profile.fc_repos) || 50,
        fc_max: parseInt(profile.fc_max),
        vo2max_current: parseFloat(profile.vo2max_current) || null,
      } : null
      const result = await api.convertImport(rawData, source, athleteProfile)
      setConverted(result)
      setStep(2)
    } catch (e) {
      setError(e.message)
    } finally {
      setConverting(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (skipImport) {
        // Sauvegarde uniquement le profil
        await api.saveProfile({
          name: profile.name || 'Athlète',
          fc_repos: parseInt(profile.fc_repos) || 50,
          fc_max: parseInt(profile.fc_max) || 185,
          vo2max_current: parseFloat(profile.vo2max_current) || null,
        })
      } else {
        await api.saveImport(converted.data)
      }
      setStep(3)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const sourceCfg = SOURCES.find(s => s.id === source)

  return (
    <div className="min-h-screen bg-dark-900 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-xl">

        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <Mountain className="text-brand-green" size={28} />
          <span className="font-bold text-2xl text-gradient">Ultra Coach</span>
        </div>

        {/* Step indicator */}
        <div className="flex gap-2 mb-6">
          {STEPS.map((s, i) => (
            <div key={s} className="flex-1 flex flex-col items-center gap-1">
              <div className={`h-1.5 w-full rounded-full transition-colors ${i <= step ? 'bg-brand-green' : 'bg-dark-600'}`} />
              <span className={`text-xs ${i === step ? 'text-white' : 'text-gray-500'}`}>{s}</span>
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">

          {/* ── ÉTAPE 0 : Profil athlète ─────────────────────────────────── */}
          {step === 0 && (
            <motion.div key="step0" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="card space-y-5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-brand-green/10"><User size={20} className="text-brand-green" /></div>
                <div>
                  <h2 className="font-bold text-lg">Ton profil athlète</h2>
                  <p className="text-xs text-gray-400">Ces données servent à calculer tes zones de fréquence cardiaque</p>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-400 mb-1 block">Prénom</label>
                <input className="input-field" placeholder="ex. Sophie" value={profile.name} onChange={e => setP('name', e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">FC repos <span className="text-brand-green">*</span></label>
                  <input type="number" className="input-field" placeholder="ex. 48" value={profile.fc_repos} onChange={e => setP('fc_repos', e.target.value)} />
                  <p className="text-xs text-gray-500 mt-0.5">bpm au réveil</p>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">FC max <span className="text-brand-green">*</span></label>
                  <input type="number" className="input-field" placeholder="ex. 185" value={profile.fc_max} onChange={e => setP('fc_max', e.target.value)} />
                  <p className="text-xs text-gray-500 mt-0.5">bpm max atteint en course</p>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">VO2max estimé <span className="text-gray-500">(optionnel)</span></label>
                <input type="number" className="input-field" placeholder="ex. 52" value={profile.vo2max_current} onChange={e => setP('vo2max_current', e.target.value)} />
                <p className="text-xs text-gray-500 mt-0.5">ml/kg/min — visible sur Garmin Connect ou Suunto</p>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => setStep(1)}
                  disabled={!profile.fc_repos || !profile.fc_max}
                  className="btn-primary flex items-center gap-1 disabled:opacity-40"
                >
                  Suivant <ChevronRight size={16} />
                </button>
              </div>
            </motion.div>
          )}

          {/* ── ÉTAPE 1 : Source des données ─────────────────────────────── */}
          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="space-y-4">
              <div className="card">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-lg bg-brand-blue/10"><Upload size={20} className="text-brand-blue" /></div>
                  <div>
                    <h2 className="font-bold text-lg">Tes données d'entraînement</h2>
                    <p className="text-xs text-gray-400">Importe ton historique pour des recommandations personnalisées</p>
                  </div>
                </div>

                {/* Choix source */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {SOURCES.map(s => (
                    <button key={s.id} onClick={() => setSource(s.id)}
                      className={`p-3 rounded-lg border text-left transition-all ${source === s.id ? 'border-brand-green bg-green-500/10' : 'border-dark-500 hover:border-dark-400'}`}>
                      <div className="text-lg mb-0.5">{s.icon}</div>
                      <div className="text-sm font-medium">{s.label}</div>
                    </button>
                  ))}
                </div>

                {/* Instructions d'export */}
                {sourceCfg && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    className="p-3 rounded-lg bg-dark-700 border border-dark-500 mb-4">
                    <p className="text-xs font-bold text-brand-green mb-2">Comment exporter depuis {sourceCfg.label} :</p>
                    <ol className="space-y-1">
                      {sourceCfg.instructions.map((inst, i) => (
                        <li key={i} className="text-xs text-gray-300 flex gap-2">
                          <span className="text-brand-green shrink-0">{i + 1}.</span>{inst}
                        </li>
                      ))}
                    </ol>
                    <p className="text-xs text-gray-500 mt-2 italic">{sourceCfg.hint}</p>
                  </motion.div>
                )}

                {/* Zone de dépôt / paste */}
                {source && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">Importe ou colle ton fichier ici</label>
                      <label className="flex items-center gap-2 p-3 border border-dashed border-dark-400 rounded-lg cursor-pointer hover:border-brand-green transition-colors">
                        <FileText size={16} className="text-gray-400" />
                        <span className="text-sm text-gray-400">Clique pour sélectionner le fichier CSV ou JSON</span>
                        <input type="file" accept=".csv,.json,.txt" className="hidden" onChange={handleFile} />
                      </label>
                      {rawData && (
                        <p className="text-xs text-brand-green mt-1">✓ {rawData.split('\n').length} lignes chargées</p>
                      )}
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">Ou colle directement le contenu</label>
                      <textarea
                        className="input-field min-h-[120px] font-mono text-xs"
                        placeholder="Colle ici le contenu CSV ou JSON..."
                        value={rawData}
                        onChange={e => setRawData(e.target.value)}
                      />
                    </div>
                  </motion.div>
                )}

                {error && (
                  <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30 flex gap-2">
                    <AlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-300">{error}</p>
                  </div>
                )}
              </div>

              <div className="flex gap-3 justify-between">
                <button onClick={() => setStep(0)} className="btn-secondary flex items-center gap-1">
                  <ChevronLeft size={16} /> Retour
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setSkipImport(true); handleSave() }}
                    className="btn-secondary text-sm text-gray-400"
                  >
                    Passer — démarrer sans historique
                  </button>
                  <button
                    onClick={handleConvert}
                    disabled={!source || !rawData.trim() || converting}
                    className="btn-primary flex items-center gap-2 disabled:opacity-40"
                  >
                    {converting ? <Loader2 size={14} className="animate-spin" /> : <Cpu size={14} />}
                    {converting ? 'Conversion IA…' : 'Convertir avec l\'IA'}
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── ÉTAPE 2 : Résultat conversion ────────────────────────────── */}
          {step === 2 && converted && (
            <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="space-y-4">
              <div className="card">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-lg bg-green-500/10"><CheckCircle size={20} className="text-brand-green" /></div>
                  <div>
                    <h2 className="font-bold text-lg">Conversion réussie</h2>
                    <p className="text-xs text-gray-400">Vérifie les données avant de confirmer</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="p-3 rounded-lg bg-dark-700">
                    <p className="text-2xl font-black text-brand-green">{converted.stats.activity_count}</p>
                    <p className="text-xs text-gray-400">activités course importées</p>
                  </div>
                  <div className="p-3 rounded-lg bg-dark-700">
                    <p className="text-2xl font-black text-brand-blue">{converted.stats.with_hr}</p>
                    <p className="text-xs text-gray-400">avec données FC</p>
                  </div>
                  <div className="p-3 rounded-lg bg-dark-700 col-span-2">
                    <p className="text-sm font-medium">{converted.stats.date_from} → {converted.stats.date_to}</p>
                    <p className="text-xs text-gray-400">période couverte</p>
                  </div>
                </div>

                <div className="p-2 rounded bg-dark-700/50 mb-3">
                  <p className="text-xs text-gray-400">Converti via <span className="text-brand-purple font-medium">{converted.provider}</span></p>
                </div>

                {/* Aperçu des 3 premières activités */}
                <div className="space-y-1">
                  <p className="text-xs text-gray-400 mb-1">Aperçu des premières activités :</p>
                  {converted.data.activities.slice(0, 3).map((a, i) => (
                    <div key={i} className="flex items-center justify-between text-xs p-2 rounded bg-dark-700">
                      <span className="text-gray-300">{a.Date?.slice(0, 10)}</span>
                      <span className="text-white font-medium">{a.Distance_km?.toFixed(1)} km</span>
                      <span className="text-gray-400">D+ {a.D_plus_exact || 0}m</span>
                      <span className="text-gray-400">{a.HR_moy ? `FC ${a.HR_moy}` : 'Sans FC'}</span>
                    </div>
                  ))}
                </div>

                {error && (
                  <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                    <p className="text-xs text-red-300">{error}</p>
                  </div>
                )}
              </div>

              <div className="flex gap-3 justify-between">
                <button onClick={() => setStep(1)} className="btn-secondary flex items-center gap-1">
                  <ChevronLeft size={16} /> Recommencer
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="btn-primary flex items-center gap-2 disabled:opacity-40"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                  {saving ? 'Sauvegarde…' : 'Confirmer et démarrer'}
                </button>
              </div>
            </motion.div>
          )}

          {/* ── ÉTAPE 3 : Terminé ────────────────────────────────────────── */}
          {step === 3 && (
            <motion.div key="step3" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              className="card text-center space-y-4">
              <div className="flex justify-center">
                <div className="p-4 rounded-full bg-green-500/10">
                  <Mountain size={40} className="text-brand-green" />
                </div>
              </div>
              <h2 className="font-bold text-xl">Tout est prêt, {profile.name || 'athlète'} !</h2>
              <p className="text-sm text-gray-400">
                {skipImport
                  ? 'Ton profil est créé. Commence par encoder quelques séances dans le Journal pour que l\'app apprenne à te connaître.'
                  : `${converted?.stats.activity_count || ''} activités importées. L'app va maintenant calculer tes métriques personnelles.`
                }
              </p>
              <button onClick={onComplete} className="btn-primary w-full text-base py-3">
                Ouvrir Ultra Coach →
              </button>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  )
}
