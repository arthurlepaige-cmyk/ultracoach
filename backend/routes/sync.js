const express = require('express');
const router = express.Router();
const { syncGarmin, testConnection, encryptPassword } = require('../garminSync');
const { getDb } = require('../db');
const { runWithUser } = require('../userContext');

// GET /api/sync/status
router.get('/status', (req, res) => {
  runWithUser(req.user.id, () => {
    const db = getDb();
    const garmin = db.prepare(
      'SELECT provider, username, last_sync, last_sync_activities, last_sync_status, enabled FROM sync_config WHERE provider = ?'
    ).get('garmin');
    res.json({ garmin: garmin || null });
  });
});

// PUT /api/sync/garmin/config — sauvegarder credentials
router.put('/garmin/config', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });

  runWithUser(req.user.id, () => {
    const db = getDb();
    const encrypted = encryptPassword(password);
    const existing = db.prepare('SELECT id FROM sync_config WHERE provider = ?').get('garmin');
    if (existing) {
      db.prepare('UPDATE sync_config SET username = ?, password_encrypted = ?, enabled = 1 WHERE provider = ?')
        .run(username, encrypted, 'garmin');
    } else {
      db.prepare('INSERT INTO sync_config (provider, username, password_encrypted, enabled) VALUES (?, ?, ?, 1)')
        .run('garmin', username, encrypted);
    }
    res.json({ ok: true });
  });
});

// DELETE /api/sync/garmin/config — supprimer credentials
router.delete('/garmin/config', (req, res) => {
  runWithUser(req.user.id, () => {
    const db = getDb();
    db.prepare('DELETE FROM sync_config WHERE provider = ?').run('garmin');
    res.json({ ok: true });
  });
});

// POST /api/sync/garmin/test — tester la connexion
router.post('/garmin/test', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });

  try {
    const result = await testConnection(username, password);
    res.json(result);
  } catch (e) {
    res.status(401).json({ error: 'Connexion échouée : ' + e.message });
  }
});

// POST /api/sync/garmin/run — déclencher manuellement
router.post('/garmin/run', async (req, res) => {
  try {
    const result = await syncGarmin(req.user.id);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
