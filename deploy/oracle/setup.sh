#!/bin/bash
# Olympus server on an Oracle Cloud "Always Free" VM, in one go.
#
# Paste this whole file as the instance's initialization script (Create instance → Show advanced
# options → Management → Paste cloud-init script) and it runs as root on the first boot; or run it
# by hand on the VM with `sudo bash setup.sh`. It is safe to run again.
#
# What it does: adds swap (the free AMD shape has 1 GB of RAM, too little to build the app),
# installs Docker, opens ports 80 and 443 in the VM's own firewall, fetches Olympus from GitHub,
# and starts it behind HTTPS. Without a domain of your own the address is <your-ip>.sslip.io, a
# free name that points at your IP and gets a real certificate. It checks GitHub every night and
# rebuilds when something changed. Progress: /var/log/olympus-setup.log. The address, when done:
# /opt/olympus-address.txt.
set -euo pipefail
exec > >(tee -a /var/log/olympus-setup.log) 2>&1

REPO="${OLYMPUS_REPO:-https://github.com/cocopops9/olympus.git}"
DIR=/opt/olympus
DOMAIN="${OLYMPUS_DOMAIN:-}"   # e.g. gym.example.org; empty uses <ip>.sslip.io

echo "== Olympus setup $(date -u)"

# 1. Swap: building the web app needs more memory than the 1 GB shape has.
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 4G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=4096
  chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# 2. Docker and git.
if command -v apt-get >/dev/null; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y && apt-get install -y ca-certificates curl git
else
  dnf install -y git curl || yum install -y git curl
fi
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

# 3. The VM's own firewall. Oracle's Ubuntu images reject everything but SSH in iptables;
#    Oracle Linux uses firewalld. (The cloud's Security List must allow 80 and 443 as well:
#    that part is done in the console, see deploy/oracle/README.md.)
if command -v firewall-cmd >/dev/null && systemctl is-active --quiet firewalld; then
  firewall-cmd --permanent --add-service=http --add-service=https && firewall-cmd --reload
else
  for port in 80 443; do
    iptables -C INPUT -p tcp --dport $port -m state --state NEW -j ACCEPT 2>/dev/null \
      || iptables -I INPUT 5 -p tcp --dport $port -m state --state NEW -j ACCEPT
  done
  iptables -C INPUT -p udp --dport 443 -j ACCEPT 2>/dev/null || iptables -I INPUT 5 -p udp --dport 443 -j ACCEPT
  if command -v netfilter-persistent >/dev/null; then netfilter-persistent save
  else (apt-get install -y iptables-persistent && netfilter-persistent save) || true; fi
fi

# 4. The address.
IP="$(curl -fsS --max-time 10 https://api.ipify.org || curl -fsS --max-time 10 https://ifconfig.me)"
HOST="${DOMAIN:-$(echo "$IP" | tr . -).sslip.io}"
echo "Public IP $IP, address https://$HOST"

# 5. The code, and its settings. An existing .env is kept: it may have been edited since.
if [ -d "$DIR/.git" ]; then git -C "$DIR" pull --ff-only; else git clone --depth 1 "$REPO" "$DIR"; fi
cd "$DIR"
if [ ! -f .env ]; then
  cat > .env <<ENV
# Written by deploy/oracle/setup.sh. Change and run: docker compose -f docker-compose.yml -f deploy/oracle/compose.https.yml up -d
RP_ID=$HOST
ORIGIN=https://$HOST
OLYMPUS_HOST=$HOST
RP_NAME=Olympus
WEB_PORT=127.0.0.1:8080
# Name-and-password sign-in, which the phone app uses to join without a pairing code.
PASSWORD_LOGIN=1
# The first profile created becomes the admin (Settings → Admin dashboard). Create yours first.
FIRST_USER_ADMIN=1
# Caddy sets this header to the real client address; nginx passes it to the API's throttle.
CF_CONNECTING_IP=\$\$http_cf_connecting_ip
ENV
fi

COMPOSE="docker compose -f docker-compose.yml -f deploy/oracle/compose.https.yml"
$COMPOSE up -d --build

# 6. Every night: fetch what was pushed to GitHub and rebuild only when something changed.
cat > /usr/local/bin/olympus-update <<UPD
#!/bin/bash
cd $DIR || exit 1
before=\$(git rev-parse HEAD)
git pull --ff-only -q || exit 1
[ "\$(git rev-parse HEAD)" = "\$before" ] && exit 0
$COMPOSE up -d --build && docker image prune -f
UPD
chmod +x /usr/local/bin/olympus-update
echo "40 3 * * * root /usr/local/bin/olympus-update >> /var/log/olympus-update.log 2>&1" > /etc/cron.d/olympus-update

echo "https://$HOST" > /opt/olympus-address.txt
echo "== Olympus is starting at https://$HOST (the certificate can take a minute)"
