/**
 * Core training metric calculations
 */

function calculateAEI(distance_km, duration_min, dplus_m, hr_moy) {
  if (!distance_km || !duration_min || !hr_moy || distance_km <= 0 || hr_moy <= 0) return null;
  const allure = duration_min / distance_km; // min/km
  const d_per_km = (dplus_m || 0) / distance_km;
  const allure_flat_eq = allure - (d_per_km / 100) * 2.0;
  const speed_eq = 60 / Math.max(allure_flat_eq, 3);
  const aei = (speed_eq / hr_moy) * 100;
  return Math.round(aei * 100) / 100;
}

function getAEIStatus(aei) {
  if (!aei) return { label: 'N/A', color: 'gray' };
  if (aei >= 9.0) return { label: 'Pic de forme', color: 'green' };
  if (aei >= 8.0) return { label: 'Bonne forme', color: 'blue' };
  return { label: 'Fatigue', color: 'orange' };
}

// Protocole tapis fixe de l'athlète : pente moyenne 7,5%.
//   séance courte (~30min) courue à 8 km/h → 4 km → 300 m D+
//   séance longue (~1h)    courue à 7 km/h → 7 km → 525 m D+
const TREADMILL_SLOPE = 0.075;
function correctTreadmillDplus(recorded_dplus, duration_min) {
  // D+ enregistré sur tapis = 0 → estimer depuis la durée réelle.
  if (recorded_dplus && recorded_dplus > 0) return recorded_dplus;
  if (!duration_min || duration_min <= 0) return null;
  const speed_kmh = duration_min <= 45 ? 8 : 7;
  const distance_m = speed_kmh * (duration_min / 60) * 1000;
  return Math.round(distance_m * TREADMILL_SLOPE);
}

function estimateRaceTime(distance_km, dplus_m) {
  // Based on SaintéLyon 2025: 79km + 2200D+/100 in 8.978h
  const ref_speed_pts_h = (79 + 2200 / 100) / 8.978; // ~11.25 pts/h
  const race_pts = distance_km + dplus_m / 100;
  return race_pts / ref_speed_pts_h;
}

function checkSweetSpot(activities, race_date) {
  const raceD = new Date(race_date);
  const j28 = new Date(raceD);
  j28.setDate(j28.getDate() - 28);

  const window = activities.filter(a => {
    const d = new Date(a.Date || a.date);
    return d >= j28 && d < raceD;
  });

  const km = window.reduce((s, a) => s + (a.Distance_km || a.distance_km || 0), 0);
  const dplus = window.reduce((s, a) => s + (a.D_plus_exact || a.dplus_m || 0), 0);

  return {
    km: Math.round(km * 10) / 10,
    dplus: Math.round(dplus),
    km_ok: km >= 300 && km <= 376,
    dplus_ok: dplus >= 4000 && dplus <= 5000,
    status: km >= 300 && km <= 376 && dplus >= 4000 ? 'OPTIMAL' : 'À AJUSTER',
    km_target_min: 300,
    km_target_max: 376,
    dplus_target_min: 4000,
    dplus_target_max: 5000
  };
}

function getRollingAEI(activities, count = 10) {
  // Get rolling AEI from last N outdoor runs > 7km
  const eligible = activities
    .filter(a => {
      const dist = a.Distance_km || a.distance_km || 0;
      const treadmill = a.is_treadmill === true || a.is_treadmill === 1;
      const hr = a.HR_moy || a.fc_moy;
      return !treadmill && dist >= 7 && hr && !isNaN(hr) && hr > 0;
    })
    .sort((a, b) => new Date(b.Date || b.date) - new Date(a.Date || a.date))
    .slice(0, count);

  if (eligible.length === 0) return null;

  const aeis = eligible.map(a => {
    const dist = a.Distance_km || a.distance_km;
    const dur = (a.Temps_h || a.duration_min / 60 || 0) * 60;
    const dplus = a.D_plus_exact || a.dplus_corrected || 0;
    const hr = a.HR_moy || a.fc_moy;
    return calculateAEI(dist, dur, dplus, hr);
  }).filter(v => v !== null);

  if (aeis.length === 0) return null;
  return Math.round((aeis.reduce((s, v) => s + v, 0) / aeis.length) * 100) / 100;
}

