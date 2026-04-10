const express = require('express');
const router = express.Router();
const xml2js = require('xml2js');
const { getDb } = require('../db');
const { loadData } = require('../dataLoader');
const { callAI } = require('../ai');

// ── Helpers ──────────────────────────────────────────────────────────────────

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function downsample(points, targetCount) {
  if (points.length <= targetCount) return points;
  const step = points.length / targetCount;
  return Array.from({ length: targetCount }, (_, i) => points[Math.floor(i * step)]);
}

async function parseGPXContent(gpxContent) {
  const parser = new xml2js.Parser();
  const result = await parser.parseStringPromise(gpxContent);
  const trackPoints = result.gpx?.trk?.[0]?.trkseg?.[0]?.trkpt || [];

  const points = [];
  let totalDist = 0;
  let prevPoint = null;

  for (const pt of trackPoints) {
    const lat = parseFloat(pt.$.lat);
    const lon = parseFloat(pt.$.lon);
    const ele = parseFloat(pt.ele?.[0] || 0);
    if (prevPoint) {
      totalDist += haversine(prevPoint.lat, prevPoint.lon, lat, lon);
    }
    points.push({ km: Math.round(totalDist * 100) / 100, ele: Math.round(ele), lat, lon });
    prevPoint = { lat, lon };
  }

  // Calculate real D+ and D- with smoothing
  let dplus = 0, dminus = 0;
  for (let i = 1; i < points.length; i++) {
    const diff = points[i].ele - points[i - 1].ele;
    if (diff > 0) dplus += diff;
    else dminus += Math.abs(diff);
  }

  // Auto-detect sections based on elevation trend (windows of ~10km)
  const sections = detectSections(points, totalDist);

  return {
    points: downsample(points, 500),
    raw_count: points.length,
    total_km: Math.round(totalDist * 10) / 10,
    dplus_computed: Math.round(dplus),
    dminus_computed: Math.round(dminus),
    sections,
    synthetic: false,
  };
}

function detectSections(points, totalKm) {
  const windowKm = 8;
  const sections = [];
  let i = 0;

  while (i < points.length - 1) {
    const startKm = points[i].km;
    const startEle = points[i].ele;

    // Find end of window
    let j = i + 1;
    while (j < points.length - 1 && points[j].km - startKm < windowKm) j++;

    const endKm = points[j].km;
    const endEle = points[j].ele;
    const distKm = endKm - startKm;

    // Always advance i to avoid infinite loop
    i = j;
    if (distKm < 1) continue;

    const eleGain = endEle - startEle;
    const gradient = (eleGain / (distKm * 1000)) * 100;
    const type = gradient > 3 ? 'climb' : gradient < -3 ? 'descent' : 'flat';

    if (sections.length > 0 && sections[sections.length - 1].type === type) {
      sections[sections.length - 1].km_end = Math.round(endKm * 10) / 10;
      sections[sections.length - 1].ele_end = endEle;
    } else {
      sections.push({
        km_start: Math.round(startKm * 10) / 10,
        km_end: Math.round(endKm * 10) / 10,
        ele_start: startEle,
        ele_end: endEle,
        type,
        gradient: Math.round(gradient * 10) / 10,
      });
    }
  }

  return sections;
}

function generateSyntheticProfile(race) {
  const dist = race?.distance_km || 157;
  const dplus = race?.dplus_m || 4590;
  const points = [];
  // Simple sinusoidal profile scaled to actual race
  const segments = [
    { frac: 0.19, climb: -0.25 }, { frac: 0.16, climb: 0.60 },
    { frac: 0.13, climb: -0.40 }, { frac: 0.16, climb: 0.50 },
    { frac: 0.13, climb: -0.45 }, { frac: 0.14, climb: 0.40 },
    { frac: 0.09, climb: -0.40 },
  ];
  let km = 0, ele = 800;
  for (const seg of segments) {
    const segLen = dist * seg.frac;
    const eleChange = dplus * Math.abs(seg.climb) * (seg.climb > 0 ? 1 : -1) * 0.4;
    const steps = Math.max(10, Math.floor(segLen * 3));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      points.push({
        km: Math.round((km + t * segLen) * 10) / 10,
        ele: Math.round(ele + eleChange * t + Math.sin(t * Math.PI * 3) * 30),
      });
    }
    km += segLen;
    ele += eleChange;
  }
  return { points, total_km: dist, dplus_computed: dplus, dminus_computed: dplus * 0.9, sections: [], synthetic: true };
}

