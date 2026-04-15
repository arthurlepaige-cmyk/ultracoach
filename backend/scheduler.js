/**
 * Scheduler Ultra Coach
 * Tâches automatiques — génération des menus nutrition chaque samedi
 */
const cron = require('node-cron');

function getNextMondayStr() {
  const d = new Date();
  const day = d.getDay(); // 0=dim, 6=sam
  // Depuis un samedi, le prochain lundi est dans 2 jours
  const daysToMonday = day === 6 ? 2 : (8 - day) % 7 || 7;
  d.setDate(d.getDate() + daysToMonday);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function getDatesOfWeek(mondayStr) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mondayStr);
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

async function generateWeekMenus(label = 'scheduled') {
  // Import ici pour éviter les dépendances circulaires au démarrage
  const { generateMenuForDate } = require('./routes/nutrition');
  const mondayStr = getNextMondayStr();
  const dates = getDatesOfWeek(mondayStr);

  console.log(`\n[scheduler:nutrition] ${label} — génération semaine ${dates[0]} → ${dates[6]}`);

  let ok = 0, skipped = 0, errors = 0;
  for (const date of dates) {
    try {
      const result = await generateMenuForDate(date, false); // ne régénère pas si déjà en cache
      if (result.cached) {
        skipped++;
      } else {
        ok++;
        console.log(`  ✓ ${date} — ${result.session_summary} (~${result.needs?.total_kcal} kcal)`);
      }
    } catch (e) {
      errors++;
      console.error(`  ✗ ${date} — ${e.message}`);
    }
    // Petite pause entre chaque appel IA pour ne pas surcharger Ollama
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log(`[scheduler:nutrition] Terminé — ${ok} générés, ${skipped} en cache, ${errors} erreurs`);

  // Push automatique vers GitHub Gist si token configuré
  await pushToGistIfConfigured(mondayStr);
  console.log();
}

async function pushToGistIfConfigured(mondayStr) {
  try {
    const { getDb } = require('./db');
    const db = getDb();
    const settings = db.prepare('SELECT gist_token FROM nutrition_settings WHERE id = 1').get();
    if (!settings?.gist_token) return; // Pas de token → pas de push
    const { buildWeekIngredients } = require('./routes/nutrition');
    const items = await buildWeekIngredients(db, mondayStr);
    if (!items.length) return;

    const https = require('https');
    const { getAuthDb } = require('./db');
    const { getUserId } = require('./userContext');
    const userRow = getAuthDb().prepare('SELECT name FROM users WHERE id = ?').get(getUserId());
    const content = JSON.stringify({ week: mondayStr, user: userRow?.name || 'Arthur', generated_at: new Date().toISOString(), items }, null, 2);
    const existingGist = db.prepare('SELECT gist_id FROM nutrition_settings WHERE id = 1').get();
    const method = existingGist?.gist_id ? 'PATCH' : 'POST';
    const path = existingGist?.gist_id ? `/gists/${existingGist.gist_id}` : '/gists';
    const payload = JSON.stringify({ description: `UltraCoach — liste courses semaine ${mondayStr}`, public: false, files: { 'ultracoach_liste_courses.json': { content } } });

    await new Promise((resolve, reject) => {
      const options = { hostname: 'api.github.com', path, method, headers: { 'Authorization': `token ${settings.gist_token}`, 'User-Agent': 'UltraCoach', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } };
      const req = https.request(options, r => {
        let body = '';
        r.on('data', c => body += c);
        r.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data.id) {
              db.prepare('UPDATE nutrition_settings SET gist_id = ?, gist_last_push = CURRENT_TIMESTAMP WHERE id = 1').run(data.id);
              console.log(`[scheduler:gist] Push OK — gist ${data.id}`);
            }
          } catch {}
          resolve();
        });
      });
      req.on('error', e => { console.error('[scheduler:gist] Erreur:', e.message); resolve(); });
      req.write(payload); req.end();
    });
  } catch (e) {
    console.error('[scheduler:gist] Erreur push:', e.message);
  }
}

async function checkMissedGeneration() {
  // Vérifie si les menus de la semaine prochaine sont complets.
  // Si la machine était éteinte samedi 20h, les génère au prochain démarrage.
  const mondayStr = getNextMondayStr();
  const dates = getDatesOfWeek(mondayStr);

  const { getDb } = require('./db');
  const db = getDb();
  const missing = dates.filter(d => !db.prepare('SELECT date FROM nutrition_menus WHERE date = ?').get(d));

  if (missing.length > 0) {
    console.log(`[scheduler:startup] ${missing.length} menus manquants (semaine ${mondayStr}) — rattrapage en cours…`);
    await generateWeekMenus('startup-rattrapage');
  } else {
    console.log(`[scheduler:startup] Menus semaine ${mondayStr} complets.`);
  }
}

async function syncAllUsers() {
  const { getAuthDb } = require('./db');
  const { syncGarmin } = require('./garminSync');

  const users = getAuthDb().prepare('SELECT id FROM users').all();
  for (const { id } of users) {
    try {
      // Vérifie si cet utilisateur a une config Garmin
      const { getDb } = require('./db');
      const { runWithUser } = require('./userContext');
      const hasConfig = runWithUser(id, () => {
        const db = getDb();
        return db.prepare('SELECT id FROM sync_config WHERE provider = ? AND enabled = 1').get('garmin');
      });
      if (!hasConfig) continue;

      const result = await syncGarmin(id);
      console.log(`[scheduler:sync] user ${id.slice(0, 8)} — ${result.savedActivities} activités, ${result.savedHealthDays} jours santé`);
    } catch (e) {
      console.error(`[scheduler:sync] user ${id.slice(0, 8)} — erreur: ${e.message}`);
    }
  }
}

function initScheduler() {
  // Tous les samedis à 20h00 — génère les menus de la semaine suivante
  cron.schedule('0 20 * * 6', () => {
    generateWeekMenus('auto-samedi').catch(e => console.error('[scheduler] Erreur fatale:', e.message));
  }, { timezone: 'Europe/Brussels' });

  // Sync Garmin — 9h00 (données nuit + matin) et 23h00 (données journée + entraînement)
  cron.schedule('0 9 * * *', () => {
    syncAllUsers().catch(e => console.error('[scheduler:sync:9h] Erreur:', e.message));
  }, { timezone: 'Europe/Brussels' });

  cron.schedule('0 23 * * *', () => {
    syncAllUsers().catch(e => console.error('[scheduler:sync:23h] Erreur:', e.message));
  }, { timezone: 'Europe/Brussels' });

  console.log('[scheduler] Actif — nutrition sam. 20h00, sync Garmin 9h00 + 23h00 (Europe/Brussels)');

  // Rattrapage au démarrage si la génération du samedi a été manquée
  setTimeout(() => {
    checkMissedGeneration().catch(e => console.error('[scheduler:startup] Erreur:', e.message));
  }, 8000); // Délai pour laisser le serveur démarrer complètement
}

module.exports = { initScheduler, generateWeekMenus };