function getTrainingPhase(daysUntilRace) {
  if (daysUntilRace > 56) return { phase: 'Base', color: '#378ADD', description: 'Construction de la base aérobie' };
  if (daysUntilRace > 35) return { phase: 'Charge', color: '#1D9E75', description: 'Augmentation progressive du volume' };
  if (daysUntilRace > 21) return { phase: 'Spécificité', color: '#7F77DD', description: 'Sorties longues spécifiques course' };
  if (daysUntilRace > 10) return { phase: 'Affûtage', color: '#EF9F27', description: 'Réduction volume, maintien intensité' };
  return { phase: 'Race Week', color: '#E24B4A', description: 'Repos, activation légère' };
}

/**
 * Compute HRV trend from daily logs (sorted desc by date).
 * Returns today's value, 7-day baseline, deviation %, and status.
 * Based on Firstbeat/HRV4Training methodology:
 * - Baseline = rolling 7-day mean (excluding today)
 * - Deviation > +5% → very recovered (green)
 * - -5% to +5% → normal (blue)
 * - -5% to -15% → slight fatigue (orange)
 * - < -15% → significant fatigue (red)
 */
function computeHRVTrend(logsDesc) {
  const withHRV = logsDesc.filter(l => l.hrv && l.hrv > 0);
  if (!withHRV.length) return null;

  const today = withHRV[0].hrv;
  const prev = withHRV.slice(1, 8);
  if (!prev.length) return { today, baseline: null, deviation: null, status: 'neutral' };

  const baseline = Math.round(prev.reduce((s, l) => s + l.hrv, 0) / prev.length);
  const deviation = Math.round(((today - baseline) / baseline) * 100 * 10) / 10;

  let status;
  if (deviation > 5) status = 'green';
  else if (deviation >= -5) status = 'blue';
  else if (deviation >= -15) status = 'orange';
  else status = 'red';

  return { today, baseline, deviation, status };
}

/**
 * Compute FC repos trend (same logic as HRV but inverted — higher is worse).
 */
function computeFCReposTrend(logsDesc) {
  const withFC = logsDesc.filter(l => l.fc_repos && l.fc_repos > 0);
  if (!withFC.length) return null;

  const today = withFC[0].fc_repos;
  const prev = withFC.slice(1, 8);
  const baseline = prev.length
    ? Math.round(prev.reduce((s, l) => s + l.fc_repos, 0) / prev.length)
    : null;
  const deviation = baseline ? Math.round(((today - baseline) / baseline) * 100 * 10) / 10 : null;

  // For FC repos: positive deviation (higher than baseline) is bad
  let status;
  if (!deviation) status = today < 53 ? 'green' : today < 56 ? 'orange' : 'red';
  else if (today >= 56) status = 'red';
  else if (today >= 53 || deviation > 5) status = 'orange';
  else status = 'green';

  return { today, baseline, deviation, status };
}

/**
 * Compute a composite recovery score 0-100.
 * Inputs: hrv_trend, fc_repos, sensation (1-5), sleep_h, sleep_quality (1-5)
 *
 * Weights:
 *   - HRV deviation: 35%
 *   - FC repos: 30%
 *   - Sensation: 20%
 *   - Sleep (hours + quality): 15%
 */
