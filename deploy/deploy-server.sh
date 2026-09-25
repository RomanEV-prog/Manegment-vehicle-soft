#!/usr/bin/env bash
# Postavi ali posodobi SUMS na strežniku (Ubuntu 24.04, dostop root prek SSH ključa).
#
#   deploy/deploy-server.sh <IP>            # posodobitev (koda iz zadnjega commita)
#   deploy/deploy-server.sh <IP> --setup    # prvič: Docker, požarni zid, fail2ban
#
# Koda gre na strežnik z `git archive HEAD` — samo commitano, brez .env in lokalnih datotek.
# Skrivnosti (DB_PASSWORD, SECRET_KEY) se ustvarijo NA strežniku in ga nikoli ne zapustijo.
set -euo pipefail

IP="${1:?Uporaba: deploy-server.sh <IP> [--setup]}"
SETUP="${2:-}"
SSH="ssh -o StrictHostKeyChecking=accept-new root@${IP}"
REMOTE=/opt/eversum-sums
SITE="${IP//./-}.sslip.io"
cd "$(dirname "$0")/.."

if [ -n "$(git status --porcelain)" ]; then
  echo "⚠ Necommitane spremembe ne gredo na strežnik (git archive HEAD)."
fi

if [ "$SETUP" = "--setup" ]; then
  echo "=== Priprava strežnika ==="
  $SSH 'bash -s' <<'EOF'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q docker.io docker-compose-v2 ufw fail2ban unattended-upgrades
systemctl enable --now docker fail2ban
# SSH samo s ključem
sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl reload ssh || systemctl reload sshd
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
dpkg-reconfigure -f noninteractive unattended-upgrades
docker --version && docker compose version
EOF
fi

echo "=== Prenos kode ($(git rev-parse --short HEAD)) ==="
$SSH "mkdir -p ${REMOTE} && find ${REMOTE} -mindepth 1 -maxdepth 1 ! -name deploy -exec rm -rf {} +"
# autocrlf=false: sicer git archive na Windows izvozi CRLF in bash skripte na strežniku ne tečejo
git -c core.autocrlf=false archive --format=tar HEAD | $SSH "tar -x -C ${REMOTE}"

echo "=== Skrivnosti in nastavitve (.env.server ostane med posodobitvami) ==="
$SSH "cd ${REMOTE}/deploy && if [ ! -f .env.server ]; then
  umask 077
  printf 'SITE_ADDRESS=%s\nDB_PASSWORD=%s\nSECRET_KEY=%s\nDEFAULT_LOCALE=en\nMODULES=r156,audit\n' \
    '${SITE}' \"\$(openssl rand -hex 24)\" \"\$(openssl rand -hex 32)\" > .env.server
  echo 'ustvarjena nova .env.server'
fi
grep -q '^ERP_API_KEY=' .env.server || { printf 'ERP_API_KEY=%s\n' \"\$(openssl rand -hex 24)\" >> .env.server; echo 'dodan ERP_API_KEY'; }"

echo "=== Dnevna varnostna kopija baze (cron 03:30) ==="
$SSH "install -m 700 ${REMOTE}/deploy/eversum-backup.sh /usr/local/bin/eversum-backup.sh &&   echo '30 3 * * * root /usr/local/bin/eversum-backup.sh >> /var/log/eversum-backup.log 2>&1' > /etc/cron.d/eversum-backup"

echo "=== Gradnja in zagon ==="
$SSH "cd ${REMOTE}/deploy && docker compose -f docker-compose.server.yml --env-file .env.server up -d --build --remove-orphans"

echo "=== Preverjanje ==="
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 5 "https://${SITE}/login" || true)
  [ "$code" = "200" ] && break
  sleep 5
done
echo "https://${SITE}/login → HTTP ${code}"
$SSH "cd ${REMOTE}/deploy && docker compose -f docker-compose.server.yml --env-file .env.server ps --format '{{.Service}}: {{.Status}}'"
