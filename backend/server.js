require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '20mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '..', 'frontend', 'dist')));

// Auth routes (public)
app.use('/api/auth', require('./routes/auth'));

// Protected routes
const { requireAuth } = require('./middleware/auth');
app.use('/api/import', requireAuth, require('./routes/import'));
app.use('/api/nutrition', requireAuth, require('./routes/nutrition').router);
app.use('/api/athlete', requireAuth, require('./routes/athlete'));
app.use('/api/activities', requireAuth, require('./routes/activities'));
app.use('/api/daily-log', requireAuth, require('./routes/daily-log'));
app.use('/api/training', requireAuth, require('./routes/training'));
app.use('/api/race', requireAuth, require('./routes/race').router);
const healthRoutes = require('./routes/health');
app.use('/api/health', requireAuth, healthRoutes);

// Health check (server status)
app.get('/api/status', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// SPA fallback
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, '..', 'frontend', 'dist', 'index.html');
  const fs = require('fs');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.json({ message: 'Ultra Coach API running. Start frontend separately.' });
  }
});

app.listen(PORT, () => {
  console.log(`\n🏔️  Ultra Coach backend running on http://localhost:${PORT}`);
  console.log(`📊  API: http://localhost:${PORT}/api/health\n`);

  // Démarrage du scheduler (génération nutrition chaque samedi)
  const { initScheduler } = require('./scheduler');
  initScheduler();
});
