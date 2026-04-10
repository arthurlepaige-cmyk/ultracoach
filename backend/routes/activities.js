const express = require('express');
const router = express.Router();
const {
  calculateAEI, getRollingAEI,
  buildSessionsWithTRIMP, computeDynamicVO2max,
  extendATLCTL, computeEnduranceScore, computeHillScore, computeStrengthScore,
} = require('../calc');
const { loadData } = require('../dataLoader');
const { getDb } = require('../db');

// GET /api/activities — list with optional filters
router.get('/', (req, res) => {
  const data = loadData();
  let acts = data.activities;

  const { from, to, limit } = req.query;
  if (from) acts = acts.filter(a => new Date(a.Date) >= new Date(from));
  if (to) acts = acts.filter(a => new Date(a.Date) <= new Date(to));

  // Sort by date desc
  acts = acts.sort((a, b) => new Date(b.Date) - new Date(a.Date));

  if (limit) acts = acts.slice(0, parseInt(limit));

  res.json(acts);
});

// GET /api/activities/aei-monthly — AEI aggregated by month (JSON + DB)
router.get('/aei-monthly', (req, res) => {
  const data = loadData();
  const monthly = {};

  // From JSON historical activities
  for (const a of data.activities) {
    if (!a.HR_moy || isNaN(a.HR_moy) || a.HR_moy <= 0) continue;
    if (!a.Distance_km || a.Distance_km < 5) continue;
    const key = a.Date.slice(0, 7);
    const aei = calculateAEI(a.Distance_km, (a.Temps_h || 0) * 60, a.D_plus_exact || 0, a.HR_moy);
    if (!aei) continue;
    if (!monthly[key]) monthly[key] = { aeis: [], count: 0 };
    monthly[key].aeis.push(aei);
    monthly[key].count++;
  }

  // From daily_logs DB
  try {
    const db = getDb();
    const RUN_SPORTS = ['Course à pied', 'Trail', 'Tapis', 'Compétition'];
    const logs = db.prepare(
      "SELECT date, distance_km, duration_min, dplus_corrected, dplus_m, fc_moy, aei FROM daily_logs WHERE distance_km >= 5 AND fc_moy > 0"
    ).all();
    for (const l of logs) {
      const aei = l.aei || calculateAEI(l.distance_km, l.duration_min, l.dplus_corrected || l.dplus_m || 0, l.fc_moy);
      if (!aei) continue;
      const key = l.date.slice(0, 7);
      if (!monthly[key]) monthly[key] = { aeis: [], count: 0 };
      // Avoid double-counting if same date already in JSON
      if (!data.activities.some(a => a.Date === l.date)) {
        monthly[key].aeis.push(aei);
        monthly[key].count++;
      }
    }
  } catch {}

  const result = Object.entries(monthly)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({
      month,
      aei: Math.round((v.aeis.reduce((s, x) => s + x, 0) / v.aeis.length) * 100) / 100,
      count: v.count,
    }));

  res.json(result);
});

