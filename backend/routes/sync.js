const express = require('express');
const router = express.Router();
const { syncGarmin, initConnection, completeMfa, testConnection, encryptPassword } = require('../garminSync');
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

// POST /api/sync/garmin/init — étape 1 : email + password
router.post('/garmin/init', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });

  try {
    const result = await initConnection(req.user.id, username, password);
    if (!result.ok) return res.status(401).json({ error: result.error });

    // Si auth OK sans MFA, on sauvegarde la config
    if (!result.need_mfa) {
      runWithUser(req.user.id, () => {
        const db = getDb();
        const enc = encryptPassword(password);
        const existing = db.prepare('SELECT id FROM sync_config WHERE provider = ?').get('garmin');
        if (existing) {
          db.prepare('UPDATE sync_config SET username = ?, password_encrypted = ?, enabled = 1 WHERE provider = ?')
            .run(username, enc, 'garmin');
        } else {
          db.prepare('INSERT INTO sync_config (provider, username, password_encrypted, enabled) VALUES (?, ?, ?, 1)')
            .run('garmin', username, enc);
        }
      });
    }

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/sync/garmin/mfa — étape 2 : code reçu par email
router.post('/garmin/mfa', async (req, res) => {
  const { mfa_code, username, password } = req.body;
  if (!mfa_code) return res.status(400).json({ error: 'Code MFA requis' });

  try {
    const result = await completeMfa(req.user.id, mfa_code);
    if (!result.ok) return res.status(401).json({ error: result.error });

    // Sauvegarde la config après MFA réussi
    runWithUser(req.user.id, () => {
      const db = getDb();
      const enc = username && password ? encryptPassword(password) : null;
      const existing = db.prepare('SELECT id FROM sync_config WHERE provider = ?').get('garmin');
      if (existing) {
        db.prepare('UPDATE sync_config SET username = ?, password_encrypted = ?, enabled = 1 WHERE provider = ?')
          .run(username || existing.username, enc || existing.password_encrypted, 'garmin');
      } else {
        db.prepare('INSERT INTO sync_config (provider, username, password_encrypted, enabled) VALUES (?, ?, ?, 1)')
          .run('garmin', username || '', enc || '');
      }
    });

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/sync/garmin/run — sync manuelle
router.post('/garmin/run', async (req, res) => {
  try {
    const result = await syncGarmin(req.user.id);
    if (!result.ok) return res.status(500).json({ error: result.error });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/sync/garmin/config — supprimer
router.delete('/garmin/config', (req, res) => {
  const fs = require('fs');
  runWithUser(req.user.id, () => {
    const db = getDb();
    db.prepare('DELETE FROM sync_config WHERE provider = ?').run('garmin');
    // Supprime aussi les tokens
    const { getUserDataDir } = require('../db');
    const tokensPath = require('path').join(getUserDataDir(req.user.id), 'garmin_tokens.json');
    try { fs.unlinkSync(tokensPath); } catch {}
    try { fs.unlinkSync(tokensPath + '.mfa_state'); } catch {}
    res.json({ ok: true });
  });
});

module.exports = router;
