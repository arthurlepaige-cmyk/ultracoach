/**
 * Génère la base d'entraînement autonome (public/training.sqlite) à partir de
 * athlete_data_export.json + fc_repos/hrv de la DB UltraCoach.
 * NE MODIFIE JAMAIS les données originales : lecture seule, écriture dans public/.
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const ROOT = path.resolve(__dirname, '../..');
const USER_DIR = path.join(ROOT, 'data/users/acfb0309-d723-47b3-97c8-24f3e1382e48');
const JSON_PATH = path.join(USER_DIR, 'athlete_data_export.json');
const SRC_DB = path.join(USER_DIR, 'ultracoach.db');
const OUT_DIR = path.join(__dirname, '../public');
const OUT_DB = path.join(OUT_DIR, 'training.sqlite');

// --- Lecture des données source (read-only) ---
const raw = fs.readFileSync(JSON_PATH, 'utf8').replace(/NaN/g, 'null');
const data = JSON.parse(raw);

// fc_repos / hrv depuis la vraie DB (lecture seule)
let recovery = {};
try {
  const src = new Database(SRC_DB, { readonly: true, fileMustExist: true });
  for (const r of src.prepare('SELECT date, fc_repos, hrv FROM daily_logs').all()) {
    recovery[r.date] = { fc_repos: r.fc_repos, hrv: r.hrv };
  }
  src.close();
} catch (e) {
  console.warn('  (fc_repos/hrv indisponibles:', e.message, ')');
}

// --- Construction de la base d'entraînement ---
fs.mkdirSync(OUT_DIR, { recursive: true });
if (fs.existsSync(OUT_DB)) fs.unlinkSync(OUT_DB);
const db = new Database(OUT_DB);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE activity_types (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE races (
  id           INTEGER PRIMARY KEY,
  date         TEXT NOT NULL,
  name         TEXT NOT NULL,
  distance_km  REAL,
  dplus_m      REAL,
  time_h       REAL,
  rank_num     INTEGER,
  rank_tot     INTEGER,
  itra         REAL,
  utmb_idx     INTEGER,
  categorie    TEXT,
  finished     INTEGER
);

CREATE TABLE activities (
  id            INTEGER PRIMARY KEY,
  date          TEXT NOT NULL,          -- 'YYYY-MM-DD'
  datetime      TEXT,                    -- horodatage complet
  distance_km   REAL,
  dplus_m       REAL,
  hr_moy        INTEGER,
  hr_max        INTEGER,
  allure_min_km REAL,
  duree_h       REAL,
  vitesse_kmh   REAL,
  calories      INTEGER,
  is_treadmill  INTEGER DEFAULT 0,
  type_id       INTEGER REFERENCES activity_types(id),
  race_id       INTEGER REFERENCES races(id),
  year          INTEGER,
  month         INTEGER
);

CREATE TABLE daily_metrics (
  date            TEXT PRIMARY KEY,
  atl             INTEGER,
  ctl             INTEGER,
  acwr            REAL,
  acwr_status     TEXT,
  endurance_score INTEGER,
  hill_overall    INTEGER,
  hill_strength   INTEGER,
  hill_endurance  INTEGER,
  fc_repos        INTEGER,
  hrv             INTEGER
);
`);

// activity_types
const TYPES = [ [1, 'Route'], [2, 'Trail'], [3, 'Tapis'] ];
const insType = db.prepare('INSERT INTO activity_types (id, name) VALUES (?, ?)');
for (const t of TYPES) insType.run(t);

// races
const insRace = db.prepare(`INSERT INTO races
  (id, date, name, distance_km, dplus_m, time_h, rank_num, rank_tot, itra, utmb_idx, categorie, finished)
  VALUES (@id,@date,@name,@distance_km,@dplus_m,@time_h,@rank_num,@rank_tot,@itra,@utmb_idx,@categorie,@finished)`);
const raceByDate = {};
(data.races || []).forEach((r, i) => {
  const id = i + 1;
  const row = {
    id, date: r.date, name: r.name,
    distance_km: r.dist ?? null, dplus_m: r.dplus ?? null, time_h: r.time_h ?? null,
    rank_num: r.rank_num ?? null, rank_tot: r.rank_tot ?? null,
    itra: r.itra ?? null, utmb_idx: r.utmb_idx ?? null,
    categorie: r.cat ?? null, finished: r.finished ? 1 : 0,
  };
  insRace.run(row);
  (raceByDate[r.date] ||= []).push({ id, dist: r.dist || 0 });
});

// activities
const insAct = db.prepare(`INSERT INTO activities
  (id, date, datetime, distance_km, dplus_m, hr_moy, hr_max, allure_min_km, duree_h,
   vitesse_kmh, calories, is_treadmill, type_id, race_id, year, month)
  VALUES (@id,@date,@datetime,@distance_km,@dplus_m,@hr_moy,@hr_max,@allure_min_km,@duree_h,
          @vitesse_kmh,@calories,@is_treadmill,@type_id,@race_id,@year,@month)`);

function classify(a, dist) {
  if (a.is_treadmill) return 3;                          // Tapis
  if (dist > 0 && (a.D_plus_exact || 0) / dist >= 25) return 2; // Trail (>=25 m/km)
  return 1;                                              // Route
}

const acts = (data.activities || []).map((a, i) => {
  const dist = a.Distance_km || 0;
  const day = (a.Date || '').slice(0, 10);
  return {
    id: i + 1,
    date: day,
    datetime: a.Date || null,
    distance_km: a.Distance_km ?? null,
    dplus_m: a.D_plus_exact ?? null,
    hr_moy: a.HR_moy ?? null,
    hr_max: a.HR_max ?? null,
    allure_min_km: a.Allure != null ? Math.round(a.Allure * 100) / 100 : null,
    duree_h: a.Temps_h != null ? Math.round(a.Temps_h * 1000) / 1000 : null,
    vitesse_kmh: a.Vitesse ?? null,
    calories: a.Calories ?? null,
    is_treadmill: a.is_treadmill ? 1 : 0,
    type_id: classify(a, dist),
    race_id: null,
    year: a.Year ?? (day ? +day.slice(0, 4) : null),
    month: a.Month ?? (day ? +day.slice(5, 7) : null),
    _dist: dist, _day: day,
  };
});

// Relier chaque course à l'activité du jour la plus proche en distance
for (const [date, races] of Object.entries(raceByDate)) {
  for (const race of races) {
    const sameDay = acts.filter(a => a._day === date);
    if (!sameDay.length) continue;
    let best = sameDay[0], bestDiff = Infinity;
    for (const a of sameDay) {
      const diff = Math.abs(a._dist - race.dist);
      if (diff < bestDiff) { bestDiff = diff; best = a; }
    }
    best.race_id = race.id;
  }
}

const insMany = db.transaction((rows) => { for (const r of rows) { delete r._dist; delete r._day; insAct.run(r); } });
insMany(acts);

// daily_metrics : fusion par date
const metrics = {};
function slot(date) { return (metrics[date] ||= { date, atl: null, ctl: null, acwr: null, acwr_status: null, endurance_score: null, hill_overall: null, hill_strength: null, hill_endurance: null, fc_repos: null, hrv: null }); }
for (const r of data.atl_ctl || []) { const s = slot(r.date); s.atl = r.atl ?? null; s.ctl = r.ctl ?? null; s.acwr = r.acwr ?? null; s.acwr_status = r.acwr_status ?? null; }
for (const r of data.endurance_score || []) { slot(r.date).endurance_score = r.es ?? null; }
for (const r of data.hill_score || []) { const s = slot(r.date); s.hill_overall = r.hs_overall ?? null; s.hill_strength = r.hs_strength ?? null; s.hill_endurance = r.hs_endurance ?? null; }
for (const [date, rec] of Object.entries(recovery)) { const s = slot(date); s.fc_repos = rec.fc_repos ?? null; s.hrv = rec.hrv ?? null; }

const insMetric = db.prepare(`INSERT INTO daily_metrics
  (date, atl, ctl, acwr, acwr_status, endurance_score, hill_overall, hill_strength, hill_endurance, fc_repos, hrv)
  VALUES (@date,@atl,@ctl,@acwr,@acwr_status,@endurance_score,@hill_overall,@hill_strength,@hill_endurance,@fc_repos,@hrv)`);
const insMetrics = db.transaction((rows) => { for (const r of rows) insMetric.run(r); });
insMetrics(Object.values(metrics).sort((a, b) => a.date.localeCompare(b.date)));

// WAL -> fichier unique portable
db.pragma('wal_checkpoint(TRUNCATE)');
db.pragma('journal_mode = DELETE');

const counts = {
  activity_types: db.prepare('SELECT COUNT(*) c FROM activity_types').get().c,
  activities: db.prepare('SELECT COUNT(*) c FROM activities').get().c,
  races: db.prepare('SELECT COUNT(*) c FROM races').get().c,
  daily_metrics: db.prepare('SELECT COUNT(*) c FROM daily_metrics').get().c,
  activities_liees_course: db.prepare('SELECT COUNT(*) c FROM activities WHERE race_id IS NOT NULL').get().c,
};
db.close();
console.log('Base générée :', OUT_DB);
console.table(counts);