// GET /api/activities/aei-daily?from=YYYY-MM-DD&to=YYYY-MM-DD — per-session AEI detail
router.get('/aei-daily', (req, res) => {
  const now = new Date();
  const defaultFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  const from = req.query.from || defaultFrom;
  const to = req.query.to || defaultTo;

  const sessions = [];

  // From daily_logs DB
  try {
    const db = getDb();
    const logs = db.prepare(
      "SELECT date, sport, session_type, distance_km, dplus_m, dplus_corrected, duration_min, fc_moy, aei, notes FROM daily_logs WHERE date >= ? AND date <= ? ORDER BY date ASC"
    ).all(from, to);
    for (const l of logs) {
      const aei = l.aei || (l.distance_km >= 5 && l.fc_moy > 0
        ? calculateAEI(l.distance_km, l.duration_min, l.dplus_corrected || l.dplus_m || 0, l.fc_moy)
        : null);
      if (!aei) continue;
      sessions.push({
        date: l.date,
        aei: Math.round(aei * 100) / 100,
        distance_km: l.distance_km,
        dplus_m: l.dplus_corrected || l.dplus_m,
        duration_min: l.duration_min,
        fc_moy: l.fc_moy,
        sport: l.sport,
        session_type: l.session_type,
        notes: l.notes,
        source: 'log',
      });
    }
  } catch {}

  // From JSON historical activities (fill dates not in DB)
  const data = loadData();
  const dbDates = new Set(sessions.map(s => s.date));
  for (const a of data.activities) {
    if (a.Date < from || a.Date > to) continue;
    if (dbDates.has(a.Date)) continue;
    if (!a.HR_moy || a.HR_moy <= 0 || !a.Distance_km || a.Distance_km < 5) continue;
    const aei = calculateAEI(a.Distance_km, (a.Temps_h || 0) * 60, a.D_plus_exact || 0, a.HR_moy);
    if (!aei) continue;
    sessions.push({
      date: a.Date,
      aei: Math.round(aei * 100) / 100,
      distance_km: a.Distance_km,
      dplus_m: a.D_plus_exact,
      duration_min: (a.Temps_h || 0) * 60,
      fc_moy: a.HR_moy,
      sport: a.Sport || 'Course à pied',
      session_type: a.Type_seance || null,
      source: 'history',
    });
  }

  sessions.sort((a, b) => a.date.localeCompare(b.date));

  // Rolling 5-session average
  const result = sessions.map((s, i) => {
    const window = sessions.slice(Math.max(0, i - 4), i + 1);
    const rolling = Math.round((window.reduce((sum, x) => sum + x.aei, 0) / window.length) * 100) / 100;
    return { ...s, rolling };
  });

  res.json(result);
});

// GET /api/activities/weekly-volume — last N weeks
router.get('/weekly-volume', (req, res) => {
  const data = loadData();
  const acts = data.activities;
  const weeks = parseInt(req.query.weeks) || 12;

  const now = new Date();
  const result = [];

  for (let w = weeks - 1; w >= 0; w--) {
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() - w * 7);
    weekEnd.setHours(23, 59, 59);

    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() - 6);
    weekStart.setHours(0, 0, 0);

    const weekActs = acts.filter(a => {
      const d = new Date(a.Date);
      return d >= weekStart && d <= weekEnd;
    });

    const km = weekActs.reduce((s, a) => s + (a.Distance_km || 0), 0);
    const dplus = weekActs.reduce((s, a) => s + (a.D_plus_exact || 0), 0);

    result.push({
      week: weekStart.toISOString().split('T')[0],
      label: `S${String(weekStart.getMonth() + 1).padStart(2, '0')}/${weekStart.getDate()}`,
      km: Math.round(km * 10) / 10,
      dplus: Math.round(dplus),
      sessions: weekActs.length
    });
  }

  res.json(result);
});

// GET /api/activities/races
router.get('/races', (req, res) => {
  const data = loadData();
  res.json(data.races || []);
});

// GET /api/activities/garmin
router.get('/garmin', (req, res) => {
  const data = loadData();
  const { from } = req.query;
  let runs = data.garmin_runs || [];
  if (from) runs = runs.filter(r => new Date(r.date) >= new Date(from));
  res.json(runs);
});

// Helper: get all DB logs with HR data
function getDbLogs() {
  try {
    const db = getDb();
    return db.prepare('SELECT date, sport, distance_km, dplus_m, dplus_corrected, duration_min, fc_moy, extra_sessions_json FROM daily_logs ORDER BY date ASC').all();
  } catch { return []; }
}

// GET /api/activities/atl-ctl — historical series extended with dynamic computation
router.get('/atl-ctl', (req, res) => {
  const data = loadData();
  const { from } = req.query;
  const { fc_repos, fc_max } = data.athlete || { fc_repos: 48, fc_max: 187 };

  // Historical series from JSON
  let series = [...(data.atl_ctl || [])].sort((a, b) => a.date.localeCompare(b.date));

  // Find last known ATL/CTL
  const last = series.at(-1);
  if (last) {
    const dbLogs = getDbLogs();
    const sessions = buildSessionsWithTRIMP(data.activities, dbLogs, fc_repos, fc_max);
    const extended = extendATLCTL(last.date, last.atl, last.ctl, sessions);
    if (extended.length) series = [...series, ...extended];
  }

  if (from) series = series.filter(r => r.date >= from);
  res.json(series);
});

