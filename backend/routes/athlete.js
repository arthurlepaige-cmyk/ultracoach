const express = require('express');
const router = express.Router();
const { getRollingAEI, getDayStatus, buildSessionsWithTRIMP, computeDynamicVO2max, computeEnduranceScore, computeHillScore, computeStrengthScore, computeHRVTrend, computeFCReposTrend, computeRecoveryScore } = require('../calc');
const { getDb } = require('../db');
const { loadData } = require('../dataLoader');

// GET /api/athlete — athlete profile + current metrics (dynamic)
router.get('/', (req, res) => {
  const data = loadData();
  const { athlete } = data;
  const { fc_repos: fc_repos_profile, fc_max, vo2max_current } = athlete;

  // Rolling AEI from historical activities
  const aei = getRollingAEI(data.activities);

  // Load recent daily logs for health trend analysis (last 14 days, desc)
  let healthLogs = [];
  let hrv_trend = null;
  let fc_repos_trend = null;
  let today_log = null;
  try {
    const db = getDb();
    healthLogs = db.prepare(
      'SELECT date, fc_repos, hrv, sensation, sleep_h, sleep_quality FROM daily_logs ORDER BY date DESC LIMIT 14'
    ).all();
    today_log = healthLogs[0]?.date === new Date().toISOString().slice(0, 10) ? healthLogs[0] : null;
    hrv_trend = computeHRVTrend(healthLogs);
    fc_repos_trend = computeFCReposTrend(healthLogs);
  } catch {}

  // Use today's logged FC repos if available, fall back to profile
  const fc_repos_today = today_log?.fc_repos || fc_repos_profile;

  // Build sessions with TRIMP for dynamic metrics
  let dynamic_scores = {};
  try {
    const db = getDb();
    const dbLogs = db.prepare('SELECT date, sport, distance_km, dplus_m, dplus_corrected, duration_min, fc_moy, extra_sessions_json FROM daily_logs ORDER BY date ASC').all();
    const sessions = buildSessionsWithTRIMP(data.activities, dbLogs, fc_repos_profile, fc_max);

    const vo2_dynamic = computeDynamicVO2max(sessions, fc_repos_profile, fc_max, vo2max_current) || vo2max_current;
    const es_dynamic = computeEnduranceScore(sessions, vo2_dynamic);
    const hs_dynamic = computeHillScore(sessions);
    const strength_dynamic = computeStrengthScore(dbLogs);

    const last_atlctl = (data.atl_ctl || []).at(-1) || {};
    const acwr = last_atlctl.acwr || athlete.garmin_current?.acwr;
    const atl = last_atlctl.atl || athlete.garmin_current?.atl;
    const ctl = last_atlctl.ctl || athlete.garmin_current?.ctl;

    // Recovery score from today's health data
    const recovery = computeRecoveryScore(
      hrv_trend,
      fc_repos_today,
      today_log?.sensation,
      today_log?.sleep_h,
      today_log?.sleep_quality
    );

    dynamic_scores = {
      vo2max_dynamic: vo2_dynamic,
      endurance_score_dynamic: es_dynamic,
      hill_score_dynamic: hs_dynamic,
      strength_score: strength_dynamic,
      acwr_current: acwr,
      atl_current: atl,
      ctl_current: ctl,
      recovery_score: recovery,
    };
  } catch {}

  // Day status — now uses HRV trend + today's logged FC repos
  const dayStatus = getDayStatus(
    dynamic_scores.acwr_current ?? athlete.garmin_current?.acwr,
    hrv_trend,
    fc_repos_today
  );

  res.json({
    ...athlete,
    aei_rolling: aei,
    day_status: dayStatus,
    hrv_trend,
    fc_repos_trend,
    today_log,
    ...dynamic_scores,
  });
});

// GET /api/athlete/zones — Karvonen heart rate zones
router.get('/zones', (req, res) => {
  const data = loadData();
  res.json(data.athlete.zones_karvonen);
});

// GET /api/athlete/pace-zones — BPM zones + estimated flat pace per zone from history
router.get('/pace-zones', (req, res) => {
  const data = loadData();
  const { zones_karvonen: zones, fc_repos, fc_max } = data.athlete;

  // Build pace estimate per zone from historical outdoor activities with HR data
  const zoneKeys = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'];
  const buckets = { Z1: [], Z2: [], Z3: [], Z4: [], Z5: [] };

  const outdoor = (data.activities || []).filter(a =>
    a.Distance_km > 5 &&
    a.HR_moy > 0 &&
    a.Temps_h > 0 &&
    !a.is_treadmill
  );

  for (const a of outdoor) {
    const hr = a.HR_moy;
    const paceRaw = (a.Temps_h * 60) / a.Distance_km; // min/km raw
    const dPerKm = (a.D_plus_exact || 0) / a.Distance_km;
    const paceFlat = paceRaw - (dPerKm / 100) * 1.0; // flat-equivalent pace

    if (paceFlat < 3 || paceFlat > 15) continue; // sanity filter

    for (const z of zoneKeys) {
      const [lo, hi] = zones[z];
      if (hr >= lo && (hr < hi || z === 'Z5')) {
        buckets[z].push(paceFlat);
        break;
      }
    }
  }

  const result = {};
  for (const z of zoneKeys) {
    const [bpmMin, bpmMax] = zones[z];
    const paces = buckets[z];
    let pace_min = null, pace_max = null;
    if (paces.length >= 3) {
      paces.sort((a, b) => a - b);
      // Use 10th-90th percentile range
      const lo = paces[Math.floor(paces.length * 0.1)];
      const hi = paces[Math.floor(paces.length * 0.9)];
      pace_min = Math.round(lo * 10) / 10;
      pace_max = Math.round(hi * 10) / 10;
    }
    result[z] = { bpm_min: bpmMin, bpm_max: bpmMax, pace_min, pace_max, samples: paces.length };
  }

  res.json({ zones: result, fc_repos, fc_max });
});

// GET /api/athlete/insights
router.get('/insights', (req, res) => {
  const data = loadData();
  res.json(data.insights);
});

module.exports = router;
