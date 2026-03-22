#!/bin/bash
# Deployment skripta za Hetzner VPS
# Uporaba: ./deploy.sh [branch]
# Primer: ./deploy.sh main

set -e

BRANCH=${1:-main}
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"

echo "=== eVersum Deploy: $BRANCH ==="

# 1. Pull latest code
git fetch origin
git checkout "$BRANCH"
git pull origin "$BRANCH"

# 2. Build images
echo "--- Gradim Docker slike ---"
$COMPOSE build --no-cache api frontend

# 3. Run DB migrations
echo "--- Izvajam Alembic migracije ---"
$COMPOSE run --rm api alembic upgrade head

# 4. Restart services
echo "--- Restartiram servise ---"
$COMPOSE up -d --remove-orphans

# 5. Health check
sleep 5
echo "--- Health check ---"
curl -f http://localhost:8000/health && echo " API: OK" || echo " API: FAILED"

echo "=== Deploy končan ==="
