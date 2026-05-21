#!/usr/bin/env bash
# Interactive secret prompt → writes ~/coding-scratch/study-rpg-m2/.env.local
# Uses `read -s` so secrets never echo to terminal or shell history.
# Run from this repo root: bash scripts/setup-env-local.sh

set -euo pipefail

ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/.env.local"

if [ -f "$ENV_FILE" ]; then
  echo "WARN: $ENV_FILE already exists."
  read -rp "Overwrite? [y/N] " ans
  case "$ans" in
    y|Y) ;;
    *) echo "Aborted."; exit 1 ;;
  esac
fi

echo ""
echo "=== bulk-migrate .env.local setup ==="
echo "Paste each secret then press Enter. Input is hidden."
echo ""

prompt_secret() {
  # Bash function output: stderr for prompts/feedback (so $() command
  # substitution captures only the secret on stdout). Earlier version
  # accidentally captured the trailing `echo ""` newline into the value.
  local var_name="$1"
  local desc="$2"
  local val=""
  while [ -z "$val" ]; do
    read -rsp "$var_name ($desc): " val >&2
    echo "" >&2
    if [ -z "$val" ]; then
      echo "  empty — try again" >&2
    fi
  done
  printf -- "%s" "$val"
}

SUPABASE_KEY=$(prompt_secret "SUPABASE_SERVICE_ROLE_KEY" "sb_secret_... from Supabase dashboard")
R2_ACCESS=$(prompt_secret "R2_S3_ACCESS_KEY_ID" "from 1Password study-rpg-worker-s3")
R2_SECRET=$(prompt_secret "R2_S3_SECRET_ACCESS_KEY" "from 1Password study-rpg-worker-s3")

umask 077  # 600 perms on the env file

cat > "$ENV_FILE" <<EOF
SUPABASE_URL=https://jakdyjxojokyqxeiuukx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_KEY
R2_S3_ENDPOINT=https://43631a35f33f4132484a6ce024cc502a.r2.cloudflarestorage.com
R2_S3_ACCESS_KEY_ID=$R2_ACCESS
R2_S3_SECRET_ACCESS_KEY=$R2_SECRET
R2_BUCKET=study-rpg-saves
EOF

echo ""
echo "Written: $ENV_FILE (mode 600)"
echo "Sanity check (only var names + first 6 chars of each value):"
echo ""
while IFS='=' read -r k v; do
  if [[ "$k" =~ ^[A-Z_]+$ ]]; then
    masked="${v:0:6}…"
    printf "  %-30s %s\n" "$k" "$masked"
  fi
done < "$ENV_FILE"
echo ""
echo "Done. Next: pnpm bulk-migrate --dry-run --user 2dc5fdd4-c1a6-4e2d-ac1e-6567d8a6f58e"
