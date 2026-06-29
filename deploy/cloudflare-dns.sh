#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════
#  Cloudflare — создать/обновить A-запись домена через API.
#  Домен должен быть уже добавлен в аккаунт Cloudflare (бесплатно).
#  Токен: Cloudflare → My Profile → API Tokens → Create Token →
#         шаблон "Edit zone DNS" (права Zone:DNS:Edit, Zone:Read).
#
#  Использование:
#    bash cloudflare-dns.sh <CF_API_TOKEN> <домен> <IP_сервера>
#
#  По умолчанию proxied=false (серое облако) — так Caddy на сервере сам
#  выдаёт настоящий HTTPS. Для проксирования Cloudflare поставьте PROXIED=true.
# ════════════════════════════════════════════════════════════════════════
set -euo pipefail
TOKEN="${1:-}"; NAME="${2:-}"; IP="${3:-}"; PROXIED="${PROXIED:-false}"
if [ -z "$TOKEN" ] || [ -z "$NAME" ] || [ -z "$IP" ]; then
  echo "Использование: bash cloudflare-dns.sh <CF_API_TOKEN> <домен> <IP_сервера>"; exit 1
fi
API="https://api.cloudflare.com/client/v4"
H_AUTH="Authorization: Bearer $TOKEN"; H_CT="Content-Type: application/json"
ROOT="$(echo "$NAME" | awk -F. '{print $(NF-1)"."$NF}')"

ZONE_ID="$(curl -s -H "$H_AUTH" -H "$H_CT" "$API/zones?name=$ROOT" | grep -o '"id":"[a-f0-9]\{32\}"' | head -1 | cut -d'"' -f4 || true)"
if [ -z "$ZONE_ID" ]; then echo "Зона $ROOT не найдена в Cloudflare. Добавьте домен в аккаунт CF и повторите."; exit 1; fi

REC_ID="$(curl -s -H "$H_AUTH" -H "$H_CT" "$API/zones/$ZONE_ID/dns_records?type=A&name=$NAME" | grep -o '"id":"[a-f0-9]\{32\}"' | head -1 | cut -d'"' -f4 || true)"
DATA="{\"type\":\"A\",\"name\":\"$NAME\",\"content\":\"$IP\",\"ttl\":120,\"proxied\":$PROXIED}"

if [ -n "$REC_ID" ]; then
  curl -s -X PUT -H "$H_AUTH" -H "$H_CT" "$API/zones/$ZONE_ID/dns_records/$REC_ID" -d "$DATA" >/dev/null
  echo "A-запись обновлена: $NAME → $IP (proxied=$PROXIED)"
else
  curl -s -X POST -H "$H_AUTH" -H "$H_CT" "$API/zones/$ZONE_ID/dns_records" -d "$DATA" >/dev/null
  echo "A-запись создана: $NAME → $IP (proxied=$PROXIED)"
fi
