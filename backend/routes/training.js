const express = require('express');

function getPainNoteForSession(session, activeHighPain) {
  if (!activeHighPain.length) return null;
  const zones = activeHighPain.map(z => z.zone);
  const sport = session.sport || '';
  const warnings = [];
  if ((zones.includes('genou_g') || zones.includes('genou_d')) && (sport.includes('Course') || sport.includes('Trail'))) {
    warnings.push('⚠ Genou douloureux — évite les descentes');
  }
  if ((zones.includes('achille_g') || zones.includes('achille_d') || zones.includes('mollet_g') || zones.includes('mollet_d')) && sport.includes('Escalier')) {
    warnings.push('⚠ Achille/mollet sensible — réduis l\'escalier');
  }
  if ((zones.includes('tibia_g') || zones.includes('tibia_d')) && (sport.includes('Course') || sport.includes('Trail'))) {
    warnings.push('⚠ Tibias sensibles — terrain souple si possible');
  }
  if ((zones.includes('lombaires') || zones.includes('haut_dos')) && sport.includes('Renforcement')) {
    warnings.push('⚠ Dos sensible — évite les charges lourdes');
  }
  return warnings.length ? warnings.join(' · ') : null;
}

const router = express.Router();
const { getDb } = require('../db');
const { checkSweetSpot, getTrainingPhase, estimateRaceTime, getBlockWeek } = require('../calc');
const { loadData } = require('../dataLoader');
const { callAI } = require('../ai');

// GET /api/training/plan — weekly training plan
router.get('/plan', (req, res) => {
  const data = loadData();
  const db = getDb();

  // Prefer priority A race from SQLite, fallback to JSON targets
  const dbRaces = db.prepare("SELECT * FROM race_targets WHERE active = 1 ORDER BY date ASC").all();
  const priorityA = dbRaces.find(r => r.priority === 'A' && new Date(r.date) > new Date());
  const fallbackRace = data.targets.find(t => new Date(t.date) > new Date());
  const nextRace = priorityA || fallbackRace;

  if (!nextRace) return res.json({ error: 'No upcoming race' });

  const today = new Date();
  const raceDate = new Date(nextRace.date);
  const daysUntilRace = Math.ceil((raceDate - today) / (1000 * 60 * 60 * 24));
  const phase = getTrainingPhase(daysUntilRace);

  const monday = new Date(today);
  const day = monday.getDay();
  monday.setDate(monday.getDate() + (day === 0 ? -6 : 1 - day));

  const raceDplus = nextRace.dplus_m || nextRace.dplus || 0;
  const weekPlan = generateWeekPlan(phase.phase, data.athlete, daysUntilRace, monday, raceDplus);

  res.json({
    phase,
    days_until_race: daysUntilRace,
    race: nextRace,
    week_start: monday.toISOString().split('T')[0],
    plan: weekPlan,
    gpx_available: !!nextRace.gpx_profile,
  });
});

// GET /api/training/sweet-spot
router.get('/sweet-spot', (req, res) => {
  const data = loadData();
  const db = getDb();

  const nextRace = data.targets.find(t => new Date(t.date) > new Date());
  if (!nextRace) return res.json(null);

  const dbActs = db.prepare('SELECT * FROM daily_logs WHERE distance_km IS NOT NULL').all().map(r => ({
    Date: r.date,
    Distance_km: r.distance_km,
    D_plus_exact: r.dplus_corrected || r.dplus_m || 0,
  }));

  const allActs = [...data.activities, ...dbActs];
  const ss = checkSweetSpot(allActs, nextRace.date);

  res.json({ ...ss, race: nextRace.name, race_date: nextRace.date });
});

// GET /api/training/race-targets
router.get('/race-targets', (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM race_targets ORDER BY date ASC').all());
});

// GET /api/training/race-targets/:race_id/conflicts — check impact on priority A races
router.get('/race-targets/:race_id/conflicts', (req, res) => {
  const db = getDb();
  const race = db.prepare('SELECT * FROM race_targets WHERE race_id = ?').get(req.params.race_id);
  if (!race) return res.status(404).json({ error: 'Not found' });
  res.json(checkConflicts(race, db));
});

// POST /api/training/race-targets/check-conflicts — pre-save conflict check
router.post('/race-targets/check-conflicts', (req, res) => {
  const db = getDb();
  res.json(checkConflicts(req.body, db));
});

// PATCH /api/training/race-targets/:race_id/gpx — update GPX only (can be called anytime)
router.patch('/race-targets/:race_id/gpx', (req, res) => {
  const db = getDb();
  const { gpx_profile } = req.body;
  if (!gpx_profile) return res.status(400).json({ error: 'gpx_profile required' });
  const race = db.prepare('SELECT * FROM race_targets WHERE race_id = ?').get(req.params.race_id);
  if (!race) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE race_targets SET gpx_profile = ? WHERE race_id = ?').run(gpx_profile, req.params.race_id);
  // Trigger background AI strategy regeneration with new GPX data
  const { generateAndSaveStrategy } = require('./race');
  generateAndSaveStrategy(req.params.race_id).catch(console.error);
  res.json({ ok: true, race_id: req.params.race_id, message: 'GPX mis à jour — stratégie IA en cours de recalcul' });
});

