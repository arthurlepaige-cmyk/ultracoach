const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { Ollama } = require('ollama');
const Anthropic = require('@anthropic-ai/sdk');

const DATA_PATH = path.join(__dirname, '..', '..', 'data', 'athlete_data_export.json');
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'mistral';
const ollama = new Ollama({ host: OLLAMA_HOST });

// ── GET /api/import/status — vérifie si des données existent ─────────────────
router.get('/status', (req, res) => {
  const exists = fs.existsSync(DATA_PATH);
  if (!exists) return res.json({ has_data: false });

  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf8').replace(/\bNaN\b/g, 'null');
    const data = JSON.parse(raw);
    res.json({
      has_data: true,
      activity_count: data.activities?.length || 0,
      athlete_name: data.athlete?.name || 'Athlète',
      date_range: {
        from: data.activities?.[0]?.Date?.slice(0, 10) || null,
        to: data.activities?.[data.activities.length - 1]?.Date?.slice(0, 10) || null,
      },
    });
  } catch {
    res.json({ has_data: false });
  }
});

// ── POST /api/import/convert — conversion IA d'un export brut ────────────────
router.post('/convert', async (req, res) => {
  const { raw_data, source, athlete_profile } = req.body;
  if (!raw_data) return res.status(400).json({ error: 'raw_data manquant' });

  // Limiter la taille envoyée à l'IA (premières 300 lignes suffisent pour le schéma)
  const lines = raw_data.split('\n').filter(l => l.trim());
  const sample = lines.slice(0, 300).join('\n');

  const sourceLabels = {
    garmin_csv: 'Garmin Connect (export CSV activités)',
    strava_csv: 'Strava (activities.csv depuis archive)',
    suunto_csv: 'Suunto (export CSV journal d\'entraînement)',
    json_libre: 'JSON libre / autre format',
  };

  const systemPrompt = `Tu es un expert en transformation de données sportives.
LANGUE: Réponds UNIQUEMENT en français. Tous les messages d'erreur et descriptions doivent être en français.

Tu dois convertir des données d'entraînement brutes vers un format JSON précis utilisé par une application de coaching trail running.

FORMAT DE SORTIE EXACT (JSON valide uniquement) :
{
  "version": "1.0",
  "export_date": "YYYY-MM-DD",
  "athlete": {
    "name": "Athlète",
    "fc_repos": <FC repos bpm, defaut 50>,
    "fc_max": <FC max bpm, defaut 185>,
    "fc_reserve": <fc_max - fc_repos>,
    "vo2max_current": <VO2max ml/kg/min, defaut null>,
    "utmb_index": null,
    "itra_max": null,
    "zones_karvonen": {
      "Z1": [<fc_repos + fc_reserve*0.6>, <fc_repos + fc_reserve*0.7>],
      "Z2": [<fc_repos + fc_reserve*0.7>, <fc_repos + fc_reserve*0.8>],
      "Z3": [<fc_repos + fc_reserve*0.8>, <fc_repos + fc_reserve*0.87>],
      "Z4": [<fc_repos + fc_reserve*0.87>, <fc_repos + fc_reserve*0.93>],
      "Z5": [<fc_repos + fc_reserve*0.93>, <fc_max>]
    },
    "personal_records": {},
    "garmin_current": null
  },
  "activities": [
    {
      "Date": "YYYY-MM-DD HH:MM:SS",
      "Distance_km": <float km>,
      "D_plus_exact": <float metres D+, 0 si inconnu>,
      "HR_moy": <int bpm ou null>,
      "HR_max": <int bpm ou null>,
      "Allure": <float min/km = Temps_h*60/Distance_km>,
      "Temps_h": <float heures>,
      "Effort": <float charge ou null>,
      "Vitesse": <float m/s = Distance_km/3.6/Temps_h ou null>,
      "Calories": <int ou null>,
      "Temp_moy": null,
      "is_treadmill": false,
      "Year": <int annee>,
      "Month": <int mois 1-12>
    }
  ],
  "garmin_runs": [],
  "atl_ctl": [],
  "endurance_score": [],
  "hill_score": [],
  "targets": [],
  "races": [],
  "insights": {}
}

RÈGLES DE CONVERSION :
- Ne garde que les activités de type course à pied / trail / tapis (exclure vélo, natation, yoga, etc.)
- Si la distance est en mètres, convertis en km (divise par 1000)
- Si la durée est au format HH:MM:SS, convertis en heures décimales
- Si le D+ est manquant ou 0, mets 0
- Si HR manquant, mets null
- Allure = Temps_h * 60 / Distance_km (min/km)
- is_treadmill: true si le nom de l'activité contient "tapis", "treadmill", "indoor"
- Trie les activités par date croissante
- Si le profil athlète est fourni, utilise ces valeurs ; sinon déduis depuis les données (FC max observée, etc.)

Réponds UNIQUEMENT avec le JSON valide, sans texte autour.`;

  const userMsg = `SOURCE: ${sourceLabels[source] || source || 'inconnu'}

PROFIL ATHLÈTE FOURNI:
${athlete_profile ? JSON.stringify(athlete_profile, null, 2) : 'Non fourni — déduis depuis les données'}

DONNÉES BRUTES À CONVERTIR (${lines.length} lignes, échantillon):
${sample}

${lines.length > 300 ? `\n[... et ${lines.length - 300} lignes supplémentaires non montrées — traite l'échantillon représentatif]` : ''}

Convertis ces données vers le format JSON décrit. Réponds UNIQUEMENT en JSON valide, en français.`;

  try {
    let text, provider;

    // Essaie Ollama en local d'abord
    try {
      const models = await ollama.list();
      if (models.models?.length > 0) {
        const resp = await ollama.chat({
          model: OLLAMA_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMsg },
          ],
          format: 'json',
          options: { temperature: 0.1, num_predict: 16000 },
        });
        text = resp.message.content;
        provider = 'ollama';
      }
    } catch {}

    // Fallback Anthropic
    if (!text) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return res.status(503).json({ error: 'Aucun provider IA disponible. Lance Ollama ou configure ANTHROPIC_API_KEY.' });
      const client = new Anthropic({ apiKey });
      const msg = await client.messages.create({
        model: 'claude-opus-4-6',
        max_tokens: 16000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMsg }],
      });
      text = msg.content[0].text;
      provider = 'anthropic';
    }

    // Parse le JSON retourné
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(422).json({ error: 'Réponse IA non parseable — réessaie ou vérifie le format des données' });

    const converted = JSON.parse(jsonMatch[0]);
    const actCount = converted.activities?.length || 0;
    if (actCount === 0) return res.status(422).json({ error: 'Aucune activité course détectée dans les données' });

    res.json({
      ok: true,
      provider,
      data: converted,
      stats: {
        activity_count: actCount,
        date_from: converted.activities[0]?.Date?.slice(0, 10),
        date_to: converted.activities[actCount - 1]?.Date?.slice(0, 10),
        with_hr: converted.activities.filter(a => a.HR_moy).length,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/import/save — sauvegarde le JSON converti ──────────────────────
router.post('/save', (req, res) => {
  const { data } = req.body;
  if (!data?.activities) return res.status(400).json({ error: 'Données invalides' });

  // Backup de l'ancien fichier si existant
  if (fs.existsSync(DATA_PATH)) {
    const backupPath = DATA_PATH.replace('.json', `_backup_${Date.now()}.json`);
    fs.copyFileSync(DATA_PATH, backupPath);
  }

  // Vide le cache dataLoader pour forcer le rechargement
  const { clearCache } = require('../dataLoader');
  clearCache();

  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf8');
  res.json({ ok: true, activity_count: data.activities.length });
});

// ── POST /api/import/profile — sauvegarde uniquement le profil athlète ───────
router.post('/profile', (req, res) => {
  const profile = req.body;
  if (!profile.fc_max || !profile.fc_repos) return res.status(400).json({ error: 'fc_max et fc_repos requis' });

  const fcReserve = profile.fc_max - profile.fc_repos;
  const athleteData = {
    version: '1.0',
    export_date: new Date().toISOString().slice(0, 10),
    athlete: {
      name: profile.name || 'Athlète',
      fc_repos: profile.fc_repos,
      fc_max: profile.fc_max,
      fc_reserve: fcReserve,
      vo2max_current: profile.vo2max_current || null,
      utmb_index: profile.utmb_index || null,
      itra_max: null,
      zones_karvonen: {
        Z1: [Math.round(profile.fc_repos + fcReserve * 0.60), Math.round(profile.fc_repos + fcReserve * 0.70)],
        Z2: [Math.round(profile.fc_repos + fcReserve * 0.70), Math.round(profile.fc_repos + fcReserve * 0.80)],
        Z3: [Math.round(profile.fc_repos + fcReserve * 0.80), Math.round(profile.fc_repos + fcReserve * 0.87)],
        Z4: [Math.round(profile.fc_repos + fcReserve * 0.87), Math.round(profile.fc_repos + fcReserve * 0.93)],
        Z5: [Math.round(profile.fc_repos + fcReserve * 0.93), profile.fc_max],
      },
      personal_records: {},
      garmin_current: null,
    },
    activities: [],
    garmin_runs: [],
    atl_ctl: [],
    endurance_score: [],
    hill_score: [],
    targets: [],
    races: [],
    insights: {},
  };

  if (fs.existsSync(DATA_PATH)) {
    // Met à jour seulement le profil athlete dans le JSON existant
    try {
      const raw = fs.readFileSync(DATA_PATH, 'utf8').replace(/\bNaN\b/g, 'null');
      const existing = JSON.parse(raw);
      existing.athlete = athleteData.athlete;
      fs.writeFileSync(DATA_PATH, JSON.stringify(existing, null, 2), 'utf8');
      return res.json({ ok: true, updated: true });
    } catch {}
  }

  fs.writeFileSync(DATA_PATH, JSON.stringify(athleteData, null, 2), 'utf8');
  res.json({ ok: true, created: true });
});

module.exports = router;
