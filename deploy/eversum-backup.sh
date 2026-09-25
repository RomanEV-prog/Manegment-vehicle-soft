#!/bin/bash
# Dnevna varnostna kopija baze SUMS (cron 03:30); hrani 14 dni v /root/backup.
# Namesti deploy-server.sh. Obnova:
#   gunzip -c /root/backup/daily-YYYYMMDD.sql.gz | docker compose ... exec -T db psql -U eversum eversum_db
#
# Neuspel dump NE sme nadomestiti dobre kopije: pipefail + preverba arhiva, šele
# nato se stara kopija zamenja in pobrišejo kopije, starejše od 14 dni.
set -euo pipefail
mkdir -p /root/backup
cd /opt/eversum-sums/deploy
out=/root/backup/daily-$(date +%Y%m%d).sql.gz
tmp="$out.tmp"

docker compose -f docker-compose.server.yml --env-file .env.server exec -T db pg_dump -U eversum eversum_db | gzip > "$tmp"
gunzip -t "$tmp"
tables=$(gunzip -c "$tmp" | grep -c '^CREATE TABLE' || true)
if [ "$tables" -lt 10 ]; then
  echo "$(date -Is) NAPAKA: dump ima le $tables tabel — ohranjam prejšnje kopije" >&2
  rm -f "$tmp"
  exit 1
fi
mv "$tmp" "$out"
find /root/backup -name "daily-*.sql.gz" -mtime +14 -delete
echo "$(date -Is) OK $out ($tables tabel)"
