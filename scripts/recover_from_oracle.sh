#!/bin/bash
# Rapatrie toutes les données depuis Oracle Cloud vers le dossier local
# Usage: ./scripts/recover_from_oracle.sh
# Exécuter AVANT de supprimer la VM Oracle

set -e

OLD_IP="130.61.178.50"
SSH_KEY="$HOME/Downloads/ssh-key-2026-04-10-3.key"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="$PROJECT_DIR/data"
BACKUP_DIR="$HOME/Desktop/ultracoach_oracle_backup_$(date +%Y%m%d_%H%M%S)"

echo "======================================"
echo "  RÉCUPÉRATION DONNÉES ORACLE"
echo "  Serveur : $OLD_IP"
echo "======================================"

# Vérifier la clé SSH
if [ ! -f "$SSH_KEY" ]; then
  echo "❌ Clé SSH introuvable : $SSH_KEY"
  echo "   Modifie la variable SSH_KEY dans ce script"
  exit 1
fi

echo ""
echo "→ Test de connexion..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=10 ubuntu@$OLD_IP "echo '✅ Connecté'" || {
  echo "❌ Connexion impossible à $OLD_IP"
  echo "   Vérifie que la VM Oracle est encore active"
  exit 1
}

mkdir -p "$BACKUP_DIR"

echo ""
echo "→ [1/4] Téléchargement de la base de données principale..."
scp -i "$SSH_KEY" ubuntu@$OLD_IP:~/UltraCoach/data/ultracoach.db \
  "$BACKUP_DIR/ultracoach.db" 2>/dev/null || echo "  ⚠️  ultracoach.db absent (normal si VM fraîche)"

echo ""
echo "→ [2/4] Téléchargement de la base d'authentification..."
scp -i "$SSH_KEY" ubuntu@$OLD_IP:~/UltraCoach/data/auth.db \
  "$BACKUP_DIR/auth.db" 2>/dev/null || echo "  ⚠️  auth.db absent"

echo ""
echo "→ [3/4] Téléchargement des données utilisateurs individuels..."
mkdir -p "$BACKUP_DIR/users"
# Copie le dossier users/ entier si il existe
ssh -i "$SSH_KEY" ubuntu@$OLD_IP \
  "[ -d ~/UltraCoach/data/users ] && tar -czf /tmp/users_backup.tar.gz -C ~/UltraCoach/data users && echo 'OK' || echo 'EMPTY'"
RESULT=$(ssh -i "$SSH_KEY" ubuntu@$OLD_IP "[ -f /tmp/users_backup.tar.gz ] && echo 'OK' || echo 'EMPTY'")
if [ "$RESULT" = "OK" ]; then
  scp -i "$SSH_KEY" ubuntu@$OLD_IP:/tmp/users_backup.tar.gz "$BACKUP_DIR/users_backup.tar.gz"
  tar -xzf "$BACKUP_DIR/users_backup.tar.gz" -C "$BACKUP_DIR/"
  echo "  ✅ Dossier users/ récupéré"
else
  echo "  ℹ️  Pas de données utilisateurs individuels"
fi

echo ""
echo "→ [4/4] Téléchargement athlete_data_export.json..."
scp -i "$SSH_KEY" ubuntu@$OLD_IP:~/UltraCoach/data/athlete_data_export.json \
  "$BACKUP_DIR/athlete_data_export.json" 2>/dev/null || echo "  ⚠️  athlete_data_export.json absent"

echo ""
echo "======================================"
echo "  SAUVEGARDE TERMINÉE"
echo "  Dossier : $BACKUP_DIR"
ls -lh "$BACKUP_DIR/"
echo "======================================"

echo ""
echo "→ Copie vers le dossier local de l'app..."

# ultracoach.db racine (profil par défaut)
if [ -f "$BACKUP_DIR/ultracoach.db" ]; then
  cp "$BACKUP_DIR/ultracoach.db" "$DATA_DIR/ultracoach.db"
  echo "  ✅ ultracoach.db → data/"
fi

# auth.db
if [ -f "$BACKUP_DIR/auth.db" ]; then
  cp "$BACKUP_DIR/auth.db" "$DATA_DIR/auth.db"
  echo "  ✅ auth.db → data/"
fi

# Dossier users/
if [ -d "$BACKUP_DIR/users" ]; then
  cp -r "$BACKUP_DIR/users" "$DATA_DIR/"
  echo "  ✅ users/ → data/users/"
fi

# athlete_data_export.json
if [ -f "$BACKUP_DIR/athlete_data_export.json" ]; then
  cp "$BACKUP_DIR/athlete_data_export.json" "$DATA_DIR/athlete_data_export.json"
  echo "  ✅ athlete_data_export.json → data/"
fi

echo ""
echo "======================================"
echo "  ✅ DONNÉES RAPATRIÉES EN LOCAL !"
echo "======================================"
echo ""
echo "Prochaine étape :"
echo "  ./scripts/install_local.sh"
echo ""
echo "Une fois l'app locale vérifiée, tu pourras supprimer la VM Oracle."
echo "La sauvegarde complète reste ici : $BACKUP_DIR"
