#!/bin/sh
# SOPS-Decrypt fuer docker compose env_file (arcane pre-deploy hook).
# shortcut: age-Key liegt auf dem Host (/opt/docker/secrets/age.key) und wird
# read-only in den Runner gemountet; auf KMS umstellen, sobald eines existiert.
set -eu
export SOPS_AGE_KEY_FILE="${SOPS_AGE_KEY_FILE:-/age.key}"
sops -d secrets.enc.env > .env.runtime
chmod 600 .env.runtime
# 65532 = nonroot-UID des arcane-Images: Arcanes compose-Prozess laeuft als
# dieser User und muss .env.runtime lesen koennen (sonst Deploy-Fehler).
# shortcut: bei einem Arcane-Image-Update mit anderer UID hier nachziehen.
chown 65532:65532 .env.runtime 2>/dev/null || true
