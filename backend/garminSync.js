const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const RUNNING_TYPES = new Set([
  'running', 'trail_running', 'indoor_running', 'treadmill_running',
  'track_running', 'virtual_run', 'ultra_run', 'obstacle_run',
]);

const ALGORITHM = 'aes-256-cbc';

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

function convertActivity(act) {
  const distKm = (act.distance || 0) / 1000;
  const timeH = (act.duration || 0) / 3600;
  const dateStr = (act.startTimeLocal || '').replace('T', ' ').slice(0, 19);
  const d = new Date(dateStr);
  const isTreadmill = ['indoor_running', 'treadmill_running'].includes(act.activityType?.typeKey) ||
    !!(act.activityName?.toLowerCase().match(/tapis|treadmill/));

  return {
    Date: dateStr,
    Distance_km: Math.round(distKm * 100) / 100,
    D_plus_exact: Math.round(act.elevationGain || 0),
    HR_moy: act.averageHR ? Math.round(act.averageHR) : null,
    HR_max: act.maxHR ? Math.round(act.maxHR) : null,
    Allure: distKm > 0 && timeH > 0 ? Math.round((timeH * 60 / distKm) * 100) / 100 : null,
    Temps_h: Math.round(timeH * 10000) / 10000,
    Effort: act.activityTrainingLoad || null,
    Vitesse: distKm > 0 && timeH > 0 ? Math.round((distKm * 1000 / (timeH * 3600)) * 100) / 100 : null,
    Calories: act.calories ? Math.round(act.calories) : null,
    Temp_moy: null,
    is_treadmill: isTreadmill,
    Year: d.getFullYear(),
    Month: d.getMonth() + 1,
    garmin_id: act.activityId,
  };
}

async function testConnection(username, password) {
  const { GarminConnect } = require('garmin-connect');
  const client = new GarminConnect({ username, password });
  await client.login();
  let name = username;
  try {
    const profile = await client.getUserProfile();
    name = profile?.displayName || profile?.userName || username;
  } catch {}
  return { ok: true, name };
}

async function syncGarmin(userId) {
  const { getUserDataDir, getDb } = require('./db');
  const { runWithUser } = require('./userContext');

  return runWithUser(userId, async () => {
    const db = getDb();
    const userDir = getUserDataDir(userId);
    const dataPath = path.join(userDir, 'athlete_data_export.json');

    const config = db.prepare('SELECT * FROM sync_config WHERE provider = ?').get('garmin');
    if (!config?.username || !config?.password_encrypted) {
      throw new Error('Identifiants Garmin non configurés');
    }

    const { GarminConnect } = require('garmin-connect');
    const client = new GarminConnect({ username: config.username, password: decryptPassword(config.password_encrypted) });
    await client.login();

    const lastSync = config.last_sync
      ? new Date(config.last_sync)
      : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    // ── Activités ──────────────────────────────────────────────────────────────
    let savedActivities = 0;
    try {
      const rawActivities = await client.getActivities(0, 100);
      const newOnes = rawActivities.filter(a => {
        const key = a.activityType?.typeKey?.toLowerCase() || '';
        if (!RUNNING_TYPES.has(key)) return false;
        return new Date(a.startTimeLocal) > lastSync;
      }).map(convertActivity);

      if (newOnes.length > 0) {
        let data = { activities: [], athlete: {}, garmin_runs: [], atl_ctl: [], endurance_score: [], hill_score: [], targets: [], races: [], insights: {} };
        if (fs.existsSync(dataPath)) {
          try {
            data = JSON.parse(fs.readFileSync(dataPath, 'utf8').replace(/\bNaN\b/g, 'null'));
          } catch {}
        }

        const existingIds = new Set(data.activities.map(a => a.garmin_id).filter(Boolean));
        const existingKeys = new Set(data.activities.map(a => `${a.Date?.slice(0, 10)}_${a.Distance_km}`));
        const toAdd = newOnes.filter(a =>
          (!a.garmin_id || !existingIds.has(a.garmin_id)) &&
          !existingKeys.has(`${a.Date?.slice(0, 10)}_${a.Distance_km}`)
        );

        if (toAdd.length > 0) {
          data.activities = [...data.activities, ...toAdd].sort((a, b) => new Date(a.Date) - new Date(b.Date));
          fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
          try { require('./dataLoader').clearCache(); } catch {}
          savedActivities = toAdd.length;
        }
      }
    } catch (e) {
      console.error('[GarminSync] Activités:', e.message);
    }

    // ── Données santé ──────────────────────────────────────────────────────────
    const daysToSync = Math.min(30, Math.ceil((Date.now() - lastSync.getTime()) / 86400000));
    let savedHealthDays = 0;

    for (let i = 0; i < daysToSync; i++) {
      const d = new Date(Date.now() - i * 86400000);
      const dateStr = d.toISOString().slice(0, 10);

      let restingHR = null, hrv = null, sleepH = null, sleepQuality = null;

      try {
        const hrData = await client.getDailyHeartRate(dateStr);
        restingHR = hrData?.restingHeartRate || null;
      } catch {}

      try {
        const hrvData = await client.getHrvData(d);
        hrv = hrvData?.hrvSummary?.lastNight || hrvData?.lastNight5MinHigh || null;
        if (hrv) hrv = Math.round(hrv);
      } catch {}

      try {
        const sleepData = await client.getSleepData(d);
        const dto = sleepData?.dailySleepDTO;
        if (dto?.sleepTimeSeconds) sleepH = Math.round((dto.sleepTimeSeconds / 3600) * 10) / 10;
        const score = dto?.sleepScores?.overall?.value;
        if (score != null) sleepQuality = Math.max(1, Math.min(5, Math.round(score / 20)));
      } catch {}

      if (restingHR || hrv || sleepH) {
        const existing = db.prepare('SELECT id, fc_repos, hrv, sleep_h FROM daily_logs WHERE date = ?').get(dateStr);
        if (existing) {
          db.prepare(`UPDATE daily_logs SET
            fc_repos = COALESCE(CASE WHEN fc_repos IS NULL THEN ? ELSE NULL END, fc_repos),
            hrv = COALESCE(CASE WHEN hrv IS NULL THEN ? ELSE NULL END, hrv),
            sleep_h = COALESCE(CASE WHEN sleep_h IS NULL THEN ? ELSE NULL END, sleep_h),
            sleep_quality = COALESCE(CASE WHEN sleep_quality IS NULL THEN ? ELSE NULL END, sleep_quality)
            WHERE date = ?`).run(restingHR, hrv, sleepH, sleepQuality, dateStr);
        } else {
          db.prepare(`INSERT OR IGNORE INTO daily_logs (date, fc_repos, hrv, sleep_h, sleep_quality) VALUES (?, ?, ?, ?, ?)`)
            .run(dateStr, restingHR, hrv, sleepH, sleepQuality);
        }
        savedHealthDays++;
      }
    }

    db.prepare('UPDATE sync_config SET last_sync = ?, last_sync_activities = ?, last_sync_status = ? WHERE provider = ?')
      .run(new Date().toISOString(), savedActivities, 'ok', 'garmin');

    return { ok: true, savedActivities, savedHealthDays };
  });
}

module.exports = { syncGarmin, testConnection, encryptPassword, decryptPassword };
