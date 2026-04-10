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

// GET /api/athlete/pace-zones — BPM zones + flat-equivalent pace per zone
// Both BPM zone boundaries AND pace ranges are calibrated from recent data:
//   BPM:  fc_repos = last 7-day median from daily_logs (→ profile fallback)
//         fc_max   = P99 of HR_max from last 90 days activities (→ profile fallback)
//         → Karvonen zones recomputed with these effective values
//   Pace: ITRA correction + zone-specific filters + recent-first strategy
router.get('/pace-zones', (req, res) => {
  const data = loadData();
  const { zones_karvonen: profileZones, fc_repos: fcReposProfile, fc_max: fcMaxProfile } = data.athlete;

  const d3m  = new Date(Date.now() -  90 * 864e5).toISOString().slice(0, 10);
  const d2y  = new Date(Date.now() - 730 * 864e5).toISOString().slice(0, 10);

  // ── Calibrate fc_repos from recent daily logs ──
  let fcReposEffective = fcReposProfile;
  let fcReposSource = 'profile';
  try {
    const db = getDb();
    const recentLogs = db.prepare(
      `SELECT fc_repos FROM daily_logs WHERE fc_repos IS NOT NULL AND date >= ? ORDER BY date DESC LIMIT 14`
    ).all(d3m);
    if (recentLogs.length >= 3) {
      const vals = recentLogs.map(r => r.fc_repos).sort((a, b) => a - b);
      fcReposEffective = vals[Math.floor(vals.length / 2)]; // median
      fcReposSource = 'recent';
    }
  } catch {}

  // ── Calibrate fc_max from recent activities (P99 of HR_max last 90 days) ──
  let fcMaxEffective = fcMaxProfile;
  let fcMaxSource = 'profile';
  const recentHrMax = (data.activities || [])
    .filter(a => a.Date >= d3m && a.HR_max > 0)
    .map(a => a.HR_max)
    .sort((a, b) => a - b);
  if (recentHrMax.length >= 5) {
    // Use 99th percentile — avoids outlier artefacts but captures true max
    fcMaxEffective = recentHrMax[Math.floor(recentHrMax.length * 0.99)];
    fcMaxSource = 'recent';
  }

  // ── Recompute Karvonen zones from effective fc_repos / fc_max ──
  const reserve = fcMaxEffective - fcReposEffective;
  const karvonen = (pct) => Math.round(fcReposEffective + pct * reserve);
  const zones = {
    Z1: [karvonen(0.50), karvonen(0.60)],
    Z2: [karvonen(0.60), karvonen(0.70)],
    Z3: [karvonen(0.70), karvonen(0.80)],
    Z4: [karvonen(0.80), karvonen(0.90)],
    Z5: [karvonen(0.90), fcMaxEffective],
  };

  // ── Calibrate flat-equivalent pace per zone ──
  const zoneKeys = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'];
  const zoneCfg = {
    Z1: { cutoff: d3m, fallback: d2y,          maxDplus: 12, maxKm: 999, minSamples: 3 },
    Z2: { cutoff: d3m, fallback: d2y,          maxDplus: 12, maxKm: 999, minSamples: 3 },
    Z3: { cutoff: d3m, fallback: d2y,          maxDplus: 12, maxKm: 15,  minSamples: 3 },
    Z4: { cutoff: d3m, fallback: '2018-01-01', maxDplus: 10, maxKm: 12,  minSamples: 2 },
    Z5: { cutoff: d3m, fallback: '2018-01-01', maxDplus: 10, maxKm: 10,  minSamples: 2 },
  };

  function getPacesFrom(z, fromDate) {
    const [lo, hi] = zones[z];
    const cfg = zoneCfg[z];
    const paces = [];
    for (const a of (data.activities || [])) {
      if (!a.HR_moy || !a.Temps_h || a.is_treadmill || a.Distance_km < 2) continue;
      if (a.Date < fromDate) continue;
      if (a.HR_moy < lo || (a.HR_moy >= hi && z !== 'Z5')) continue;
      const dPerKm = (a.D_plus_exact || 0) / a.Distance_km;
      if (dPerKm > cfg.maxDplus || a.Distance_km > cfg.maxKm) continue;
      const paceFlat = ((a.Temps_h * 60) / a.Distance_km) / (1 + dPerKm / 100);
      if (paceFlat >= 3 && paceFlat <= 12) paces.push(paceFlat);
    }
    return paces;
  }

  // ── Linear regression on well-sampled zones to extrapolate Z4/Z5 ──
  // Model: pace_p10 = a + b * hr_median  (uses fastest 10% of paces per zone)
  // Anchored on Z1-Z3 (sufficient samples); applied when zone has < minSamples data
  function buildRegression() {
    const anchors = [];
    for (const z of ['Z1', 'Z2', 'Z3']) {
      const cfg = zoneCfg[z];
      let paces = getPacesFrom(z, cfg.cutoff);
      if (paces.length < cfg.minSamples) paces = getPacesFrom(z, d2y);
      if (paces.length < 2) continue;
      paces.sort((a, b) => a - b);
      const p10 = paces[Math.max(0, Math.floor(paces.length * 0.1))];
      const [lo, hi] = zones[z];
      const hrMid = (lo + hi) / 2;
      anchors.push({ hr: hrMid, pace: p10 });
    }
    if (anchors.length < 2) return null;
    const n = anchors.length;
    const sumX  = anchors.reduce((s, p) => s + p.hr,       0);
    const sumY  = anchors.reduce((s, p) => s + p.pace,     0);
    const sumXY = anchors.reduce((s, p) => s + p.hr * p.pace, 0);
    const sumX2 = anchors.reduce((s, p) => s + p.hr * p.hr,  0);
    const b = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const a = (sumY - b * sumX) / n;
    return { a, b }; // pace(hr) = a + b*hr  (b < 0: faster at higher HR)
  }

  const reg = buildRegression();

  const result = {};
  for (const z of zoneKeys) {
    const [bpmMin, bpmMax] = zones[z];
    const cfg = zoneCfg[z];
    let paces = getPacesFrom(z, cfg.cutoff);
    let paceSource = 'recent';
    if (paces.length < cfg.minSamples) {
      paces = getPacesFrom(z, cfg.fallback);
      paceSource = paces.length >= cfg.minSamples ? 'historical' : 'extrapolated';
    }

    let pace_min = null, pace_max = null;

    if (paceSource === 'extrapolated' && reg) {
      // Extrapolate: faster end = reg(bpmMax), slower end = reg(bpmMin)
      pace_min = Math.round((reg.a + reg.b * bpmMax) * 10) / 10; // fastest (high HR = fast)
      pace_max = Math.round((reg.a + reg.b * bpmMin) * 10) / 10; // slowest
    } else if (paces.length >= 2) {
      paces.sort((a, b) => a - b);
      pace_min = Math.round(paces[Math.max(0, Math.floor(paces.length * 0.1))] * 10) / 10;
      pace_max = Math.round(paces[Math.min(paces.length - 1, Math.floor(paces.length * 0.9))] * 10) / 10;
    }

    result[z] = { bpm_min: bpmMin, bpm_max: bpmMax, pace_min, pace_max, samples: paces.length, pace_source: paceSource };
  }

  res.json({
    zones: result,
    fc_repos: fcReposEffective,
    fc_max: fcMaxEffective,
    fc_repos_source: fcReposSource,
    fc_max_source: fcMaxSource,
  });
});

// GET /api/athlete/insights
router.get('/insights', (req, res) => {
  const data = loadData();
  res.json(data.insights);
});

module.exports = router;