// POST /api/training/race-targets
router.post('/race-targets', (req, res) => {
  const db = getDb();
  const {
    name, date, distance_km, dplus_m, dminus_m, start_time,
    obj_a_time_h, obj_b_time_h, obj_c_time_h,
    priority, race_type, tapering, recovery_days,
    weekly_runs_target, weekly_workouts_target, long_run_day,
    weekend_available, terrain_access, notes_planning,
    gpx_profile
  } = req.body;

  const race_id = `${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${date}`;

  // Auto-estimate recovery days based on distance if not provided
  const autoRecovery = recovery_days || estimateRecoveryDays(distance_km, dplus_m);
  const autoTapering = tapering !== undefined ? tapering : (priority === 'A' ? 1 : priority === 'B' ? 1 : 0);

  db.prepare(`
    INSERT OR REPLACE INTO race_targets
    (race_id, name, date, distance_km, dplus_m, dminus_m, start_time,
     obj_a_time_h, obj_b_time_h, obj_c_time_h,
     priority, race_type, tapering, recovery_days,
     weekly_runs_target, weekly_workouts_target, long_run_day,
     weekend_available, terrain_access, notes_planning, gpx_profile)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    race_id, name, date, distance_km, dplus_m, dminus_m || null, start_time || '00:00',
    obj_a_time_h || estimateRaceTime(distance_km, dplus_m) * 0.9,
    obj_b_time_h || estimateRaceTime(distance_km, dplus_m),
    obj_c_time_h || estimateRaceTime(distance_km, dplus_m) * 1.1,
    priority || 'A', race_type || 'trail',
    autoTapering, autoRecovery,
    weekly_runs_target || null, weekly_workouts_target || null,
    long_run_day || null, weekend_available !== undefined ? (weekend_available ? 1 : 0) : 1,
    terrain_access || 'mixte', notes_planning || null,
    gpx_profile || null
  );

  const saved = db.prepare('SELECT * FROM race_targets WHERE race_id = ?').get(race_id);
  const conflicts = checkConflicts(saved, db);

  // Trigger background AI strategy generation for new race
  const { generateAndSaveStrategy } = require('./race');
  generateAndSaveStrategy(race_id).catch(console.error);

  res.json({ race: saved, conflicts });
});

// PUT /api/training/race-targets/:race_id
router.put('/race-targets/:race_id', (req, res) => {
  const db = getDb();
  const fields = [
    'name','date','distance_km','dplus_m','dminus_m','start_time',
    'obj_a_time_h','obj_b_time_h','obj_c_time_h',
    'priority','race_type','tapering','recovery_days',
    'weekly_runs_target','weekly_workouts_target','long_run_day',
    'weekend_available','terrain_access','notes_planning','gpx_profile','active'
  ];
  const updates = fields.filter(f => req.body[f] !== undefined);
  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

  // Si la priorité change, invalide la stratégie IA stockée → sera régénérée avec le bon contexte
  const strategyInvalidatingFields = ['priority', 'obj_a_time_h', 'obj_b_time_h', 'obj_c_time_h', 'date', 'distance_km', 'dplus_m'];
  const needsStrategyReset = updates.some(f => strategyInvalidatingFields.includes(f));

  const set = updates.map(f => `${f} = ?`).join(', ');
  const vals = updates.map(f => req.body[f]);
  db.prepare(`UPDATE race_targets SET ${set} WHERE race_id = ?`).run(...vals, req.params.race_id);

  if (needsStrategyReset) {
    db.prepare('UPDATE race_targets SET ai_strategy = NULL, ai_strategy_generated_at = NULL WHERE race_id = ?')
      .run(req.params.race_id);
  }

  res.json(db.prepare('SELECT * FROM race_targets WHERE race_id = ?').get(req.params.race_id));
});

// DELETE /api/training/race-targets/:race_id
router.delete('/race-targets/:race_id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM race_targets WHERE race_id = ?').run(req.params.race_id);
  res.json({ ok: true });
});

// GET /api/training/strength-exercises — static library of home exercises
router.get('/strength-exercises', (req, res) => {
  res.json(STRENGTH_SESSIONS);
});

// GET /api/training/ai-status — check which AI provider is available
router.get('/ai-status', async (req, res) => {
  const { getAIStatus } = require('../ai');
  const status = await getAIStatus();
  res.json({
    groq: status.groq,
    ollama: status.ollama,
    anthropic: status.anthropic,
    active_provider: status.active,
  });
});

// GET /api/training/upcoming?days=14 — next N days of planned sessions
router.get('/upcoming', (req, res) => {
  const days = Math.min(parseInt(req.query.days) || 14, 30);
  const db = getDb();
  const data = loadData();
  const today = new Date().toISOString().slice(0, 10);

  const nextRace = db.prepare("SELECT * FROM race_targets WHERE active = 1 AND priority = 'A' AND date > ? ORDER BY date ASC").get(today);
  if (!nextRace) return res.json([]);

  const raceDate = new Date(nextRace.date);
  const sessions = [];
  const weekCache = {};

  for (let d = 0; d < days; d++) {
    const date = new Date();
    date.setDate(date.getDate() + d);
    const dateStr = date.toISOString().slice(0, 10);

    const daysUntilRace = Math.ceil((raceDate - date) / (1000 * 60 * 60 * 24));
    if (daysUntilRace < 0) continue;

    const phase = getTrainingPhase(daysUntilRace);
    const blockWeek = getBlockWeek(daysUntilRace);

    // Find monday of this date's week
    const monday = new Date(date);
    const dow = monday.getDay();
    monday.setDate(monday.getDate() + (dow === 0 ? -6 : 1 - dow));
    const mondayStr = monday.toISOString().slice(0, 10);

    if (!weekCache[mondayStr]) {
      weekCache[mondayStr] = generateWeekPlan(phase.phase, data.athlete, daysUntilRace, monday, nextRace.dplus_m || 0, blockWeek);
    }
    const weekPlan = weekCache[mondayStr];

    const dayIdx = (date.getDay() + 6) % 7; // 0=Mon … 6=Sun
    const session = weekPlan[dayIdx];
    if (session) {
      sessions.push({ ...session, date: dateStr, phase: phase.phase, block_week: blockWeek });
    }
  }

  res.json(sessions);
});

// GET /api/training/today-adapted — session du jour adaptée aux données matin
router.get('/today-adapted', (req, res) => {
  const db = getDb();
  const data = loadData();
  const today = new Date().toISOString().split('T')[0];

  // Get today's morning log if available
  const morningLog = db.prepare('SELECT * FROM daily_logs WHERE date = ?').get(today);
  const hrv = morningLog?.hrv || null;
  const fcRepos = morningLog?.fc_repos || null;

  // Get reference values from athlete data
  const athlete = data.athlete;
  const refHrv = athlete.garmin_current?.hrv_mean || 90;
  const refFcRepos = athlete.fc_repos || 48;

  // Get today's planned session from current week plan
  const priorityA = db.prepare("SELECT * FROM race_targets WHERE active = 1 AND priority = 'A' AND date > ? ORDER BY date ASC").get(today);
  if (!priorityA) return res.json({ session: null, adaptation: null });

  const raceDate = new Date(priorityA.date);
  const daysUntilRace = Math.ceil((raceDate - new Date()) / (1000*60*60*24));
  const phase = getTrainingPhase(daysUntilRace);

  // Find monday of current week
  const monday = new Date();
  const dayOfWeek = monday.getDay();
  monday.setDate(monday.getDate() + (dayOfWeek === 0 ? -6 : 1 - dayOfWeek));
  const todayIdx = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1; // 0=Mon…6=Sun

  const raceDplus = priorityA.dplus_m || 0;
  const weekPlan = generateWeekPlan(phase.phase, athlete, daysUntilRace, monday, raceDplus);
  const plannedSession = weekPlan[todayIdx] || weekPlan[0];

  // Readiness assessment
  let readiness = 'OPTIMAL'; // OPTIMAL | VIGILANCE | REPOS
  let adaptations = [];
  let adaptedSession = { ...plannedSession };

  if (hrv !== null && fcRepos !== null) {
    const hvDrop = refHrv > 0 ? ((refHrv - hrv) / refHrv) * 100 : 0;
    const fcElev = fcRepos - refFcRepos;

    if (hvDrop > 15 || fcElev > 8) {
      readiness = 'REPOS';
      adaptations = [
        `VFC basse (${hrv} vs moy ${refHrv}) — signal de fatigue fort`,
        'Séance transformée en récupération active'
      ];
      adaptedSession = {
        ...plannedSession,
        type: 'Récup',
        distance: Math.min(plannedSession.distance || 0, 8),
        dplus: Math.min(plannedSession.dplus || 0, 100),
        fc_target: athlete.zones_karvonen.Z1[1],
        zone: 'Z1',
        desc: `⚠️ Récup active uniquement — VFC ${hrv} (moy ${refHrv}). Écoute ton corps, pas de forcing.`,
        warmup: null,
        cooldown: '10 min marche + étirements doux',
      };
    } else if (hvDrop > 8 || fcElev > 5) {
      readiness = 'VIGILANCE';
      adaptations = [
        `VFC légèrement basse (${hrv} vs moy ${refHrv}) — vigilance`,
        'Intensité réduite, reste en Z1-Z2'
      ];
      if (['Tempo', 'Côtes', 'Spécifique'].includes(plannedSession.type)) {
        adaptedSession = {
          ...plannedSession,
          type: 'Endurance',
          fc_target: athlete.zones_karvonen.Z2[0],
          zone: 'Z1-Z2',
          desc: `↓ Séance allégée (VFC ${hrv}) — remplace ${plannedSession.type} par endurance Z1-Z2 aujourd'hui`,
          warmup: '5 min progressif',
          cooldown: '5 min marche',
        };
      }
    } else {
      adaptations = [`VFC ${hrv} (moy ${refHrv}) — forme nominale ✓`];
      if (hrv > refHrv + 5) {
        adaptations.push('VFC élevée — tu peux pousser un peu plus fort si tu le sens');
      }
    }
  } else if (fcRepos !== null) {
    const fcElev = fcRepos - refFcRepos;
    if (fcElev > 8) {
      readiness = 'REPOS';
      adaptations = [`FC repos élevée (${fcRepos} vs ref ${refFcRepos}) — récupération conseillée`];
      adaptedSession = { ...adaptedSession, type: 'Récup', zone: 'Z1', fc_target: athlete.zones_karvonen.Z1[1], desc: `Récup active — FC repos ${fcRepos} bpm` };
    } else if (fcElev > 4) {
      readiness = 'VIGILANCE';
      adaptations = [`FC repos légèrement haute (${fcRepos}) — baisse l'intensité`];
    }
  } else {
    adaptations = ['Pas de données matin — plan standard appliqué. Encode ta VFC et FC repos pour une adaptation personnalisée.'];
  }

  // Check for missed key sessions in the past 3 days
  const missedSessions = [];
  for (let dAgo = 1; dAgo <= 3; dAgo++) {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - dAgo);
    const pastDateStr = pastDate.toISOString().split('T')[0];
    const pastIdx = (new Date().getDay() - dAgo + 7) % 7 === 0 ? 6 : (new Date().getDay() - dAgo + 6) % 7;
    const pastPlanned = weekPlan[pastIdx];
    if (!pastPlanned || pastPlanned.type === 'Repos') continue;

    const pastLog = db.prepare('SELECT * FROM daily_logs WHERE date = ?').get(pastDateStr);
    const wasRest = !pastLog || !pastLog.distance_km || pastLog.sport === 'Repos';
    if (wasRest && ['Longue', 'Spécifique', 'Tempo', 'Côtes'].includes(pastPlanned.type)) {
      missedSessions.push({ date: pastDateStr, session: pastPlanned });
    }
  }

  // If key session was missed, suggest partial make-up
  if (missedSessions.length > 0 && readiness !== 'REPOS') {
    const missed = missedSessions[0];
    adaptations.push(`Séance ${missed.session.type} manquée le ${missed.date} — volume légèrement augmenté aujourd'hui`);
    if (adaptedSession.type === 'Endurance' || adaptedSession.type === 'Repos') {
      adaptedSession = {
        ...adaptedSession,
        distance: Math.round((adaptedSession.distance || 0) * 1.15),
        dplus: Math.round((adaptedSession.dplus || 0) * 1.15),
        desc: adaptedSession.desc + ' (+15% volume — rattrapage séance manquée)',
      };
    }
  }

  res.json({
    today,
    readiness,
    hrv,
    fc_repos: fcRepos,
    ref_hrv: refHrv,
    ref_fc_repos: refFcRepos,
    planned_session: plannedSession,
    adapted_session: adaptedSession,
    adaptations,
    missed_sessions: missedSessions,
    is_adapted: JSON.stringify(adaptedSession) !== JSON.stringify(plannedSession),
  });
});

