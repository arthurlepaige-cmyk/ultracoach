const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getAuthDb, getUserDataDir, invalidateDbCache } = require('../db');
const { signToken } = require('../middleware/auth');
const { requireAuth } = require('../middleware/auth');
const fs = require('fs');
const path = require('path');

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false',
  sameSite: 'lax',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 jours
};

// ── POST /api/auth/register ───────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const { email, name, password, consent_gdpr } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });
  if (!consent_gdpr) return res.status(400).json({ error: 'Consentement GDPR requis' });
  if (password.length < 8) return res.status(400).json({ error: 'Mot de passe trop court (8 caractères minimum)' });

  const db = getAuthDb();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) return res.status(409).json({ error: 'Un compte existe déjà avec cet email' });

  const id = uuidv4();
  const password_hash = await bcrypt.hash(password, 12);

  db.prepare(`
    INSERT INTO users (id, email, name, password_hash, consent_gdpr, consent_date)
    VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
  `).run(id, email.toLowerCase().trim(), name || email.split('@')[0], password_hash);

  const user = db.prepare('SELECT id, email, name, created_at FROM users WHERE id = ?').get(id);
  const token = signToken(user);
  res.cookie('token', token, COOKIE_OPTS);
  res.json({ ok: true, user: { id: user.id, email: user.email, name: user.name } });
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });

  const db = getAuthDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });

  db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

  const token = signToken(user);
  res.cookie('token', token, COOKIE_OPTS);
  res.json({ ok: true, user: { id: user.id, email: user.email, name: user.name } });
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get('/me', requireAuth, (req, res) => {
  const db = getAuthDb();
  const user = db.prepare('SELECT id, email, name, created_at, last_login FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
  res.json(user);
});

// ── GET /api/auth/export — export GDPR de toutes les données ─────────────────
router.get('/export', requireAuth, (req, res) => {
  const { getDb } = require('../db');
  const { loadData } = require('../dataLoader');
  const { runWithUser } = require('../userContext');

  runWithUser(req.user.id, () => {
    const db = getDb();
    const athleteData = loadData();

    const logs = db.prepare('SELECT * FROM daily_logs ORDER BY date').all();
    const races = db.prepare('SELECT * FROM race_targets ORDER BY date').all();
    const nutrition = db.prepare('SELECT date, session_summary, needs_json, generated_at FROM nutrition_menus ORDER BY date').all();
    const nutSettings = db.prepare('SELECT weight_kg, height_cm, age, sex, birthdate FROM nutrition_settings WHERE id = 1').get();
    const shoes = db.prepare('SELECT * FROM shoes').all();

    const authDb = getAuthDb();
    const userInfo = authDb.prepare('SELECT id, email, name, created_at, consent_date FROM users WHERE id = ?').get(req.user.id);

    res.setHeader('Content-Disposition', `attachment; filename="ultracoach-export-${req.user.id.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json({
      export_date: new Date().toISOString(),
      user: userInfo,
      profile: nutSettings,
      athlete_data_summary: {
        activities_count: athleteData.activities?.length || 0,
        date_range: athleteData.activities?.length
          ? `${athleteData.activities.at(-1)?.date} → ${athleteData.activities[0]?.date}`
          : null,
      },
      daily_logs: logs,
      race_targets: races,
      nutrition_settings: nutSettings,
      nutrition_menus_count: nutrition.length,
      shoes,
    });
  });
});

// ── DELETE /api/auth/account — suppression compte + données (GDPR) ────────────
router.delete('/account', requireAuth, async (req, res) => {
  const { password } = req.body;
  const authDb = getAuthDb();
  const user = authDb.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

  // Confirmation par mot de passe
  const valid = await bcrypt.compare(password || '', user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Mot de passe incorrect' });

  // Supprime les données utilisateur (SQLite + JSON)
  const userDir = getUserDataDir(req.user.id);
  if (fs.existsSync(userDir)) {
    fs.rmSync(userDir, { recursive: true, force: true });
  }
  invalidateDbCache(req.user.id);

  // Supprime le compte
  authDb.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);

  res.clearCookie('token');
  res.json({ ok: true, message: 'Compte et toutes les données supprimés.' });
});

// ── GET /api/auth/users — admin: liste des utilisateurs ──────────────────────
router.get('/users', requireAuth, (req, res) => {
  const authDb = getAuthDb();
  const me = authDb.prepare('SELECT role FROM users WHERE id = ?').get(req.user.id);
  if (me?.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });

  const users = authDb.prepare('SELECT id, email, name, created_at, last_login FROM users ORDER BY created_at').all();
  res.json(users);
});

module.exports = router;
