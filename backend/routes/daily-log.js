const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { calculateAEI, getAEIStatus, checkSweetSpot } = require('../calc');
const { loadData } = require('../dataLoader');

// Sports for which AEI applies
const RUN_SPORTS = ['Course à pied', 'Trail', 'Tapis', 'Compétition'];

// Stair height in meters (standard step ≈ 18cm)
const STAIR_HEIGHT_M = 0.18;

function loadHistoricalActivities() {
  return loadData().activities || [];
}

// GET /api/daily-log
router.get('/', (req, res) => {
  const db = getDb();
  const { from, to, limit } = req.query;
  let query = 'SELECT * FROM daily_logs WHERE 1=1';
  const params = [];
  if (from) { query += ' AND date >= ?'; params.push(from); }
  if (to) { query += ' AND date <= ?'; params.push(to); }
  query += ' ORDER BY date DESC';
  if (limit) { query += ' LIMIT ?'; params.push(parseInt(limit)); }
  const rows = db.prepare(query).all(...params);
  res.json(rows.map(r => ({
    ...r,
    extra_sessions: r.extra_sessions_json ? JSON.parse(r.extra_sessions_json) : [],
  })));
});

// GET /api/daily-log/:date
router.get('/:date', (req, res) => {
  const db = getDb();
  const entry = db.prepare('SELECT * FROM daily_logs WHERE date = ?').get(req.params.date);
  if (!entry) return res.status(404).json({ error: 'Not found' });
  res.json({
    ...entry,
    extra_sessions: entry.extra_sessions_json ? JSON.parse(entry.extra_sessions_json) : [],
  });
});

// POST /api/daily-log — create/update
router.post('/', (req, res) => {
  const db = getDb();
  const {
    date, fc_repos, hrv, sensation, meteo_temp,
    sport, session_type,
    distance_km, dplus_m, duration_min, fc_moy, power_w,
    nb_marches,        // Escalier: number of steps
    extra_sessions,    // Array of additional sessions
    notes,
    rpe,               // RPE séance 1-10
    pain_zones,        // JSON: [{ zone, level }]
    shoe_id,           // Référence à la table shoes
  } = req.body;

  if (!date) return res.status(400).json({ error: 'date required' });

  const isRun = RUN_SPORTS.includes(sport);
  const isTreadmill = sport === 'Tapis';

  // Escalier: auto-compute D+ from nb_marches if not provided
  let effective_dplus = dplus_m;
  if (sport === 'Escalier' && nb_marches && !dplus_m) {
    effective_dplus = Math.round(nb_marches * STAIR_HEIGHT_M);
  }

  const dplus_corrected = effective_dplus || null;

  // AEI for running sports
  let aei = null;
  if (isRun && distance_km && duration_min && fc_moy) {
    aei = calculateAEI(distance_km, duration_min, dplus_corrected || 0, fc_moy);
  }

  const extraJson = extra_sessions?.length ? JSON.stringify(extra_sessions) : null;
  const painZonesJson = pain_zones ? JSON.stringify(pain_zones) : null;

  db.prepare(`
    INSERT INTO daily_logs
      (date, fc_repos, hrv, sensation, meteo_temp, sport, session_type,
       distance_km, dplus_m, duration_min, fc_moy, power_w,
       is_treadmill, dplus_corrected, aei, notes, nb_marches, extra_sessions_json,
       rpe, pain_zones, shoe_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(date) DO UPDATE SET
      fc_repos = excluded.fc_repos, hrv = excluded.hrv,
      sensation = excluded.sensation, meteo_temp = excluded.meteo_temp,
      sport = excluded.sport, session_type = excluded.session_type,
      distance_km = excluded.distance_km, dplus_m = excluded.dplus_m,
      duration_min = excluded.duration_min, fc_moy = excluded.fc_moy,
      power_w = excluded.power_w, is_treadmill = excluded.is_treadmill,
      dplus_corrected = excluded.dplus_corrected, aei = excluded.aei,
      notes = excluded.notes, nb_marches = excluded.nb_marches,
      extra_sessions_json = excluded.extra_sessions_json,
      rpe = excluded.rpe, pain_zones = excluded.pain_zones,
      shoe_id = excluded.shoe_id
  `).run(
    date,
    fc_repos || null, hrv || null, sensation || null, meteo_temp || null,
    sport || 'Course à pied', session_type || null,
    distance_km || null, effective_dplus || null, duration_min || null,
    fc_moy || null, power_w || null,
    isTreadmill ? 1 : 0, dplus_corrected, aei,
    notes || null,
    nb_marches || null, extraJson,
    rpe || null, painZonesJson, shoe_id || null
  );

  const entry = db.prepare('SELECT * FROM daily_logs WHERE date = ?').get(date);

  // Sweet spot check
  let sweetSpot = null;
  if (isRun) {
    try {
      const historical = loadHistoricalActivities();
      const dbRuns = db.prepare(
        "SELECT * FROM daily_logs WHERE distance_km IS NOT NULL AND (sport IS NULL OR sport IN ('Course à pied','Trail','Tapis','Compétition'))"
      ).all().map(r => ({
        Date: r.date,
        Distance_km: r.distance_km,
        D_plus_exact: r.dplus_corrected || r.dplus_m || 0,
        HR_moy: r.fc_moy,
        Temps_h: r.duration_min ? r.duration_min / 60 : null,
      }));
      sweetSpot = checkSweetSpot([...historical, ...dbRuns], '2026-05-15');
    } catch { /* ignore */ }
  }

  let message = null;
  if (aei) {
    if (aei >= 8.3) message = `Excellente séance ! AEI ${aei} — pic de forme 🔥`;
    else if (aei >= 7.5) message = `Bonne séance ! AEI ${aei} — forme solide`;
    else message = `Séance enregistrée. AEI ${aei} — récupération conseillée`;
  } else if (sport === 'Escalier') {
    const dplusOut = effective_dplus || dplus_m;
    const marchesNote = nb_marches ? ` (${nb_marches} marches × ${STAIR_HEIGHT_M * 100}cm)` : '';
    message = `Séance escalier — ${dplusOut}m D+${marchesNote} ✓`;
  } else if (sport === 'Renforcement') {
    message = 'Séance renforcement enregistrée ✓';
  } else if (!isRun) {
    const sportLabels = { 'Vélo extérieur': 'Sortie vélo', 'Vélo intérieur': 'Séance vélo indoor' };
    message = `${sportLabels[sport] || 'Séance'} enregistrée ✓`;
  }

  const totalSessions = 1 + (extra_sessions?.length || 0);

  res.json({
    entry: { ...entry, extra_sessions: entry.extra_sessions_json ? JSON.parse(entry.extra_sessions_json) : [] },
    aei, aei_status: getAEIStatus(aei),
    sweet_spot: sweetSpot,
    message,
    total_sessions: totalSessions,
  });
});