// ── Helper: get race from DB or fallback to JSON ──────────────────────────────

function getRaceById(race_id) {
  const db = getDb();
  if (race_id) {
    const r = db.prepare('SELECT * FROM race_targets WHERE race_id = ?').get(race_id);
    if (r) return r;
  }
  // Fallback: priority A upcoming race
  const today = new Date().toISOString().split('T')[0];
  return db.prepare("SELECT * FROM race_targets WHERE active = 1 AND date > ? ORDER BY CASE priority WHEN 'A' THEN 0 WHEN 'B' THEN 1 ELSE 2 END, date ASC").get(today);
}

// ── Routes ───────────────────────────────────────────────────────────────────

// GET /api/race/strategy?race_id=xxx
router.get('/strategy', (req, res) => {
  const race = getRaceById(req.query.race_id);
  if (!race) {
    // Fallback to JSON
    const data = loadData();
    const fallback = data.targets?.[0];
    if (!fallback) return res.status(404).json({ error: 'No race found' });
    return res.json(fallback);
  }

  // Merge DB race with JSON strategy details if available
  const data = loadData();
  const jsonRace = data.targets?.find(t => t.id === race.race_id);

  res.json({
    ...race,
    // Expose objective times in consistent format
    objective_a: { time_h: race.obj_a_time_h, label: race.name + ' — Objectif A' },
    objective_b: { time_h: race.obj_b_time_h, label: race.name + ' — Objectif B' },
    objective_c: { time_h: race.obj_c_time_h, label: race.name + ' — Objectif C' },
    // Merge race strategy from JSON if available for this race
    race_strategy: jsonRace?.race_strategy || null,
    has_gpx: !!race.gpx_profile,
  });
});

// GET /api/race/gpx?race_id=xxx — parse GPX from DB or return synthetic
router.get('/gpx', async (req, res) => {
  const race = getRaceById(req.query.race_id);

  if (race?.gpx_profile) {
    try {
      const parsed = await parseGPXContent(race.gpx_profile);
      return res.json(parsed);
    } catch (e) {
      console.error('GPX parse error from DB:', e.message);
    }
  }

  // Fallback: check local file (legacy)
  const path = require('path');
  const fs = require('fs');
  const GPX_PATH = path.join(__dirname, '..', '..', 'data', 'COURSE_429510180.gpx');
  if (fs.existsSync(GPX_PATH)) {
    try {
      const content = fs.readFileSync(GPX_PATH, 'utf8');
      const parsed = await parseGPXContent(content);
      return res.json(parsed);
    } catch {}
  }

  res.json(generateSyntheticProfile(race));
});

