# Ultra Coach — Guide de développement

## Stack technique
- **Frontend** : React 18 + Vite + TailwindCSS + Recharts + Framer Motion
- **Backend** : Node.js + Express (port 3001)
- **Base de données** : SQLite via `better-sqlite3` → `data/ultracoach.db`
- **Données historiques** : `data/athlete_data_export.json` (read-only, 1421 activités)

## Démarrage rapide

```bash
# Premier lancement — installer toutes les dépendances
cd backend && npm install
cd ../frontend && npm install

# Lancer l'app (deux terminaux)
# Terminal 1 : backend
cd backend && node server.js        # → http://localhost:3001

# Terminal 2 : frontend
cd frontend && npm run dev          # → http://localhost:5173
```

## Architecture

```
ultra-coach/
├── data/
│   ├── athlete_data_export.json    # Données historiques READ-ONLY
│   ├── COURSE_429510180.gpx        # GPX course Chevaliers (optionnel)
│   └── ultracoach.db               # SQLite — nouvelles entrées (auto-créé)
├── backend/
│   ├── server.js                   # Express app, port 3001
│   ├── db.js                       # SQLite init + import targets
│   ├── calc.js                     # Calculs métier (AEI, sweet spot…)
│   ├── dataLoader.js               # Chargement JSON avec gestion NaN→null
│   └── routes/
│       ├── athlete.js              # GET /api/athlete, /zones, /insights
│       ├── activities.js           # GET /api/activities, /aei-monthly, /weekly-volume…
│       ├── training.js             # GET /api/training/plan, /sweet-spot, /race-targets
│       ├── daily-log.js            # CRUD /api/daily-log
│       └── race.js                 # GET /api/race/strategy, /gpx, /checkpoints
└── frontend/src/
    ├── App.jsx                     # Router + nav
    ├── api.js                      # Toutes les fonctions fetch
    ├── hooks/useApi.js             # Hook générique chargement données
    ├── pages/
    │   ├── Dashboard.jsx           # Métriques, countdowns, AEI, volume
    │   ├── DailyLog.jsx            # Saisie quotidienne mobile-first ★
    │   ├── Training.jsx            # Plan semaine + phases
    │   ├── RaceStrategy.jsx        # GPX interactif + checkpoints
    │   └── Analytics.jsx           # Graphiques AEI, ATL/CTL, scores, courses
    └── components/
        ├── AEIChart.jsx            # Graphique AEI mensuel
        ├── WeeklyLoad.jsx          # Histogramme volume hebdo
        ├── GPXProfile.jsx          # Profil altimétrique interactif
        ├── RaceCountdown.jsx       # Compte à rebours course
        └── FormIndicator.jsx       # Statut forme + alerte FC repos
```

## Points critiques

### Données
- `athlete_data_export.json` contient des valeurs `NaN` (Python) → remplacé par `null` dans `dataLoader.js`
- Les nouvelles entrées vont **uniquement dans SQLite** (`daily_logs` table)
- Le dashboard combine JSON historique + SQLite

### Calcul AEI
- Utilise `D_plus_exact` (D+ corrigé tapis), **pas** `D_plus` (D+ brut Strava)
- AEI rolling = moyenne des 10 dernières sorties outdoor > 7km avec FC
- `> 8.3` = pic de forme (vert), `7.5-8.3` = bonne forme (bleu), `< 7.5` = fatigue (orange)

### Tapis incliné
- `is_treadmill: true` → D+ enregistré = 0 → correction automatique :
  - 2025 et avant : **290m**
  - 2026 et après : **400m**

### Alerte FC repos
- `< 53` → Vert (OK)
- `53-55` → Orange (vigilance)
- `≥ 56` → Rouge (reporter la séance)

### Sweet Spot J-28
- Fenêtre 28 jours avant course cible (Chevaliers: 2026-05-15)
- Objectif : `300-376 km` + `4000-5000 m D+`

## Couleurs palette
```
Vert     #1D9E75  — forme/progression/optimal
Bleu     #378ADD  — volume/données
Orange   #EF9F27  — vigilance/allure
Rouge    #E24B4A  — alerte/intensité
Violet   #7F77DD  — HRV/métriques secondaires
```

## Prochaines courses
- **Chevaliers** : 2026-05-15 · 157km / 4590m D+ · Départ 17h
- **UTMB** : 2026-08-28

## GPX
Placer le fichier `COURSE_429510180.gpx` dans `data/` pour le vrai profil altimétrique.
Sans ce fichier, l'app utilise un profil synthétique avec avertissement visuel.

## Base de données SQLite — tables
```sql
daily_logs     -- Entrées quotidiennes: FC repos, HRV, séance, AEI calculé…
race_targets   -- Courses cibles (importées depuis JSON au 1er lancement)
daily_briefing -- Cache briefing IA (date PK, text, generated_at)
```

## Déploiement — Oracle Cloud

- **Serveur** : `ubuntu@130.61.178.50`
- **Clé SSH** : `~/Downloads/ssh-key-2026-04-10-3.key`
- **Repo GitHub** : `https://github.com/arthurlepaige-cmyk/ultracoach.git`

```bash
# 1. Committer et pusher en local
git add <fichiers> && git commit -m "..." && git push origin main

# 2. Déployer sur le serveur (une seule commande)
ssh -i ~/Downloads/ssh-key-2026-04-10-3.key ubuntu@130.61.178.50 \
  "cd ~/UltraCoach && git pull && cd frontend && npm install && npm run build && cd .. && pm2 restart ultracoach && pm2 status"
```