function computeRecoveryScore(hrv_trend, fc_repos, sensation, sleep_h, sleep_quality) {
  let score = 0;
  let totalWeight = 0;

  // HRV component (35 pts)
  if (hrv_trend?.deviation !== null && hrv_trend?.deviation !== undefined) {
    // Map deviation from [-30, +20] to [0, 100]
    const hrvScore = Math.min(100, Math.max(0, ((hrv_trend.deviation + 30) / 50) * 100));
    score += hrvScore * 0.35;
    totalWeight += 0.35;
  }

  // FC repos component (30 pts) — invert: lower is better
  if (fc_repos && fc_repos > 0) {
    let fcScore;
    if (fc_repos < 48) fcScore = 100;
    else if (fc_repos < 53) fcScore = 85;
    else if (fc_repos < 56) fcScore = 50;
    else fcScore = 15;
    score += fcScore * 0.30;
    totalWeight += 0.30;
  }

  // Sensation (20 pts) — 1-5 → 0-100
  if (sensation && sensation > 0) {
    score += ((sensation - 1) / 4) * 100 * 0.20;
    totalWeight += 0.20;
  }

  // Sleep (15 pts) — hours (0-9h → 0-100) × quality (1-5 → 0.4-1.0)
  if (sleep_h !== null && sleep_h !== undefined) {
    const hoursScore = Math.min(100, (sleep_h / 9) * 100);
    const qualityFactor = sleep_quality ? 0.4 + ((sleep_quality - 1) / 4) * 0.6 : 0.7;
    score += hoursScore * qualityFactor * 0.15;
    totalWeight += 0.15;
  }

  if (totalWeight === 0) return null;
  // Normalize if we don't have all inputs
  return Math.round((score / totalWeight) * totalWeight / 1 * (1 / Math.max(totalWeight, 0.3)));
}

function getDayStatus(acwr, hrv_trend, fc_repos) {
  // fc_repos alert
  let fcAlert = 'green';
  if (fc_repos >= 56) fcAlert = 'red';
  else if (fc_repos >= 53) fcAlert = 'orange';

  // HRV alert (if we have trend data)
  let hrvAlert = 'green';
  if (hrv_trend?.deviation !== null && hrv_trend?.deviation !== undefined) {
    if (hrv_trend.deviation < -15) hrvAlert = 'red';
    else if (hrv_trend.deviation < -5) hrvAlert = 'orange';
  }

  // ACWR status
  let acwrStatus = 'OPTIMAL';
  if (acwr < 0.7 || acwr > 1.3) acwrStatus = 'REPOS';
  else if (acwr < 0.8 || acwr > 1.1) acwrStatus = 'VIGILANCE';

  // Overall — worst case wins
  if (fcAlert === 'red' || acwrStatus === 'REPOS' || hrvAlert === 'red')
    return { status: 'REPOS', color: '#E24B4A' };
  if (fcAlert === 'orange' || acwrStatus === 'VIGILANCE' || hrvAlert === 'orange')
    return { status: 'VIGILANCE', color: '#EF9F27' };
  return { status: 'OPTIMAL', color: '#1D9E75' };
}

// ─── Dynamic fitness metrics ──────────────────────────────────────────────────

/**
 * TRIMP (Banister exponential, male formula)
 * Returns training impulse in arbitrary units.
 * ref: Banister et al. 1991; k=0.64, b=1.92 for males
 */
function calculateTRIMP(duration_min, fc_moy, fc_repos, fc_max) {
  if (!duration_min || !fc_moy || !fc_repos || !fc_max) return null;
  const hrr = (fc_moy - fc_repos) / (fc_max - fc_repos);
  if (hrr <= 0.2 || hrr > 1.05) return null;
  return Math.round(duration_min * hrr * (0.64 * Math.exp(1.92 * hrr)) * 10) / 10;
}

/**
 * VO2max estimate from a single run — Firstbeat/ACSM sub-maximal method.
 * VO2_running = speed_m/min * 0.2 + speed * grade * 0.9 + 3.5
 * VO2max = VO2_running / HRR_fraction
 * Requires HRR >= 0.65 for reliable sub-maximal extrapolation.
 */
function estimateVO2maxFromRun(distance_km, duration_min, dplus_m, fc_moy, fc_repos, fc_max) {
  if (!distance_km || !duration_min || !fc_moy || duration_min < 20) return null;
  const speed_m_min = (distance_km * 1000) / duration_min;
  const grade = (dplus_m || 0) / (distance_km * 1000);
  const vo2_running = speed_m_min * 0.2 + speed_m_min * grade * 0.9 + 3.5;
  const hrr = (fc_moy - fc_repos) / (fc_max - fc_repos);
  if (hrr < 0.65 || hrr > 0.97) return null; // min 65% HRR for sub-maximal extrapolation
  const estimate = vo2_running / hrr;
  if (estimate < 30 || estimate > 90) return null;
  return Math.round(estimate * 10) / 10;
}