// GET /api/race/checkpoints?race_id=xxx&objective=a
router.get('/checkpoints', (req, res) => {
  const race = getRaceById(req.query.race_id);
  if (!race) return res.status(404).json({ error: 'No race found' });

  const obj = req.query.objective || 'a';
  const timeH = obj === 'a' ? race.obj_a_time_h
    : obj === 'b' ? race.obj_b_time_h
    : race.obj_c_time_h;

  const startTime = race.start_time || '00:00';
  const [sh, sm] = startTime.split(':').map(Number);
  const startMinutes = sh * 60 + sm;

  // Try to use JSON strategy sections first, then generate from race params
  const data = loadData();
  const jsonRace = data.targets?.find(t => t.id === race.race_id);
  const sections = jsonRace?.race_strategy?.sections || generateDefaultSections(race);

  if (!sections.length) return res.json({ checkpoints: [], start_time: startTime, total_h: timeH });

  const baseH = sections.reduce((s, sec) => s + (sec.target_h || 0), 0);
  const factor = baseH > 0 ? (timeH || 20) / baseH : 1;

  // FC adjustment per objective: A = faster = +4bpm, C = slower = -4bpm vs B
  const fcAdjust = obj === 'a' ? 4 : obj === 'c' ? -4 : 0;

  const checkpoints = sections.map((s, i) => {
    const cumulH = sections.slice(0, i + 1).reduce((sum, sec) => sum + (sec.target_h || 0) * factor, 0);
    const passMinutes = startMinutes + cumulH * 60;
    const passH = Math.floor(passMinutes / 60) % 24;
    const passM = Math.round(passMinutes % 60);
    const isNight = passH >= 22 || passH < 6;

    // Recompute pace from actual adjusted section duration
    const sectionKm = (s.km_end || 0) - (s.km_start || 0);
    const sectionH = (s.target_h || 0) * factor;
    let pace = s.pace;
    if (sectionKm > 0 && sectionH > 0) {
      const paceMin = (sectionH * 60) / sectionKm;
      pace = `${Math.floor(paceMin)}:${String(Math.round((paceMin % 1) * 60)).padStart(2, '0')}`;
    }

    return {
      km: s.km_end,
      name: s.desc || `km ${s.km_end}`,
      target_time: `${String(passH).padStart(2, '0')}:${String(passM).padStart(2, '0')}`,
      cumul_h: Math.round(cumulH * 100) / 100,
      fc_max: s.fc_max ? s.fc_max + fcAdjust : null,
      is_night: isNight,
      pace,
      objective: obj.toUpperCase(),
    };
  });

  res.json({ checkpoints, start_time: startTime, total_h: timeH });
});

function generateDefaultSections(race) {
  // Auto-generate sections proportional to race distance
  // Use obj_b as base reference for target_h ratios; pace is recalculated per objective in /checkpoints
  const dist = race.distance_km || 100;
  const refTimeH = race.obj_b_time_h || dist / 7;
  const parts = Math.min(8, Math.ceil(dist / 20));
  return Array.from({ length: parts }, (_, i) => ({
    km_start: Math.round((i / parts) * dist),
    km_end: Math.round(((i + 1) / parts) * dist),
    desc: `Section ${i + 1}`,
    target_h: refTimeH / parts,
    fc_max: 148, // base FC, adjusted per objective in /checkpoints
  }));
}

// ── AI Strategy — shared generation function ──────────────────────────────────

const generatingRaces = new Set();