// DELETE /api/daily-log/:date
router.delete('/:date', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM daily_logs WHERE date = ?').run(req.params.date);
  res.json({ ok: true });
});

// PUT /api/daily-log/:date/health — upsert health fields only (keep training intact)
router.put('/:date/health', (req, res) => {
  const db = getDb();
  const { fc_repos, hrv, sensation, meteo_temp, sleep_h, sleep_quality, pain_zones } = req.body;
  const { date } = req.params;
  if (!date) return res.status(400).json({ error: 'date required' });

  const painZonesJson = pain_zones ? JSON.stringify(pain_zones) : null;

  db.prepare(`
    INSERT INTO daily_logs (date, fc_repos, hrv, sensation, meteo_temp, sleep_h, sleep_quality, pain_zones)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      fc_repos = COALESCE(excluded.fc_repos, daily_logs.fc_repos),
      hrv = COALESCE(excluded.hrv, daily_logs.hrv),
      sensation = COALESCE(excluded.sensation, daily_logs.sensation),
      meteo_temp = COALESCE(excluded.meteo_temp, daily_logs.meteo_temp),
      sleep_h = COALESCE(excluded.sleep_h, daily_logs.sleep_h),
      sleep_quality = COALESCE(excluded.sleep_quality, daily_logs.sleep_quality),
      pain_zones = COALESCE(excluded.pain_zones, daily_logs.pain_zones)
  `).run(date, fc_repos || null, hrv || null, sensation || null, meteo_temp || null, sleep_h ?? null, sleep_quality || null, painZonesJson);

  const entry = db.prepare('SELECT * FROM daily_logs WHERE date = ?').get(date);
  res.json({
    entry: { ...entry, extra_sessions: entry?.extra_sessions_json ? JSON.parse(entry.extra_sessions_json) : [] },
    message: 'Données de santé enregistrées ✓',
  });
});

// DELETE /api/daily-log/:date/training — clear training fields, keep health data
router.delete('/:date/training', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM daily_logs WHERE date = ?').get(req.params.date);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  db.prepare(`
    UPDATE daily_logs SET
      sport = NULL, session_type = NULL, distance_km = NULL, dplus_m = NULL,
      duration_min = NULL, fc_moy = NULL, power_w = NULL, is_treadmill = 0,
      dplus_corrected = NULL, aei = NULL, notes = NULL, nb_marches = NULL,
      extra_sessions_json = NULL
    WHERE date = ?
  `).run(req.params.date);

  res.json({ ok: true, message: 'Séance supprimée — données de santé conservées' });
});

module.exports = router;