/**
 * Build a unified list of sessions with TRIMP from JSON activities + DB logs.
 * Returns [{date, trimp, distance_km, dplus_m, duration_min, fc_moy}] sorted by date.
 */
function buildSessionsWithTRIMP(activities, dbLogs, fc_repos, fc_max) {
  const sessions = [];
  const dbDates = new Set((dbLogs || []).map(l => l.date));

  // Historical JSON activities (skip dates covered by DB)
  for (const a of (activities || [])) {
    const date = (a.Date || '').slice(0, 10);
    if (!date || !a.HR_moy || !a.Temps_h || !a.Distance_km) continue;
    if (dbDates.has(date)) continue;
    const duration_min = a.Temps_h * 60;
    const trimp = calculateTRIMP(duration_min, a.HR_moy, fc_repos, fc_max);
    if (!trimp) continue;
    sessions.push({ date, trimp, distance_km: a.Distance_km, dplus_m: a.D_plus_exact || 0, duration_min, fc_moy: a.HR_moy });
  }

  // DB logs
  for (const l of (dbLogs || [])) {
    if (!l.fc_moy || !l.duration_min || !l.distance_km) continue;
    const trimp = calculateTRIMP(l.duration_min, l.fc_moy, fc_repos, fc_max);
    if (!trimp) continue;
    sessions.push({ date: l.date, trimp, distance_km: l.distance_km, dplus_m: l.dplus_corrected || l.dplus_m || 0, duration_min: l.duration_min, fc_moy: l.fc_moy });
  }

  return sessions.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Dynamic VO2max — average of top-5 estimates from last 30 qualifying sessions.
 * known_vo2max: last Garmin value used to calibrate personal running economy factor.
 * Without known_vo2max, applies a 0.87 population-level economy factor for trained runners.
 */
function computeDynamicVO2max(sessions, fc_repos, fc_max, known_vo2max) {
  const estimates = sessions
    .slice(-30)
    .map(s => estimateVO2maxFromRun(s.distance_km, s.duration_min, s.dplus_m, s.fc_moy, fc_repos, fc_max))
    .filter(v => v !== null);
  if (!estimates.length) return null;
  estimates.sort((a, b) => b - a);
  const top = estimates.slice(0, Math.min(5, estimates.length));
  const rawEstimate = top.reduce((s, v) => s + v, 0) / top.length;
  // Calibrate to individual running economy using Garmin baseline
  const economyFactor = known_vo2max ? Math.min(1, known_vo2max / rawEstimate) : 0.87;
  return Math.round(rawEstimate * economyFactor * 10) / 10;
}

/**
 * Extend ATL/CTL series from last known values using Banister decay.
 * τ_atl = 7 days (acute/fatigue), τ_ctl = 42 days (chronic/fitness).
 * Returns [{date, atl, ctl, acwr, acwr_status}] for dates after lastDate.
 */
function extendATLCTL(lastDate, lastATL, lastCTL, sessions) {
  const result = [];
  const today = new Date().toISOString().slice(0, 10);
  if (lastDate >= today) return result;

  // Group TRIMP by date
  const trimpByDate = {};
  for (const s of sessions) {
    if (s.date > lastDate) trimpByDate[s.date] = (trimpByDate[s.date] || 0) + s.trimp;
  }

  let atl = lastATL;
  let ctl = lastCTL;
  let cur = new Date(lastDate);
  cur.setDate(cur.getDate() + 1);

  while (cur.toISOString().slice(0, 10) <= today) {
    const dateStr = cur.toISOString().slice(0, 10);
    const trimp = trimpByDate[dateStr] || 0;
    // Banister decay: ATL_d = ATL_{d-1} * e^(-1/7) + TRIMP_d
    atl = atl * Math.exp(-1 / 7) + trimp;
    ctl = ctl * Math.exp(-1 / 42) + trimp;
    const acwr = ctl > 0 ? Math.round((atl / ctl) * 100) / 100 : 0;
    const acwr_status = acwr < 0.8 || acwr > 1.5 ? (acwr < 0.7 || acwr > 1.9 ? 'DANGER' : 'VIGILANCE') : 'OPTIMAL';
    result.push({ date: dateStr, atl: Math.round(atl), ctl: Math.round(ctl), acwr, acwr_status });
    cur.setDate(cur.getDate() + 1);
  }
  return result;
}

/**
 * Dynamic Endurance Score on 0-10000 scale (matches Garmin es units).
 * Formula: VO2max 50% + 90-day TRIMP load 30% + 14-day load 10% + longest run 10%.
 * Calibrated against athlete benchmark: VO2max=59.4, decayed TRIMP≈4806 → es≈8452.
 * REF values derived empirically from athlete data.
 */
function computeEnduranceScore(sessions, vo2max) {
  if (!vo2max || !sessions.length) return null;
  const today = new Date();

  // vo2Component: calibrated so 59.4 → ~7920 (normalized to 0-10000)
  const vo2Component = (vo2max / 75) * 10000;

  const cutoff90 = new Date(today); cutoff90.setDate(cutoff90.getDate() - 90);
  const cutoff14 = new Date(today); cutoff14.setDate(cutoff14.getDate() - 14);

  const longTermSessions = sessions.filter(s => new Date(s.date) >= cutoff90);
  const shortTermSessions = sessions.filter(s => new Date(s.date) >= cutoff14);

  // Long-term: TRIMP with exp decay τ=60d; REF=5350 decayed TRIMP → 10000 pts
  const longTermLoad = longTermSessions.reduce((sum, s) => {
    const daysAgo = (today - new Date(s.date)) / 86400000;
    return sum + s.trimp * Math.exp(-daysAgo / 60);
  }, 0);
  const longTermComponent = Math.min(10000, (longTermLoad / 5350) * 10000);

  // Short-term: REF=1660 TRIMP in 14d → 10000 pts
  const shortTermLoad = shortTermSessions.reduce((sum, s) => sum + s.trimp, 0);
  const shortTermComponent = Math.min(10000, (shortTermLoad / 1660) * 10000);

  // Long run bonus: REF=58km → 10000 pts
  const maxDist = Math.max(0, ...longTermSessions.map(s => s.distance_km || 0));
  const longRunComponent = Math.min(10000, (maxDist / 58) * 10000);

  return Math.round(vo2Component * 0.5 + longTermComponent * 0.3 + shortTermComponent * 0.1 + longRunComponent * 0.1);
}

/**
 * Dynamic Hill Score on 0-100 scale.
 * Detect hill sessions (D+/km >= 10), apply recency decay τ=45d over 90 days.
 * Sub-scores: endurance (<50m D+/km) vs strength (>=50m D+/km).
 * Calibrated: REF_TOTAL=4000 decayed D+ → overall=100
 */
function computeHillScore(sessions) {
  const today = new Date();
  const cutoff = new Date(today); cutoff.setDate(cutoff.getDate() - 90);

  const hillSessions = sessions.filter(s =>
    new Date(s.date) >= cutoff &&
    s.dplus_m > 0 && s.distance_km > 0 &&
    (s.dplus_m / s.distance_km) >= 10
  );
  if (!hillSessions.length) return { overall: 0, endurance: 0, strength: 0 };

  const decay = (s) => {
    const daysAgo = (today - new Date(s.date)) / 86400000;
    return s.dplus_m * Math.exp(-daysAgo / 45);
  };

  const totalDecayed = hillSessions.reduce((sum, s) => sum + decay(s), 0);
  const endDecayed = hillSessions.filter(s => (s.dplus_m / s.distance_km) < 50).reduce((sum, s) => sum + decay(s), 0);
  const strDecayed = hillSessions.filter(s => (s.dplus_m / s.distance_km) >= 50).reduce((sum, s) => sum + decay(s), 0);

  // Calibration: REF values produce score=100 (derived from athlete benchmark data)
  const REF_OVERALL = 8253;  // total decayed D+ for score=100 → matches Garmin ~72/100
  const REF_END = 8209;      // endurance decayed D+ for score=100 → matches Garmin ~71/100
  const REF_STR = 263;       // strength decayed D+ for score=100 → matches Garmin ~43/100

  return {
    overall: Math.min(100, Math.round(totalDecayed / REF_OVERALL * 100)),
    endurance: Math.min(100, Math.round(endDecayed / REF_END * 100)),
    strength: Math.min(100, Math.round(strDecayed / REF_STR * 100)),
  };
}

/**
 * Strength score from logged Renforcement sessions in last 28 days.
 * Target: 8 sessions (2/week). Returns score 0-100 + raw count.
 */
function computeStrengthScore(dbLogs) {
  const today = new Date();
  const cutoff28 = new Date(today); cutoff28.setDate(cutoff28.getDate() - 28);

  let count = 0;
  for (const l of (dbLogs || [])) {
    if (new Date(l.date) < cutoff28) continue;
    if (l.sport === 'Renforcement') { count++; continue; }
    // Check extra sessions
    try {
      const extra = JSON.parse(l.extra_sessions_json || '[]');
      if (extra.some(s => s.sport === 'Renforcement')) count++;
    } catch {}
  }
  return { score: Math.min(100, Math.round(count / 8 * 100)), sessions_28d: count, target: 8 };
}

/**
 * 4-week training block position (1=moderate, 2=medium, 3=high load, 4=recovery).
 * Counts backwards from race: ensures the week right before taper is NOT a recovery week.
 */
function getBlockWeek(daysUntilRace) {
  const weeksToRace = Math.ceil(daysUntilRace / 7);
  return ((weeksToRace - 1) % 4) + 1;
}

/**
 * Estimate dominant HR zone for a session (Karvonen zones).
 * Returns 1-5.
 */
function estimateZone(fc_moy, fc_repos, fc_max) {
  if (!fc_moy || !fc_repos || !fc_max) return null;
  const hrr = (fc_moy - fc_repos) / (fc_max - fc_repos);
  if (hrr < 0.6) return 1;
  if (hrr < 0.75) return 2;
  if (hrr < 0.85) return 3;
  if (hrr < 0.95) return 4;
  return 5;
}

/**
 * Compute training polarization from a list of sessions with fc_moy.
 * Returns { easy_pct, moderate_pct, hard_pct, sessions_with_fc, zone_counts }
 * easy = Z1+Z2, moderate = Z3, hard = Z4+Z5
 */
function computePolarization(sessions, fc_repos, fc_max) {
  const withFC = sessions.filter(s => s.fc_moy && s.fc_moy > 0 && s.duration_min > 0);
  if (!withFC.length) return null;
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  // Weight by duration
  let totalMin = 0;
  const weighted = { easy: 0, moderate: 0, hard: 0 };
  for (const s of withFC) {
    const z = estimateZone(s.fc_moy, fc_repos, fc_max);
    if (!z) continue;
    counts[z] = (counts[z] || 0) + 1;
    totalMin += s.duration_min;
    if (z <= 2) weighted.easy += s.duration_min;
    else if (z === 3) weighted.moderate += s.duration_min;
    else weighted.hard += s.duration_min;
  }
  if (!totalMin) return null;
  return {
    easy_pct: Math.round((weighted.easy / totalMin) * 100),
    moderate_pct: Math.round((weighted.moderate / totalMin) * 100),
    hard_pct: Math.round((weighted.hard / totalMin) * 100),
    sessions_with_fc: withFC.length,
    zone_counts: counts,
    total_min: Math.round(totalMin),
  };
}

/**
 * Compute pain zone frequency from recent daily logs.
 * Returns [{ zone, label, count, max_level, last_date }] sorted by count desc.
 */
const ZONE_LABELS = {
  tete: 'Tête', epaule_g: 'Épaule G', epaule_d: 'Épaule D',
  thorax: 'Thorax', ventre: 'Abdomen',
  hanche_g: 'Hanche G', hanche_d: 'Hanche D',
  quad_g: 'Quadriceps G', quad_d: 'Quadriceps D',
  genou_g: 'Genou G', genou_d: 'Genou D',
  tibia_g: 'Tibia G', tibia_d: 'Tibia D',
  pied_g: 'Pied G', pied_d: 'Pied D',
  haut_dos: 'Haut du dos', lombaires: 'Lombaires',
  fesse_g: 'Fessier G', fesse_d: 'Fessier D',
  ischio_g: 'Ischio G', ischio_d: 'Ischio D',
  mollet_g: 'Mollet G', mollet_d: 'Mollet D',
  achille_g: 'Achille G', achille_d: 'Achille D',
};

function computePainSummary(logsDesc, days = 14) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const recent = logsDesc.filter(l => l.date >= cutoffStr && l.pain_zones);
  if (!recent.length) return [];
  const zoneStats = {};
  for (const log of recent) {
    let zones;
    try { zones = JSON.parse(log.pain_zones); } catch { continue; }
    for (const { zone, level } of (zones || [])) {
      if (!level || level === 0) continue;
      if (!zoneStats[zone]) zoneStats[zone] = { zone, label: ZONE_LABELS[zone] || zone, count: 0, max_level: 0, last_date: log.date };
      zoneStats[zone].count++;
      zoneStats[zone].max_level = Math.max(zoneStats[zone].max_level, level);
      if (log.date > zoneStats[zone].last_date) zoneStats[zone].last_date = log.date;
    }
  }
  return Object.values(zoneStats).sort((a, b) => b.count - a.count || b.max_level - a.max_level);
}

