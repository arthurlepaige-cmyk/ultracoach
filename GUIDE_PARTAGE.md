# Guide — Ultra Coach : Déploiement & Partage

> L'application tourne sur un serveur Oracle Cloud (Frankfurt). Arthur et sa compagne y accèdent depuis n'importe quel appareil via un navigateur.

---

## 1. Architecture

```
Internet
   │
   ▼
Oracle Cloud VM (Frankfurt)
  ├── Node.js backend  :3001
  ├── data/auth.db             ← comptes utilisateurs
  ├── data/users/arthur/       ← données Arthur
  └── data/users/compagne/     ← données compagne
```

- Chaque utilisateur a son propre compte (email + mot de passe)
- Les données sont isolées — Arthur ne voit pas les données de sa compagne et vice versa
- L'IA est fournie par **Groq** (gratuit, Llama 3 70B)

---

## 2. Accès à l'application

Une fois déployée, l'app est accessible à :
```
http://<IP_ORACLE>:3001
```

Chaque utilisateur crée son compte à la première visite (bouton "Inscription").

---

## 3. Clé API Groq — Sécurité

⚠️ **Important** : La clé API Groq est une information sensible.

### Règles à suivre
- **Ne jamais partager la clé** dans un chat, email ou message
- La clé est stockée dans `/backend/.env` sur le serveur — ce fichier n'est **pas** dans Git
- Si tu penses que la clé a été compromise (partagée accidentellement) :
  1. Va sur **console.groq.com** → API Keys
  2. Supprime l'ancienne clé
  3. Crée une nouvelle clé
  4. Mets à jour `/backend/.env` sur le serveur :
     ```bash
     nano ~/UltraCoach/backend/.env
     # Modifie GROQ_API_KEY=gsk_nouvelle_cle
     # Ctrl+X, Y, Entrée pour sauvegarder
     ```
  5. Redémarre le serveur : `pm2 restart ultracoach`

### Limite gratuite Groq
- 14 400 requêtes/jour — largement suffisant pour 2 utilisateurs
- Quota visible sur console.groq.com → Usage

---

## 4. Déploiement sur Oracle Cloud (référence)

### Première installation
```bash
# Connexion SSH
ssh -i ~/ultracoach.key ubuntu@<IP_ORACLE>

# Installer Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git

# Installer PM2 (gestionnaire de processus)
sudo npm install -g pm2

# Cloner le projet
git clone <URL_DEPOT> ~/UltraCoach
cd ~/UltraCoach/backend && npm install
cd ~/UltraCoach/frontend && npm install && npm run build

# Créer le fichier .env
cp ~/UltraCoach/backend/.env.example ~/UltraCoach/backend/.env
nano ~/UltraCoach/backend/.env
# → Renseigne GROQ_API_KEY et JWT_SECRET

# Migrer les données existantes (première fois seulement)
node ~/UltraCoach/backend/scripts/migrate-to-multiuser.js \
  --email arthur@example.com --name Arthur --password tonmotdepasse

# Lancer avec PM2
cd ~/UltraCoach/backend
pm2 start server.js --name ultracoach
pm2 startup && pm2 save
```

### Mettre à jour l'application
```bash
ssh -i ~/ultracoach.key ubuntu@<IP_ORACLE>
cd ~/UltraCoach
git pull
cd backend && npm install
cd ../frontend && npm install && npm run build
pm2 restart ultracoach
```

---

## 5. Comptes utilisateurs

### Créer un compte
- Ouvre `http://<IP_ORACLE>:3001` dans le navigateur
- Clique **Inscription**
- Renseigne email, prénom, mot de passe (8 caractères min)
- Coche la case de consentement RGPD
- Clique **Créer mon compte**

### Premier démarrage après inscription
L'app détecte qu'aucune donnée n'existe et affiche l'assistant de configuration :

**Étape 1 — Profil athlète**
- FC repos, FC max, VO2max (optionnel)