// GET /api/activities/endurance-score — historical + dynamic latest point
router.get('/endurance-score', (req, res) => {
  const data = loadData();
  const { fc_repos, fc_max, vo2max_current } = data.athlete || {};

  // Historical series from JSON
  const series = [...(data.endurance_score || [])].sort((a, b) => a.date.localeCompare(b.date));

  // Compute dynamic current value
  try {
    const dbLogs = getDbLogs();
    const sessions = buildSessionsWithTRIMP(data.activities, dbLogs, fc_repos || 48, fc_max || 187);
    const vo2 = computeDynamicVO2max(sessions, fc_repos || 48, fc_max || 187, vo2max_current) || vo2max_current || 59;
    const today = new Date().toISOString().slice(0, 10);
    const dynEs = computeEnduranceScore(sessions, vo2);
    if (dynEs) {
      // Replace or append today's value
      const lastStatic = series.at(-1);
      if (!lastStatic || lastStatic.date < today) {
        series.push({ date: today, es: dynEs, dynamic: true });
      } else if (lastStatic.date === today) {
        lastStatic.es = dynEs;
        lastStatic.dynamic = true;
      }
    }
  } catch {}

  res.json(series);
});

// GET /api/activities/hill-score — historical + dynamic latest point
router.get('/hill-score', (req, res) => {
  const data = loadData();
  const { fc_repos, fc_max } = data.athlete || { fc_repos: 48, fc_max: 187 };

  const series = [...(data.hill_score || [])].sort((a, b) => a.date.localeCompare(b.date));

  try {
    const dbLogs = getDbLogs();
    const sessions = buildSessionsWithTRIMP(data.activities, dbLogs, fc_repos || 48, fc_max || 187);
    const hs = computeHillScore(sessions);
    const today = new Date().toISOString().slice(0, 10);
    const lastStatic = series.at(-1);
    if (!lastStatic || lastStatic.date < today) {
      series.push({ date: today, hs_overall: hs.overall, hs_strength: hs.strength, hs_endurance: hs.endurance, dynamic: true });
    } else if (lastStatic.date === today) {
      lastStatic.hs_overall = hs.overall;
      lastStatic.hs_strength = hs.strength;
      lastStatic.hs_endurance = hs.endurance;
      lastStatic.dynamic = true;
    }
  } catch {}

  res.json(series);
});

// GET /api/activities/strength-score — dynamic strength score from logged sessions
router.get('/strength-score', (req, res) => {
  try {
    const dbLogs = getDbLogs();
    res.json(computeStrengthScore(dbLogs));
  } catch {
    res.json({ score: 0, sessions_28d: 0, target: 8 });
  }
});

// GET /api/activities/vo2max — dynamic VO2max trend
router.get('/vo2max', (req, res) => {
  const data = loadData();
  const { fc_repos, fc_max, vo2max_current } = data.athlete || {};
  try {
    const dbLogs = getDbLogs();
    const sessions = buildSessionsWithTRIMP(data.activities, dbLogs, fc_repos || 48, fc_max || 187);
    const dynamic = computeDynamicVO2max(sessions, fc_repos || 48, fc_max || 187, vo2max_current);
    // Also return garmin vo2max series for chart
    const garminSeries = (data.garmin_runs || [])
      .filter(r => r.vo2max && r.vo2max > 0)
      .map(r => ({ date: r.date?.slice(0, 10), vo2max: r.vo2max }));
    res.json({ current_garmin: vo2max_current, current_dynamic: dynamic, series: garminSeries });
  } catch {
    res.json({ current_garmin: vo2max_current, current_dynamic: null, series: [] });
  }
});

module.exports = router;