// ─────────────────────────────────────────────────────────────────────────────
// NUTRITION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * BMR via Mifflin-St Jeor
 * sex: 'M' | 'F'
 */
function computeBMR(weight_kg, height_cm, age, sex = 'M') {
  const base = 10 * weight_kg + 6.25 * height_cm - 5 * age;
  return Math.round(sex === 'M' ? base + 5 : base - 161);
}

/**
 * Calories brûlées pour une session (formule trail running).
 * ~1 kcal/kg/km plat + 10 kcal/kg/100m D+
 */
function estimateSessionCalories(session, weight_kg) {
  if (!session || !weight_kg) return 0;
  const type = session.type || session.sport || '';
  const dist = parseFloat(session.distance || session.km || 0);
  const dplus = parseFloat(session.dplus || session.dplus_m || 0);
  const duration = parseFloat(session.duration_min || 0);

  if (/repos|off/i.test(type)) return 0;

  // Course / Trail / Tapis
  if (/endurance|long|tempo|spéc|course|trail|côtes|activation|récup/i.test(type)) {
    const flat_kcal = weight_kg * (dist || (duration / 60) * 10);
    const elev_kcal = weight_kg * (dplus / 100) * 0.1;
    return Math.round(flat_kcal + elev_kcal);
  }
  // Renforcement / Escalier
  if (/renfo|escal/i.test(type)) {
    return Math.round((duration / 60) * weight_kg * 5.5); // MET 5.5
  }
  return Math.round(weight_kg * Math.max(dist, duration / 12 || 5));
}