**Étape 2 — Import des activités**

| Source | Comment exporter |
|--------|-----------------|
| **Garmin Connect** | connect.garmin.com → Paramètres → Exporter tes données → CSV |
| **Strava** | strava.com → Paramètres → Télécharger tes données → activities.csv |
| **Suunto** | suunto.com → Journal → Export CSV |

**Étape 3 — Vérification & import**

### Droits RGPD
Chaque utilisateur peut depuis son compte :
- **Exporter ses données** : Paramètres → "Exporter mes données" → télécharge un JSON complet
- **Supprimer son compte** : Paramètres → "Supprimer mon compte" → confirmation par mot de passe → toutes les données sont effacées

---

## 6. Partage des menus nutrition via GitHub Gist

Les deux utilisateurs partagent les **mêmes recettes**. Chaque app adapte les quantités à la charge individuelle.

### Configuration côté Arthur (publier)

1. Crée un **Personal Access Token GitHub** :
   - github.com → Settings → Developer settings → Personal access tokens → Tokens (classic)
   - Nom : `UltraCoach Gist` · Scope : **`gist`** uniquement
   - Copie le token (commence par `ghp_`)

2. Dans l'app → **Nutrition** → ⚙️ → onglet **"Partage Gist"**
   - Colle le token → **Enregistrer**

3. Clique **"Gist"** dans le header → un Gist secret est créé
   - Copie l'URL Gist et envoie-la à ta compagne

> Push automatique chaque samedi soir après la génération des menus.

### Configuration côté compagne (recevoir)

1. **Nutrition** → ⚙️ → **"Partage Gist"**
2. Dans "URL Gist à recevoir" : colle l'URL d'Arthur
3. **Enregistrer**
4. Onglet **"Liste de courses"** → **"Tirer Gist"**
   - Les recettes sont importées, les quantités recalculées selon sa charge à elle

### Tableau hebdomadaire

| Qui | Quand | Action |
|-----|-------|--------|
| Arthur | Samedi soir (auto) | Génération + push Gist |
| Compagne | Dimanche ou lundi | "Liste de courses" → "Tirer Gist" |
| Les deux | Toute la semaine | Cochent les articles achetés |

---

## 7. Structure des données sur le serveur

```
~/UltraCoach/
├── data/
│   ├── auth.db                          ← comptes (emails, mots de passe hashés)
│   └── users/
│       ├── <uuid-arthur>/
│       │   ├── ultracoach.db            ← journal, objectifs, nutrition...
│       │   └── athlete_data_export.json ← historique activités
│       └── <uuid-compagne>/
│           ├── ultracoach.db
│           └── athlete_data_export.json
├── backend/
│   └── .env                             ← GROQ_API_KEY, JWT_SECRET (ne pas committer)
└── frontend/dist/                       ← app buildée (servie par le backend)
```

---

## 8. Questions fréquentes

**L'IA ne génère pas les menus ?**
→ Vérifie que `GROQ_API_KEY` est bien dans `/backend/.env` et redémarre : `pm2 restart ultracoach`
→ Vérifie le quota sur console.groq.com → Usage

**Le serveur ne redémarre pas après reboot Oracle ?**
→ `pm2 startup` puis `pm2 save` (à faire une seule fois après le premier lancement)

**J'ai oublié mon mot de passe ?**
→ Arthur (admin) peut voir les comptes via l'API `/api/auth/users`
→ Pour réinitialiser : supprimer le compte dans `auth.db` et recréer

**Le push Gist échoue ?**
→ Vérifie que le token GitHub a bien le scope `gist`
→ Régénère un token si besoin

**Mes données sont-elles partagées entre utilisateurs ?**
→ Non. Seules les **recettes** (ingrédients + étapes) transitent via le Gist.
→ Profil, entraînements, journal, chaussures restent privés.

---

*Dernière mise à jour : 2026-04-10*
