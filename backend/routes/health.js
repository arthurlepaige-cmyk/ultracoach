const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { loadData } = require('../dataLoader');
const { computePolarization, computePainSummary, buildSessionsWithTRIMP, estimateZone } = require('../calc');

// ─── Shoes ───────────────────────────────────────────────────────────────────

router.get('/shoes', (req, res) => {
  const db = getDb();
  const shoes = db.prepare('SELECT * FROM shoes WHERE active = 1 ORDER BY created_at DESC').all();
  const data = loadData();
  const dbLogs = db.prepare('SELECT * FROM daily_logs WHERE shoe_id IS NOT NULL ORDER BY date').all();

  const result = shoes.map(shoe => {
    // Count km from db logs
    const shoeKm = dbLogs
      .filter(l => l.shoe_id === shoe.id)
      .reduce((sum, l) => sum + (l.distance_km || 0), 0);
    const totalKm = Math.round((shoe.km_initial || 0) + shoeKm);
    return {
      ...shoe,
      km_logged: Math.round(shoeKm),
      km_total: totalKm,
      km_remaining: Math.max(0, 700 - totalKm),
      alert: totalKm >= 600,
    };
  });
  res.json(result);
});

router.post('/shoes', (req, res) => {
  const db = getDb();
  const { name, brand, km_initial, purchase_date } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const r = db.prepare('INSERT INTO shoes (name, brand, km_initial, purchase_date) VALUES (?,?,?,?)').run(name, brand || null, km_initial || 0, purchase_date || null);
  res.json(db.prepare('SELECT * FROM shoes WHERE id = ?').get(r.lastInsertRowid));
});

router.put('/shoes/:id', (req, res) => {
  const db = getDb();
  const { name, brand, km_initial, purchase_date, active } = req.body;
  db.prepare('UPDATE shoes SET name=?, brand=?, km_initial=?, purchase_date=?, active=? WHERE id=?')
    .run(name, brand || null, km_initial || 0, purchase_date || null, active ?? 1, req.params.id);
  res.json(db.prepare('SELECT * FROM shoes WHERE id = ?').get(req.params.id));
});

router.delete('/shoes/:id', (req, res) => {
  const db = getDb();
  db.prepare('UPDATE shoes SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── Polarization ────────────────────────────────────────────────────────────

router.get('/polarization', (req, res) => {
  const weeks = parseInt(req.query.weeks) || 12;
  const db = getDb();
  const data = loadData();
  const athlete = data.athlete;
  const fc_repos = athlete?.fc_repos_actuelle || 50;
  const fc_max = athlete?.fc_max || 185;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - weeks * 7);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  // Build sessions from JSON + DB logs
  const dbLogs = db.prepare('SELECT * FROM daily_logs WHERE date >= ? AND fc_moy IS NOT NULL ORDER BY date').all(cutoffStr);
  const jsonActivities = (data.activities || []).filter(a => {
    const date = (a.Date || '').slice(0, 10);
    return date >= cutoffStr && a.HR_moy;
  }).map(a => ({
    date: (a.Date || '').slice(0, 10),
    fc_moy: a.HR_moy,
    duration_min: (a.Temps_h || 0) * 60,
    distance_km: a.Distance_km || 0,
  }));

  const dbDates = new Set(dbLogs.map(l => l.date));
  const allSessions = [
    ...jsonActivities.filter(a => !dbDates.has(a.date)),
    ...dbLogs.map(l => ({ date: l.date, fc_moy: l.fc_moy, duration_min: l.duration_min || 0, distance_km: l.distance_km || 0 }))
  ].sort((a, b) => a.date.localeCompare(b.date));

  // Overall polarization
  const overall = computePolarization(allSessions, fc_repos, fc_max);

  // Weekly breakdown (last 12 weeks)
  const weeklyData = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const weekEnd = new Date();
    weekEnd.setDate(weekEnd.getDate() - w * 7);
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() - 6);
    const ws = weekStart.toISOString().slice(0, 10);
    const we = weekEnd.toISOString().slice(0, 10);
    const weekSessions = allSessions.filter(s => s.date >= ws && s.date <= we);
    const pol = computePolarization(weekSessions, fc_repos, fc_max);
    weeklyData.push({ week: ws, ...( pol || { easy_pct: 0, moderate_pct: 0, hard_pct: 0, sessions_with_fc: 0 }) });
  }

  res.json({ overall, weekly: weeklyData, fc_repos, fc_max });
});