// ---- Full plan (all weeks) ----

const SWISSPEAKS_RACE_DATES = ['2026-05-15', '2026-08-28'];
const DAY_ABBR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function buildSwissPeaksFullPlan(raceDateStr, db) {
  const { getSessionsForRange, WEEKS } = require('../planData');

  const planWeeks = raceDateStr === '2026-05-15'
    ? WEEKS.filter(w => w.id === 'S1')
    : WEEKS.filter(w => w.id !== 'S1');

  if (!planWeeks.length) return null;

  const raceDate = new Date(raceDateStr + 'T12:00:00');
  const fromDate = planWeeks[0].start;
  const lastWeekEnd = new Date(planWeeks[planWeeks.length - 1].start + 'T12:00:00');
  lastWeekEnd.setDate(lastWeekEnd.getDate() + 6);
  const toDate = lastWeekEnd.toISOString().slice(0, 10);

  const days = getSessionsForRange(fromDate, toDate);
  const daysByDate = {};
  days.forEach(d => { daysByDate[d.date] = d; });

  const unavPeriods = db.prepare('SELECT * FROM unavailability_periods ORDER BY date_from ASC').all();

  return planWeeks.map((pw, wi) => {
    const weekStart = pw.start;
    const weekEndDate = new Date(weekStart + 'T12:00:00');
    weekEndDate.setDate(weekEndDate.getDate() + 6);
    const weekEndStr = weekEndDate.toISOString().slice(0, 10);
    const daysUntilRace = Math.ceil((raceDate - new Date(weekStart + 'T12:00:00')) / 86400000);
    const unavMatch = unavPeriods.find(u => u.date_from <= weekEndStr && u.date_to >= weekStart);

    const sessions = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart + 'T12:00:00');
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      const dayEntry = daysByDate[dateStr];
      const dayName = DAY_ABBR[i];

      if (!dayEntry || !dayEntry.sessions.length) {
        sessions.push({ day: dayName, date: dateStr, type: 'Repos', distance: 0, dplus: 0, desc: '' });
        continue;
      }

      dayEntry.sessions.forEach(s => {
        if (s.sport === 'Multiple') {
          (s.sessions || []).forEach(ss => {
            sessions.push({
              day: dayName, date: dateStr,
              type: ss.sport, distance: ss.km || 0, dplus: ss.dplus_m || 0,
              desc: ss.notes || '', slot: s.slot, duration_min: ss.duration_min,
            });
          });
        } else {
          sessions.push({
            day: dayName, date: dateStr,
            type: s.sport, distance: s.km || 0, dplus: s.dplus_m || 0,
            desc: s.notes || '', slot: s.slot, duration_min: s.duration_min,
            fc_target: s.fc_max,
          });
        }
      });
    }

    return {
      week_number: wi + 1,
      week_start: weekStart,
      week_end: weekEndStr,
      phase: { phase: pw.phase },
      days_until_race: daysUntilRace,
      is_unavailable: !!unavMatch,
      unavailability_label: unavMatch?.label || null,
      sessions,
      has_ai_plan: false,
      week_summary: pw.focus,
    };
  });
}

