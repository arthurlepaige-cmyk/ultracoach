/**
 * Migration : données existantes → premier utilisateur multi-user
 *
 * Usage :
 *   node scripts/migrate-to-multiuser.js --email arthur@example.com --name Arthur --password monmotdepasse
 *
 * Ce script :
 * 1. Crée un compte utilisateur dans auth.db
 * 2. Copie data/ultracoach.db → data/users/{id}/ultracoach.db
 * 3. Copie data/athlete_data_export.json → data/users/{id}/athlete_data_export.json
 */

const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const DATA_ROOT = path.join(__dirname, '..', '..', 'data');

// Parse args
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf('--' + name);
  return idx !== -1 ? args[idx + 1] : null;
}

const email = getArg('email');
const name = getArg('name');
const password = getArg('password');

if (!email || !password) {
  console.error('Usage: node migrate-to-multiuser.js --email <email> --name <name> --password <password>');
  process.exit(1);
}

async function run() {
  // 1. Ouvre/crée auth.db
  fs.mkdirSync(DATA_ROOT, { recursive: true });
  const authDb = new Database(path.join(DATA_ROOT, 'auth.db'));
  authDb.pragma('journal_mode = WAL');
  authDb.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      password_hash TEXT NOT NULL,
      consent_gdpr INTEGER DEFAULT 1,
      consent_date TEXT,
      role TEXT DEFAULT 'user',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      last_login TEXT
    );
  `);

  // Vérifie si l'email existe déjà
  const existing = authDb.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  let userId;
  if (existing) {
    userId = existing.id;
    console.log(`Utilisateur existant trouvé : ${userId}`);
  } else {
    userId = uuidv4();
    const hash = await bcrypt.hash(password, 12);
    authDb.prepare(`
      INSERT INTO users (id, email, name, password_hash, consent_gdpr, consent_date)
      VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
    `).run(userId, email.toLowerCase().trim(), name || email.split('@')[0], hash);
    console.log(`Compte créé : ${email} (${userId})`);
  }

  // 2. Crée le répertoire utilisateur
  const userDir = path.join(DATA_ROOT, 'users', userId);
  fs.mkdirSync(userDir, { recursive: true });

  // 3. Copie ultracoach.db
  const srcDb = path.join(DATA_ROOT, 'ultracoach.db');
  const dstDb = path.join(userDir, 'ultracoach.db');
  if (fs.existsSync(srcDb) && !fs.existsSync(dstDb)) {
    fs.copyFileSync(srcDb, dstDb);
    // Copie aussi les fichiers WAL si présents
    for (const ext of ['-shm', '-wal']) {
      if (fs.existsSync(srcDb + ext)) fs.copyFileSync(srcDb + ext, dstDb + ext);
    }
    console.log(`DB copiée → ${dstDb}`);
  } else if (fs.existsSync(dstDb)) {
    console.log(`DB déjà présente dans ${dstDb} — pas de copie`);
  } else {
    console.log(`Pas de DB source trouvée dans ${srcDb}`);
  }

  // 4. Copie athlete_data_export.json
  const srcJson = path.join(DATA_ROOT, 'athlete_data_export.json');
  const dstJson = path.join(userDir, 'athlete_data_export.json');
  if (fs.existsSync(srcJson) && !fs.existsSync(dstJson)) {
    fs.copyFileSync(srcJson, dstJson);
    console.log(`JSON copié → ${dstJson}`);
  } else if (fs.existsSync(dstJson)) {
    console.log(`JSON déjà présent dans ${dstJson} — pas de copie`);
  } else {
    console.log(`Pas de JSON source trouvé dans ${srcJson}`);
  }

  console.log('\n✅ Migration terminée !');
  console.log(`   Email    : ${email}`);
  console.log(`   User ID  : ${userId}`);
  console.log(`   Données  : data/users/${userId}/`);
  console.log('\nRelance le serveur puis connecte-toi avec ces identifiants.');
}

run().catch(err => {
  console.error('Erreur migration :', err.message);
  process.exit(1);
});
