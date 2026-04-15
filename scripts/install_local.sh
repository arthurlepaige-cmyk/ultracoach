#!/bin/bash
# Installation locale d'UltraCoach avec Ollama
# Compatible macOS et Linux (Ubuntu/Debian)
# Usage: bash scripts/install_local.sh

set -e
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OLLAMA_MODEL="${OLLAMA_MODEL:-mistral}"

echo "=========================================="
echo "  INSTALLATION LOCALE — UltraCoach"
echo "  Répertoire : $PROJECT_DIR"
echo "=========================================="

# ── Détection OS ───────────────────────────────
OS="$(uname -s)"
ARCH="$(uname -m)"

# ── 1. Vérifier Node.js ───────────────────────
echo ""
echo "→ [1/5] Vérification Node.js..."
if ! command -v node &>/dev/null; then
  echo "  Node.js non trouvé — installation..."
  if [ "$OS" = "Darwin" ]; then
    if command -v brew &>/dev/null; then
      brew install node
    else
      echo "  ❌ Installe Homebrew d'abord : https://brew.sh"
      exit 1
    fi
  elif [ "$OS" = "Linux" ]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
  fi
else
  NODE_VER=$(node -v)
  echo "  ✅ Node.js $NODE_VER"
fi

# ── 2. Vérifier/Installer Ollama ──────────────
echo ""
echo "→ [2/5] Vérification Ollama..."
if ! command -v ollama &>/dev/null; then
  echo "  Ollama non trouvé — installation..."
  if [ "$OS" = "Darwin" ]; then
    if command -v brew &>/dev/null; then
      brew install ollama
    else
      curl -fsSL https://ollama.com/install.sh | sh
    fi
  elif [ "$OS" = "Linux" ]; then
    curl -fsSL https://ollama.com/install.sh | sh
  fi
  echo "  ✅ Ollama installé"
else
  echo "  ✅ Ollama $(ollama --version 2>/dev/null | head -1)"
fi

# ── 3. Démarrer Ollama et télécharger le modèle ─
echo ""
echo "→ [3/5] Démarrage Ollama + modèle $OLLAMA_MODEL..."

# Démarrer ollama serve en arrière-plan si pas déjà actif
if ! curl -s http://localhost:11434/api/tags &>/dev/null; then
  echo "  Démarrage du serveur Ollama..."
  if [ "$OS" = "Darwin" ]; then
    open -a Ollama 2>/dev/null || ollama serve &>/dev/null &
  else
    ollama serve &>/dev/null &
  fi
  echo -n "  Attente démarrage"
  for i in $(seq 1 15); do
    sleep 1
    echo -n "."
    if curl -s http://localhost:11434/api/tags &>/dev/null; then break; fi
  done
  echo ""
fi

# Vérifier si le modèle est déjà téléchargé
if ollama list 2>/dev/null | grep -q "$OLLAMA_MODEL"; then
  echo "  ✅ Modèle $OLLAMA_MODEL déjà présent"
else
  echo "  Téléchargement du modèle $OLLAMA_MODEL (peut prendre quelques minutes)..."
  ollama pull "$OLLAMA_MODEL"
  echo "  ✅ Modèle $OLLAMA_MODEL prêt"
fi

# ── 4. Installer les dépendances Node.js ──────
echo ""
echo "→ [4/5] Installation des dépendances..."
cd "$PROJECT_DIR/backend" && npm install --silent
echo "  ✅ Backend"
cd "$PROJECT_DIR/frontend" && npm install --silent
echo "  ✅ Frontend"

# ── 5. Configurer .env si absent ──────────────
echo ""
echo "→ [5/5] Configuration .env..."
ENV_FILE="$PROJECT_DIR/backend/.env"
if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" << 'EOF'
# UltraCoach — configuration locale
# Ollama est utilisé en priorité (aucune clé API nécessaire)

# Modèle Ollama (mistral, llama3.2, llama3.1:8b…)
OLLAMA_MODEL=mistral
OLLAMA_HOST=http://localhost:11434

# JWT (change cette valeur)
JWT_SECRET=ultracoach_local_secret_change_me

# Optionnel : Groq (cloud, plus rapide) ou Anthropic (fallback)
# GROQ_API_KEY=gsk_xxxx
# ANTHROPIC_API_KEY=sk-ant-xxxx
EOF
  echo "  ✅ .env créé"
else
  echo "  ✅ .env existant conservé"
fi

# ── Build frontend ─────────────────────────────
echo ""
echo "→ Build du frontend..."
cd "$PROJECT_DIR/frontend" && npm run build --silent
echo "  ✅ Frontend buildé"

# ── PM2 ───────────────────────────────────────
echo ""
echo "→ Démarrage avec PM2..."
if ! command -v pm2 &>/dev/null; then
  npm install -g pm2 --silent
fi

cd "$PROJECT_DIR"
pm2 delete ultracoach 2>/dev/null || true
pm2 start backend/server.js --name ultracoach
pm2 save
echo "  ✅ App démarrée"

echo ""
echo "=========================================="
echo "  ✅ ULTRACOACH EN LOCAL !"
echo ""
echo "  → http://localhost:3001"
echo ""
echo "  Commandes utiles :"
echo "    pm2 logs ultracoach    # voir les logs"
echo "    pm2 restart ultracoach # redémarrer"
echo "    pm2 stop ultracoach    # arrêter"
echo "=========================================="
