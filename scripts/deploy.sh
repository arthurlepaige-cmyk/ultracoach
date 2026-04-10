#!/bin/bash
# Script de mise à jour UltraCoach sur Oracle Cloud
# Usage : bash ~/UltraCoach/scripts/deploy.sh

set -e
cd ~/UltraCoach

echo "⬇️  Téléchargement des mises à jour..."
git pull

echo "📦 Installation des dépendances backend..."
cd backend && npm install --omit=dev
cd ..

echo "🔨 Build du frontend..."
cd frontend && npm install && npm run build
cd ..

echo "🔄 Redémarrage du serveur..."
pm2 restart ultracoach

echo "✅ Déploiement terminé !"
pm2 status
