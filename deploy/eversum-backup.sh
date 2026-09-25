#!/bin/sh
# Dnevna varnostna kopija baze SUMS (cron 03:30); hrani 14 dni v /root/backup.
# Namesti deploy-server.sh. Obnova:
#   gunzip -c /root/backup/daily-YYYYMMDD.sql.gz | docker compose ... exec -T db psql -U eversum eversum_db
set -e
mkdir -p /root/backup
cd /opt/eversum-sums/deploy
docker compose -f docker-compose.server.yml --env-file .env.server exec -T db pg_dump -U eversum eversum_db \
  | gzip > /root/backup/daily-$(date +%Y%m%d).sql.gz
find /root/backup -name "daily-*.sql.gz" -mtime +14 -delete