// ─── Pain timeline ────────────────────────────────────────────────────────────

router.get('/pain-timeline', (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const db = getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const logsDesc = db.prepare('SELECT date, pain_zones FROM daily_logs WHERE date >= ? ORDER BY date DESC').all(cutoff.toISOString().slice(0, 10));
  const summary = computePainSummary(logsDesc, days);
  const timeline = logsDesc
    .filter(l => l.pain_zones)
    .map(l => {
      let zones;
      try { zones = JSON.parse(l.pain_zones); } catch { zones = []; }
      return { date: l.date, zones: zones.filter(z => z.level > 0) };
    })
    .filter(l => l.zones.length > 0);
  res.json({ timeline, summary });
});

// ─── Correlations ────────────────────────────────────────────────────────────

router.get('/correlations', (req, res) => {
  const db = getDb();
  const logs = db.prepare('SELECT * FROM daily_logs ORDER BY date ASC').all();

  // Sleep → AEI next session
  const sleepAei = [];
  for (let i = 0; i < logs.length - 1; i++) {
    const l = logs[i];
    const next = logs[i + 1];
    if (l.sleep_h && next.aei) {
      sleepAei.push({ sleep_h: l.sleep_h, aei: next.aei, date: l.date });
    }
  }

  // HRV → RPE next session
  const hrvRpe = [];
  for (let i = 0; i < logs.length - 1; i++) {
    const l = logs[i];
    const next = logs[i + 1];
    if (l.hrv && next.rpe) {
      hrvRpe.push({ hrv: l.hrv, rpe: next.rpe, date: l.date });
    }
  }

  // Sleep → Sensation
  const sleepSensation = logs
    .filter(l => l.sleep_h && l.sensation)
    .map(l => ({ sleep_h: l.sleep_h, sensation: l.sensation, date: l.date }));

  res.json({ sleep_aei: sleepAei, hrv_rpe: hrvRpe, sleep_sensation: sleepSensation });
});

// ─── Weekly summary (coach) ───────────────────────────────────────────────────

router.get('/weekly-summary', (req, res) => {
  const db = getDb();
  const data = loadData();
  const athlete = data.athlete;
  const fc_repos = athlete?.fc_repos_actuelle || 50;
  const fc_max = athlete?.fc_max || 185;

  const cutoff7 = new Date(); cutoff7.setDate(cutoff7.getDate() - 7);
  const cutoff28 = new Date(); cutoff28.setDate(cutoff28.getDate() - 28);

  const logs7 = db.prepare('SELECT * FROM daily_logs WHERE date >= ? ORDER BY date DESC').all(cutoff7.toISOString().slice(0, 10));
  const logs28 = db.prepare('SELECT * FROM daily_logs WHERE date >= ? ORDER BY date DESC').all(cutoff28.toISOString().slice(0, 10));

  const km7 = logs7.reduce((s, l) => s + (l.distance_km || 0), 0);
  const dplus7 = logs7.reduce((s, l) => s + (l.dplus_corrected || l.dplus_m || 0), 0);
  const km28 = logs28.reduce((s, l) => s + (l.distance_km || 0), 0);

  const avgRpe = logs7.filter(l => l.rpe).reduce((s, l, _, a) => s + l.rpe / a.length, 0) || null;
  const avgSleep = logs7.filter(l => l.sleep_h).reduce((s, l, _, a) => s + l.sleep_h / a.length, 0) || null;

  const painSummary = computePainSummary(logs28, 28);
  const painAlerts = painSummary.filter(p => p.max_level >= 2 || p.count >= 3);

  // ACWR estimate
  const acwr = km28 > 0 ? Math.round((km7 / (km28 / 4)) * 100) / 100 : null;
  const acwrStatus = acwr ? (acwr > 1.5 ? 'DANGER' : acwr > 1.3 ? 'VIGILANCE' : acwr < 0.7 ? 'SOUS-CHARGE' : 'OPTIMAL') : null;

  res.json({
    stats: {
      km_7d: Math.round(km7 * 10) / 10,
      dplus_7d: Math.round(dplus7),
      km_28d: Math.round(km28 * 10) / 10,
      sessions_7d: logs7.filter(l => l.distance_km || l.sport === 'Renforcement').length,
      avg_rpe: avgRpe ? Math.round(avgRpe * 10) / 10 : null,
      avg_sleep_h: avgSleep ? Math.round(avgSleep * 10) / 10 : null,
      acwr, acwr_status: acwrStatus,
    },
    pain_alerts: painAlerts,
    hrv_logs: logs7.map(l => ({ date: l.date, hrv: l.hrv, fc_repos: l.fc_repos })),
  });
});

