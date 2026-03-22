#!/bin/bash
# =============================================================================
# eVersum VPS Setup — enkratna inicializacija Hetzner strežnika
# Ubuntu 24.04 LTS
#
# Uporaba:
#   ssh root@VPS_IP
#   bash setup-vps.sh
#
# Po zagonu tega skripta naredi še:
#   1. Nastavi DNS (api.eversum.com + app.eversum.com → VPS IP)
#   2. Dodaj GitHub deploy SSH ključ (navodila spodaj)
#   3. Kloniraj repo + nastavi .env
#   4. make prod-migrate && make prod
# =============================================================================

set -e

echo "=== eVersum VPS Setup ==="

# -----------------------------------------------------------------------------
# 1. Posodobitev sistema
# -----------------------------------------------------------------------------
echo "--- Posodabljam sistem ---"
apt update && apt upgrade -y
apt install -y ca-certificates curl gnupg git ufw

# -----------------------------------------------------------------------------
# 2. Docker — namestitev iz uradnega APT repozitorija
#    (ne convenience script — ta je samo za dev/test)
# -----------------------------------------------------------------------------
echo "--- Nameščam Docker iz APT repozitorija ---"

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | tee /etc/apt/sources.list.d/docker.list > /dev/null

apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

systemctl enable docker
systemctl start docker

docker --version
docker compose version

# -----------------------------------------------------------------------------
# 3. Firewall — samo 22 (SSH), 80 (HTTP), 443 (HTTPS)
# -----------------------------------------------------------------------------
echo "--- Nastavljam UFW ---"
ufw allow 22
ufw allow 80
ufw allow 443
ufw --force enable
ufw status

# -----------------------------------------------------------------------------
# 4. Deploy mapa
# -----------------------------------------------------------------------------
echo "--- Ustvarjam /opt/eversum ---"
mkdir -p /opt/eversum

# -----------------------------------------------------------------------------
# 5. SSH deploy key za private GitHub repo
# -----------------------------------------------------------------------------
echo ""
echo "=== PRIVATE REPO SETUP ==="
echo ""
echo "Ker je repo privaten, moraš dodati SSH deploy key:"
echo ""
echo "  a) Generiraj ključ NA TEM STREŽNIKU:"
echo "     ssh-keygen -t ed25519 -C 'eversum-deploy' -f /root/.ssh/eversum_deploy -N ''"
echo ""
echo "  b) Izpiši public key:"
echo "     cat /root/.ssh/eversum_deploy.pub"
echo ""
echo "  c) Dodaj ga na GitHub:"
echo "     GitHub repo → Settings → Deploy keys → Add deploy key"
echo "     (Read-only dostop zadostuje)"
echo ""
echo "  d) Nastavi SSH config:"
cat >> /root/.ssh/config << 'EOF'

Host github.com
  IdentityFile /root/.ssh/eversum_deploy
  StrictHostKeyChecking no
EOF
echo "     /root/.ssh/config posodobljen."
echo ""
echo "  e) Kloniraj repo:"
echo "     cd /opt/eversum"
echo "     git clone git@github.com:<org>/eversum ."
echo ""

# -----------------------------------------------------------------------------
# 6. Navodila za .env
# -----------------------------------------------------------------------------
echo "=== .ENV SETUP ==="
echo ""
echo "Po kloniranju repozitorija:"
echo "  cp .env.example .env"
echo "  nano .env"
echo ""
echo "Generiraj vrednosti z:"
echo "  SECRET_KEY:          openssl rand -hex 32"
echo "  DB_PASSWORD:         openssl rand -hex 16"
echo "  MINIO_ROOT_PASSWORD: openssl rand -hex 16"
echo ""
echo "NEXT_PUBLIC_API_URL=https://api.eversum.com"
echo "NEXT_PUBLIC_WS_URL=wss://api.eversum.com"
echo ""

# -----------------------------------------------------------------------------
# 7. Navodila za prvi zagon
# -----------------------------------------------------------------------------
echo "=== PRVI ZAGON ==="
echo ""
echo "  cd /opt/eversum"
echo "  make prod-migrate"
echo "  make prod"
echo ""
echo "Preveri loge:"
echo "  make prod-logs"
echo "  docker compose -f docker-compose.yml -f docker-compose.prod.yml ps"
echo ""

# -----------------------------------------------------------------------------
# 8. Security hardening (po uspešnem deployu)
# -----------------------------------------------------------------------------
echo "=== SECURITY (po uspešnem deployu) ==="
echo ""
echo "Onemogoči root password login (SSH key only):"
echo "  sed -i 's/^PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config"
echo "  sed -i 's/^PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config"
echo "  systemctl restart sshd"
echo ""
echo "MinIO admin (samo prek SSH tunnel — port ni odprt navzven):"
echo "  ssh -L 9001:localhost:9001 root@VPS_IP"
echo "  Odpri: http://localhost:9001"
echo ""

echo "=== Setup skript zaključen ==="
echo "Nadaljuj po navodilih zgoraj."
