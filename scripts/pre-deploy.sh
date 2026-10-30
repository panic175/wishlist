#!/bin/sh
# SOPS-Decrypt fuer docker compose env_file (arcane pre-deploy hook).
# shortcut: age-Key liegt auf dem Host (/opt/docker/secrets/age.key) und wird
# read-only in den Runner gemountet; auf KMS umstellen, sobald eines existiert.
set -eu
export SOPS_AGE_KEY_FILE="${SOPS_AGE_KEY_FILE:-/age.key}"
sops -d secrets.enc.env > .env.runtime
chmod 600 .env.runtime