async function generateAndSaveStrategy(race_id) {
  if (generatingRaces.has(race_id)) return null;
  generatingRaces.add(race_id);
  try {
    const race = getRaceById(race_id);
    if (!race) return null;

    const data = loadData();
    const db = getDb();
    const athlete = data.athlete;

    const recentLogs = db.prepare(
      "SELECT * FROM daily_logs WHERE distance_km IS NOT NULL ORDER BY date DESC LIMIT 15"
    ).all();

    const recentAEI = recentLogs
      .filter(l => l.aei)
      .slice(0, 8)
      .map(l => `${l.date}: AEI ${l.aei} / ${l.distance_km}km D+${l.dplus_m || 0}m`)
      .join('\n');

    const aeiTrend = recentLogs.filter(l => l.aei).map(l => l.aei);
    const aeiAvg = aeiTrend.length ? aeiTrend.reduce((a, b) => a + b, 0) / aeiTrend.length : null;
    const aeiTrendDir = aeiTrend.length >= 3
      ? (aeiTrend[0] > aeiTrend[aeiTrend.length - 1] ? 'en amélioration' : 'en baisse')
      : 'stable';

    const latestLog = db.prepare('SELECT * FROM daily_logs ORDER BY date DESC LIMIT 1').get();
    const hrv = latestLog?.hrv || athlete.garmin_current?.hrv_current;
    const fcRepos = latestLog?.fc_repos || athlete.fc_repos;

    let gpxSummary = 'GPX non disponible — profil estimé';
    if (race.gpx_profile) {
      try {
        const parsed = await parseGPXContent(race.gpx_profile);
        const keyClimbs = parsed.sections
          .filter(s => s.type === 'climb' && s.km_end - s.km_start > 5)
          .map(s => `  km${s.km_start}-${s.km_end}: +${s.ele_end - s.ele_start}m (pente ${s.gradient}%)`)
          .join('\n');
        gpxSummary = `GPX chargé — ${parsed.total_km}km, D+ calculé ${parsed.dplus_computed}m, D- ${parsed.dminus_computed}m\nPrincipales montées:\n${keyClimbs || '  (non identifiées)'}`;
      } catch {}
    }

    const systemPrompt = `Tu es un coach ultra-trail expert en stratégie de course. Tu génères des plans de course en JSON.
LANGUE: Tu dois IMPÉRATIVEMENT répondre en français. Tous les textes (desc, strategy, race_rules, night_strategy, nutrition_plan, mental_tips, objective_assessment, key_risk, nutrition) doivent être rédigés en français.


ATHLÈTE:
- FC repos: ${fcRepos} bpm | FC max: ${athlete.fc_max} bpm
- Zones: Z1[${athlete.zones_karvonen?.Z1}], Z2[${athlete.zones_karvonen?.Z2}], Z3[${athlete.zones_karvonen?.Z3}]
- VO2max: ${athlete.vo2max_current} | UTMB Index: ${athlete.utmb_index}
- ATL: ${athlete.garmin_current?.atl} | CTL: ${athlete.garmin_current?.ctl} | ACWR: ${athlete.garmin_current?.acwr}
- HRV actuel: ${hrv} (moy: ${athlete.garmin_current?.hrv_mean})
- Hill Score: ${athlete.garmin_current?.hill_score_overall}/100 (Force: ${athlete.garmin_current?.hill_score_strength}, Endurance: ${athlete.garmin_current?.hill_score_endurance})

PERFORMANCES RÉCENTES (AEI = indice efficacité aérobie, >8.3 = pic de forme):
${recentAEI || 'Pas de données récentes'}
AEI moyen: ${aeiAvg ? aeiAvg.toFixed(2) : '—'} — Tendance: ${aeiTrendDir}

COURSE: ${race.name}
- Date: ${race.date} | Distance: ${race.distance_km}km | D+: ${race.dplus_m}m | D-: ${race.dminus_m || '?'}m
- Départ: ${race.start_time || '00:00'}
- Priorité: ${race.priority === 'A' ? 'A — Course principale, pic de forme visé' : race.priority === 'B' ? 'B — Course secondaire / préparation' : 'C — Course de sortie / expérience'}
- Objectif A: ${race.obj_a_time_h ? `${Math.floor(race.obj_a_time_h)}h${Math.round((race.obj_a_time_h % 1) * 60)}min` : '—'}
- Objectif B: ${race.obj_b_time_h ? `${Math.floor(race.obj_b_time_h)}h${Math.round((race.obj_b_time_h % 1) * 60)}min` : '—'}
- Objectif C: ${race.obj_c_time_h ? `${Math.floor(race.obj_c_time_h)}h${Math.round((race.obj_c_time_h % 1) * 60)}min` : '—'}

${race.priority === 'B' ? `CONTEXTE PRIORITÉ B: Cette course est secondaire dans la saison. Adapte la stratégie en conséquence:
- Recommande un effort contrôlé (ne pas vider les réserves — course A prévue après)
- Favorise la gestion prudente: ne pas partir trop vite, rester en Z1-Z2
- L'objectif de temps est indicatif — la priorité est l'expérience terrain et la récup rapide
- Suggère de terminer avec de l'énergie en réserve (plutôt objectif B ou C)
` : race.priority === 'C' ? `CONTEXTE PRIORITÉ C: Course de sortie ou d'expérience. Stratégie très conservative, plaisir avant tout.
` : `CONTEXTE PRIORITÉ A: Course principale. Optimise pour la performance maximale sur la durée de la saison.
`}
PROFIL GPX:
${gpxSummary}

ADAPTE LA STRATÉGIE selon:
- Si AEI ${aeiAvg ? `= ${aeiAvg.toFixed(2)}` : 'inconnu'} et tendance ${aeiTrendDir}: ajuste les objectifs de temps
- Si HRV ${hrv} vs moy ${athlete.garmin_current?.hrv_mean}: signale si récupération insuffisante
- Si ACWR ${athlete.garmin_current?.acwr}: signale si surcharge ou sous-charge
- Hill Score ${athlete.garmin_current?.hill_score_overall}: adapte la stratégie D+

RÉPONDS en JSON valide uniquement:
{
  "recommended_objective": "A|B|C",
  "objective_assessment": "phrase d'évaluation personnalisée",
  "health_flags": ["alertes santé éventuelles"],
  "sections": [
    {
      "km_start": number, "km_end": number,
      "desc": "description section",
      "strategy": "consigne tactique précise",
      "target_pace_min_km": number,
      "fc_max": number,
      "zone": "Z1|Z1-Z2|Z2|Z2-Z3",
      "target_h": number,
      "key_risk": "risque principal",
      "nutrition": "consigne nutrition/hydratation"
    }
  ],
  "race_rules": ["règle 1", "règle 2"],
  "night_strategy": "stratégie section nuit si applicable",
  "nutrition_plan": "plan nutrition global",
  "mental_tips": ["conseil mental 1"]
}`;

    const { text: rawText, provider } = await callAI(systemPrompt, 'Génère la stratégie de course complète et adaptée. Réponds UNIQUEMENT en français, en JSON valide.');
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Réponse IA non parseable');
    const strategy = JSON.parse(jsonMatch[0]);

    // Ensure columns exist then save
    const cols = db.prepare("PRAGMA table_info(race_targets)").all().map(c => c.name);
    if (!cols.includes('ai_strategy')) db.exec("ALTER TABLE race_targets ADD COLUMN ai_strategy TEXT");
    if (!cols.includes('ai_strategy_generated_at')) db.exec("ALTER TABLE race_targets ADD COLUMN ai_strategy_generated_at TEXT");

    db.prepare("UPDATE race_targets SET ai_strategy = ?, ai_strategy_generated_at = ? WHERE race_id = ?")
      .run(JSON.stringify(strategy), new Date().toISOString(), race.race_id);

    console.log(`[AI Strategy] Generated for ${race.race_id} via ${provider}`);
    return { strategy, provider };
  } catch (err) {
    console.error(`[AI Strategy] Failed for ${race_id}:`, err.message);
    return null;
  } finally {
    generatingRaces.delete(race_id);
  }
}

