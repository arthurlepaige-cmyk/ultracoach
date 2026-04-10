import React, { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { LayoutDashboard, Calendar, Map, BarChart2, ClipboardList, Sun, Moon, Mountain, Settings, Utensils, LogOut, User } from 'lucide-react'
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

function AppContent() {
  const { user, logout } = useAuth()
  const [darkMode, setDarkMode] = useState(true)
  const [setupDone, setSetupDone] = useState(true)
  const [showSetup, setShowSetup] = useState(false)

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
                <span className="hidden md:flex items-center gap-1.5 text-xs text-gray-400 mr-1">
                  <User size={13} />
                  {user.name}
                </span>
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
