#!/usr/bin/env bash
# Bundle each Butterbase function (inlining _lib.ts via esbuild) and deploy.
# Prereqs: npm i -g @butterbase/cli && butterbase login && npm install (here)
# Env vars are read from backend/.env (see backend/.env.example).
set -euo pipefail
cd "$(dirname "$0")"

OUT=dist
mkdir -p "$OUT"

FUNCTIONS=(trigger-scout trigger-analyze get-graph get-findings get-jobs get-artifact)

echo "==> Applying schema"
butterbase schema apply ./schema.sql

echo "==> Enabling realtime on jobs"
butterbase realtime enable jobs

for fn in "${FUNCTIONS[@]}"; do
  echo "==> Bundling $fn"
  npx esbuild "functions/$fn.ts" \
    --bundle --format=esm --platform=neutral --target=es2022 \
    --outfile="$OUT/$fn.js"
  echo "==> Deploying $fn"
  butterbase functions deploy "$OUT/$fn.js" --name "$fn"
done

echo "==> Done. Set frontend VITE_USE_BUTTERBASE=true to go live."
