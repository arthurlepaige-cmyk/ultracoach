const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { getUserId } = require('./userContext');

const DATA_ROOT = path.join(__dirname, '..', 'data');

// Cache des instances DB par userId
const dbInstances = {};

function getUserDataDir(userId) {
  if (!userId || userId === 'default') return DATA_ROOT;
  return path.join(DATA_ROOT, 'users', userId);
}

function getDb() {
  const userId = getUserId();
  if (dbInstances[userId]) return dbInstances[userId];

  const userDir = getUserDataDir(userId);
  fs.mkdirSync(userDir, { recursive: true });

  const db = new Database(path.join(userDir, 'ultracoach.db'));
  db.pragma('journal_mode = WAL');
  initSchema(db);
  dbInstances[userId] = db;
  return db;
}

// DB globale pour les utilisateurs (partagée entre tous)
let authDb;
function getAuthDb() {
  if (!authDb) {
    fs.mkdirSync(DATA_ROOT, { recursive: true });
    authDb = new Database(path.join(DATA_ROOT, 'auth.db'));
    authDb.pragma('journal_mode = WAL');
    authDb.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        password_hash TEXT NOT NULL,
        consent_gdpr INTEGER DEFAULT 0,
        consent_date TEXT,
        role TEXT DEFAULT 'user',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        last_login TEXT
      );
    `);
  }
  return authDb;
}

function invalidateDbCache(userId) {
  delete dbInstances[userId];
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      fc_repos INTEGER,
      hrv INTEGER,
      sensation INTEGER,
      meteo_temp REAL,
      sport TEXT DEFAULT 'Course à pied',
      session_type TEXT,
      distance_km REAL,
      dplus_m REAL,
      duration_min INTEGER,
      fc_moy INTEGER,
      power_w INTEGER,
      is_treadmill INTEGER DEFAULT 0,
      dplus_corrected REAL,
      aei REAL,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS unavailability_periods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date_from TEXT NOT NULL,
      date_to TEXT NOT NULL,
      label TEXT,
      impact TEXT DEFAULT 'maintenance',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ai_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      race_id TEXT NOT NULL,
      week_start TEXT NOT NULL,
      sessions_json TEXT NOT NULL,
      generated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(race_id, week_start)
    );

    CREATE TABLE IF NOT EXISTS race_targets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      race_id TEXT UNIQUE,
      name TEXT NOT NULL,
      date TEXT NOT NULL,
      distance_km REAL,
      dplus_m REAL,
      dminus_m REAL,
      start_time TEXT,
      obj_a_time_h REAL,
      obj_b_time_h REAL,
      obj_c_time_h REAL,
      gpx_profile TEXT,
      active INTEGER DEFAULT 1,
      priority TEXT DEFAULT 'A',
      race_type TEXT,
      tapering INTEGER DEFAULT 1,
      recovery_days INTEGER,
      weekly_runs_target INTEGER,
      weekly_workouts_target INTEGER,
      long_run_day TEXT,
      weekend_available INTEGER DEFAULT 1,
      terrain_access TEXT,
      notes_planning TEXT
    );
  `);

  // Migrations daily_logs
  const logCols = db.prepare('PRAGMA table_info(daily_logs)').all().map(c => c.name);
  const logNewCols = [
    ["sport", "TEXT DEFAULT 'Course à pied'"],
    ["power_w", "INTEGER"],
    ["nb_marches", "INTEGER"],
    ["extra_sessions_json", "TEXT"],
    ["sleep_h", "REAL"],
    ["sleep_quality", "INTEGER"],
    ["rpe", "INTEGER"],
    ["pain_zones", "TEXT"],
    ["shoe_id", "INTEGER"],
    ["body_battery_morning", "INTEGER"],
    ["body_battery_evening", "INTEGER"],
    ["stress_avg", "INTEGER"],
    ["gpx_garmin_id", "TEXT"],
  ];
  for (const [col, def] of logNewCols) {
    if (!logCols.includes(col)) db.exec(`ALTER TABLE daily_logs ADD COLUMN ${col} ${def}`);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS shoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      brand TEXT,
      km_initial REAL DEFAULT 0,
      purchase_date TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migrations race_targets
  const existingCols = db.prepare('PRAGMA table_info(race_targets)').all().map(c => c.name);
  const newCols = [
    ["priority", "TEXT DEFAULT 'A'"],
    ["race_type", "TEXT"],
    ["tapering", "INTEGER DEFAULT 1"],
    ["recovery_days", "INTEGER"],
    ["weekly_runs_target", "INTEGER"],
    ["weekly_workouts_target", "INTEGER"],
    ["long_run_day", "TEXT"],
    ["weekend_available", "INTEGER DEFAULT 1"],
    ["terrain_access", "TEXT"],
    ["notes_planning", "TEXT"],
    ["ai_strategy", "TEXT"],
    ["ai_strategy_generated_at", "TEXT"],
  ];
  for (const [col, def] of newCols) {
    if (!existingCols.includes(col)) db.exec(`ALTER TABLE race_targets ADD COLUMN ${col} ${def}`);
  }

  // Briefing quotidien IA
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_briefing (
      date TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      generated_at TEXT NOT NULL
    );
  `);

  // Table sync (Garmin, Suunto…)
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL UNIQUE,
      username TEXT,
      password_encrypted TEXT,
      last_sync TEXT,
      last_sync_activities INTEGER DEFAULT 0,
      last_sync_status TEXT,
      enabled INTEGER DEFAULT 1
    );
  `);

  // Tables nutrition
  db.exec(`
    CREATE TABLE IF NOT EXISTS nutrition_settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      weight_kg REAL DEFAULT 70,
      height_cm REAL DEFAULT 175,
      age INTEGER DEFAULT 35,
      sex TEXT DEFAULT 'M',
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    INSERT OR IGNORE INTO nutrition_settings (id) VALUES (1);

    CREATE TABLE IF NOT EXISTS nutrition_menus (
      date TEXT PRIMARY KEY,
      session_summary TEXT,
      needs_json TEXT,
      menu_json TEXT,
      generated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migrations nutrition_settings
  const nutCols = db.prepare('PRAGMA table_info(nutrition_settings)').all().map(c => c.name);
  const nutNewCols = [
    ['gist_token', 'TEXT'],
    ['gist_id', 'TEXT'],
    ['gist_source_url', 'TEXT'],
    ['gist_last_push', 'TEXT'],
    ['gist_last_pull', 'TEXT'],
    ['birthdate', 'TEXT'],
  ];
  for (const [col, def] of nutNewCols) {
    if (!nutCols.includes(col)) db.exec(`ALTER TABLE nutrition_settings ADD COLUMN ${col} ${def}`);
  }

  // Import race targets from JSON si table vide
  const count = db.prepare('SELECT COUNT(*) as c FROM race_targets').get();
  if (count.c === 0) {
    try {
      const { loadData } = require('./dataLoader');
      const data = loadData();
      if (data.targets?.length > 0) {
        const insert = db.prepare(`
          INSERT OR IGNORE INTO race_targets
          (race_id, name, date, distance_km, dplus_m, dminus_m, start_time, obj_a_time_h, obj_b_time_h, obj_c_time_h, priority)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const t of data.targets) {
          insert.run(
            t.id, t.name, t.date, t.distance_km, t.dplus_m,
            t.dminus_m || null, t.start_time || '00:00',
            t.objective_a?.time_h || null,
            t.objective_b?.time_h || null,
            t.objective_c?.time_h || null,
            'A'
          );
        }
        console.log(`Imported ${data.targets.length} race targets from JSON`);
      }
    } catch {}
  }
}

module.exports = { getDb, getAuthDb, getUserDataDir, invalidateDbCache };
