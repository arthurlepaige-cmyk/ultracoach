import React, { useState } from 'react'
import { Mountain, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { login, register } = useAuth()
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [form, setForm] = useState({ email: '', password: '', name: '', consent: false })
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function set(key, val) {
    setForm(f => ({ ...f, [key]: val }))
    setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'login') {
        await login(form.email, form.password)
      } else {
        if (!form.consent) {
          setError('Vous devez accepter les conditions pour créer un compte.')
          setLoading(false)
          return
        }
        await register(form.email, form.password, form.name, form.consent)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Mountain className="text-brand-green" size={32} />
            <span className="font-bold text-2xl text-gradient">Ultra Coach</span>
          </div>
          <p className="text-gray-400 text-sm">Préparation trail · Chevaliers & UTMB</p>
        </div>

        {/* Card */}
        <div className="bg-dark-800 rounded-2xl p-6 border border-dark-600">
          {/* Tabs */}
          <div className="flex mb-6 bg-dark-700 rounded-xl p-1">
            {['login', 'register'].map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setError('') }}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                  mode === m ? 'bg-brand-green text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                {m === 'login' ? 'Connexion' : 'Inscription'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs text-gray-400 mb-1">Prénom</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => set('name', e.target.value)}
                  placeholder="Arthur"
                  className="input-field w-full"
                />
              </div>
            )}

            <div>
              <label className="block text-xs text-gray-400 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={e => set('email', e.target.value)}
                placeholder="arthur@example.com"
                required
                className="input-field w-full"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Mot de passe</label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => set('password', e.target.value)}
                  placeholder={mode === 'register' ? 'Minimum 8 caractères' : '••••••••'}
                  required
                  className="input-field w-full pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {mode === 'register' && (
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.consent}
                  onChange={e => set('consent', e.target.checked)}
                  className="mt-0.5 accent-brand-green"
                />
                <span className="text-xs text-gray-400 leading-relaxed">
                  J'accepte que mes données d'entraînement soient stockées sur ce serveur.
                  Je peux les exporter ou supprimer mon compte à tout moment (RGPD).
                </span>
              </label>
            )}

            {error && (
              <div className="flex items-center gap-2 text-red-400 text-sm bg-red-400/10 rounded-lg px-3 py-2">
                <AlertCircle size={14} className="shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-brand-green hover:bg-brand-green/90 disabled:opacity-50 text-white font-medium rounded-xl transition-colors"
            >
              {loading ? '...' : mode === 'login' ? 'Se connecter' : 'Créer mon compte'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-600 mt-4">
          Ultra Coach · Données stockées localement
        </p>
      </div>
    </div>
  )
}