// GET /api/training/full-plan/:race_id
router.get('/full-plan/:race_id', (req, res) => {
  const db = getDb();
  const data = loadData();
  const race = db.prepare('SELECT * FROM race_targets WHERE race_id = ?').get(req.params.race_id);
  if (!race) return res.status(404).json({ error: 'Race not found' });

  const today = new Date();
  const raceDate = new Date(race.date);
  if (raceDate < today) return res.json({ weeks: [], race });

  // Use SwissPeaks plan for known races
  if (SWISSPEAKS_RACE_DATES.includes(race.date)) {
    const weeks = buildSwissPeaksFullPlan(race.date, db);
    if (weeks) return res.json({ weeks, race, total_weeks: weeks.length });
  }

  // Generic template-based plan for other races
  const unavPeriods = db.prepare('SELECT * FROM unavailability_periods ORDER BY date_from ASC').all();

  const aiPlans = db.prepare('SELECT * FROM ai_plans WHERE race_id = ?').all(req.params.race_id);
  const aiByWeek = {};
  for (const p of aiPlans) {
    try { aiByWeek[p.week_start] = JSON.parse(p.sessions_json); } catch {}
  }

  const startMonday = new Date(today);
  const dayOfWeek = startMonday.getDay();
  startMonday.setDate(startMonday.getDate() + (dayOfWeek === 0 ? -6 : 1 - dayOfWeek));

  const weeks = [];
  const cursor = new Date(startMonday);
  let weekNum = 1;
  const raceDplus = race.dplus_m || 0;

  while (cursor <= raceDate) {
    const weekStart = cursor.toISOString().split('T')[0];
    const weekEnd = new Date(cursor);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekEndStr = weekEnd.toISOString().split('T')[0];

    const mondayOfWeek = new Date(cursor);
    const daysUntilRaceThisWeek = Math.ceil((raceDate - mondayOfWeek) / (1000 * 60 * 60 * 24));
    const phase = getTrainingPhase(daysUntilRaceThisWeek);

    const unavMatch = unavPeriods.find(u => u.date_from <= weekEndStr && u.date_to >= weekStart);
    const isUnavailable = !!unavMatch;

    let sessions;
    if (aiByWeek[weekStart]) {
      sessions = aiByWeek[weekStart];
    } else {
      const blockWeek = getBlockWeek(daysUntilRaceThisWeek);
      sessions = generateWeekPlan(
        isUnavailable ? 'maintenance' : phase.phase,
        data.athlete,
        daysUntilRaceThisWeek,
        new Date(cursor),
        raceDplus,
        blockWeek
      );
    }

    weeks.push({
      week_number: weekNum,
      week_start: weekStart,
      week_end: weekEndStr,
      phase,
      days_until_race: daysUntilRaceThisWeek,
      is_unavailable: isUnavailable,
      unavailability_label: unavMatch?.label || null,
      sessions,
      has_ai_plan: !!aiByWeek[weekStart],
    });

    cursor.setDate(cursor.getDate() + 7);
    weekNum++;
  }

  res.json({ weeks, race, total_weeks: weeks.length });
});

// ---- Unavailability periods ----

// GET /api/training/unavailability
router.get('/unavailability', (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM unavailability_periods ORDER BY date_from ASC').all());
});

// POST /api/training/unavailability
router.post('/unavailability', (req, res) => {
  const db = getDb();
  const { date_from, date_to, label, impact } = req.body;
  if (!date_from || !date_to) return res.status(400).json({ error: 'date_from and date_to required' });
  const result = db.prepare(
    'INSERT INTO unavailability_periods (date_from, date_to, label, impact) VALUES (?,?,?,?)'
  ).run(date_from, date_to, label || null, impact || 'maintenance');
  res.json(db.prepare('SELECT * FROM unavailability_periods WHERE id = ?').get(result.lastInsertRowid));
});

