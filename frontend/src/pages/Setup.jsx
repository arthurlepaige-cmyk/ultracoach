import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { User, Upload, Cpu, CheckCircle, AlertTriangle, ChevronRight, ChevronLeft, Mountain, FileText, Loader2, RefreshCw, Wifi, WifiOff, Trash2, Heart, Unlink } from 'lucide-react'
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

function SyncTab({ onClose }) {
  const [garmin, setGarmin] = useState({ username: '', password: '' })
  const [mfaCode, setMfaCode] = useState('')
  const [status, setStatus] = useState(null)
  const [step, setStep] = useState('idle') // idle | connecting | need_mfa | configured
  const [syncing, setSyncing] = useState(false)
  const [msg, setMsg] = useState(null)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    api.getSyncStatus().then(s => {
      setStatus(s)
      if (s.garmin?.username) {
        setGarmin(g => ({ ...g, username: s.garmin.username }))
        setStep('configured')
      }
    }).catch(() => {})
  }, [])

  async function handleConnect() {
    if (!garmin.username || !garmin.password) return
    setStep('connecting'); setMsg(null)
    try {
      const r = await api.initGarminConnection(garmin.username, garmin.password)
      if (r.need_mfa) {
        setStep('need_mfa')
        setMsg({ ok: true, text: 'Garmin a envoyé un code de vérification à ton adresse email. Saisis-le ci-dessous.' })
      } else {
        const s = await api.getSyncStatus()
        setStatus(s)
        setStep('configured')
        setMsg({ ok: true, text: 'Connexion établie !' })
        setGarmin(g => ({ ...g, password: '' }))
      }
    } catch (e) {
      setStep('idle')
      setMsg({ ok: false, text: e.message })
    }
  }

  async function handleMfa() {
    if (!mfaCode.trim()) return
    setStep('connecting'); setMsg(null)
    try {
      await api.completeGarminMfa(mfaCode, garmin.username, garmin.password)
      const s = await api.getSyncStatus()
      setStatus(s)
      setStep('configured')
      setMsg({ ok: true, text: 'Connexion Garmin établie !' })
      setMfaCode('')
      setGarmin(g => ({ ...g, password: '' }))
    } catch (e) {
      setStep('need_mfa')
      setMsg({ ok: false, text: e.message })
    }
  }

  async function handleSync() {
    setSyncing(true); setMsg(null)
    try {
      const r = await api.runGarminSync()
      const s = await api.getSyncStatus()
      setStatus(s)
      setMsg({ ok: true, text: `Sync OK — ${r.savedActivities} activité(s) + ${r.savedHealthDays} jour(s) santé` })
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    } finally { setSyncing(false) }
  }

  async function handleDelete() {
    if (!confirm('Déconnecter Garmin et supprimer les tokens ?')) return
    await api.deleteGarminConfig()
    setStatus(s => ({ ...s, garmin: null }))
    setGarmin({ username: '', password: '' })
    setStep('idle')
    setMsg({ ok: true, text: 'Connexion Garmin supprimée' })
  }

  const isConfigured = step === 'configured'
  const isConnecting = step === 'connecting'
  const lastSync = status?.garmin?.last_sync

  return (
    <div className="space-y-5">
      {/* Garmin */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-brand-blue/10 text-xl">⌚</div>
            <div>
              <h3 className="font-bold">Garmin Connect</h3>
              <p className="text-xs text-gray-400">Activités + HRV + FC repos + sommeil</p>
            </div>
          </div>
          {isConfigured
            ? <span className="flex items-center gap-1 text-xs text-brand-green"><Wifi size={12} />Connecté</span>
            : <span className="flex items-center gap-1 text-xs text-gray-500"><WifiOff size={12} />Non configuré</span>
          }
        </div>

        {lastSync && (
          <div className="p-2 rounded bg-dark-700 text-xs text-gray-400">
            Dernière sync : {new Date(lastSync).toLocaleString('fr-FR')} · {status.garmin.last_sync_activities} activité(s)
          </div>
        )}

        {/* Formulaire connexion */}
        {!isConfigured && (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Email Garmin Connect</label>
              <input className="input-field w-full" placeholder="ton.email@exemple.com"
                value={garmin.username} onChange={e => setGarmin(g => ({ ...g, username: e.target.value }))} />
            </div>
            {step !== 'need_mfa' && (
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Mot de passe Garmin</label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'}
                    className="input-field w-full pr-16" placeholder="Mot de passe"
                    value={garmin.password} onChange={e => setGarmin(g => ({ ...g, password: e.target.value }))} />
                  <button type="button" onClick={() => setShowPassword(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-white px-1">
                    {showPassword ? 'Cacher' : 'Voir'}
                  </button>
                </div>
              </div>
            )}
            {step === 'need_mfa' && (
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Code de vérification (reçu par email Garmin)</label>
                <input className="input-field w-full tracking-widest text-center text-lg" placeholder="123456"
                  maxLength={8} value={mfaCode} onChange={e => setMfaCode(e.target.value)} />
              </div>
            )}
          </div>
        )}

        {msg && (
          <p className={`text-xs px-3 py-2 rounded-lg ${msg.ok ? 'bg-green-500/10 text-green-300' : 'bg-red-500/10 text-red-300'}`}>
            {msg.text}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {!isConfigured && step !== 'need_mfa' && (
            <button onClick={handleConnect}
              disabled={!garmin.username || !garmin.password || isConnecting}
              className="btn-primary flex items-center gap-1.5 text-sm disabled:opacity-40">
              {isConnecting ? <Loader2 size={13} className="animate-spin" /> : <Wifi size={13} />}
              {isConnecting ? 'Connexion…' : 'Se connecter à Garmin'}
            </button>
          )}
          {step === 'need_mfa' && (
            <>
              <button onClick={handleMfa} disabled={!mfaCode.trim() || isConnecting}
                className="btn-primary flex items-center gap-1.5 text-sm disabled:opacity-40">
                {isConnecting ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                {isConnecting ? 'Vérification…' : 'Confirmer le code'}
              </button>
              <button onClick={() => { setStep('idle'); setMsg(null); }}
                className="btn-secondary text-sm">Retour</button>
            </>
          )}
          {isConfigured && (
            <>
              <button onClick={handleSync} disabled={syncing}
                className="btn-primary flex items-center gap-1.5 text-sm disabled:opacity-40">
                {syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                {syncing ? 'Sync en cours…' : 'Synchroniser maintenant'}
              </button>
              <button onClick={handleDelete}
                className="p-2 rounded-lg hover:bg-red-500/10 text-gray-500 hover:text-red-400 transition-colors">
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>

        <p className="text-xs text-gray-500">
          Connexion sécurisée — les tokens OAuth sont stockés uniquement sur ton serveur.
          Sync automatique chaque matin à 6h.
        </p>
      </div>

      {/* Suunto — placeholder */}
      <div className="card opacity-50 pointer-events-none space-y-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-dark-600 text-xl">🔵</div>
          <div>
            <h3 className="font-bold">Suunto</h3>
            <p className="text-xs text-gray-400">Bientôt disponible</p>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={onClose} className="btn-secondary">Fermer</button>
      </div>
    </div>
  )
}

// ── Composant Foyer ─────────────────────────────────────────────────────────
function FoyerTab() {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  const load = () => {
    setLoading(true)
    api.getPartner().then(d => { setStatus(d); setLoading(false) }).catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleLink = async () => {
    if (!email.trim()) return
    setSaving(true)
    setMsg(null)
    try {
      const r = await api.linkPartner(email.trim())
      setMsg({ ok: true, text: `Compte lié avec ${r.partner.name} — la liste de courses est maintenant partagée !` })
      load()
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    } finally {
      setSaving(false)
    }
  }

  const handleUnlink = async () => {
    setSaving(true)
    setMsg(null)
    try {
      await api.unlinkPartner()
      setMsg({ ok: true, text: 'Liaison supprimée.' })
      load()
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-gray-400" /></div>

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Heart size={16} className="text-brand-green" />
          <h3 className="font-semibold text-sm">Liste de courses commune</h3>
        </div>
        <p className="text-xs text-gray-400 leading-relaxed">
          En liant deux comptes, la liste de courses de la page Nutrition combine automatiquement
          les menus des deux athlètes. Chaque personne garde son historique et son plan d'entraînement indépendants.
        </p>

        {status?.linked ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 bg-dark-700 rounded-xl p-3">
              <CheckCircle size={16} className="text-brand-green flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{status.partner.name}</p>
                <p className="text-xs text-gray-400">{status.partner.email}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {status.role === 'source' ? 'Vos menus sont partagés avec ce compte' : 'Vous voyez les menus de ce compte'}
                </p>
              </div>
            </div>
            <button
              onClick={handleUnlink}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-red-500/30 text-red-400 text-sm hover:bg-red-500/10 transition-colors"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Unlink size={14} />}
              Supprimer la liaison
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Email du compte à lier</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="camille@exemple.com"
                className="input w-full text-sm"
                onKeyDown={e => e.key === 'Enter' && handleLink()}
              />
            </div>
            <p className="text-xs text-gray-500">
              L'autre personne doit d'abord créer son compte UltraCoach sur cette application.
              Une fois lié, sa liste de courses inclura vos menus.
            </p>
            <button
              onClick={handleLink}
              disabled={saving || !email.trim()}
              className="btn-primary w-full text-sm py-2.5 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Heart size={14} />}
              Lier les comptes
            </button>
          </div>
        )}

        {msg && (
          <p className={`text-xs rounded-lg px-3 py-2 ${msg.ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
            {msg.text}
          </p>
        )}
      </div>
    </div>
  )
}

export default function Setup({ onComplete }) {
  const [tab, setTab] = useState('import')  // 'import' | 'sync'
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

        {/* Tab selector */}
        <div className="flex gap-1 mb-6 bg-dark-800 p-1 rounded-xl">
          <button
            onClick={() => setTab('import')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'import' ? 'bg-dark-600 text-white' : 'text-gray-400 hover:text-white'}`}
          >
            Profil & Import
          </button>
          <button
            onClick={() => setTab('sync')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'sync' ? 'bg-dark-600 text-white' : 'text-gray-400 hover:text-white'}`}
          >
            Sync automatique
          </button>
          <button
            onClick={() => setTab('foyer')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'foyer' ? 'bg-dark-600 text-white' : 'text-gray-400 hover:text-white'}`}
          >
            Foyer
          </button>
        </div>

        {tab === 'sync' && <SyncTab onClose={onComplete} />}
        {tab === 'foyer' && <FoyerTab />}

        {tab === 'import' && <>
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
        </>}
      </div>
    </div>
  )
}
