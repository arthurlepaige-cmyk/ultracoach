import React, { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { LayoutDashboard, Calendar, Map, BarChart2, ClipboardList, Sun, Moon, Mountain, Settings, Utensils, LogOut, User, KeyRound, X } from 'lucide-react'
import Dashboard from './pages/Dashboard'
import Training from './pages/Training'
import RaceStrategy from './pages/RaceStrategy'
import Analytics from './pages/Analytics'
import DailyLog from './pages/DailyLog'
import Nutrition from './pages/Nutrition'
import Setup from './pages/Setup'
import Login from './pages/Login'
import { AuthProvider, useAuth } from './context/AuthContext'
import { api } from './api'

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Tableau de bord' },
  { path: '/log', icon: ClipboardList, label: 'Journal' },
  { path: '/training', icon: Calendar, label: 'Plan' },
  { path: '/race', icon: Map, label: 'Course' },
  { path: '/nutrition', icon: Utensils, label: 'Nutrition' },
  { path: '/analytics', icon: BarChart2, label: 'Analyses' },
]

function AccountPanel({ onClose }) {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (form.next !== form.confirm) { setStatus({ ok: false, msg: 'Les mots de passe ne correspondent pas' }); return }
    if (form.next.length < 8) { setStatus({ ok: false, msg: 'Minimum 8 caractères' }); return }
    setLoading(true)
    try {
      await api.changePassword(form.current, form.next)
      setStatus({ ok: true, msg: 'Mot de passe changé !' })
      setForm({ current: '', next: '', confirm: '' })
    } catch (e) {
      setStatus({ ok: false, msg: e.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-dark-800 border border-dark-600 rounded-xl w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold flex items-center gap-2"><KeyRound size={16} className="text-brand-green" />Changer le mot de passe</h3>
          <button onClick={onClose} className="p-1 hover:bg-dark-600 rounded"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Mot de passe actuel</label>
            <input type="password" className="input-field w-full" value={form.current} onChange={e => setForm(f => ({ ...f, current: e.target.value }))} required />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Nouveau mot de passe</label>
            <input type="password" className="input-field w-full" placeholder="Minimum 8 caractères" value={form.next} onChange={e => setForm(f => ({ ...f, next: e.target.value }))} required />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Confirmer</label>
            <input type="password" className="input-field w-full" value={form.confirm} onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))} required />
          </div>
          {status && (
            <p className={`text-xs px-3 py-2 rounded-lg ${status.ok ? 'bg-green-500/10 text-green-300' : 'bg-red-500/10 text-red-300'}`}>{status.msg}</p>
          )}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Annuler</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">{loading ? '...' : 'Changer'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function AppContent() {
  const { user, logout } = useAuth()
  const [darkMode, setDarkMode] = useState(true)
  const [setupDone, setSetupDone] = useState(true)
  const [showSetup, setShowSetup] = useState(false)
  const [showAccount, setShowAccount] = useState(false)

  useEffect(() => {
    if (!user) return
    api.getImportStatus().then(s => {
      setSetupDone(s.has_data)
    }).catch(() => setSetupDone(true))
  }, [user])

  // Loading state
  if (user === undefined) {
    return (
      <div className="min-h-screen bg-dark-900 flex items-center justify-center">
        <Mountain className="text-brand-green animate-pulse" size={32} />
      </div>
    )
  }

  // Not authenticated
  if (!user) return <Login />

  if (!setupDone || showSetup) {
    return <Setup onComplete={() => { setSetupDone(true); setShowSetup(false) }} />
  }

  return (
    <BrowserRouter>
      <div className={darkMode ? 'dark' : ''}>
        <div className="min-h-screen bg-dark-900 text-white flex flex-col">
          {/* Top nav */}
          <header className="bg-dark-800 border-b border-dark-600 sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mountain className="text-brand-green" size={22} />
                <span className="font-bold text-lg text-gradient">Ultra Coach</span>
              </div>

              {/* Desktop nav */}
              <nav className="hidden md:flex items-center gap-1">
                {navItems.map(({ path, icon: Icon, label }) => (
                  <NavLink
                    key={path}
                    to={path}
                    end={path === '/'}
                    className={({ isActive }) =>
                      `nav-link ${isActive ? 'active' : ''}`
                    }
                  >
                    <Icon size={16} />
                    {label}
                  </NavLink>
                ))}
              </nav>

              <div className="flex items-center gap-1">
                <button onClick={() => setShowAccount(true)} className="hidden md:flex items-center gap-1.5 text-xs text-gray-400 hover:text-white mr-1 px-2 py-1 rounded-lg hover:bg-dark-600 transition-colors">
                  <User size={13} />
                  {user.name}
                </button>
                <button
                  onClick={() => setShowSetup(true)}
                  className="p-2 rounded-lg hover:bg-dark-600 text-gray-400 hover:text-white transition-colors"
                  title="Gérer les données / profil"
                >
                  <Settings size={18} />
                </button>
                <button
                  onClick={() => setDarkMode(!darkMode)}
                  className="p-2 rounded-lg hover:bg-dark-600 text-gray-400 hover:text-white transition-colors"
                >
                  {darkMode ? <Sun size={18} /> : <Moon size={18} />}
                </button>
                <button
                  onClick={logout}
                  className="p-2 rounded-lg hover:bg-dark-600 text-gray-400 hover:text-red-400 transition-colors"
                  title="Se déconnecter"
                >
                  <LogOut size={18} />
                </button>
              </div>
            </div>
          </header>

          {showAccount && <AccountPanel onClose={() => setShowAccount(false)} />}

          {/* Main content */}
          <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/log" element={<DailyLog />} />
              <Route path="/training" element={<Training />} />
              <Route path="/race" element={<RaceStrategy />} />
              <Route path="/nutrition" element={<Nutrition />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/setup" element={<Setup onComplete={() => setShowSetup(false)} />} />
            </Routes>
          </main>

          {/* Mobile bottom nav */}
          <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-dark-800 border-t border-dark-600 flex">
            {navItems.map(({ path, icon: Icon, label }) => (
              <NavLink
                key={path}
                to={path}
                end={path === '/'}
                className={({ isActive }) =>
                  `flex-1 flex flex-col items-center py-2 text-xs transition-colors ${
                    isActive ? 'text-brand-green' : 'text-gray-500'
                  }`
                }
              >
                <Icon size={20} />
                <span className="mt-0.5">{label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      </div>
    </BrowserRouter>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
