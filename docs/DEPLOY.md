# Деплой на сервер и домен

Самый простой путь — Ubuntu-сервер (VPS) + домен. Установка в одну команду:
ставится Node, Caddy (автоматический HTTPS), systemd-сервис.

## 1. Что нужно

- VPS с Ubuntu 22.04/24.04 и доступом по SSH (root).
- Домен (или поддомен), например `shop.example.com`.

## 2. Направить домен на сервер

В панели вашего регистратора/DNS создайте **A-запись**:

```
shop.example.com   A   <IP вашего сервера>
```

Подождите, пока запись применится (обычно минуты).

## 3. Установка (одна команда на сервере)

Зайдите на сервер по SSH и выполните:

```bash
curl -fsSL https://raw.githubusercontent.com/marketmcp/lzt-reseller/main/deploy/server-setup.sh | sudo bash -s -- shop.example.com
```

Скрипт ([`deploy/server-setup.sh`](../deploy/server-setup.sh)) сделает всё сам:
ставит Node 20 и Caddy, клонирует репозиторий в `/opt/lzt-reseller`, создаёт `.env`
(сгенерит `SESSION_SECRET`, включит `SECURE_COOKIE`), поднимет systemd-сервис и
выпустит HTTPS-сертификат на ваш домен.

## 4. Вписать секреты

Скрипт создаст `/opt/lzt-reseller/.env`. Откройте и заполните:

```bash
sudo nano /opt/lzt-reseller/.env
```

```ini
OWNER_PASSWORD=ваш_пароль_владельца     # вход на https://shop.example.com/#admin
LZT_TOKEN=ваш_токен_LZT                  # без него — демо-режим
TELEGRAM_BOT_TOKEN=...                    # опционально
TELEGRAM_CHAT_ID=...                      # опционально
```

Применить:

```bash
sudo systemctl restart lzt-reseller
```

Готово — магазин на `https://shop.example.com`, админка на `/#admin`.

## 5. Обновления

После изменений в репозитории — на сервере:

```bash
sudo bash /opt/lzt-reseller/deploy/update.sh
```

(`git pull` + перезапуск сервиса.) Либо вручную:

```bash
cd /opt/lzt-reseller && sudo git pull && sudo systemctl restart lzt-reseller
```

> Настройку магазина (бренд, тема, мерчанты) лучше менять в админке или в
> `web/config.js` через нейросеть по MCP — это не требует переустановки.

## Полезные команды

```bash
systemctl status lzt-reseller      # статус
journalctl -u lzt-reseller -f      # логи приложения
systemctl restart caddy            # перезапустить веб-прокси
```

---

## Альтернатива: Docker

```bash
git clone https://github.com/marketmcp/lzt-reseller.git && cd lzt-reseller
cp .env.example .env && nano .env
docker build -t lzt-reseller .
docker run -d --name lzt-reseller -p 3000:3000 --env-file .env --restart unless-stopped lzt-reseller
```

HTTPS/домен — поставьте перед контейнером Caddy или Nginx (см. `deploy/Caddyfile`).

## Альтернатива: только статика (без бэкенда)

Витрина работает и как статика (демо-режим: без живого LZT и серверной авторизации).
Залейте папку `web/` на GitHub Pages / Netlify / Cloudflare Pages — годится для превью дизайна.

---

## Платёжный шлюз

Витрина отдаёт выбор метода оплаты (`config.payments`). Реальный приём денег — серверная
интеграция под вашего провайдера: создание счёта + вебхук об оплате → зачисление баланса.
Точка расширения — `server/index.js` (добавьте `/api/pay/*` и обработчик вебхука).