// GET /api/race/list — all upcoming races for selector
router.get('/list', (req, res) => {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];
  const races = db.prepare("SELECT race_id, name, date, distance_km, dplus_m, priority, gpx_profile FROM race_targets WHERE active = 1 AND date > ? ORDER BY date ASC").all(today);
  res.json(races.map(r => ({ ...r, has_gpx: !!r.gpx_profile, gpx_profile: undefined })));
});

// POST /api/race/ai-strategy/:race_id — force (re)generate AI strategy
router.post('/ai-strategy/:race_id', async (req, res) => {
  const race_id = req.params.race_id;
  if (!getRaceById(race_id)) return res.status(404).json({ error: 'Race not found' });
  if (generatingRaces.has(race_id)) return res.json({ generating: true, message: 'Génération déjà en cours' });
  try {
    const result = await generateAndSaveStrategy(race_id);
    if (!result) return res.status(500).json({ error: 'Génération échouée' });
    res.json({ strategy: result.strategy, provider: result.provider, race_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/race/ai-strategy/:race_id — get saved strategy (auto-regenerates if stale)
router.get('/ai-strategy/:race_id', (req, res) => {
  const db = getDb();
  const race_id = req.params.race_id;
  const row = db.prepare('SELECT ai_strategy, ai_strategy_generated_at FROM race_targets WHERE race_id = ?').get(race_id);

  const strategy = row?.ai_strategy ? (() => { try { return JSON.parse(row.ai_strategy); } catch { return null; } })() : null;
  const generatedAt = row?.ai_strategy_generated_at || null;
  const isGenerating = generatingRaces.has(race_id);

  const sevenDaysMs = 7 * 24 * 3600 * 1000;
  const isStale = !generatedAt || Date.now() - new Date(generatedAt).getTime() > sevenDaysMs;

  // Auto-trigger background regen if missing or stale
  if (isStale && !isGenerating) {
    generateAndSaveStrategy(race_id).catch(console.error);
  }

  res.json({
    strategy,
    generating: isGenerating || (isStale && !strategy),
    stale: isStale && !!strategy,
    generated_at: generatedAt,
  });
});

module.exports = { router, generateAndSaveStrategy };
