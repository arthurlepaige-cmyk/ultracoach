const fs = require('fs');
const path = require('path');
const { getUserId, getUserDataDir } = require('./userContext');

// getUserDataDir est dans db.js — on l'importe dynamiquement pour éviter la dépendance circulaire
function getDataPath() {
  const { getUserDataDir } = require('./db');
  const userId = getUserId();
  return path.join(getUserDataDir(userId), 'athlete_data_export.json');
}

const EMPTY_DATA = {
  version: '1.0',
  export_date: null,
  athlete: {
    name: 'Athlète',
    fc_repos: 50,
    fc_max: 185,
    fc_reserve: 135,
    vo2max_current: null,
    utmb_index: null,
    itra_max: null,
    zones_karvonen: { Z1:[120,134], Z2:[134,148], Z3:[148,162], Z4:[162,175], Z5:[175,185] },
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

// Cache par userId
const _caches = {};

function loadData() {
  const userId = getUserId();
  if (_caches[userId]) return _caches[userId];

  const dataPath = getDataPath();
  if (!fs.existsSync(dataPath)) return EMPTY_DATA;
  try {
    const raw = fs.readFileSync(dataPath, 'utf8').replace(/\bNaN\b/g, 'null');
    _caches[userId] = JSON.parse(raw);
    return _caches[userId];
  } catch {
    return EMPTY_DATA;
  }
}

function clearCache() {
  const userId = getUserId();
  delete _caches[userId];
}

function clearAllCaches() {
  Object.keys(_caches).forEach(k => delete _caches[k]);
}

module.exports = { loadData, clearCache, clearAllCaches, EMPTY_DATA };