/**
 * Besoins énergétiques journaliers totaux + répartition macros.
 * phase: 'base' | 'charge' | 'spécificité' | 'affûtage' | 'récup' | 'course'
 */
function computeDailyNeeds(bmr, session_kcal, phase = 'base') {
  // Facteur d'activité de base (NEAT + vie quotidienne)
  const neat = Math.round(bmr * 0.35);
  const total = bmr + neat + session_kcal;

  // Répartition macros selon phase (g/kg estimé depuis total)
  // Référence : Burke et al. & AIS nutrition guidelines pour endurance
  const weight_est = bmr / 22; // approximation inverse Mifflin
  let carb_factor, prot_factor, fat_factor;

  if (/course/.test(phase)) {
    [carb_factor, prot_factor, fat_factor] = [9, 1.8, 0.8];
  } else if (/charge|spéc/.test(phase)) {
    [carb_factor, prot_factor, fat_factor] = [7, 1.8, 1.0];
  } else if (/affûtage/.test(phase)) {
    [carb_factor, prot_factor, fat_factor] = [6, 1.7, 1.0];
  } else if (/récup/.test(phase)) {
    [carb_factor, prot_factor, fat_factor] = [4, 2.0, 1.2];
  } else { // base
    [carb_factor, prot_factor, fat_factor] = [5, 1.7, 1.1];
  }

  const carbs_g = Math.round(weight_est * carb_factor);
  const protein_g = Math.round(weight_est * prot_factor);
  const fat_g = Math.round(weight_est * fat_factor);
  const macro_kcal = carbs_g * 4 + protein_g * 4 + fat_g * 9;
  // Ajuste les glucides pour atteindre le total calorique
  const carbs_adj = Math.round(carbs_g + (total - macro_kcal) / 4);

  return {
    total_kcal: total,
    bmr,
    neat,
    session_kcal,
    macros: { carbs_g: carbs_adj, protein_g, fat_g },
    hydration_l: Math.round((2.5 + session_kcal / 1000) * 10) / 10,
  };
}