// DELETE /api/training/unavailability/:id
router.delete('/unavailability/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM unavailability_periods WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---- AI Plan generation ----

// POST /api/training/ai-plan/:race_id — generate AI plan for all future weeks
router.post('/ai-plan/:race_id', async (req, res) => {
  const db = getDb();
  const data = loadData();
  const race = db.prepare('SELECT * FROM race_targets WHERE race_id = ?').get(req.params.race_id);
  if (!race) return res.status(404).json({ error: 'Race not found' });

  const athlete = data.athlete;
  const recentActivities = (data.activities || [])
    .filter(a => a.Distance_km > 5)
    .slice(-20)
    .map(a => `${(a.Date||'').substring(0,10)}: ${a.Distance_km}km / D+${a.D_plus_exact||0}m / ${a.Temps_h ? Math.round(a.Temps_h*60) + 'min' : '?'} / FC moy ${a.HR_moy || '?'} bpm`)
    .join('\n');

  const garminRecent = (data.garmin_runs || []).slice(-5).map(g =>
    `${(g.date||'').substring(0,10)}: ${g.dist_km}km D+${g.dplus_m}m FC moy ${g.avg_hr} VO2max ${g.vo2max} charge ${g.training_load}`
  ).join('\n');

  const today = new Date();
  const raceDate = new Date(race.date);
  const daysUntilRace = Math.ceil((raceDate - today) / (1000*60*60*24));
  const unavPeriods = db.prepare('SELECT * FROM unavailability_periods ORDER BY date_from ASC').all();

  // Build weeks list for AI context
  const cursor = new Date(today);
  const dayOfWeek = cursor.getDay();
  cursor.setDate(cursor.getDate() + (dayOfWeek === 0 ? -6 : 1 - dayOfWeek));
  const weeksInfo = [];
  while (cursor <= raceDate) {
    const weekStart = cursor.toISOString().split('T')[0];
    const weekEnd = new Date(cursor);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekEndStr = weekEnd.toISOString().split('T')[0];
    const dtr = Math.ceil((raceDate - new Date(cursor)) / (1000*60*60*24));
    const phase = getTrainingPhase(dtr);
    const unavailable = unavPeriods.find(u => u.date_from <= weekEndStr && u.date_to >= weekStart);
    weeksInfo.push(`Semaine ${weekStart} au ${weekEndStr}: phase ${phase.phase}, J-${dtr}${unavailable ? ` [INDISPONIBLE: ${unavailable.label || 'période réduite'}]` : ''}`);
    cursor.setDate(cursor.getDate() + 7);
  }

  const systemPrompt = `Tu es un coach ultra-trail expert. Tu génères des plans d'entraînement personnalisés en JSON strictement valide.
LANGUE: Tu dois IMPÉRATIVEMENT répondre en français. Tous les champs texte (desc, week_summary, warmup, cooldown) doivent être rédigés en français.


PROFIL ATHLÈTE:
- FC repos: ${athlete.fc_repos} bpm | FC max: ${athlete.fc_max} bpm
- VO2max: ${athlete.vo2max_current} | UTMB Index: ${athlete.utmb_index}
- Zones Karvonen: Z1[${athlete.zones_karvonen.Z1}], Z2[${athlete.zones_karvonen.Z2}], Z3[${athlete.zones_karvonen.Z3}], Z4[${athlete.zones_karvonen.Z4}], Z5[${athlete.zones_karvonen.Z5}]
- ATL actuel: ${athlete.garmin_current?.atl} | CTL: ${athlete.garmin_current?.ctl} | ACWR: ${athlete.garmin_current?.acwr}
- HRV moyen: ${athlete.garmin_current?.hrv_mean} | HRV actuel: ${athlete.garmin_current?.hrv_current}
- Hill score global: ${athlete.garmin_current?.hill_score_overall} | Force: ${athlete.garmin_current?.hill_score_strength} | Endurance: ${athlete.garmin_current?.hill_score_endurance}

COURSE CIBLE: ${race.name}
- Date: ${race.date} (J-${daysUntilRace})
- Distance: ${race.distance_km}km / D+: ${race.dplus_m}m
- Objectif A: ${race.obj_a_time_h ? Math.floor(race.obj_a_time_h) + 'h' + Math.round((race.obj_a_time_h % 1) * 60) + 'min' : 'non défini'}

ACTIVITÉS RÉCENTES (20 dernières):
${recentActivities}

GARMIN RÉCENT (5 derniers):
${garminRecent}

SEMAINES À PLANIFIER:
${weeksInfo.join('\n')}

CONSIGNES:
- Pendant les semaines INDISPONIBLES: maintien de forme, 3 séances max, Z1-Z2 uniquement, volume réduit de 40-60%
- Pendant les autres semaines: progression selon la phase (Base→Charge→Spécificité→Affûtage)
- Intègre des séances Escalier si D+ course > 1500m (${race.dplus_m > 1500 ? 'OUI' : 'NON'})
- Adapte les intensités selon l'ACWR (actuel: ${athlete.garmin_current?.acwr}) et le HRV
- Inclus échauffement et retour au calme pour les séances intenses
- Les descriptions doivent être concrètes et motivantes

RÉPONDS UNIQUEMENT avec un JSON valide de cette forme:
{
  "weeks": [
    {
      "week_start": "YYYY-MM-DD",
      "sessions": [
        {
          "day": "Lun",
          "type": "Repos|Endurance|Longue|Tempo|Côtes|Spécifique|Activation|Récup|Escalier|COURSE",
          "distance": number,
          "dplus": number,
          "fc_target": number|null,
          "zone": "Z1|Z1-Z2|Z2|Z2-Z3|Z3",
          "desc": "description concrète",
          "warmup": "protocole échauffement ou null",
          "cooldown": "retour au calme ou null",
          "sport": "Course à pied|Trail|Escalier|null"
        }
      ],
      "week_summary": "résumé de la semaine en 1 phrase",
      "total_km": number,
      "total_dplus": number
    }
  ]
}`;

  try {
    const { text: rawText, provider, model } = await callAI(
      systemPrompt,
      'Génère le plan complet pour toutes les semaines listées. Réponds UNIQUEMENT en français, en JSON valide.'
    );
    console.log(`AI plan generated via ${provider} (${model})`);

    // Extract JSON — Ollama with format:'json' returns clean JSON, Anthropic may wrap it
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'Réponse IA non parseable — réessayez' });
    const parsed = JSON.parse(jsonMatch[0]);

    // Save AI plans to DB
    const upsert = db.prepare(`
      INSERT OR REPLACE INTO ai_plans (race_id, week_start, sessions_json, generated_at)
      VALUES (?, ?, ?, datetime('now'))
    `);
    let saved = 0;
    for (const w of (parsed.weeks || [])) {
      if (w.week_start && w.sessions) {
        // Attach dates to sessions
        const monday = new Date(w.week_start);
        const sessionsWithDates = w.sessions.map((s, i) => {
          const d = new Date(monday);
          d.setDate(d.getDate() + i);
          return { ...s, date: d.toISOString().split('T')[0] };
        });
        upsert.run(req.params.race_id, w.week_start, JSON.stringify(sessionsWithDates));
        saved++;
      }
    }

    res.json({ ok: true, weeks_generated: saved, plan: parsed, provider, model });
  } catch (err) {
    console.error('AI plan error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/training/plan-sessions?from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns SwissPeaks plan sessions adapted to the athlete's current form
router.get('/plan-sessions', (req, res) => {
  const { getSessionsForRange } = require('../planData');
  const { computeHRVTrend, computeFCReposTrend } = require('../calc');
  const db = getDb();

  const today = new Date().toISOString().slice(0, 10);
  const from = req.query.from || today;
  const defaultTo = new Date();
  defaultTo.setDate(defaultTo.getDate() + 13);
  const to = req.query.to || defaultTo.toISOString().slice(0, 10);

  // Get raw plan sessions
  const planDays = getSessionsForRange(from, to);

  // Load health + training logs (14 days back for trend computation)
  const trendFrom = new Date(from);
  trendFrom.setDate(trendFrom.getDate() - 14);
  const allLogs = db.prepare(
    'SELECT * FROM daily_logs WHERE date >= ? ORDER BY date DESC'
  ).all(trendFrom.toISOString().slice(0, 10));

  // Compute HRV + FC repos trends from recent logs
  const hrv_trend = computeHRVTrend(allLogs);
  const fc_repos_trend = computeFCReposTrend(allLogs);

  // 7-day training load stats
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentRuns = allLogs.filter(l => l.distance_km && l.date <= today && l.date >= sevenDaysAgo.toISOString().slice(0, 10));
  const recentKm = recentRuns.reduce((s, r) => s + (r.distance_km || 0), 0);

  // Recent AEI average (last 5 sessions)
  const recentAEI = allLogs.filter(l => l.aei).slice(0, 5);
  const avgAEI = recentAEI.length > 0 ? recentAEI.reduce((s, r) => s + r.aei, 0) / recentAEI.length : null;

  // RPE fatigue check (last 3 days)
  const recentLogs3 = allLogs.slice(0, 3);
  const recentRPE = recentLogs3.filter(l => l.rpe && l.rpe > 0).map(l => l.rpe);
  const avgRPE = recentRPE.length > 0 ? recentRPE.reduce((s, v) => s + v, 0) / recentRPE.length : null;

  // Pain zone alerts
  const latestPainLog = allLogs.find(l => l.pain_zones);
  let activeHighPain = [];
  if (latestPainLog) {
    try { activeHighPain = (JSON.parse(latestPainLog.pain_zones) || []).filter(z => z.level >= 2); } catch {}
  }

  const enrichedDays = planDays.map(day => {
    const logForDay = allLogs.find(l => l.date === day.date);
    const isToday = day.date === today;
    const isPast = day.date < today;

    let readiness = 'OPTIMAL';
    const adaptations = [];
    let factor = 1.0;

    if (isToday && logForDay) {
      // Today: use actual morning data for precise adaptation
      if (hrv_trend?.deviation !== null && hrv_trend?.deviation !== undefined) {
        if (hrv_trend.deviation < -15) {
          readiness = 'REPOS'; factor = 0.6;
          adaptations.push(`VFC ${hrv_trend.today} vs base ${hrv_trend.baseline?.toFixed(0)} (${hrv_trend.deviation.toFixed(0)}%) — fatigue marquée`);
        } else if (hrv_trend.deviation < -5) {
          readiness = 'VIGILANCE'; factor = 0.82;
          adaptations.push(`VFC légèrement basse (${hrv_trend.deviation.toFixed(0)}%) — intensité réduite`);
        } else if (hrv_trend.deviation > 8) {
          readiness = 'BOOST'; factor = 1.08;
          adaptations.push(`VFC élevée (+${hrv_trend.deviation.toFixed(0)}%) — bonne forme, tu peux pousser`);
        }
      }
      if (fc_repos_trend?.today && fc_repos_trend?.baseline) {
        const fcElev = fc_repos_trend.today - fc_repos_trend.baseline;
        if (fcElev > 6) {
          factor = Math.min(factor, 0.72); readiness = 'REPOS';
          adaptations.push(`FC repos +${fcElev.toFixed(0)} bpm vs base — corps non récupéré`);
        } else if (fcElev > 3) {
          factor = Math.min(factor, 0.88);
          if (readiness === 'OPTIMAL') readiness = 'VIGILANCE';
          adaptations.push(`FC repos légèrement haute (+${fcElev.toFixed(0)}) — prudence`);
        }
      }
      if (logForDay.sensation !== null && logForDay.sensation !== undefined) {
        if (logForDay.sensation <= 2) {
          factor = Math.min(factor, 0.7); readiness = 'REPOS';
          adaptations.push(`Sensation ${logForDay.sensation}/5 — corps épuisé`);
        } else if (logForDay.sensation === 3 && readiness === 'BOOST') {
          readiness = 'OPTIMAL'; factor = Math.min(factor, 1.0);
        } else if (logForDay.sensation >= 4 && readiness !== 'REPOS' && readiness !== 'VIGILANCE') {
          if (readiness === 'OPTIMAL') { readiness = 'BOOST'; factor = Math.max(factor, 1.05); }
          adaptations.push(`Sensation ${logForDay.sensation}/5 ✓`);
        }
      }
      if (logForDay.sleep_h && logForDay.sleep_h < 6) {
        factor = Math.min(factor, 0.85);
        if (readiness === 'OPTIMAL') readiness = 'VIGILANCE';
        adaptations.push(`Sommeil court (${logForDay.sleep_h.toFixed(1)}h) — récupération incomplète`);
      }
    } else if (!isPast) {
      // Future: estimate from trends and load
      if (hrv_trend?.status === 'red') {
        factor = 0.85; readiness = 'VIGILANCE';
        adaptations.push('Tendance VFC basse — volume préventivement allégé');
      } else if (hrv_trend?.status === 'orange') {
        factor = 0.92; readiness = 'VIGILANCE';
        adaptations.push('VFC en légère baisse — légère modération');
      }
      if (avgAEI !== null && avgAEI < 7.5) {
        factor = Math.min(factor, 0.9);
        adaptations.push(`AEI récente ${avgAEI.toFixed(1)} — charge préventive réduite`);
      }
      if (recentKm > 95) {
        factor = Math.min(factor, 0.92);
        adaptations.push(`Charge 7j élevée (${recentKm.toFixed(0)}km) — conservation prévue`);
      }
    }

    // RPE fatigue check (last 3 days)
    if (avgRPE !== null && avgRPE >= 8 && factor > 0.85) {
      factor = Math.max(0.85, factor * 0.92);
      if (!adaptations.length) adaptations.push(`RPE moyen élevé (${avgRPE.toFixed(1)}/10) — charge allégée`);
    }

    // Apply adaptation factor to sessions
    const adaptedSessions = day.sessions.map(s => {
      if (s.sport === 'Repos' || s.sport === 'Sauna' || s.sport === 'Renforcement') return s;
      if (readiness === 'REPOS' && s.sport === 'Course à pied' && (s.km || 0) > 7) {
        const painNote = getPainNoteForSession(s, activeHighPain);
        return {
          ...s, adapted: true, original_km: s.km,
          km: Math.min(s.km || 7, 7), fc_max: 125, zone: 'Z1',
          session_type: 'Récup',
          desc: `🔴 Récup active — 7km Z1 FC<125 (prévu: ${s.desc})`,
          adaptation_note: 'Session transformée — récupération prioritaire',
          ...(painNote ? { pain_warning: painNote } : {}),
        };
      }
      if (factor !== 1.0 && s.km) {
        const newKm = Math.round(s.km * factor * 10) / 10;
        const newFcMax = s.fc_max ? (factor < 1
          ? Math.round(s.fc_max - (s.fc_max - 118) * (1 - factor) * 0.4)
          : s.fc_max) : null;
        const arrow = factor < 1 ? `↓${Math.round((1 - factor) * 100)}%` : `↑${Math.round((factor - 1) * 100)}%`;
        const painNote = getPainNoteForSession(s, activeHighPain);
        return {
          ...s, adapted: true, original_km: s.km,
          km: newKm, fc_max: newFcMax,
          desc: `${s.desc} [${arrow}]`,
          adaptation_note: factor < 0.8 ? 'Volume fortement réduit' : factor < 1 ? 'Volume allégé' : 'Volume légèrement augmenté',
          ...(painNote ? { pain_warning: painNote } : {}),
        };
      }
      const painNote = getPainNoteForSession(s, activeHighPain);
      return painNote ? { ...s, pain_warning: painNote } : s;
    });

    return {
      ...day,
      sessions: adaptedSessions,
      readiness,
      adaptation_factor: Math.round(factor * 100) / 100,
      adaptations,
      log: logForDay ? {
        hrv: logForDay.hrv, fc_repos: logForDay.fc_repos,
        sensation: logForDay.sensation, sleep_h: logForDay.sleep_h,
        sleep_quality: logForDay.sleep_quality, aei: logForDay.aei,
      } : null,
    };
  });

  res.json({
    days: enrichedDays,
    hrv_trend, fc_repos_trend,
    recent_load: { km_7d: recentKm, avg_aei: avgAEI },
    from, to,
  });
});

// ---- Helpers ----

function estimateRecoveryDays(distance_km, dplus_m) {
  const pts = (distance_km || 0) + (dplus_m || 0) / 100;
  if (pts > 180) return 21;
  if (pts > 100) return 14;
  if (pts > 60)  return 10;
  if (pts > 35)  return 7;
  return 4;
}

function checkConflicts(race, db) {
  if (!race.date) return { warnings: [], blockers: [] };

  const allRaces = db.prepare("SELECT * FROM race_targets WHERE active = 1 AND race_id != ? ORDER BY date ASC")
    .all(race.race_id || '');

  const raceDate = new Date(race.date);
  const warnings = [];
  const blockers = [];

  for (const other of allRaces) {
    const otherDate = new Date(other.date);
    const gapDays = Math.round((otherDate - raceDate) / 86400000); // positive = other is after
    const absGap = Math.abs(gapDays);
    const recoveryNeeded = estimateRecoveryDays(race.distance_km, race.dplus_m);
    const otherRecovery = estimateRecoveryDays(other.distance_km, other.dplus_m);

    // This race is BEFORE a priority A race
    if (gapDays > 0 && other.priority === 'A') {
      if (absGap < recoveryNeeded) {
        blockers.push({
          type: 'BLOCKER',
          message: `⛔ Trop proche de ${other.name} (${other.date}, priorité A) — seulement ${absGap}j de récup, il t'en faut ${recoveryNeeded}j minimum`,
          other_race: other.name,
          other_date: other.date,
          gap_days: absGap,
          recovery_needed: recoveryNeeded,
        });
      } else if (absGap < recoveryNeeded + 7) {
        warnings.push({
          type: 'WARNING',
          message: `⚠️ ${other.name} (${other.date}) est dans ${absGap}j — marge de récup serrée, vise objectif C uniquement`,
          other_race: other.name,
          other_date: other.date,
          gap_days: absGap,
          recommendation: 'Objectif C (finisher), pas de tapering agressif',
        });
      } else if (absGap < 35 && (race.distance_km > 50 || (race.dplus_m > 2000))) {
        warnings.push({
          type: 'INFO',
          message: `ℹ️ ${other.name} est dans ${absGap}j — course longue/technique avant un A, surveille la récup`,
          other_race: other.name,
          other_date: other.date,
          gap_days: absGap,
          recommendation: 'Récupération active prioritaire, réduire volume semaine suivante',
        });
      }
    }

    // A priority A race is BEFORE this race
    if (gapDays < 0 && other.priority === 'A') {
      if (absGap < otherRecovery) {
        warnings.push({
          type: 'WARNING',
          message: `⚠️ Tu sors de ${other.name} (${other.date}) depuis seulement ${absGap}j — encore en phase de récup`,
          other_race: other.name,
          other_date: other.date,
          gap_days: absGap,
          recommendation: 'Course de récupération active uniquement',
        });
      }
    }

    // Two priority A races close together
    if (race.priority === 'A' && other.priority === 'A' && absGap < 42) {
      warnings.push({
        type: 'WARNING',
        message: `⚠️ Deux objectifs A (${other.name}) séparés de ${absGap}j seulement — difficile de faire un vrai tapering pour les deux`,
        other_race: other.name,
        other_date: other.date,
        gap_days: absGap,
        recommendation: 'Envisage de passer l\'un des deux en priorité B',
      });
    }
  }

  return { warnings, blockers, safe: blockers.length === 0 };
}

// Warmup/cooldown protocols per session type
const WARMUP = {
  Tempo:      { warmup: '15-20 min Z1 progressif + 4×30s accélérations', cooldown: '10-15 min trot Z1 + étirements dynamiques' },
  Côtes:      { warmup: '15 min Z1-Z2 progressif + mobilité hanches/chevilles', cooldown: '10 min trot lent + étirements quadris/mollets' },
  Spécifique: { warmup: '10-15 min Z1 facile avant d\'entrer dans la zone cible', cooldown: '10 min Z1 + récupération active' },
  COURSE:     { warmup: '5-10 min marche active + mobilité articulaire', cooldown: 'Marche récup, hydratation, alimentation dans les 30min' },
  Longue:     { warmup: '10 min allure très facile Z1', cooldown: '5-10 min marche + étirements ciblés' },
  Endurance:  { warmup: '5 min allure progressive', cooldown: null },
  VMA:        { warmup: '3km progressif Z1→Z3 + 4×100m strides', cooldown: '3km Z1 très lent + étirements dynamiques' },
  'Seuil 30': { warmup: '3km progressif Z1-Z2 + 2×30s accélérations', cooldown: '3km Z1 + 5min marche' },
  'Seuil 60': { warmup: '5km progressif Z1 → Z2', cooldown: '4km Z1 facile' },
  Progressif: { warmup: null, cooldown: '5 min marche' },
};

// Strength exercises library (home, no equipment)
const STRENGTH_SESSIONS = {
  A: {
    name: 'Renforcement A — Force jambes',
    duration_min: 40,
    exercises: [
      { name: 'Gainage frontal', sets: '3×45s', muscles: 'Core, épaules', desc: 'Corps droit, coudes sous les épaules, abdos serrés' },
      { name: 'Fentes avant', sets: '3×12/jambe', muscles: 'Quadriceps, fessiers', desc: 'Grand pas, genou arrière près du sol, dos droit' },
      { name: 'Squats sautés', sets: '3×15', muscles: 'Quadriceps, fessiers, cardio', desc: 'Descente contrôlée, saut explosif, réception douce' },
      { name: 'Pont fessier', sets: '3×20', muscles: 'Fessiers, ischio-jambiers', desc: 'Dos au sol, pieds à plat, pousser les hanches en haut' },
      { name: 'Step-ups (chaise)', sets: '3×15/jambe', muscles: 'Quadriceps, fessiers, équilibre', desc: 'Monter sur chaise stable, genou poussé haut' },
      { name: 'Gainage latéral', sets: '3×30s/côté', muscles: 'Obliques, stabilisateurs', desc: 'Appui sur le côté, corps aligné, bassin stable' },
    ],
  },
  B: {
    name: 'Renforcement B — Core & stabilité',
    duration_min: 40,
    exercises: [
      { name: 'Pompes', sets: '3×12', muscles: 'Pectoraux, triceps, core', desc: 'Corps droit, descente contrôlée, coudes à 45°' },
      { name: 'Mountain climbers', sets: '3×30s', muscles: 'Core, cardio, épaules', desc: 'En planche, ramener genoux vers poitrine alternativement' },
      { name: 'Fentes latérales', sets: '3×12/côté', muscles: 'Adducteurs, fessiers, stabilité', desc: 'Grand pas sur le côté, genou fléchi, dos droit' },
      { name: 'Chaise (wall sit)', sets: '3×45s', muscles: 'Quadriceps, isométrique', desc: 'Dos contre mur, genoux à 90°, talons sous les genoux' },
      { name: 'Burpees', sets: '3×10', muscles: 'Full body, cardio', desc: 'Squat → planche → pompe (optionnelle) → saut' },
      { name: 'Pistol squat partiel', sets: '3×8/jambe', muscles: 'Quadriceps, équilibre, proprioception', desc: 'Squat sur une jambe, jambe libre tendue devant, descente partielle' },
    ],
  },
};

function generateWeekPlan(phase, athlete, daysUntilRace, monday, raceDplus = 0, blockWeek = null) {
  const zones = athlete.zones_karvonen;
  // Compute block week if not provided (for phases that use 4-week cycles)
  const bw = blockWeek || getBlockWeek(daysUntilRace);
  // Volume scale: W1=85%, W2=100%, W3=115%, W4=55% (recovery)
  const SCALE = { 1: 0.85, 2: 1.0, 3: 1.15, 4: 0.55 };
  const scale = SCALE[bw] || 1.0;
  const isRecoveryWeek = bw === 4 && ['Base', 'Charge'].includes(phase);

  const s = (day, type, distance, dplus, fc_target, zone, desc, extra = {}) => {
    const w = WARMUP[type];
    return { day, type, distance, dplus, fc_target, zone, desc, warmup: w?.warmup || null, cooldown: w?.cooldown || null, block_week: bw, ...extra };
  };

  const renfo = (day, variant) => {
    const session = STRENGTH_SESSIONS[variant];
    return {
      day, type: 'Renforcement', distance: 0, dplus: 0, fc_target: null, zone: null,
      desc: session.name, sport: 'Renforcement',
      duration_min: session.duration_min,
      exercises: session.exercises,
      warmup: '5 min mobilité articulaire (hanches, chevilles, épaules)',
      cooldown: '5 min étirements statiques ciblés',
      block_week: bw,
    };
  };

  // Scale a session's distance and dplus by factor
  const sc = (sess) => {
    if (scale === 1.0 || sess.type === 'Repos' || sess.type === 'Renforcement' || sess.type === 'COURSE') return sess;
    const note = bw === 4 ? ' · Semaine récup' : bw === 3 ? ' · Semaine haute charge' : '';
    return { ...sess, distance: Math.round((sess.distance || 0) * scale * 10) / 10, dplus: Math.round((sess.dplus || 0) * scale), desc: sess.desc + note };
  };

  // Specialised session builders
  const vma = (day) => sc({
    ...s(day, 'VMA', 12, 200, zones.Z5?.[0] || 170, 'Z4-Z5',
      'VMA — 3km écha. + 8×400m à 90-95% FCmax (récup 400m trot) + 3km retour',
      { warmup: '3km progressif Z1→Z3 + 4×100m strides', cooldown: '3km Z1 très lent + étirements dynamiques' })
  });

  const seuil30 = (day) => sc({
    ...s(day, 'Seuil 30', 14, 350, zones.Z3?.[1] || 155, 'Z3',
      'Seuil 30 — 3km écha. + 30min continus au seuil lactique Z3 + 3km retour',
      { warmup: '3km progressif Z1-Z2 + 2×30s accélérations', cooldown: '3km Z1 + 5min marche' })
  });

  const seuil60 = (day) => sc({
    ...s(day, 'Seuil 60', 18, 500, zones.Z3?.[0] || 148, 'Z2-Z3',
      'Seuil 60 — 5km écha. + 60min à allure seuil Z2-Z3 + 4km retour',
      { warmup: '5km progressif Z1 → Z2', cooldown: '4km Z1 facile' })
  });

  const progressif = (day, dist, dplus) => ({
    ...s(day, 'Progressif', dist, dplus, zones.Z3?.[0] || 148, 'Z1→Z3',
      `Progressif ${dist}km — 1er tiers Z1, 2e tiers Z2, dernier tiers Z3 — finir plus fort`,
      { warmup: null, cooldown: '5 min marche' }),
    block_week: bw,
  });

  // Maintenance plan for unavailability periods
  const maintenancePlan = [
    s('Lun', 'Repos',      0,   0,   null,          null,    'Repos — période d\'indisponibilité'),
    s('Mar', 'Endurance',  10,  150, zones.Z1[1],   'Z1',    'Sortie maintien 10km — Z1 strict'),
    s('Mer', 'Repos',      0,   0,   null,          null,    'Repos ou mobilité douce'),
    s('Jeu', 'Endurance',  12,  200, zones.Z2[0],   'Z1-Z2', 'Endurance légère — maintenir le cardio de base'),
    s('Ven', 'Repos',      0,   0,   null,          null,    'Repos'),
    s('Sam', 'Longue',     18,  400, zones.Z1[1],   'Z1',    'Sortie longue modérée — maintien sans surcharge'),
    s('Dim', 'Repos',      0,   0,   null,          null,    'Repos ou marche active'),
  ];

  // Recovery week (block week 4) for Base and Charge phases
  const recoveryWeekPlan = [
    s('Lun', 'Repos',      0,   0,   null,          null,    'Repos — semaine de récupération'),
    s('Mar', 'Récup',      10,  100, zones.Z1[1],   'Z1',    'Récup active 10km — Z1 strict, jambes légères · Semaine récup'),
    renfo('Mer', 'A'),
    s('Jeu', 'Endurance',  14,  250, zones.Z2[0],   'Z1-Z2', 'Endurance douce — pas de forcing · Semaine récup'),
    s('Ven', 'Repos',      0,   0,   null,          null,    'Repos'),
    s('Sam', 'Longue',     20,  500, zones.Z1[1],   'Z1',    'Longue légère — allure conversationnelle · Semaine récup'),
    s('Dim', 'Endurance',  14,  300, zones.Z1[1],   'Z1',    'Endurance facile — récup active · Semaine récup'),
  ];

  const plans = {
    'Race Week': [
      s('Lun', 'Repos',      0,   0,   null,          null,    'Repos complet'),
      s('Mar', 'Activation', 8,   100, zones.Z1[1],   'Z1',    'Sortie légère 8km — rester très facile'),
      s('Mer', 'Repos',      0,   0,   null,          null,    'Repos ou mobilité douce'),
      s('Jeu', 'Activation', 6,   50,  zones.Z1[1],   'Z1',    '6km activation + 4×20s strides en fin de sortie'),
      s('Ven', 'Repos',      0,   0,   null,          null,    'Repos, préparation matériel et drop bags'),
      s('Sam', 'Repos',      0,   0,   null,          null,    'Arrivée sur site, check-in, reconnaître le départ'),
      s('Dim', 'COURSE',     157, 4590, zones.Z2[0],  'Z1-Z2', '🏁 Ultra Trail des Chevaliers — Départ 17h'),
    ],
    'Affûtage': [
      s('Lun', 'Repos',      0,   0,   null,          null,    'Récupération active — mobilité, sommeil'),
      renfo('Mar', 'A'),
      s('Mer', 'Endurance',  14,  300, zones.Z2[0],   'Z1-Z2', 'Endurance modérée — rester en Z1-Z2 strict'),
      progressif('Jeu', 16, 450),
      s('Ven', 'Repos',      0,   0,   null,          null,    'Repos complet'),
      s('Sam', 'Endurance',  12,  200, zones.Z2[0],   'Z1',    'Sortie légère, sensations'),
      s('Dim', 'Longue',     25,  600, zones.Z2[0],   'Z1-Z2', 'Sortie longue modérée — manger/boire en courant'),
    ],
    'Spécificité': [
      s('Lun', 'Repos',      0,   0,   null,          null,    'Récupération'),
      seuil60('Mar'),
      renfo('Mer', 'B'),
      s('Jeu', 'Côtes',      15,  600, zones.Z3[0],   'Z2-Z3', '8×200m D+ en côte — descente en récup active'),
      s('Ven', 'Repos',      0,   0,   null,          null,    'Repos'),
      s('Sam', 'Spécifique', 22,  900, zones.Z2[1],   'Z2',    'Sortie terrain course — simuler sections course cible'),
      s('Dim', 'Longue',     35,  1200, zones.Z2[0],  'Z1-Z2', 'Grande sortie longue — manger toutes les 40min'),
    ],
    'Charge': [
      renfo('Lun', 'A'),
      seuil30('Mar'),
      s('Mer', 'Récup',      12,  150, zones.Z1[1],   'Z1',    'Récup légère — allure très facile'),
      sc(s('Jeu', 'Tempo',   16,  400, zones.Z3[1],   'Z3',    '3×15min en Z3 — récup 5min Z1 entre chaque')),
      renfo('Ven', 'B'),
      sc(s('Sam', 'Spécifique', 28, 1100, zones.Z2[1], 'Z2',   'Sortie longue terrain trail — penser à la nutrition')),
      sc(s('Dim', 'Longue',  40,  1500, zones.Z2[0],  'Z1-Z2', 'Grande sortie longue — back-to-back, gérer la fatigue')),
    ],
    'Base': [
      s('Lun', 'Repos',      0,   0,   null,          null,    'Repos complet'),
      sc(s('Mar', 'Endurance', 15, 300, zones.Z2[0],  'Z1-Z2', 'Endurance fondamentale — construire la base aérobie')),
      renfo('Mer', 'A'),
      vma('Jeu'),
      renfo('Ven', 'B'),
      sc(s('Sam', 'Longue',  25,  800, zones.Z2[0],   'Z1-Z2', 'Sortie longue progressive — dernier tiers légèrement plus fort')),
      sc(s('Dim', 'Endurance', 18, 550, zones.Z2[0],  'Z1-Z2', 'Endurance terrain varié')),
    ],
  };

  if (phase === 'maintenance') return maintenancePlan.map((sess, i) => {
    const date = new Date(monday);
    date.setDate(date.getDate() + i);
    return { ...sess, date: date.toISOString().split('T')[0] };
  });

  // Use recovery week template for Base/Charge on block week 4
  let template;
  if (isRecoveryWeek) {
    template = [...recoveryWeekPlan];
  } else {
    template = [...(plans[phase] || plans['Base'])];
  }

  // Inject escalier sessions for races with significant D+ (>1500m)
  if (!isRecoveryWeek && raceDplus >= 1500 && ['Base', 'Charge', 'Spécificité', 'Affûtage'].includes(phase)) {
    const escalierTarget = raceDplus >= 3000 ? 2 : 1;
    const escalierDplus = Math.min(Math.round(raceDplus * 0.06 * scale), 800);
    const escalierDur = raceDplus >= 3000 ? 50 : 40;

    const escalierSession = (day) => ({
      ...s(day, 'Escalier', 0, escalierDplus, zones.Z3[0], 'Z2-Z3',
        `Escalier — ${escalierDplus}m D+ en ${escalierDur}min — ${Math.round(escalierDplus / 0.18)} marches`),
      sport: 'Escalier',
      suggested_marches: Math.round(escalierDplus / 0.18),
      block_week: bw,
    });

    let replaced = 0;
    for (let i = 0; i < template.length && replaced < escalierTarget; i++) {
      if (template[i].type === 'Récup') {
        template[i] = escalierSession(template[i].day);
        replaced++;
      }
    }
  }

  return template.map((sess, i) => {
    const date = new Date(monday);
    date.setDate(date.getDate() + i);
    return { ...sess, date: date.toISOString().split('T')[0] };
  });
}

module.exports = router;
