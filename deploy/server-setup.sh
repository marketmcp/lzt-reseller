#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════
#  LZT Reseller — установка на Ubuntu в одну команду
#  Ставит Node + Caddy, клонирует репозиторий, поднимает systemd-сервис и
#  HTTPS на вашем домене. Запускать на ЧИСТОМ Ubuntu 22.04/24.04 от root.
#
#  Использование:
#    sudo bash server-setup.sh shop.example.com
#  или удалённо:
#    curl -fsSL https://raw.githubusercontent.com/marketmcp/lzt-reseller/main/deploy/server-setup.sh | sudo bash -s -- shop.example.com
# ════════════════════════════════════════════════════════════════════════
set -euo pipefail

DOMAIN="${1:-}"
REPO="${REPO:-https://github.com/marketmcp/lzt-reseller.git}"
APP_DIR="/opt/lzt-reseller"

if [ -z "$DOMAIN" ]; then echo "Ошибка: укажите домен.  Пример: sudo bash server-setup.sh shop.example.com"; exit 1; fi
if [ "$(id -u)" != "0" ]; then echo "Запускайте от root (sudo)."; exit 1; fi

echo ">> [1/6] Пакеты"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y git curl gnupg debian-keyring debian-archive-keyring apt-transport-https

echo ">> [2/6] Node.js 20"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

echo ">> [3/6] Caddy (авто-HTTPS)"
if ! command -v caddy >/dev/null 2>&1; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt-get update -y
  apt-get install -y caddy
fi

echo ">> [4/6] Код в $APP_DIR"
if [ -d "$APP_DIR/.git" ]; then git -C "$APP_DIR" pull --ff-only; else git clone "$REPO" "$APP_DIR"; fi
mkdir -p "$APP_DIR/data"

echo ">> [5/6] Конфиг (.env)"
if [ ! -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  SECRET="$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')"
  sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=$SECRET|" "$APP_DIR/.env"
  sed -i "s|^SECURE_COOKIE=.*|SECURE_COOKIE=1|" "$APP_DIR/.env"
  sed -i "s|^HOST=.*|HOST=127.0.0.1|" "$APP_DIR/.env"
  NEEDS_SECRETS=1
fi
chown -R www-data:www-data "$APP_DIR"

echo ">> [6/6] Сервисы (systemd + Caddy)"
cp "$APP_DIR/deploy/lzt-reseller.service" /etc/systemd/system/lzt-reseller.service
systemctl daemon-reload
systemctl enable lzt-reseller >/dev/null 2>&1 || true
systemctl restart lzt-reseller
sed "s/__DOMAIN__/$DOMAIN/g" "$APP_DIR/deploy/Caddyfile" > /etc/caddy/Caddyfile
systemctl restart caddy

echo ""
echo "════════════════════════════════════════════════════════════"
echo " Готово.  https://$DOMAIN"
echo " DNS: A-запись домена должна указывать на IP этого сервера."
if [ "${NEEDS_SECRETS:-0}" = "1" ]; then
  echo ""
  echo " ⚠ Впишите секреты в $APP_DIR/.env:"
  echo "     OWNER_PASSWORD=...   (пароль владельца, вход на /#admin)"
  echo "     LZT_TOKEN=...        (токен LZT; без него — демо-режим)"
  echo " затем:  systemctl restart lzt-reseller"
fi
echo "════════════════════════════════════════════════════════════"
