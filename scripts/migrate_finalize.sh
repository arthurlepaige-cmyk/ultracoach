#!/bin/bash
# FINALISATION — Met à jour CLAUDE.md + deploy script avec la nouvelle IP
# Usage: ./scripts/migrate_finalize.sh <NOUVELLE_IP>

set -e

NEW_IP="$1"
OLD_IP="130.61.178.50"
SSH_KEY="$HOME/Downloads/ssh-key-2026-04-10-3.key"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [ -z "$NEW_IP" ]; then
  echo "Usage: $0 <NOUVELLE_IP>"
  exit 1
fi

echo "======================================"
echo "  FINALISATION — Mise à jour CLAUDE.md"
echo "======================================"

# Mise à jour CLAUDE.md
sed -i '' "s/$OLD_IP/$NEW_IP/g" "$PROJECT_DIR/CLAUDE.md"
echo "✅ CLAUDE.md mis à jour ($OLD_IP → $NEW_IP)"

# Mise à jour deploy.sh si présent
if [ -f "$PROJECT_DIR/scripts/deploy.sh" ]; then
  sed -i '' "s/$OLD_IP/$NEW_IP/g" "$PROJECT_DIR/scripts/deploy.sh"
  echo "✅ deploy.sh mis à jour"
fi

echo ""
echo "→ Vérification finale de l'app..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "http://$NEW_IP:3001/api/athlete" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ Application accessible : http://$NEW_IP:3001"
else
  echo "⚠️  Pas encore accessible (HTTP $HTTP_CODE) — vérifie les Security Lists Oracle"
fi

echo ""
echo "======================================"
echo "  ✅ MIGRATION COMPLÈTE !"
echo "======================================"
echo ""
echo "Pense à :"
echo "  1. Vérifier l'app en prod : http://$NEW_IP:3001"
echo "  2. Committer CLAUDE.md : git add CLAUDE.md && git commit -m 'Migrate to free tier VM ($NEW_IP)'"
echo "  3. Résilier l'ancienne VM $OLD_IP dans la console Oracle"
