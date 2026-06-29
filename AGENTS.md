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

## Деплой (можно выполнить за пользователя)

- Локальный запуск: `npm start` → `http://localhost:3000`, админка `/#admin`.
- Ubuntu-сервер + домен (одна команда на сервере):
  `curl -fsSL https://raw.githubusercontent.com/marketmcp/lzt-reseller/main/deploy/server-setup.sh | sudo bash -s -- ДОМЕН`
  затем вписать `OWNER_PASSWORD` и `LZT_TOKEN` в `/opt/lzt-reseller/.env` и `systemctl restart lzt-reseller`.
- Обновление: `sudo bash /opt/lzt-reseller/deploy/update.sh`.
- Подробно — `docs/DEPLOY.md`.

## Правила
1. **Никогда** не вписывай реальные секреты (`LZT_TOKEN`, пароли, токены ботов) в `web/config.js` или любой коммитимый файл — только в `.env`.
2. Цвета — `#RRGGBB`. Смена темы — `theme.preset`; точечная перекраска — `theme.colors`.
3. После правок предложи перезапустить сервер. Дизайн-токены применяются на загрузке.
4. Токен LZT — только в `.env`, во фронтенд не клади.
5. Админка — `/#admin`, доступ по паролю владельца. Это тот же конфиг, что правишь ты.