// ── GET /api/health/recovery-suggestions ─────────────────────────────────────
// Analyse les derniers logs et retourne des suggestions de récupération ciblées
// avec liens de recherche YouTube.
router.get('/recovery-suggestions', (req, res) => {
  const db = getDb();
  const data = loadData();
  const athlete = data.athlete || {};

  const logs = db.prepare('SELECT * FROM daily_logs ORDER BY date DESC LIMIT 14').all();
  if (!logs.length) return res.json([]);

  const latest = logs[0];
  const suggestions = [];

  // ── FC repos ──────────────────────────────────────────────────────────────
  const fcRepos = latest.fc_repos;
  if (fcRepos >= 56) {
    suggestions.push({
      level: 'alert',
      icon: '❤️',
      reason: `FC repos élevée (${fcRepos} bpm) — fatigue accumulée`,
      technique: 'Cohérence cardiaque',
      description: '5 min de respiration 4-4-4 pour activer le système parasympathique et accélérer la récupération.',
      search_url: 'https://www.youtube.com/results?search_query=coherence+cardiaque+recuperation+sport+5+minutes',
      duration: '5 min',
    });
  } else if (fcRepos >= 53) {
    suggestions.push({
      level: 'warning',
      icon: '💤',
      reason: `FC repos légèrement élevée (${fcRepos} bpm) — vigilance`,
      technique: 'Relaxation progressive',
      description: 'Technique de Jacobson : contracter puis relâcher chaque groupe musculaire pour améliorer la qualité du sommeil.',
      search_url: 'https://www.youtube.com/results?search_query=relaxation+musculaire+progressive+sport+recuperation',
      duration: '10 min',
    });
  }

  // ── HRV ───────────────────────────────────────────────────────────────────
  const hrv = latest.hrv;
  const hrvValues = logs.filter(l => l.hrv).map(l => l.hrv);
  if (hrv && hrvValues.length >= 5) {
    const hrvMean = hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length;
    if (hrv < hrvMean * 0.82) {
      suggestions.push({
        level: 'alert',
        icon: '📉',
        reason: `HRV bas (${hrv} vs moy ${Math.round(hrvMean)}) — récupération incomplète`,
        technique: 'Yoga Nidra',
        description: '20 min de yoga nidra équivalent à 2h de sommeil réparateur selon plusieurs études sur les athlètes d\'endurance.',
        search_url: 'https://www.youtube.com/results?search_query=yoga+nidra+sport+recuperation+francais+20+minutes',
        duration: '20 min',
      });
    }
  }

  // ── RPE élevé ────────────────────────────────────────────────────────────
  const rpe = latest.rpe;
  if (rpe >= 8) {
    suggestions.push({
      level: 'warning',
      icon: '🦵',
      reason: `Effort intense (RPE ${rpe}/10) — muscles à traiter`,
      technique: 'Foam rolling post-effort',
      description: 'Protocole complet mollets, quadriceps, IT band et fessiers. Insiste 60-90 sec sur les zones douloureuses.',
      search_url: 'https://www.youtube.com/results?search_query=foam+roller+protocole+complet+trail+running+recuperation',
      duration: '15 min',
    });
  }

  // ── Sensation basse ──────────────────────────────────────────────────────
  const sensation = latest.sensation;
  if (sensation !== null && sensation <= 2) {
    suggestions.push({
      level: 'warning',
      icon: '😴',
      reason: `Sensation faible (${sensation}/5) — corps qui demande du repos`,
      technique: 'Étirements passifs doux',
      description: 'Séance douce sans forcer : 30 sec par position, respiration profonde. Ne pas étirer jusqu\'à la douleur.',
      search_url: 'https://www.youtube.com/results?search_query=etirements+passifs+coureur+recuperation+fatigué',
      duration: '10 min',
    });
  }

  // ── Zones douloureuses ────────────────────────────────────────────────────
  const painZones = (() => {
    try { return JSON.parse(latest.pain_zones || '[]'); } catch { return []; }
  })();

  const PAIN_VIDEOS = {
    'Genou gauche':    { tech: 'Renforcement genou', q: 'renforcement+genou+coureur+trail+douleur+prevention' },
    'Genou droit':     { tech: 'Renforcement genou', q: 'renforcement+genou+coureur+trail+douleur+prevention' },
    'Cheville gauche': { tech: 'Stabilisation cheville', q: 'renforcement+cheville+trail+running+stabilisation' },
    'Cheville droite': { tech: 'Stabilisation cheville', q: 'renforcement+cheville+trail+running+stabilisation' },
    'Mollet gauche':   { tech: 'Automassage mollets', q: 'automassage+mollets+foam+roller+coureur' },
    'Mollet droit':    { tech: 'Automassage mollets', q: 'automassage+mollets+foam+roller+coureur' },
    'Cuisse gauche':   { tech: 'Foam roller quadriceps', q: 'foam+roller+quadriceps+ilio+tibial+coureur' },
    'Cuisse droite':   { tech: 'Foam roller quadriceps', q: 'foam+roller+quadriceps+ilio+tibial+coureur' },
    'Hanche gauche':   { tech: 'Mobilité hanches', q: 'mobilite+hanches+coureur+étirements+fessiers+trail' },
    'Hanche droite':   { tech: 'Mobilité hanches', q: 'mobilite+hanches+coureur+étirements+fessiers+trail' },
    'Dos':             { tech: 'Mobilité lombaire', q: 'mobilite+lombaire+coureur+dos+mal+etirements' },
    'Épaule gauche':   { tech: 'Relâchement épaules', q: 'relachement+epaules+coureur+trail+posture+bras' },
    'Épaule droite':   { tech: 'Relâchement épaules', q: 'relachement+epaules+coureur+trail+posture+bras' },
    'Pied gauche':     { tech: 'Automassage plantaire', q: 'fasciite+plantaire+automassage+coureur+prevention' },
    'Pied droit':      { tech: 'Automassage plantaire', q: 'fasciite+plantaire+automassage+coureur+prevention' },
    'Ischio-jambiers': { tech: 'Étirements ischio', q: 'etirements+ischio+jambiers+coureur+trail+souplesse' },
  };

  const seenTech = new Set();
  for (const zone of painZones) {
    const vid = PAIN_VIDEOS[zone.zone];
    if (vid && !seenTech.has(vid.tech)) {
      seenTech.add(vid.tech);
      suggestions.push({
        level: zone.level >= 3 ? 'alert' : 'warning',
        icon: '🩹',
        reason: `Douleur signalée — ${zone.zone} (intensité ${zone.level}/5)`,
        technique: vid.tech,
        description: `Exercices ciblés pour soulager et prévenir l'aggravation sur ${zone.zone}.`,
        search_url: `https://www.youtube.com/results?search_query=${vid.q}`,
        duration: '10 min',
      });
    }
  }

  // ── Charge consécutive élevée ──────────────────────────────────────────────
  const recentRpe = logs.slice(0, 5).map(l => l.rpe).filter(Boolean);
  if (recentRpe.length >= 3 && recentRpe.reduce((a, b) => a + b, 0) / recentRpe.length >= 7) {
    suggestions.push({
      level: 'info',
      icon: '🛁',
      reason: 'Charge élevée sur les 5 derniers jours',
      technique: 'Bain de contraste chaud/froid',
      description: '3 cycles : 2 min eau chaude → 30 sec eau froide. Réduit l\'inflammation et améliore la circulation.',
      search_url: 'https://www.youtube.com/results?search_query=bain+contraste+chaud+froid+recuperation+athlete+endurance',
      duration: '8 min',
    });
  }

  // ── Longue sortie récente ──────────────────────────────────────────────────
  const longRun = logs.slice(0, 3).find(l => (l.distance_km || 0) >= 20);
  if (longRun && !suggestions.some(s => s.technique === 'Foam rolling post-effort')) {
    suggestions.push({
      level: 'info',
      icon: '🏔️',
      reason: `Sortie longue récente (${longRun.distance_km}km le ${longRun.date})`,
      technique: 'Récupération active ultra',
      description: 'Protocole post-longue : marche 15 min, foam roller 10 min, élévation jambes 10 min.',
      search_url: 'https://www.youtube.com/results?search_query=recuperation+apres+long+trail+protocole+complet',
      duration: '35 min',
    });
  }

  // Trie : alertes en premier, puis warnings, puis info
  const ORDER = { alert: 0, warning: 1, info: 2 };
  suggestions.sort((a, b) => ORDER[a.level] - ORDER[b.level]);

  res.json(suggestions.slice(0, 5)); // max 5 suggestions
});

module.exports = router;
