const BASE = '/api'

async function handleError(res, url) {
  try {
    const data = await res.json()
    if (data.error) throw new Error(data.error)
  } catch (e) {
    if (e.message !== `API error ${res.status}: ${url}`) throw e
  }
  throw new Error(`API error ${res.status}: ${url}`)
}

async function get(url) {
  const res = await fetch(BASE + url, { credentials: 'include' })
  if (!res.ok) await handleError(res, url)
  return res.json()
}

async function post(url, body) {
  const res = await fetch(BASE + url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) await handleError(res, url)
  return res.json()
}

async function put(url, body) {
  const res = await fetch(BASE + url, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) throw new Error(`API error ${res.status}: ${url}`)
  return res.json()
}

async function del(url, body) {
  const res = await fetch(BASE + url, {
    method: 'DELETE',
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`API error ${res.status}: ${url}`)
  return res.json()
}

export const api = {
  // Athlete
  getAthlete: () => get('/athlete'),
  getZones: () => get('/athlete/zones'),
  getInsights: () => get('/athlete/insights'),

  // Activities
  getActivities: (params = {}) => {
    const q = new URLSearchParams(params).toString()
    return get(`/activities${q ? '?' + q : ''}`)
  },
  getAEIMonthly: () => get('/activities/aei-monthly'),
  getAEIDaily: (from, to) => {
    const q = new URLSearchParams()
    if (from) q.set('from', from)
    if (to) q.set('to', to)
    return get(`/activities/aei-daily${q.toString() ? '?' + q.toString() : ''}`)
  },
  getWeeklyVolume: (weeks = 12) => get(`/activities/weekly-volume?weeks=${weeks}`),
  getRaces: () => get('/activities/races'),
  getGarminRuns: (from) => get(`/activities/garmin${from ? '?from=' + from : ''}`),
  getATLCTL: (from) => get(`/activities/atl-ctl${from ? '?from=' + from : ''}`),
  getEnduranceScore: () => get('/activities/endurance-score'),
  getHillScore: () => get('/activities/hill-score'),
  getStrengthScore: () => get('/activities/strength-score'),
  getVO2maxTrend: () => get('/activities/vo2max'),

  // Daily log
  getDailyLogs: (params = {}) => {
    const q = new URLSearchParams(params).toString()
    return get(`/daily-log${q ? '?' + q : ''}`)
  },
  getDailyLog: (date) => get(`/daily-log/${date}`),
  saveDailyLog: (data) => post('/daily-log', data),
  saveHealth: (date, data) => put(`/daily-log/${date}/health`, data),
  deleteTraining: (date) => del(`/daily-log/${date}/training`),
  deleteDailyLog: (date) => del(`/daily-log/${date}`),

  // Training
  getTrainingPlan: () => get('/training/plan'),
  getSweetSpot: () => get('/training/sweet-spot'),
  getRaceTargets: () => get('/training/race-targets'),
  saveRaceTarget: (data) => post('/training/race-targets', data),
  updateRaceTarget: (race_id, data) => put(`/training/race-targets/${race_id}`, data),
  updateRaceGPX: (race_id, gpx_profile) => {
    return fetch(`/api/training/race-targets/${race_id}/gpx`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gpx_profile })
    }).then(r => r.json())
  },
  deleteRaceTarget: (race_id) => del(`/training/race-targets/${race_id}`),
  checkConflicts: (data) => post('/training/race-targets/check-conflicts', data),
  getFullPlan: (race_id) => get(`/training/full-plan/${race_id}`),
  generateAIPlan: (race_id) => post(`/training/ai-plan/${race_id}`, {}),
  getAIStatus: () => get('/training/ai-status'),
  getStrengthExercises: () => get('/training/strength-exercises'),
  getTodayAdapted: () => get('/training/today-adapted'),
  getPlanSessions: (from, to) => {
    const q = new URLSearchParams()
    if (from) q.set('from', from)
    if (to) q.set('to', to)
    return get(`/training/plan-sessions${q.toString() ? '?' + q.toString() : ''}`)
  },

  // Unavailability
  getUnavailability: () => get('/training/unavailability'),
  addUnavailability: (data) => post('/training/unavailability', data),
  deleteUnavailability: (id) => del(`/training/unavailability/${id}`),

  // Health
  getShoes: () => get('/health/shoes'),
  addShoe: (data) => post('/health/shoes', data),
  updateShoe: (id, data) => put(`/health/shoes/${id}`, data),
  deleteShoe: (id) => del(`/health/shoes/${id}`),
  getPolarization: (weeks = 12) => get(`/health/polarization?weeks=${weeks}`),
  getPainTimeline: (days = 30) => get(`/health/pain-timeline?days=${days}`),
  getCorrelations: () => get('/health/correlations'),
  getWeeklySummary: () => get('/health/weekly-summary'),
  getRecoverySuggestions: () => get('/health/recovery-suggestions'),

  // Race
  getRaceList: () => get('/race/list'),
  getRaceStrategy: (race_id) => get(`/race/strategy${race_id ? '?race_id=' + race_id : ''}`),
  getGPXProfile: (race_id) => get(`/race/gpx${race_id ? '?race_id=' + race_id : ''}`),
  getCheckpoints: (objective = 'a', race_id) => get(`/race/checkpoints?objective=${objective}${race_id ? '&race_id=' + race_id : ''}`),
  generateAIStrategy: (race_id) => post(`/race/ai-strategy/${race_id}`, {}),
  // Returns { strategy, generating, stale, generated_at }
  getAIStrategy: (race_id) => get(`/race/ai-strategy/${race_id}`),

  // Nutrition
  getNutritionSettings: () => get('/nutrition/settings'),
  saveNutritionSettings: (data) => put('/nutrition/settings', data),
  getDailyMenu: (date, regen = false) => get(`/nutrition/daily?date=${date}${regen ? '&regen=1' : ''}`),
  getNutritionWeek: (from) => get(`/nutrition/week?from=${from}`),
  deleteMenu: (date) => del(`/nutrition/daily/${date}`),
  generateWeekMenus: (from) => post(`/nutrition/generate-week${from ? '?from=' + from : ''}`, {}),
  // Sync recettes depuis utilisateur source
  syncFromSource: (from) => post(`/nutrition/sync-from-source${from ? '?from=' + from : ''}`, {}),
  // Liste de courses commune
  getShoppingList: (from) => get(`/nutrition/shopping-list${from ? '?from=' + from : ''}`),

  // Sync Garmin / Suunto
  getSyncStatus: () => get('/sync/status'),
  initGarminConnection: (username, password) => post('/sync/garmin/init', { username, password }),
  completeGarminMfa: (mfa_code, username, password) => post('/sync/garmin/mfa', { mfa_code, username, password }),
  deleteGarminConfig: () => del('/sync/garmin/config'),
  runGarminSync: () => post('/sync/garmin/run', {}),
  getActivityGpx: (date) => get(`/sync/gpx/${date}`),
  exportPlanToGarmin: (sessions) => post('/sync/garmin/export-plan', { sessions }),

  // Import / premier démarrage
  getImportStatus: () => get('/import/status'),
  convertImport: (raw_data, source, athlete_profile) => post('/import/convert', { raw_data, source, athlete_profile }),
  saveImport: (data) => post('/import/save', { data }),
  saveProfile: (profile) => post('/import/profile', profile),

  // Auth
  getMe: () => get('/auth/me'),
  getUsers: () => get('/auth/users'),
  changePassword: (current_password, new_password) => put('/auth/password', { current_password, new_password }),
  deleteAccount: (password) => del('/auth/account', { password }),
  exportData: () => window.open('/api/auth/export', '_blank'),
}
