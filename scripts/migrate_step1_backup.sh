#!/bin/bash
# ÉTAPE 1 — Sauvegarde de l'ancienne VM
# Usage: ./scripts/migrate_step1_backup.sh

set -e

OLD_IP="130.61.178.50"
SSH_KEY="$HOME/Downloads/ssh-key-2026-04-10-3.key"
BACKUP_DIR="$HOME/Desktop/ultracoach_migration_backup"

echo "======================================"
echo "  MIGRATION UltraCoach — Étape 1/4"
echo "  Sauvegarde depuis $OLD_IP"
echo "======================================"

mkdir -p "$BACKUP_DIR"

echo ""
echo "→ Connexion à l'ancienne VM..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no ubuntu@$OLD_IP \
  "mkdir -p ~/migration_backup && \
   cp ~/UltraCoach/data/ultracoach.db ~/migration_backup/ultracoach.db && \
   echo 'Backup créé sur la VM'"

echo ""
echo "→ Téléchargement de la base de données..."
scp -i "$SSH_KEY" ubuntu@$OLD_IP:~/migration_backup/ultracoach.db \
  "$BACKUP_DIR/ultracoach.db"

echo ""
echo "→ Vérification..."
ls -lh "$BACKUP_DIR/ultracoach.db"
echo ""
echo "✅ Sauvegarde OK : $BACKUP_DIR/ultracoach.db"
echo ""
echo "➡️  Lance maintenant l'étape 2 :"
echo "   Crée la nouvelle VM sur la console Oracle (voir instructions)"
echo "   Puis exécute : ./scripts/migrate_step3_setup.sh <NOUVELLE_IP>"
