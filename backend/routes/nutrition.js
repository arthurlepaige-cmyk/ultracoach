const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { getSessionsForRange } = require('../planData');
const {
  computeBMR, estimateSessionCalories, computeDailyNeeds,
  getCurrentSeason, SEASONAL_FOODS,
} = require('../calc');
const { callAI } = require('../ai');

function getAge(settings) {
  if (settings.birthdate) {
    const birth = new Date(settings.birthdate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  }
  return settings.age || 35;
}

// ── GET /api/nutrition/settings ───────────────────────────────────────────────
router.get('/settings', (req, res) => {
  const db = getDb();
  const s = db.prepare('SELECT * FROM nutrition_settings WHERE id = 1').get();
  res.json(s || { weight_kg: 70, height_cm: 175, age: 35, sex: 'M' });
});

// ── PUT /api/nutrition/settings ───────────────────────────────────────────────
router.put('/settings', (req, res) => {
  const db = getDb();
  const { weight_kg, height_cm, age, sex, birthdate } = req.body;
  db.prepare(`
    UPDATE nutrition_settings SET weight_kg=?, height_cm=?, age=?, sex=?, birthdate=?, updated_at=CURRENT_TIMESTAMP WHERE id=1
  `).run(weight_kg, height_cm, age, sex, birthdate || null);
  // Invalide tous les menus pour forcer la régénération
  db.prepare('DELETE FROM nutrition_menus').run();
  res.json({ ok: true });
});

// ── Fonction centrale de génération — utilisée par la route ET le scheduler ───
async function generateMenuForDate(date, forceRegen = false) {
  const db = getDb();

  // Check cache
  if (!forceRegen) {
    const cached = db.prepare('SELECT * FROM nutrition_menus WHERE date = ?').get(date);
    if (cached?.menu_json) {
      return {
        date, cached: true,
        needs: JSON.parse(cached.needs_json),
        menu: JSON.parse(cached.menu_json),
        session_summary: cached.session_summary,
      };
    }
  }

  // Récupère les paramètres athlète
  const settings = db.prepare('SELECT * FROM nutrition_settings WHERE id = 1').get()
    || { weight_kg: 70, height_cm: 175, age: 35, sex: 'M' };

  const bmr = computeBMR(settings.weight_kg, settings.height_cm, getAge(settings), settings.sex);

  // Récupère la session du jour depuis le plan structuré (retourne un tableau de jours)
  let sessions = [];
  try {
    const planDays = getSessionsForRange(date, date);
    sessions = planDays?.[0]?.sessions || [];
  } catch {}

  // Fallback : cherche dans daily_logs si séance réelle encodée ce jour
  const log = db.prepare('SELECT * FROM daily_logs WHERE date = ?').get(date);
  if (log && log.distance_km) {
    sessions = [{ type: log.session_type || 'Endurance', distance: log.distance_km, dplus: log.dplus_m || 0, duration_min: log.duration_min }];
  }

  // Si aucune session dans le plan ET aucune dans les logs → jour de repos
  // (on laisse sessions = [] — estimateSessionCalories retournera 0)

  // Récupère aussi la session du lendemain (pour nutrition pré-charge)
  const tomorrow = new Date(date);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);
  let tomorrowSessions = [];
  try {
    const tmDays = getSessionsForRange(tomorrowStr, tomorrowStr);
    tomorrowSessions = tmDays?.[0]?.sessions || [];
  } catch {}

  // Calcul calories sessions
  const session_kcal = sessions.reduce((sum, s) => sum + estimateSessionCalories(s, settings.weight_kg), 0);
  const session_summary = sessions.length
    ? sessions.map(s => `${s.type || s.sport} ${s.distance || s.km || ''}km${s.dplus || s.dplus_m ? ' / ' + (s.dplus || s.dplus_m) + 'm D+' : ''}`).join(' + ')
    : 'Repos';

  // Phase d'entraînement
  const nextRace = db.prepare("SELECT * FROM race_targets WHERE active=1 AND priority='A' AND date >= ? ORDER BY date ASC").get(date);
  let phase = 'base';
  if (nextRace) {
    const diff = Math.round((new Date(nextRace.date) - new Date(date)) / 86400000);
    if (diff <= 3) phase = 'course';
    else if (diff <= 10) phase = 'affûtage';
    else if (session_kcal > 800) phase = 'charge';
    else if (session_kcal < 200 && !sessions.length) phase = 'récup';
  }

  const needs = computeDailyNeeds(bmr, session_kcal, phase);

  // Contexte saison
  const season = getCurrentSeason(new Date(date));
  const seasonal = SEASONAL_FOODS[season];
  const dateObj = new Date(date);
  const monthNames = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const monthName = monthNames[dateObj.getMonth()];

  const tomorrowHard = tomorrowSessions.some(s => /tempo|longue|spéc|charge/i.test(s.type || s.session_type || s.sport || ''));
  const isRestDay = session_kcal < 200;
  const isHardDay = session_kcal > 700;

  // Dîners déjà proposés cette semaine — pour éviter les répétitions
  const dateObj2 = new Date(date);
  const dow = (dateObj2.getDay() + 6) % 7; // 0=lun … 6=dim
  const weekMonday = new Date(dateObj2);
  weekMonday.setDate(dateObj2.getDate() - dow);
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekMonday); d.setDate(weekMonday.getDate() + i);
    return d.toISOString().slice(0, 10);
  }).filter(d => d !== date);

  const diners_semaine = weekDates
    .map(d => {
      const c = db.prepare('SELECT menu_json FROM nutrition_menus WHERE date = ?').get(d);
      if (!c?.menu_json) return null;
      try {
        const m = JSON.parse(c.menu_json);
        return m.diner?.nom ? `${d} : ${m.diner.nom}` : null;
      } catch { return null; }
    })
    .filter(Boolean);

  // Repas du matin (toujours granola maison — on ajuste juste les quantités)
  // Granola maison : 1/2 flocons d'avoine, 1/4 amandes, 1/4 noisettes + yaourt + banane + miel + beurre de cacahuète
  const breakfastBase = isHardDay
    ? { avoine_g: '80-100g', amandes_noisettes: '30-40g (1/4 amandes + 1/4 noisettes)', yaourt: '150-180g', banane: '1 grande', extras: '1 c. à café de miel + 1 c. à café de beurre de cacahuète' }
    : { avoine_g: '60-70g', amandes_noisettes: '20-25g (1/4 amandes + 1/4 noisettes)', yaourt: '120-150g', banane: '1 petite ou ½', extras: '1 c. à café de miel + 1 c. à café de beurre de cacahuète' };

  const systemPrompt = `Tu es un nutritionniste sportif spécialisé trail running. Tu proposes des menus journaliers adaptés à la charge d'entraînement.
LANGUE: Réponds UNIQUEMENT en français.
STYLE: Les quantités sont INDICATIVES, pas des prescriptions strictes. Utilise des formulations comme "environ", "une belle portion de", "une poignée de", pas uniquement des grammes. Donne aussi l'équivalent visuel quand c'est possible (ex: "environ 80g = 4-5 cuillères à soupe bombées").
TON: Bienveillant, pratique, pas rigide. Les menus doivent donner envie.`;

  const userPrompt = `Génère un menu journalier complet pour ce trail runner.

DATE: ${date} (${monthName}, ${season})
CHARGE DU JOUR: ${session_summary}
CALORIES ESTIMÉES BRÛLÉES EN SÉANCE: ${session_kcal} kcal
BESOINS TOTAUX ESTIMÉS: ~${needs.total_kcal} kcal
MACROS CIBLES (indicatif): ~${needs.macros.carbs_g}g glucides / ~${needs.macros.protein_g}g protéines / ~${needs.macros.fat_g}g lipides
HYDRATATION: ~${needs.hydration_l}L
PHASE ENTRAÎNEMENT: ${phase}
DEMAIN: ${tomorrowSessions.length ? tomorrowSessions.map(s => s.type || s.session_type || s.sport).join('+') : 'repos'} ${tomorrowHard ? '(séance dure — pré-charger en glucides ce soir)' : ''}

HABITUDES FIXES:
- Matin: granola maison (composition: 1/2 flocons d'avoine + 1/4 amandes + 1/4 noisettes, servi avec yaourt nature, banane, 1 c. à café de miel, 1 c. à café de beurre de cacahuète)
  → Quantités suggérées aujourd'hui: avoine ${breakfastBase.avoine_g}, amandes+noisettes ${breakfastBase.amandes_noisettes}, yaourt ${breakfastBase.yaourt}, banane ${breakfastBase.banane}, ${breakfastBase.extras}
- Midi: soit les restes de la veille, soit pain + fromage
- Soir: libre (cuisine de saison, variée)

INGRÉDIENTS DE SAISON disponibles en ${monthName}:
- Légumes: ${seasonal.legumes.join(', ')}
- Poissons: ${seasonal.poissons.join(', ')}
- Viandes: ${seasonal.viandes.join(', ')}
- Fruits: ${seasonal.fruits.join(', ')}
- Céréales/légumineuses: ${seasonal.cereales.join(', ')}

PRÉFÉRENCES ALIMENTAIRES (IMPORTANT):
- Budget limité → privilégie les plats économiques
- Viande: poulet et saucisse OK régulièrement, poisson et viande rouge rarement (max 1x/semaine)
- Propose majoritairement des repas VÉGÉTARIENS (légumineuses, œufs, fromage, tofu…)
- Quand il y a de la viande: poulet ou saucisse de préférence
- Pas de poisson ni viande rouge sauf occasion spéciale

${diners_semaine.length > 0 ? `DÎNERS DÉJÀ PROPOSÉS CETTE SEMAINE (NE PAS RÉPÉTER):
${diners_semaine.map(d => `- ${d}`).join('\n')}
→ Propose un plat DIFFÉRENT, avec des ingrédients principaux différents.
` : ''}
CONTRAINTES:
- Recettes simples et rapides (max 30-40 min de préparation le soir)
- Favorise les plats qui font de bonnes restes pour le repas du midi suivant
- ${isHardDay ? 'Jour intense → priorité aux glucides complexes et récupération musculaire' : ''}
- ${isRestDay ? 'Jour de repos → légèrement moins calorique, favorise légumes et protéines maigres' : ''}
- ${tomorrowHard ? 'Demain séance dure → dîner riche en glucides (pâtes, riz, patate douce…)' : ''}

Réponds UNIQUEMENT en JSON valide:
{
  "titre_journee": "ex: Journée récupération — légèreté et reminéralisation",
  "message_coach": "1-2 phrases de conseil nutritionnel personnalisé pour ce jour",
  "petit_dejeuner": {
    "nom": "Granola maison",
    "ingredients": [
      {"nom": "Flocons d'avoine", "quantite": "environ 80g (4-5 c. à soupe bombées)", "kcal_approx": 300},
      {"nom": "Yaourt nature", "quantite": "150g (1 pot)", "kcal_approx": 90},
      {"nom": "Banane", "quantite": "1 moyenne", "kcal_approx": 95},
      {"nom": "Noisettes + amandes", "quantite": "une petite poignée (~25g)", "kcal_approx": 150}
    ],
    "kcal_total": 635,
    "note": "conseil ou variante si besoin"
  },
  "dejeuner": {
    "option_restes": "Idéalement les restes du dîner d'hier",
    "option_pain_fromage": {
      "description": "ex: 2 grandes tranches de pain complet + comté + crudités",
      "ingredients": [...],
      "kcal_total": 550
    },
    "kcal_total": 550,
    "note": "conseil timing par rapport à la séance"
  },
  "diner": {
    "nom": "ex: Truite aux asperges et quinoa citronné",
    "temps_preparation": "25 min",
    "ingredients": [
      {"nom": "Filet de truite", "quantite": "1 beau filet (~180-200g)", "kcal_approx": 280},
      ...
    ],
    "preparation": ["Étape 1 simple", "Étape 2", "Étape 3"],
    "kcal_total": 700,
    "restes_lendemain": true,
    "note": "pourquoi ce plat est bon ce soir"
  },
  "collation": {
    "si_besoin": "ex: 1 banane + quelques amandes si faim entre midi et séance",
    "kcal_approx": 200
  },
  "hydratation": {
    "total_l": ${needs.hydration_l},
    "conseils": ["conseil 1 pratique", "conseil 2"]
  },
  "recap_kcal": {
    "petit_dejeuner": 635,
    "dejeuner": 550,
    "diner": 700,
    "collation": 200,
    "total": 2085,
    "objectif": ${needs.total_kcal}
  }
}`;

  try {
    const { text, provider } = await callAI(systemPrompt, userPrompt);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Réponse IA non parseable');
    const menu = JSON.parse(jsonMatch[0]);

    // Mise en cache
    db.prepare(`
      INSERT OR REPLACE INTO nutrition_menus (date, session_summary, needs_json, menu_json, generated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(date, session_summary, JSON.stringify(needs), JSON.stringify(menu));

    return { date, cached: false, provider, needs, menu, session_summary };
  } catch (e) {
    throw e;
  }
}

// ── GET /api/nutrition/daily?date=YYYY-MM-DD&regen=1 ─────────────────────────
router.get('/daily', async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const forceRegen = req.query.regen === '1';
  try {
    const result = await generateMenuForDate(date, forceRegen);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/nutrition/week?from=YYYY-MM-DD ───────────────────────────────────
router.get('/week', (req, res) => {
  const db = getDb();
  const from = req.query.from || new Date().toISOString().slice(0, 10);
  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });

  const settings = db.prepare('SELECT * FROM nutrition_settings WHERE id = 1').get()
    || { weight_kg: 70, height_cm: 175, age: 35, sex: 'M' };
  const bmr = computeBMR(settings.weight_kg, settings.height_cm, getAge(settings), settings.sex);

  const days = dates.map(date => {
    const cached = db.prepare('SELECT * FROM nutrition_menus WHERE date = ?').get(date);

    let sessions = [];
    try {
      const planDays = getSessionsForRange(date, date);
      sessions = planDays?.[0]?.sessions || [];
    } catch {}
    const log = db.prepare('SELECT * FROM daily_logs WHERE date = ?').get(date);
    if (log?.distance_km) {
      sessions = [{ type: log.session_type, distance: log.distance_km, dplus: log.dplus_m || 0, duration_min: log.duration_min }];
    }

    const session_kcal = sessions.reduce((sum, s) => sum + estimateSessionCalories(s, settings.weight_kg), 0);
    const needs = computeDailyNeeds(bmr, session_kcal, 'base');
    const session_summary = sessions.length
      ? sessions.map(s => `${s.type || s.sport}`).join('+')
      : 'Repos';

    return {
      date,
      session_summary,
      session_kcal,
      total_kcal: needs.total_kcal,
      has_menu: !!cached?.menu_json,
      menu_title: cached ? JSON.parse(cached.menu_json)?.titre_journee : null,
    };
  });

  res.json({ days, bmr });
});

// ── DELETE /api/nutrition/daily/:date — force régénération ───────────────────
router.delete('/daily/:date', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM nutrition_menus WHERE date = ?').run(req.params.date);
  res.json({ ok: true });
});

// ── POST /api/nutrition/generate-week — déclenche la génération manuelle ──────
router.post('/generate-week', async (req, res) => {
  const from = req.query.from || (() => {
    // Lundi de la semaine prochaine par défaut
    const d = new Date();
    const day = d.getDay(); // 0=dim, 1=lun…
    const daysToNextMonday = day === 0 ? 1 : 8 - day;
    d.setDate(d.getDate() + daysToNextMonday);
    return d.toISOString().slice(0, 10);
  })();

  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });

  res.json({ ok: true, message: `Génération lancée pour ${dates[0]} → ${dates[6]}`, dates });

  // Génère en arrière-plan, jour par jour (évite timeout)
  for (const date of dates) {
    try {
      await generateMenuForDate(date, false); // respecte le cache — ne régénère pas si déjà présent
      console.log(`[nutrition] Menu généré : ${date}`);
    } catch (e) {
      console.error(`[nutrition] Erreur ${date}: ${e.message}`);
    }
  }
});

// ── POST /api/nutrition/sync-from-source — synchronise les recettes de l'utilisateur source ──
router.post('/sync-from-source', async (req, res) => {
  const { getAuthDb, getUserDataDir } = require('../db');
  const { runWithUser } = require('../userContext');
  const Database = require('better-sqlite3');
  const path = require('path');

  const authDb = getAuthDb();
  const me = authDb.prepare('SELECT source_user_id FROM users WHERE id = ?').get(req.user.id);
  if (!me?.source_user_id) return res.status(400).json({ error: 'Aucun utilisateur source configuré pour ce compte' });

  const sourceId = me.source_user_id;
  const sourceDir = getUserDataDir(sourceId);
  const sourceDbPath = path.join(sourceDir, 'ultracoach.db');

  let sourceDb;
  try { sourceDb = new Database(sourceDbPath, { readonly: true }); }
  catch { return res.status(404).json({ error: 'Base de données source introuvable' }); }

  const from = req.query.from || (() => {
    const d = new Date(); const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    return d.toISOString().slice(0, 10);
  })();

  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(from); d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });

  const myDb = getDb();
  const mySettings = myDb.prepare('SELECT * FROM nutrition_settings WHERE id = 1').get() || {};
  const myBMR = computeBMR(mySettings.weight_kg || 60, mySettings.height_cm || 165, getAge(mySettings), mySettings.sex || 'F');

  let imported = 0;
  for (const date of dates) {
    const existing = myDb.prepare('SELECT date FROM nutrition_menus WHERE date = ?').get(date);
    if (existing) continue;

    const sourceMenu = sourceDb.prepare('SELECT * FROM nutrition_menus WHERE date = ?').get(date);
    if (!sourceMenu?.menu_json) continue;

    let sessions = [];
    try { const pd = getSessionsForRange(date, date); sessions = pd?.[0]?.sessions || []; } catch {}
    const log = myDb.prepare('SELECT * FROM daily_logs WHERE date = ?').get(date);
    if (log?.distance_km) sessions = [{ type: log.session_type, distance: log.distance_km, dplus: log.dplus_m || 0, duration_min: log.duration_min }];

    const session_kcal = sessions.reduce((sum, s) => sum + estimateSessionCalories(s, mySettings.weight_kg || 60), 0);
    const nextRace = myDb.prepare("SELECT * FROM race_targets WHERE active=1 AND priority='A' AND date >= ? ORDER BY date ASC").get(date);
    let phase = 'base';
    if (nextRace) {
      const diff = Math.round((new Date(nextRace.date) - new Date(date)) / 86400000);
      if (diff <= 3) phase = 'course';
      else if (diff <= 10) phase = 'affûtage';
      else if (session_kcal > 800) phase = 'charge';
      else if (!sessions.length && session_kcal < 200) phase = 'récup';
    }
    const myNeeds = computeDailyNeeds(myBMR, session_kcal, phase);

    myDb.prepare(`
      INSERT OR IGNORE INTO nutrition_menus (date, session_summary, needs_json, menu_json, generated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(date, sourceMenu.session_summary, JSON.stringify(myNeeds), sourceMenu.menu_json);
    imported++;
  }

  sourceDb.close();
  res.json({ ok: true, imported, week: from });
});

