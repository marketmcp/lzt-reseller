#!/usr/bin/env bash
# Обновление установленного магазина (запускать на сервере).
#   sudo bash /opt/lzt-reseller/deploy/update.sh
set -euo pipefail
APP_DIR="/opt/lzt-reseller"
cd "$APP_DIR"
git pull --ff-only
chown -R www-data:www-data "$APP_DIR"
systemctl restart lzt-reseller
echo "Обновлено и перезапущено: $(git -C "$APP_DIR" rev-parse --short HEAD)"
