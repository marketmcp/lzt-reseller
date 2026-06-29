# Конфигурация

Два уровня: **`web/config.js`** (публичные настройки магазина) и **`.env`** (секреты).
Всё из `config.js` можно менять и в админ-панели (`#admin`) — это один источник истины.

## web/config.js — публичные настройки

### brand
```js
brand: { name, tagline, logoImage, telegram, discord, vk, support }
```

### theme
```js
theme: {
  preset: 'vault',        // vault|obsidian|ocean|ember|matrix|rose|light
  colors: { bg, surface1, surface2, surface3, border, borderStrong,
            text, textMuted, textFaint,
            accent, accentDeep, accentLight, accentContrast,
            success, danger, warning, info },   // любой = null → из пресета
  radius: 'normal',       // sharp | normal | rounded | число(px)
  density: 'normal',      // compact | normal | spacious
  shadow: 'soft',         // flat | soft | deep
  font: { body, display, url },
}
```
Любое поле `colors` перекрашивает весь сайт без костылей — компоненты используют только CSS-токены.

### Каталог и цены
```js
categories: null,                 // null = все 29, или ['steam','discord',...]
categoryColors: { steam:'#1a9fff' },
markup: 1.0,                      // множитель цен
minPrice: 0, maxPrice: 0,
productFilter: (p) => true,      // произвольный фильтр
currency: 'RUB',                 // RUB | USD | EUR
```

### payments
```js
payments: [
  { id:'card', name:'Карта', icon:'visa', provider:'card', merchant:'', enabled:true },
  // icon — slug с cdn.simpleicons.org или null; merchant — id/кошелёк вашего шлюза
]
```

### notifications / hero / admin
```js
notifications: { telegram: { botToken, chatId, events:{ newOrder, newUser, lowStock, payout } } }
hero: { enabled:false, image, eyebrow, headline, sub, ctaText, stats }   // лендинг-баннер, по умолчанию выкл
admin: { enabled:true, password:'owner' }   // пароль лучше держать в .env
```

## .env — секреты
См. [`.env.example`](../.env.example). Ключевое: `OWNER_PASSWORD`/`OWNER_PASSWORD_HASH`,
`SESSION_SECRET`, `LZT_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

> Секреты, заданные в админке (например пароль владельца), сохраняются в `data/store-config.json`
> на сервере. Для прод-безопасности дублируйте критичные секреты в `.env`.
