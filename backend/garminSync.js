const { spawn } = require('child_process');
const path = require('path');
const crypto = require('crypto');

const ALGORITHM = 'aes-256-cbc';
const PYTHON_SCRIPT = path.join(__dirname, 'garmin_sync.py');

function getKey() {
  return crypto.scryptSync(process.env.JWT_SECRET || 'ultracoach2026', 'uc_salt_v1', 32);
}

function encryptPassword(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decryptPassword(str) {
  const [ivHex, encHex] = str.split(':');
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]).toString('utf8');
}

function runPython(args, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const proc = spawn('python3', [PYTHON_SCRIPT, ...args]);
    let stdout = '', stderr = '';

    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error('Timeout dépassé (60s)'));
    }, timeoutMs);

    proc.on('close', () => {
      clearTimeout(timer);
      try {
        const line = stdout.trim().split('\n').pop();
        resolve(JSON.parse(line));
      } catch {
        reject(new Error(stderr.trim() || 'Réponse Python invalide'));
      }
    });
  });
}

function getTokensPath(userId) {
  const { getUserDataDir } = require('./db');
  return path.join(getUserDataDir(userId), 'garmin_tokens.json');
}

function getGpxDir(userId) {
  const { getUserDataDir } = require('./db');
  return path.join(getUserDataDir(userId), 'gpx');
}

async function initConnection(userId, username, password) {
  const tokensPath = getTokensPath(userId);
  const result = await runPython(['init', username, password, tokensPath], 120000);
  return result;
}

async function completeMfa(userId, mfaCode) {
  const tokensPath = getTokensPath(userId);
  return runPython(['mfa', mfaCode, tokensPath]);
}

async function testConnection(userId) {
  const tokensPath = getTokensPath(userId);
  return runPython(['test', tokensPath]);
}

async function syncGarmin(userId) {
  const { getUserDataDir, getDb } = require('./db');
  const { runWithUser } = require('./userContext');

  return runWithUser(userId, async () => {
    const db = getDb();
    const config = db.prepare('SELECT * FROM sync_config WHERE provider = ?').get('garmin');
    if (!config?.enabled) throw new Error('Sync Garmin non configurée');

    const tokensPath = getTokensPath(userId);
    const userDir = getUserDataDir(userId);
    const dataPath = path.join(userDir, 'athlete_data_export.json');
    const dbPath = path.join(userDir, 'ultracoach.db');

    const lastSync = config.last_sync
      ? Math.ceil((Date.now() - new Date(config.last_sync).getTime()) / 86400000)
      : 90;
    const days = Math.min(Math.max(lastSync + 1, 3), 90);

    const gpxDir = getGpxDir(userId);
    const result = await runPython(['sync', tokensPath, dataPath, dbPath, gpxDir, String(days)], 180000);

    if (result.ok) {
      try { require('./dataLoader').clearCache(); } catch {}
      db.prepare('UPDATE sync_config SET last_sync = ?, last_sync_activities = ?, last_sync_status = ? WHERE provider = ?')
        .run(new Date().toISOString(), result.savedActivities, 'ok', 'garmin');
    }

    return result;
  });
}

async function exportWorkouts(userId, sessions) {
  const { getUserDataDir } = require('./db');
  const os = require('os');
  const tokensPath = getTokensPath(userId);
  const tmpPath = path.join(os.tmpdir(), `uc_export_${userId}_${Date.now()}.json`);
  const fs = require('fs');
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(sessions));
    return await runPython(['export_workouts', tokensPath, tmpPath], 120000);
  } finally {
    try { fs.unlinkSync(tmpPath); } catch {}
  }
}

module.exports = { syncGarmin, initConnection, completeMfa, testConnection, encryptPassword, decryptPassword, getGpxDir, exportWorkouts };
