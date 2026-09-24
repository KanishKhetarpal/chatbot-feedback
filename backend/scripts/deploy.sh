#!/usr/bin/env bash
# Deploy the backend to Railway, then load the sales bots into the production
# database. Run from anywhere; needs the Railway CLI, logged in, with access to
# the chatbot-feedback project.
#
#   npm i -g @railway/cli && railway login
#   bash backend/scripts/deploy.sh            # deploy + re-seed Shreya
#   bash backend/scripts/deploy.sh all        # deploy + re-seed every bot
#   bash backend/scripts/deploy.sh --no-deploy shreya   # re-seed only
#
# What it does:
#   1. `railway up --ci` uploads backend/ and waits for the build. railway.json
#      builds it (prisma generate + nest build) and starts it with
#      `prisma migrate deploy && node dist/main`, so migrations run on boot.
#   2. `pnpm db:seed:bots <filter>` inside the running service: creates or
#      updates each bot from prisma/sales-bots/bots/*.md, retrains it only when
#      its knowledge changed, and prints its share key. Idempotent.
#   3. Prints the embed <script> tag for each bot it touched.
set -euo pipefail

FRONTEND_ORIGIN="${FRONTEND_ORIGIN:-https://chatbot-feedback.vercel.app}"
DEPLOY=1
if [[ "${1:-}" == "--no-deploy" ]]; then DEPLOY=0; shift; fi
FILTER="${1:-shreya}"
[[ "$FILTER" == "all" ]] && FILTER=""

cd "$(dirname "$0")/.."

command -v railway >/dev/null || { echo "Railway CLI missing: npm i -g @railway/cli" >&2; exit 1; }
railway whoami >/dev/null 2>&1 || { echo "Not logged in: railway login" >&2; exit 1; }
railway status >/dev/null 2>&1 || {
  echo "This folder is not linked to a service. Run: railway link  (pick chatbot-feedback, the backend service)" >&2
  exit 1
}

if (( DEPLOY )); then
  echo "==> Deploying backend/ to Railway (waits for the build)"
  railway up --ci
  echo "==> Waiting for the new instance to come up"
  sleep 20
fi

echo "==> Seeding bots${FILTER:+ matching \"$FILTER\"}"
out="$(railway ssh -- pnpm db:seed:bots ${FILTER:+"$FILTER"} 2>&1 | tee /dev/stderr)"

echo
echo "==> Embed tags"
# The seed prints:  Created|Updated "<name>" (...)  then  status=... · share: /s/<key> · ...
echo "$out" | awk -v origin="$FRONTEND_ORIGIN" '
  /^(Created|Updated) "/ { match($0, /"[^"]+"/); name = substr($0, RSTART + 1, RLENGTH - 2) }
  /share: \/s\// {
    match($0, /\/s\/pk_[a-z0-9]+/); key = substr($0, RSTART + 3, RLENGTH - 3)
    printf "%s\n  share: %s/s/%s\n  <script async src=\"%s/widget.js\" data-agent-key=\"%s\"></script>\n\n", name, origin, key, origin, key
  }'