// ── GET /api/nutrition/shopping-list?from=YYYY-MM-DD ─────────────────────────
// Liste commune : combine les quantités de l'utilisateur courant + utilisateur source
router.get('/shopping-list', (req, res) => {
  const { getAuthDb, getUserDataDir } = require('../db');
  const Database = require('better-sqlite3');
  const path = require('path');

  const from = req.query.from || (() => {
    const d = new Date(); const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    return d.toISOString().slice(0, 10);
  })();

  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(from); d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });

  const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const ingredientMap = {};

  // Fusionne les quantités numériques (ex: "200g" + "150g" → "350g")
  function mergeQty(a, b) {
    if (!a) return b || '';
    if (!b) return a || '';
    const numA = parseFloat(a); const numB = parseFloat(b);
    if (!isNaN(numA) && !isNaN(numB)) {
      const unit = a.replace(/[\d.]/g, '').trim();
      return `${Math.round(numA + numB)}${unit}`;
    }
    return `${a} + ${b}`;
  }

  function addIngredients(ingredients, mealLabel, dayLabel, userId) {
    if (!Array.isArray(ingredients)) return;
    for (const ing of ingredients) {
      if (!ing?.nom) continue;
      const key = ing.nom.toLowerCase().trim();
      if (!ingredientMap[key]) ingredientMap[key] = { nom: ing.nom, occurrences: [] };
      const existing = ingredientMap[key].occurrences.find(o => o.meal === mealLabel && o.day === dayLabel);
      if (existing) {
        existing.quantite = mergeQty(existing.quantite, ing.quantite || '');
      } else {
        ingredientMap[key].occurrences.push({ quantite: ing.quantite || '', meal: mealLabel, day: dayLabel });
      }
    }
  }

  // Collecte les menus d'une DB
  function collectFromDb(db) {
    for (let i = 0; i < dates.length; i++) {
      const cached = db.prepare('SELECT menu_json FROM nutrition_menus WHERE date = ?').get(dates[i]);
      if (!cached?.menu_json) continue;
      let menu; try { menu = JSON.parse(cached.menu_json); } catch { continue; }
      const d = DAY_LABELS[i];
      addIngredients(menu.petit_dejeuner?.ingredients, 'Matin', d);
      addIngredients(menu.dejeuner?.option_pain_fromage?.ingredients, 'Midi', d);
      addIngredients(menu.diner?.ingredients, 'Soir', d);
    }
  }

  // 1. Menus de l'utilisateur courant
  const myDb = getDb();
  collectFromDb(myDb);

  // 2. Menus de l'utilisateur source (si différent)
  const authDb = getAuthDb();
  const me = authDb.prepare('SELECT source_user_id FROM users WHERE id = ?').get(req.user.id);
  if (me?.source_user_id && me.source_user_id !== req.user.id) {
    try {
      const sourceDbPath = path.join(getUserDataDir(me.source_user_id), 'ultracoach.db');
      const sourceDb = new Database(sourceDbPath, { readonly: true });
      collectFromDb(sourceDb);
      sourceDb.close();
    } catch { /* source non disponible */ }
  }

  // 3. Si c'est l'utilisateur source (Arthur), ajoute aussi les menus des utilisateurs qui le référencent
  const paired = authDb.prepare('SELECT id FROM users WHERE source_user_id = ?').all(req.user.id);
  for (const p of paired) {
    try {
      const pDbPath = path.join(getUserDataDir(p.id), 'ultracoach.db');
      const pDb = new Database(pDbPath, { readonly: true });
      collectFromDb(pDb);
      pDb.close();
    } catch { /* ok */ }
  }

  const items = Object.values(ingredientMap).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  res.json({ week: from, items });
});

module.exports = { router, generateMenuForDate };
