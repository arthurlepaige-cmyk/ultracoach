#!/bin/bash
# ÉTAPE 4 — Lancement PM2 + firewall + vérification
# Usage: ./scripts/migrate_step4_launch.sh <NOUVELLE_IP>

set -e

NEW_IP="$1"
SSH_KEY="$HOME/Downloads/ssh-key-2026-04-10-3.key"

if [ -z "$NEW_IP" ]; then
  echo "Usage: $0 <NOUVELLE_IP>"
  exit 1
fi

echo "======================================"
echo "  MIGRATION UltraCoach — Étape 4/4"
echo "  Lancement sur $NEW_IP"
echo "======================================"

SSH="ssh -i $SSH_KEY -o StrictHostKeyChecking=no ubuntu@$NEW_IP"

echo ""
echo "→ [1/4] Démarrage PM2..."
$SSH "cd ~/UltraCoach && \
      pm2 delete ultracoach 2>/dev/null || true && \
      pm2 start backend/server.js --name ultracoach && \
      pm2 save"

echo ""
echo "→ [2/4] Activation PM2 au démarrage..."
# Récupère la commande pm2 startup et l'exécute
STARTUP_CMD=$($SSH "pm2 startup | grep 'sudo' | tail -1")
$SSH "sudo $STARTUP_CMD 2>/dev/null || true"
$SSH "sudo env PATH=\$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u ubuntu --hp /home/ubuntu && pm2 save"

echo ""
echo "→ [3/4] Configuration firewall (iptables)..."
$SSH "sudo iptables -I INPUT -p tcp --dport 3001 -j ACCEPT && \
      sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT && \
      sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT && \
      sudo apt-get install -y -qq iptables-persistent && \
      sudo netfilter-persistent save"

echo ""
echo "→ [4/4] Vérification de l'application..."
sleep 3
$SSH "pm2 status"
echo ""
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "http://$NEW_IP:3001/api/athlete" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ API répond correctement (HTTP 200)"
else
  echo "⚠️  API code HTTP: $HTTP_CODE (normal si le port Oracle n'est pas encore ouvert)"
fi

echo ""
echo "======================================"
echo "  ✅ MIGRATION TERMINÉE !"
echo "======================================"
echo ""
echo "Nouvelle URL : http://$NEW_IP:3001"
echo ""
echo "➡️  Action manuelle restante :"
echo "   Ouvre les ports dans la console Oracle :"
echo "   Networking > VCN > Security Lists > Default"
echo "   Ajouter Ingress rules pour TCP ports 3001 et 80 (source 0.0.0.0/0)"
echo ""
echo "➡️  Une fois validé, mets à jour CLAUDE.md avec la nouvelle IP : $NEW_IP"
echo "   puis : ./scripts/migrate_finalize.sh $NEW_IP"
