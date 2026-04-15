#!/bin/bash
# ÉTAPE 3 — Installation automatique sur la nouvelle VM
# Usage: ./scripts/migrate_step3_setup.sh <NOUVELLE_IP>

set -e

NEW_IP="$1"
SSH_KEY="$HOME/Downloads/ssh-key-2026-04-10-3.key"
BACKUP_DIR="$HOME/Desktop/ultracoach_migration_backup"
GITHUB_REPO="https://github.com/arthurlepaige-cmyk/ultracoach.git"

if [ -z "$NEW_IP" ]; then
  echo "Usage: $0 <NOUVELLE_IP>"
  exit 1
fi

echo "======================================"
echo "  MIGRATION UltraCoach — Étape 3/4"
echo "  Setup sur $NEW_IP"
echo "======================================"

SSH="ssh -i $SSH_KEY -o StrictHostKeyChecking=no ubuntu@$NEW_IP"

echo ""
echo "→ [1/7] Mise à jour du système..."
$SSH "sudo apt-get update -qq && sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -qq"

echo ""
echo "→ [2/7] Installation Node.js 20..."
$SSH "curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && \
      sudo apt-get install -y -qq nodejs"

echo ""
echo "→ [3/7] Installation des outils (git, PM2, sqlite3, iptables-persistent)..."
$SSH "sudo apt-get install -y -qq git sqlite3 && \
      sudo npm install -g pm2 --silent"

echo ""
echo "→ [4/7] Clonage du repo GitHub..."
$SSH "[ -d ~/UltraCoach ] && rm -rf ~/UltraCoach; \
      git clone --quiet $GITHUB_REPO ~/UltraCoach"

echo ""
echo "→ [5/7] Installation des dépendances Node.js..."
$SSH "cd ~/UltraCoach/backend && npm install --silent && \
      cd ~/UltraCoach/frontend && npm install --silent"

echo ""
echo "→ [6/7] Build du frontend..."
$SSH "cd ~/UltraCoach/frontend && npm run build"

echo ""
echo "→ [7/7] Transfert de la base de données..."
scp -i "$SSH_KEY" "$BACKUP_DIR/ultracoach.db" ubuntu@$NEW_IP:~/UltraCoach/data/ultracoach.db
$SSH "ls -lh ~/UltraCoach/data/ultracoach.db"

echo ""
echo "✅ Setup terminé !"
echo ""
echo "➡️  Lance maintenant l'étape 4 :"
echo "   ./scripts/migrate_step4_launch.sh $NEW_IP"
