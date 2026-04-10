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

  // Les recettes sont maintenant partagées directement via le serveur commun (plus de Gist)
  console.log();
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

function initScheduler() {
  // Tous les samedis à 20h00 — génère les menus de la semaine suivante
  cron.schedule('0 20 * * 6', () => {
    generateWeekMenus('auto-samedi').catch(e => console.error('[scheduler] Erreur fatale:', e.message));
  }, { timezone: 'Europe/Brussels' });

  console.log('[scheduler] Actif — génération nutrition tous les samedis à 20h00 (Europe/Brussels)');

  // Rattrapage au démarrage si la génération du samedi a été manquée
  setTimeout(() => {
    checkMissedGeneration().catch(e => console.error('[scheduler:startup] Erreur:', e.message));
  }, 8000); // Délai pour laisser le serveur démarrer complètement
}

module.exports = { initScheduler, generateWeekMenus };
