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

// GET /api/athlete/insights
router.get('/insights', (req, res) => {
  const data = loadData();
  res.json(data.insights);
});

module.exports = router;