function getCurrentSeason(date = new Date()) {
  const m = date.getMonth() + 1;
  if (m >= 3 && m <= 5) return 'printemps';
  if (m >= 6 && m <= 8) return 'été';
  if (m >= 9 && m <= 11) return 'automne';
  return 'hiver';
}

const SEASONAL_FOODS = {
  printemps: {
    legumes: ['asperges vertes', 'épinards frais', 'petits pois', 'carottes nouvelles', 'radis', 'fenouil', 'artichauds', 'courgettes', 'poireaux'],
    poissons: ['truite', 'cabillaud', 'dorade', 'lieu noir', 'saumon'],
    viandes: ['agneau', 'poulet fermier', 'dinde', 'lapin'],
    fruits: ['rhubarbe', 'fraises', 'banane', 'kiwi'],
    cereales: ['quinoa', 'riz complet', 'pâtes semi-complètes', 'patate douce', 'lentilles corail'],
  },
  été: {
    legumes: ['tomates', 'courgettes', 'aubergines', 'poivrons', 'haricots verts', 'maïs', 'concombre', 'basilic'],
    poissons: ['sardines', 'maquereau', 'thon frais', 'bar', 'saumon'],
    viandes: ['poulet', 'agneau', 'brochettes veau'],
    fruits: ['melon', 'pastèque', 'pêches', 'cerises', 'framboises', 'abricots'],
    cereales: ['quinoa', 'boulgour', 'riz basmati', 'pomme de terre nouvelle'],
  },
  automne: {
    legumes: ['potiron', 'butternut', 'champignons', 'poireaux', 'brocoli', 'chou-fleur', 'betterave', 'céleri-rave'],
    poissons: ['hareng', 'maquereau', 'lieu noir', 'saumon', 'bar'],
    viandes: ['canard', 'veau', 'bœuf', 'poulet', 'gibier'],
    fruits: ['pommes', 'poires', 'raisins', 'kaki', 'châtaignes', 'figues'],
    cereales: ['lentilles', 'pois chiches', 'riz complet', 'patate douce', 'quinoa', 'orge'],
  },
  hiver: {
    legumes: ['chou kale', 'épinards', 'panais', 'céleri', 'mâche', 'endives', 'topinambour', 'chou-fleur', 'brocoli'],
    poissons: ['cabillaud', 'lieu noir', 'saumon', 'hareng', 'moules'],
    viandes: ['bœuf', 'veau', 'poulet', 'canard', 'dinde'],
    fruits: ['oranges', 'clémentines', 'pamplemousse', 'kiwi', 'banane', 'pomme'],
    cereales: ['lentilles', 'pois chiches', 'haricots rouges', 'quinoa', 'riz complet', 'polenta'],
  },
};

module.exports = {
  computeBMR,
  estimateSessionCalories,
  computeDailyNeeds,
  getCurrentSeason,
  SEASONAL_FOODS,
  calculateAEI,
  getAEIStatus,
  correctTreadmillDplus,
  estimateRaceTime,
  checkSweetSpot,
  getRollingAEI,
  getTrainingPhase,
  getDayStatus,
  getBlockWeek,
  computeHRVTrend,
  computeFCReposTrend,
  computeRecoveryScore,
  // Dynamic metrics
  calculateTRIMP,
  estimateVO2maxFromRun,
  buildSessionsWithTRIMP,
  computeDynamicVO2max,
  extendATLCTL,
  computeEnduranceScore,
  computeHillScore,
  computeStrengthScore,
  // Health metrics
  estimateZone,
  computePolarization,
  computePainSummary,
};
