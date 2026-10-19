#!/usr/bin/env bash
# ==============================================================================
# VayaPlan — Tarea de Respaldo Diario Conjunto (PostgreSQL + Originales)
# ==============================================================================
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="${BACKUP_ENV_FILE:-$PROJECT_ROOT/infra/.env.backup}"

# Cargar configuración si existe archivo dedicado de respaldos
if [ -f "$ENV_FILE" ]; then
  # Cargar variables ignorando comentarios y líneas vacías
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

# Validar precondiciones obligatorias
if [ -z "${BACKUP_ENCRYPTION_KEY:-}" ]; then
  echo "ERROR: Variable BACKUP_ENCRYPTION_KEY no definida." >&2
  exit 1
fi

if [ "${#BACKUP_ENCRYPTION_KEY}" -lt 16 ]; then
  echo "ERROR: BACKUP_ENCRYPTION_KEY debe contener al menos 16 caracteres." >&2
  exit 1
fi

if ! command -v gpg >/dev/null 2>&1; then
  echo "ERROR: GnuPG (gpg) no está instalado en el sistema." >&2
  exit 1
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "ERROR: Bun no está disponible en el PATH." >&2
  exit 1
fi

echo "[$(date -Iseconds)] Iniciando pipeline de respaldo conjunto VayaPlan..."

# Ejecutar el orquestador TypeScript mediante Bun
cd "$PROJECT_ROOT"
bun run "$SCRIPT_DIR/backup_batch.ts"

echo "[$(date -Iseconds)] Pipeline de respaldo finalizado con éxito."
