# Карта проекта для AI-ассистента (MCP)

Этот файл объясняет любой нейросети (через MCP — Claude Code, Cursor, и т.п.), как
настраивать и деплоить магазин по запросу пользователя. Почти всё делается правкой
`web/config.js` и `.env`; деплой — скриптами из `deploy/`.

## Главные файлы

| Файл | Что менять |
|---|---|
| `web/config.js` | Бренд, тема/палитра, категории, наценка, способы оплаты, hero, уведомления. **Основной файл настройки.** |
| `.env` | Секреты: `OWNER_PASSWORD`, `SESSION_SECRET`, `LZT_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`. Не коммитить. |
| `web/index.html` | Сама витрина. Логику трогать только по явной просьбе. |
| `server/index.js` | Бэкенд (прокси/авторизация). Менять только по явной просьбе. |
| `deploy/` | Установка на сервер, systemd, Caddy, обновление. |

## Настройки `web/config.js`

- **brand**: `name`, `tagline`, `logoImage`, `telegram`, `discord`, `vk`, `support`.
- **theme.preset**: `vault` | `obsidian` | `ocean` | `ember` | `matrix` | `rose` | `light`.
- **theme.colors**: переопределяет ЛЮБОЙ токен (`bg`, `surface1..3`, `border`, `text`, `accent`, `accentDeep`, `accentLight`, `success`, `danger`…). `null` = из пресета.
- **theme.radius**: `sharp`|`normal`|`rounded`|число. **theme.density**: `compact`|`normal`|`spacious`. **theme.shadow**: `flat`|`soft`|`deep`. **theme.font**: `{ body, display, url }`.
- **categories**: `null` = все 29, либо массив id. **categoryColors**: `{ steam:'#1a9fff' }`.
- **markup** (множитель цен), **minPrice/maxPrice/productFilter**, **currency**.
- **payments**: массив `{ id, name, icon, provider, merchant, enabled }`.
- **notifications.telegram**: `{ botToken, chatId, events:{ newOrder, newUser, lowStock, payout } }`.
- **hero**: `{ enabled, image, eyebrow, headline, sub, ctaText, stats }` (по умолчанию выкл).
- **admin**: `{ enabled, password }` — пароль владельца (лучше держать в `.env`).

Справочник полей с примерами — в комментариях `web/config.js` и в `docs/CONFIG.md`.

## id категорий
`steam vk instagram twitter facebook tiktok youtube twitch discord telegram fortnite valorant apex genshin eft roblox minecraft lol bnet epic ea ubisoft rockstar supercell wot warzone gifts vpn`

## Деплой за пользователя (раннбук — выполняй сам через MCP)

Цель: пользователь только покупает сервер и даёт данные — всё остальное делает нейросеть.

**Шаг 0. Спроси у пользователя (одним сообщением):**
- IP сервера и root-доступ (пароль или SSH-ключ). Сервер: Ubuntu 22.04/24.04, 1 vCPU / 1 ГБ RAM (любой VPS).
- Домен (например `shop.example.com`), добавленный в Cloudflare, и **Cloudflare API-токен** (шаблон «Edit zone DNS»).
- Пароль владельца для админки. Опционально: токен LZT, токен Telegram-бота + chat id, токен CryptoBot.

**Шаг 1. DNS через Cloudflare (локально, есть curl):**
```
bash deploy/cloudflare-dns.sh <CF_TOKEN> <домен> <IP>
```

**Шаг 2. Установка на сервер (по SSH):**
```
ssh root@<IP> "curl -fsSL https://raw.githubusercontent.com/marketmcp/lzt-reseller/main/deploy/server-setup.sh | bash -s -- <домен>"
```

**Шаг 3. Секреты в .env на сервере** (подставь полученные значения; пустые — пропусти):
```
ssh root@<IP> "cd /opt/lzt-reseller && \
  sed -i 's|^OWNER_PASSWORD=.*|OWNER_PASSWORD=<пароль>|' .env && \
  sed -i 's|^LZT_TOKEN=.*|LZT_TOKEN=<токен>|' .env && \
  sed -i 's|^TELEGRAM_BOT_TOKEN=.*|TELEGRAM_BOT_TOKEN=<токен>|' .env && \
  sed -i 's|^TELEGRAM_CHAT_ID=.*|TELEGRAM_CHAT_ID=<id>|' .env && \
  sed -i 's|^CRYPTOBOT_TOKEN=.*|CRYPTOBOT_TOKEN=<токен>|' .env && \
  systemctl restart lzt-reseller"
```

**Шаг 4. Проверка:** `curl -s https://<домен>/api/health` → `{"ok":true,...}`. Сообщи пользователю ссылку и `/#admin`.

**Обновление кода:** `ssh root@<IP> "bash /opt/lzt-reseller/deploy/update.sh"`.

> Никогда не печатай секреты в ответе пользователю и не коммить их. Передавай напрямую в команды.

## Подключение оплаты и уведомлений (за пользователя)

- **Оплата криптой (CryptoBot):** пользователь создаёт приложение в @CryptoBot → Crypto Pay → получает токен → ты вписываешь его в `CRYPTOBOT_TOKEN` (.env) и перезапускаешь. Метод `provider:'crypto'` в `payments` начнёт принимать реальные платежи.
- **Telegram-уведомления:** токен у @BotFather, chat id у @userinfobot → в `.env` (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`). Магазин шлёт уведомления о покупках/пополнениях.
- Свой мерчант (ЮMoney/карты): добавь метод в `payments` (`config.js`), серверную интеграцию вебхука — в `server/index.js` (`/api/pay/*`).

## Правила
1. **Никогда** не вписывай реальные секреты (`LZT_TOKEN`, пароли, токены ботов) в `web/config.js` или любой коммитимый файл — только в `.env`.
2. Цвета — `#RRGGBB`. Смена темы — `theme.preset`; точечная перекраска — `theme.colors`.
3. После правок предложи перезапустить сервер. Дизайн-токены применяются на загрузке.
4. Токен LZT — только в `.env`, во фронтенд не клади.
5. Админка — `/#admin`, доступ по паролю владельца. Это тот же конфиг, что правишь ты.
