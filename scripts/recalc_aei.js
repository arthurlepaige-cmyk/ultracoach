/**
 * Migration AEI — recalcule tous les AEI en base avec le nouveau coefficient (2.0)
 * Usage: node scripts/recalc_aei.js
 */
const path = require('path');
const fs = require('fs');

const backendDir = path.join(__dirname, '..', 'backend');
const Database = require(path.join(backendDir, 'node_modules', 'better-sqlite3'));
const { calculateAEI } = require(path.join(backendDir, 'calc'));
const DATA_ROOT = path.join(__dirname, '..', 'data');
const AEI_SPORTS = ['course', 'trail', 'treadmill', 'running'];

function migrateDb(dbPath, label) {
  if (!fs.existsSync(dbPath)) {
    console.log('  Absent :', label);
    return;
  }

  let db;
  try {
    db = new Database(dbPath);
  } catch (e) {
    console.log('  Ignoré (corrompu) :', label);
    return;
  }

  let rows;
  try {
    rows = db.prepare(
      'SELECT id, distance_km, duration_min, dplus_corrected, dplus_m, fc_moy, sport FROM daily_logs WHERE fc_moy IS NOT NULL AND distance_km > 0 AND duration_min > 0'
    ).all();
  } catch (e) {
    console.log('  Ignoré (table absente) :', label);
    db.close();
    return;
  }

  let updated = 0;
  const stmt = db.prepare('UPDATE daily_logs SET aei = ? WHERE id = ?');

  for (const r of rows) {
    const sport = (r.sport || '').toLowerCase();
    if (sport && !AEI_SPORTS.some(s => sport.includes(s))) continue;
    const dplus = r.dplus_corrected || r.dplus_m || 0;
    const newAEI = calculateAEI(r.distance_km, r.duration_min, dplus, r.fc_moy);
    if (newAEI !== null) {
      stmt.run(newAEI, r.id);
      updated++;
    }
  }

  db.close();
  console.log('  ' + label + ' : ' + updated + '/' + rows.length + ' logs recalculés');
}

console.log('=== Migration AEI (coefficient 1.0 → 2.0) ===\n');

migrateDb(path.join(DATA_ROOT, 'ultracoach.db'), 'DB racine');

const usersDir = path.join(DATA_ROOT, 'users');
if (fs.existsSync(usersDir)) {
  for (const uid of fs.readdirSync(usersDir)) {
    const dbPath = path.join(usersDir, uid, 'ultracoach.db');
    migrateDb(dbPath, 'User ' + uid.slice(0, 8));
  }
}

console.log('\nMigration terminée. Redémarre le serveur : pm2 restart ultracoach');
